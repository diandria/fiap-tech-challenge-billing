import { createHmac } from 'node:crypto';
import request from 'supertest';
import { Application } from 'express';
import { connectTestDB, disconnectTestDB, clearTestDB, createTestApp, prisma, TEST_WEBHOOK_SECRET } from '../helpers/testSetup';
import { FakePaymentGateway } from '../helpers/fakePaymentGateway';
import { ProviderPayment } from '../../src/use-cases/ports/IPaymentGateway';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const providerPaymentId = '1234567890';

let gateway: FakePaymentGateway;
let app: Application;

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => { await disconnectTestDB(); });

beforeEach(() => {
  gateway = new FakePaymentGateway();
  app = createTestApp(gateway);
});
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
      payment: { create: { preferenceId: 'pref-1', checkoutUrl: 'https://checkout.test/pref-1', amount: 191 } },
    },
    include: { payment: true },
  });
  return budget.payment!.id;
}

function providerReports(overrides: Partial<ProviderPayment>): void {
  gateway.payments.set(providerPaymentId, {
    providerPaymentId,
    serviceOrderId,
    amount: 191,
    status: 'APPROVED',
    statusDetail: 'accredited',
    ...overrides,
  });
}

function notify(options: { secret?: string; requestId?: string } = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = options.requestId ?? 'req-1';
  const v1 = createHmac('sha256', options.secret ?? TEST_WEBHOOK_SECRET)
    .update(`id:${providerPaymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');

  return request(app)
    .post(`/payments/notifications?data.id=${providerPaymentId}&type=payment`)
    .set('x-signature', `ts=${ts},v1=${v1}`)
    .set('x-request-id', requestId)
    .send({ action: 'payment.updated', type: 'payment', data: { id: providerPaymentId } });
}

describe('Mercado Pago notifications', () => {
  it('GIVEN a pending payment and an approved provider payment WHEN a signed notification arrives THEN returns 200 and PaymentConfirmed is in the outbox', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    providerReports({ status: 'APPROVED' });

    // WHEN
    const res = await notify();

    // THEN
    expect(res.status).toBe(200);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment).toMatchObject({ status: 'APPROVED', providerPaymentId });
    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ type: 'PaymentConfirmed', serviceOrderId, payload: { paymentId, amount: 191 } });
  });

  it('GIVEN a rejected provider payment WHEN a signed notification arrives THEN the payment is REJECTED and PaymentFailed is in the outbox', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    providerReports({ status: 'REJECTED', statusDetail: 'cc_rejected_other_reason' });

    // WHEN
    const res = await notify();

    // THEN
    expect(res.status).toBe(200);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment).toMatchObject({ status: 'REJECTED', failureReason: 'cc_rejected_other_reason' });
    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox.map((m) => m.type)).toEqual(['PaymentFailed']);
  });

  it('GIVEN an invalid signature WHEN a notification arrives THEN returns 401 and nothing changes', async () => {
    // GIVEN
    const paymentId = await seedPendingPayment();
    providerReports({ status: 'APPROVED' });

    // WHEN
    const res = await notify({ secret: 'not-the-webhook-secret' });

    // THEN
    expect(res.status).toBe(401);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('PENDING');
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('GIVEN the same notification twice WHEN both are processed THEN only one PaymentConfirmed exists', async () => {
    // GIVEN
    await seedPendingPayment();
    providerReports({ status: 'APPROVED' });

    // WHEN
    const responses = await Promise.all([notify({ requestId: 'req-1' }), notify({ requestId: 'req-2' })]);

    // THEN
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.outboxMessage.count({ where: { type: 'PaymentConfirmed' } })).toBe(1);
  });

  it('GIVEN a notification of another topic WHEN it arrives signed THEN returns 200 without asking the provider', async () => {
    // GIVEN
    await seedPendingPayment();
    const findPayment = jest.spyOn(gateway, 'findPayment');
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = createHmac('sha256', TEST_WEBHOOK_SECRET).update(`id:555;request-id:req-9;ts:${ts};`).digest('hex');

    // WHEN
    const res = await request(app)
      .post('/payments/notifications?data.id=555&type=merchant_order')
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', 'req-9');

    // THEN
    expect(res.status).toBe(200);
    expect(findPayment).not.toHaveBeenCalled();
  });
});
