import pino from 'pino';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { startLocalStack, stopLocalStack, createSagaQueues, receiveAll, SagaQueue, FifoQueue } from '../helpers/localstack';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { PrismaOutboxStore } from '../../src/adapters/gateways/PrismaOutboxStore';
import { BillingCommandHandler } from '../../src/adapters/messaging/BillingCommandHandler';
import { SqsMessageSender } from '../../src/adapters/messaging/SqsMessageSender';
import { SqsQueuePoller } from '../../src/frameworks/messaging/SqsQueuePoller';
import { CancelBudgetUseCase } from '../../src/use-cases/budgets/CancelBudgetUseCase';
import { PublishPendingMessagesUseCase } from '../../src/use-cases/messaging/PublishPendingMessagesUseCase';

const silentLog = pino({ level: 'silent' });
const noTrace = { currentTraceparent: () => undefined };
const serviceOrderId = '11111111-1111-4111-8111-111111111111';

let sqs: SQSClient;
let queues: Record<SagaQueue, FifoQueue>;
let poller: SqsQueuePoller;
let publish: PublishPendingMessagesUseCase;

beforeAll(async () => {
  await connectTestDB();
  sqs = await startLocalStack();
  queues = await createSagaQueues(sqs);

  const cancelBudget = new CancelBudgetUseCase(new PrismaUnitOfWork(prisma, noTrace));
  const handler = new BillingCommandHandler({ CancelBudget: (command) => cancelBudget.execute(command) });
  poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queues['billing-commands'].url }, handler, silentLog, { waitTimeSeconds: 1 });

  const sender = new SqsMessageSender(sqs, { 'saga-replies': queues['saga-replies'].url }, { record: jest.fn() });
  publish = new PublishPendingMessagesUseCase(new PrismaOutboxStore(prisma), sender);
});

afterAll(async () => {
  await stopLocalStack();
  await disconnectTestDB();
});

afterEach(async () => { await clearTestDB(); });

describe('Budget cancellation', () => {
  it('GIVEN an approved budget WHEN CancelBudget is consumed THEN the budget is CANCELLED and BudgetCancelled is published', async () => {
    // GIVEN
    await prisma.budget.create({
      data: {
        serviceOrderId,
        customerId: '22222222-2222-4222-8222-222222222222',
        customerName: 'Maria Souza',
        customerEmail: 'maria@example.com',
        total: 191,
        status: 'APPROVED',
        decidedAt: new Date(),
      },
    });
    await sqs.send(new SendMessageCommand({
      QueueUrl: queues['billing-commands'].url,
      MessageGroupId: serviceOrderId,
      MessageDeduplicationId: '33333333-3333-4333-8333-333333333333',
      MessageBody: JSON.stringify({
        messageId: '33333333-3333-4333-8333-333333333333',
        type: 'CancelBudget',
        serviceOrderId,
        occurredAt: new Date().toISOString(),
        payload: { reason: 'PAYMENT_FAILED' },
      }),
    }));

    // WHEN
    await poller.pollOnce();
    await publish.execute(10);

    // THEN
    const budget = await prisma.budget.findUniqueOrThrow({ where: { serviceOrderId } });
    expect(budget.status).toBe('CANCELLED');
    const replies = await receiveAll(sqs, queues['saga-replies'].url);
    expect(replies.map((m) => JSON.parse(m.Body ?? '{}'))).toEqual([
      expect.objectContaining({ type: 'BudgetCancelled', serviceOrderId, payload: {} }),
    ]);
  });
});
