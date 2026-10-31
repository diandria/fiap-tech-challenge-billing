import request from 'supertest';
import { connectTestDB, disconnectTestDB, clearTestDB, createTestApp, prisma } from '../helpers/testSetup';
import { signStaffToken } from '../helpers/tokens';
import { FakePaymentGateway } from '../helpers/fakePaymentGateway';
import { MockPaymentGateway } from '../../src/adapters/payments/MockPaymentGateway';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  process.env.JWT_SECRET = 'mock-payment-secret';
  await connectTestDB();
});
afterAll(async () => { await disconnectTestDB(); });
afterEach(async () => { await clearTestDB(); });

async function seedPendingPayment(): Promise<string> {
  const budget = await prisma.budget.create({
    data: {
      serviceOrderId,
      customerId: '22222222-2222-4222-8222-222222222222',
      customerName: 'Maria Souza',
      customerEmail: 'maria@example.com',
      total: 191,
      status: 'APPROVED',
      decidedAt: new Date(),
      payment: { create: { preferenceId: `mock-pref-${serviceOrderId}`, checkoutUrl: `/payments/mock/${serviceOrderId}`, amount: 191 } },
    },
    include: { payment: true },
  });
  return budget.payment!.id;
}

function simulate(app: ReturnType<typeof createTestApp>, status: string, token = signStaffToken('admin')) {
  return request(app)
    .post(`/payments/mock/${serviceOrderId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

describe('Simulated payment provider', () => {
  it('GIVEN mock mode and a pending payment WHEN an admin POSTs approved to /payments/mock/:id THEN returns 200 and PaymentConfirmed is in the outbox', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    const app = createTestApp(new MockPaymentGateway());

    // WHEN
    const res = await simulate(app, 'approved');

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 'confirmed' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: 'APPROVED' });
    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ type: 'PaymentConfirmed', serviceOrderId, payload: { paymentId, amount: 191 } });
  });

  it('GIVEN mock mode and a pending payment WHEN an admin POSTs rejected THEN the payment is REJECTED and PaymentFailed is in the outbox', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    const app = createTestApp(new MockPaymentGateway());

    // WHEN
    const res = await simulate(app, 'rejected');

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: 'failed' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: 'REJECTED', failureReason: 'mock' });
    expect((await prisma.outboxMessage.findMany()).map((m) => m.type)).toEqual(['PaymentFailed']);
  });

  it('GIVEN mock mode WHEN a mechanic POSTs approved THEN returns 403 and nothing changes', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    const app = createTestApp(new MockPaymentGateway());

    // WHEN
    const res = await simulate(app, 'approved', signStaffToken('mechanic'));

    // THEN
    expect(res.status).toBe(403);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: 'PENDING' });
  });

  it('GIVEN mock mode and an order without a pending payment WHEN an admin POSTs approved THEN returns 404', async () => {
    // GIVEN
    const app = createTestApp(new MockPaymentGateway());

    // WHEN
    const res = await simulate(app, 'approved');

    // THEN
    expect(res.status).toBe(404);
  });

  it('GIVEN the mercado pago provider WHEN POST /payments/mock/:id THEN returns 404', async () => {
    // GIVEN
    await seedPendingPayment();
    const app = createTestApp(new FakePaymentGateway());

    // WHEN
    const res = await simulate(app, 'approved');

    // THEN
    expect(res.status).toBe(404);
    expect(await prisma.outboxMessage.count()).toBe(0);
  });
});
