import pino from 'pino';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { startLocalStack, stopLocalStack, createFifoQueue, receiveAll, FifoQueue } from '../helpers/localstack';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { BillingCommandHandler } from '../../src/adapters/messaging/BillingCommandHandler';
import { SqsQueuePoller } from '../../src/frameworks/messaging/SqsQueuePoller';
import { MessageEnvelope } from '../../src/use-cases/messaging/MessageEnvelope';

const silentLog = pino({ level: 'silent' });
const noTrace = { currentTraceparent: () => undefined };

let sqs: SQSClient;
let queueCount = 0;

beforeAll(async () => {
  await connectTestDB();
  sqs = await startLocalStack();
});

afterAll(async () => {
  await stopLocalStack();
  await disconnectTestDB();
});

afterEach(async () => { await clearTestDB(); });

function command(messageId: string, type = 'GenerateBudget'): MessageEnvelope {
  return {
    messageId,
    type,
    serviceOrderId: '11111111-1111-4111-8111-111111111111',
    occurredAt: new Date().toISOString(),
    payload: { lines: [] },
  };
}

async function deliver(queue: FifoQueue, message: MessageEnvelope, deduplicationId = message.messageId): Promise<void> {
  await sqs.send(new SendMessageCommand({
    QueueUrl: queue.url,
    MessageBody: JSON.stringify(message),
    MessageGroupId: message.serviceOrderId,
    MessageDeduplicationId: deduplicationId,
  }));
}

/** A command handler whose effect is recorded only on the first delivery of each message. */
function recordingHandler(effects: string[]): BillingCommandHandler {
  const unitOfWork = new PrismaUnitOfWork(prisma, noTrace);
  return new BillingCommandHandler({
    GenerateBudget: (message) => unitOfWork.run(async ({ processedMessages }) => {
      if (await processedMessages.markProcessed(message.messageId, message.type)) effects.push(message.messageId);
    }),
  });
}

async function newQueue(options?: { maxReceiveCount?: number; visibilityTimeoutSeconds?: number }): Promise<FifoQueue> {
  queueCount += 1;
  return createFifoQueue(sqs, `billing-consumer-test-${queueCount}`, options);
}

describe('Billing command consumer', () => {
  it('GIVEN a command on the queue WHEN the poller runs THEN the handler receives it once and the message is deleted', async () => {
    // GIVEN
    const queue = await newQueue();
    const effects: string[] = [];
    await deliver(queue, command('33333333-3333-4333-8333-333333333333'));
    const poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queue.url }, recordingHandler(effects), silentLog, { waitTimeSeconds: 1 });

    // WHEN
    const handled = await poller.pollOnce();

    // THEN
    expect(handled).toBe(1);
    expect(effects).toEqual(['33333333-3333-4333-8333-333333333333']);
    expect(await receiveAll(sqs, queue.url)).toHaveLength(0);
  });

  it('GIVEN the same command delivered twice WHEN both are handled THEN the handler effect happens once', async () => {
    // GIVEN
    const queue = await newQueue();
    const effects: string[] = [];
    const repeated = command('44444444-4444-4444-8444-444444444444');
    await deliver(queue, repeated, 'first-send');
    await deliver(queue, repeated, 'second-send');
    const poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queue.url }, recordingHandler(effects), silentLog, { waitTimeSeconds: 1 });

    // WHEN
    const handled = (await poller.pollOnce()) + (await poller.pollOnce());

    // THEN
    expect(handled).toBe(2);
    expect(effects).toEqual(['44444444-4444-4444-8444-444444444444']);
    expect(await prisma.processedMessage.count()).toBe(1);
  });

  it('GIVEN a command with an unknown type WHEN it is received five times THEN it lands in the dead-letter queue', async () => {
    // GIVEN
    const queue = await newQueue({ maxReceiveCount: 5, visibilityTimeoutSeconds: 1 });
    await deliver(queue, command('55555555-5555-4555-8555-555555555555', 'ShipParts'));
    const poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queue.url }, recordingHandler([]), silentLog, { waitTimeSeconds: 2 });

    // WHEN
    for (let attempt = 0; attempt < 7; attempt++) {
      await poller.pollOnce();
    }

    // THEN
    const deadLetters = await receiveAll(sqs, queue.deadLetterUrl, 2);
    expect(deadLetters.map((m) => JSON.parse(m.Body ?? '{}').messageId)).toEqual(['55555555-5555-4555-8555-555555555555']);
  });
});
