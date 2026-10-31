import pino from 'pino';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { startLocalStack, stopLocalStack, createSagaQueues, receiveAll, SagaQueue, FifoQueue } from '../helpers/localstack';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { PrismaOutboxStore } from '../../src/adapters/gateways/PrismaOutboxStore';
import { BillingCommandHandler } from '../../src/adapters/messaging/BillingCommandHandler';
import { SqsMessageSender } from '../../src/adapters/messaging/SqsMessageSender';
import { SqsQueuePoller } from '../../src/frameworks/messaging/SqsQueuePoller';
import { GenerateBudgetUseCase } from '../../src/use-cases/budgets/GenerateBudgetUseCase';
import { PublishPendingMessagesUseCase } from '../../src/use-cases/messaging/PublishPendingMessagesUseCase';
import { createCustomerNotifier } from '../../src/frameworks/notifications/notifierFactory';

const silentLog = pino({ level: 'silent' });
const noTrace = { currentTraceparent: () => undefined };
const serviceOrderId = '11111111-1111-4111-8111-111111111111';

let sqs: SQSClient;
let queues: Record<SagaQueue, FifoQueue>;
let poller: SqsQueuePoller;
let publish: PublishPendingMessagesUseCase;
let logLines: string[] = [];

/** Captures what the service logs, as JSON lines, the way it reaches stdout in production. */
const capturedLog = pino({ level: 'info' }, { write: (line: string) => { logLines.push(line); } });

beforeAll(async () => {
  await connectTestDB();
  sqs = await startLocalStack();
  queues = await createSagaQueues(sqs);

  const notifier = createCustomerNotifier({ NOTIFICATION_CHANNEL: 'console' }, capturedLog);
  const generateBudget = new GenerateBudgetUseCase(new PrismaUnitOfWork(prisma, noTrace), notifier, { warn: jest.fn(), error: jest.fn() });
  const handler = new BillingCommandHandler({ GenerateBudget: (command) => generateBudget.execute(command) });
  poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queues['billing-commands'].url }, handler, silentLog, { waitTimeSeconds: 1 });

  const sender = new SqsMessageSender(sqs, { 'saga-replies': queues['saga-replies'].url }, { record: jest.fn() });
  publish = new PublishPendingMessagesUseCase(new PrismaOutboxStore(prisma), sender);
});

afterAll(async () => {
  await stopLocalStack();
  await disconnectTestDB();
});

afterEach(async () => {
  logLines = [];
  await clearTestDB();
});

function generateBudgetCommand(messageId: string): string {
  return JSON.stringify({
    messageId,
    type: 'GenerateBudget',
    serviceOrderId,
    occurredAt: new Date().toISOString(),
    payload: {
      customer: { id: '22222222-2222-4222-8222-222222222222', name: 'Maria Souza', email: 'maria@example.com' },
      lines: [
        { kind: 'SERVICE', referenceId: '44444444-4444-4444-8444-444444444444', description: 'Oil change', unitPrice: 120, quantity: 1 },
        { kind: 'ITEM', referenceId: '55555555-5555-4555-8555-555555555555', description: 'Oil filter', unitPrice: 35.5, quantity: 2 },
      ],
    },
  });
}

describe('Budget generation', () => {
  it('GIVEN a GenerateBudget command on the queue WHEN the consumer runs THEN a pending budget exists and BudgetGenerated reaches the replies queue', async () => {
    // GIVEN
    await sqs.send(new SendMessageCommand({
      QueueUrl: queues['billing-commands'].url,
      MessageGroupId: serviceOrderId,
      MessageDeduplicationId: '33333333-3333-4333-8333-333333333333',
      MessageBody: generateBudgetCommand('33333333-3333-4333-8333-333333333333'),
    }));

    // WHEN
    await poller.pollOnce();
    await publish.execute(10);

    // THEN
    const budget = await prisma.budget.findUniqueOrThrow({ where: { serviceOrderId }, include: { lines: true } });
    expect(budget.status).toBe('PENDING_APPROVAL');
    expect(Number(budget.total)).toBe(191);
    expect(budget.lines).toHaveLength(2);

    const replies = await receiveAll(sqs, queues['saga-replies'].url);
    expect(replies).toHaveLength(1);
    expect(JSON.parse(replies[0].Body ?? '{}')).toMatchObject({
      type: 'BudgetGenerated',
      serviceOrderId,
      payload: { budgetId: budget.id, total: 191 },
    });
  });

  it('GIVEN NOTIFICATION_CHANNEL=console WHEN a budget is generated THEN the budget-ready log line carries the order id', async () => {
    // GIVEN
    await sqs.send(new SendMessageCommand({
      QueueUrl: queues['billing-commands'].url,
      MessageGroupId: serviceOrderId,
      MessageDeduplicationId: '66666666-6666-4666-8666-666666666666',
      MessageBody: generateBudgetCommand('66666666-6666-4666-8666-666666666666'),
    }));

    // WHEN
    await poller.pollOnce();

    // THEN
    const notices = logLines.map((line) => JSON.parse(line)).filter((entry) => entry.event === 'budget_ready');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ serviceOrderId, budgetTotal: 191 });
    expect(JSON.stringify(notices[0])).not.toContain('maria@example.com');
  });
});
