import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { ITraceContext } from '../../src/use-cases/ports/ITraceContext';

const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const tracing: ITraceContext = { currentTraceparent: () => traceparent };
const serviceOrderId = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });
afterEach(async () => { await clearTestDB(); });

describe('Transactional outbox', () => {
  it('GIVEN a unit of work that adds a message and then throws WHEN it runs THEN no outbox row exists', async () => {
    // GIVEN
    const unitOfWork = new PrismaUnitOfWork(prisma, tracing);

    // WHEN
    const run = unitOfWork.run(async ({ outbox }) => {
      await outbox.add({ destination: 'saga-replies', type: 'BudgetGenerated', serviceOrderId, payload: {} });
      throw new Error('budget insert failed');
    });

    // THEN
    await expect(run).rejects.toThrow('budget insert failed');
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('GIVEN a unit of work that adds a message WHEN it commits THEN one unpublished outbox row exists with the envelope fields', async () => {
    // GIVEN
    const unitOfWork = new PrismaUnitOfWork(prisma, tracing);

    // WHEN
    await unitOfWork.run(async ({ outbox }) => {
      await outbox.add({
        destination: 'saga-replies',
        type: 'BudgetGenerated',
        serviceOrderId,
        payload: { total: 150 },
      });
    });

    // THEN
    const rows = await prisma.outboxMessage.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      destination: 'saga-replies',
      type: 'BudgetGenerated',
      serviceOrderId,
      payload: { total: 150 },
      traceparent,
      publishedAt: null,
    });
  });
});
