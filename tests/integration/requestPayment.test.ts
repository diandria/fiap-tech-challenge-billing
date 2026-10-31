import pino from 'pino';
import request from 'supertest';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { connectTestDB, disconnectTestDB, clearTestDB, createTestApp, prisma } from '../helpers/testSetup';
import { startLocalStack, stopLocalStack, createSagaQueues, SagaQueue, FifoQueue } from '../helpers/localstack';
import { FakePaymentGateway } from '../helpers/fakePaymentGateway';
import { signCustomerToken } from '../helpers/tokens';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { PostgresBudgetRepository } from '../../src/adapters/gateways/PostgresBudgetRepository';
import { PostgresPaymentRepository } from '../../src/adapters/gateways/PostgresPaymentRepository';
import { BillingCommandHandler } from '../../src/adapters/messaging/BillingCommandHandler';
import { SqsQueuePoller } from '../../src/frameworks/messaging/SqsQueuePoller';
import { RequestPaymentUseCase } from '../../src/use-cases/payments/RequestPaymentUseCase';

const silentLog = pino({ level: 'silent' });
const noTrace = { currentTraceparent: () => undefined };
const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';

let sqs: SQSClient;
let queues: Record<SagaQueue, FifoQueue>;
let poller: SqsQueuePoller;

beforeAll(async () => {
  process.env.JWT_SECRET = 'request-payment-secret';
  await connectTestDB();
  sqs = await startLocalStack();
  queues = await createSagaQueues(sqs);

  const requestPayment = new RequestPaymentUseCase(
    new PrismaUnitOfWork(prisma, noTrace),
    new PostgresBudgetRepository(prisma),
    new PostgresPaymentRepository(prisma),
    new FakePaymentGateway(),
  );
  const handler = new BillingCommandHandler({ RequestPayment: (command) => requestPayment.execute(command) });
  poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queues['billing-commands'].url }, handler, silentLog, { waitTimeSeconds: 1 });
});

afterAll(async () => {
  await stopLocalStack();
  await disconnectTestDB();
});

afterEach(async () => { await clearTestDB(); });

async function seedApprovedBudget(): Promise<string> {
  const budget = await prisma.budget.create({
    data: {
      serviceOrderId,
      customerId,
      customerName: 'Maria Souza',
      customerEmail: 'maria@example.com',
      total: 191,
      status: 'APPROVED',
      decidedAt: new Date(),
    },
  });
  return budget.id;
}

describe('Payment request', () => {
  it('GIVEN an approved budget WHEN RequestPayment is consumed THEN a pending payment with the checkout url exists', async () => {
    // GIVEN
    const budgetId = await seedApprovedBudget();
    await sqs.send(new SendMessageCommand({
      QueueUrl: queues['billing-commands'].url,
      MessageGroupId: serviceOrderId,
      MessageDeduplicationId: '33333333-3333-4333-8333-333333333333',
      MessageBody: JSON.stringify({
        messageId: '33333333-3333-4333-8333-333333333333',
        type: 'RequestPayment',
        serviceOrderId,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    }));

    // WHEN
    const handled = await poller.pollOnce();

    // THEN
    expect(handled).toBe(1);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { budgetId } });
    expect(payment.status).toBe('PENDING');
    expect(Number(payment.amount)).toBe(191);
    expect(payment.checkoutUrl).toMatch(/^https:\/\/checkout\.test\/pref-/);
  });

  it('GIVEN an approved budget with a payment WHEN GET /service-orders/:id/budget THEN the response carries the checkout url', async () => {
    // GIVEN
    const budgetId = await seedApprovedBudget();
    await prisma.payment.create({
      data: { budgetId, preferenceId: 'pref-1', checkoutUrl: 'https://checkout.test/pref-1', amount: 191 },
    });

    // WHEN
    const res = await request(createTestApp())
      .get(`/service-orders/${serviceOrderId}/budget`)
      .set('Authorization', `Bearer ${signCustomerToken(customerId)}`);

    // THEN
    expect(res.status).toBe(200);
    expect(res.body.payment).toEqual({ status: 'PENDING', checkoutUrl: 'https://checkout.test/pref-1' });
  });
});
