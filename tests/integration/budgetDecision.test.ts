import request from 'supertest';
import { Application } from 'express';
import { connectTestDB, disconnectTestDB, clearTestDB, createTestApp, prisma } from '../helpers/testSetup';
import { signCustomerToken, signStaffToken } from '../helpers/tokens';

const ownerId = '22222222-2222-4222-8222-222222222222';
const strangerId = '33333333-3333-4333-8333-333333333333';
let orderSequence = 0;

let app: Application;

beforeAll(async () => {
  process.env.JWT_SECRET = 'budget-decision-secret';
  await connectTestDB();
  app = createTestApp();
});
afterAll(async () => { await disconnectTestDB(); });
afterEach(async () => { await clearTestDB(); });

/** A new order id per test keeps the rate limit counters of different tests apart. */
async function seedPendingBudget(): Promise<string> {
  orderSequence += 1;
  const serviceOrderId = `11111111-1111-4111-8111-${String(orderSequence).padStart(12, '0')}`;
  await prisma.budget.create({
    data: {
      serviceOrderId,
      customerId: ownerId,
      customerName: 'Maria Souza',
      customerEmail: 'maria@example.com',
      total: 191,
      lines: {
        create: [
          { kind: 'SERVICE', referenceId: '44444444-4444-4444-8444-444444444444', description: 'Oil change', unitPrice: 120, quantity: 1 },
          { kind: 'ITEM', referenceId: '55555555-5555-4555-8555-555555555555', description: 'Oil filter', unitPrice: 35.5, quantity: 2 },
        ],
      },
    },
  });
  return serviceOrderId;
}

function decide(serviceOrderId: string, token: string, body: object) {
  return request(app)
    .patch(`/service-orders/${serviceOrderId}/budget`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Customer budget decision', () => {
  it('GIVEN a pending budget and the owner token WHEN PATCH /service-orders/:id/budget with APPROVED and the right code THEN returns 200 and BudgetApproved is in the outbox', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'APPROVED', code: '5299' });

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ serviceOrderId, status: 'APPROVED', total: 191, payment: null });
    const outbox = await prisma.outboxMessage.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ type: 'BudgetApproved', serviceOrderId, destination: 'saga-replies' });
  });

  it('GIVEN a pending budget WHEN another customer decides THEN returns 403 and the budget stays pending', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(strangerId), { status: 'APPROVED', code: '5299' });

    // THEN
    expect(res.status).toBe(403);
    const budget = await prisma.budget.findUniqueOrThrow({ where: { serviceOrderId } });
    expect(budget.status).toBe('PENDING_APPROVAL');
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('GIVEN a pending budget WHEN the code is wrong THEN returns 400', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'REJECTED', code: '0000' });

    // THEN
    expect(res.status).toBe(400);
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('GIVEN a decided budget WHEN the owner decides again THEN returns 400', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();
    await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'REJECTED', code: '5299' });

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'APPROVED', code: '5299' });

    // THEN
    expect(res.status).toBe(400);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });

  it('GIVEN an unsupported status WHEN the owner decides THEN returns 400', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'MAYBE', code: '5299' });

    // THEN
    expect(res.status).toBe(400);
  });

  it('GIVEN a staff token WHEN PATCH budget THEN returns 403', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await decide(serviceOrderId, signStaffToken('admin'), { status: 'APPROVED', code: '5299' });

    // THEN
    expect(res.status).toBe(403);
  });

  it('GIVEN six attempts within an hour WHEN PATCH budget THEN the sixth returns 429', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();
    for (let attempt = 0; attempt < 5; attempt++) {
      await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'APPROVED', code: '0000' });
    }

    // WHEN
    const res = await decide(serviceOrderId, signCustomerToken(ownerId), { status: 'APPROVED', code: '5299' });

    // THEN
    expect(res.status).toBe(429);
  });
});

describe('Budget query', () => {
  it('GIVEN a staff token WHEN GET /service-orders/:id/budget THEN returns 200', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await request(app).get(`/service-orders/${serviceOrderId}/budget`).set('Authorization', `Bearer ${signStaffToken()}`);

    // THEN
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ serviceOrderId, status: 'PENDING_APPROVAL', total: 191, payment: null });
    expect(res.body.lines).toHaveLength(2);
  });

  it('GIVEN another customer token WHEN GET /service-orders/:id/budget THEN returns 403', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await request(app).get(`/service-orders/${serviceOrderId}/budget`).set('Authorization', `Bearer ${signCustomerToken(strangerId)}`);

    // THEN
    expect(res.status).toBe(403);
  });

  it('GIVEN an order without budget WHEN GET /service-orders/:id/budget THEN returns 404', async () => {
    // GIVEN
    const serviceOrderId = '99999999-9999-4999-8999-999999999999';

    // WHEN
    const res = await request(app).get(`/service-orders/${serviceOrderId}/budget`).set('Authorization', `Bearer ${signStaffToken()}`);

    // THEN
    expect(res.status).toBe(404);
  });

  it('GIVEN no token WHEN GET /service-orders/:id/budget THEN returns 401', async () => {
    // GIVEN
    const serviceOrderId = await seedPendingBudget();

    // WHEN
    const res = await request(app).get(`/service-orders/${serviceOrderId}/budget`);

    // THEN
    expect(res.status).toBe(401);
  });
});
