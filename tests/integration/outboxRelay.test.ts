import { SQSClient } from '@aws-sdk/client-sqs';
import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { startLocalStack, stopLocalStack, createSagaQueues, receiveAll, SagaQueue, FifoQueue } from '../helpers/localstack';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { PrismaOutboxStore } from '../../src/adapters/gateways/PrismaOutboxStore';
import { SqsMessageSender } from '../../src/adapters/messaging/SqsMessageSender';
import { PublishPendingMessagesUseCase } from '../../src/use-cases/messaging/PublishPendingMessagesUseCase';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const noTrace = { currentTraceparent: () => undefined };

let sqs: SQSClient;
let queues: Record<SagaQueue, FifoQueue>;
let publish: PublishPendingMessagesUseCase;

beforeAll(async () => {
  await connectTestDB();
  sqs = await startLocalStack();
  queues = await createSagaQueues(sqs);
  const sender = new SqsMessageSender(sqs, { 'saga-replies': queues['saga-replies'].url }, { record: jest.fn() });
  publish = new PublishPendingMessagesUseCase(new PrismaOutboxStore(prisma), sender);
});

afterAll(async () => {
  await stopLocalStack();
  await disconnectTestDB();
});

afterEach(async () => { await clearTestDB(); });

async function storeReply(type: string): Promise<void> {
  await new PrismaUnitOfWork(prisma, noTrace).run(({ outbox }) =>
    outbox.add({ destination: 'saga-replies', type, serviceOrderId, payload: { step: type } }));
}

describe('Outbox relay', () => {
  it('GIVEN a pending reply in the outbox WHEN the relay runs THEN it reaches the saga replies queue with the order id as group', async () => {
    // GIVEN
    await storeReply('BudgetGenerated');

    // WHEN
    const sent = await publish.execute(10);

    // THEN
    expect(sent).toBe(1);
    const messages = await receiveAll(sqs, queues['saga-replies'].url);
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0].Body ?? '{}')).toMatchObject({ type: 'BudgetGenerated', serviceOrderId });
    expect(messages[0].Attributes?.MessageGroupId).toBe(serviceOrderId);
    expect(await prisma.outboxMessage.count({ where: { publishedAt: null } })).toBe(0);
  });

  it('GIVEN a reply already published WHEN the relay runs again THEN it is not sent a second time', async () => {
    // GIVEN
    await storeReply('BudgetCancelled');
    await publish.execute(10);

    // WHEN
    const sent = await publish.execute(10);

    // THEN
    expect(sent).toBe(0);
  });
});
