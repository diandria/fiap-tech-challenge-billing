import { connectTestDB, disconnectTestDB, clearTestDB, prisma } from '../helpers/testSetup';
import { PostgresBudgetRepository } from '../../src/adapters/gateways/PostgresBudgetRepository';
import { ConflictError } from '../../src/entities/errors/AppError';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });
afterEach(async () => { await clearTestDB(); });

describe('Budget repository', () => {
  it('GIVEN a budget changed after it was read WHEN another change uses the old version THEN it fails with a conflict and the first change stays', async () => {
    // GIVEN
    const budgets = new PostgresBudgetRepository(prisma);
    const created = await budgets.create({
      serviceOrderId,
      customer: { id: '22222222-2222-4222-8222-222222222222', name: 'Maria Souza', email: 'maria@example.com' },
      lines: [],
      total: 0,
    });
    await budgets.updateStatus(created.id, { status: 'APPROVED', decidedAt: new Date() }, created.version);

    // WHEN
    const stale = budgets.updateStatus(created.id, { status: 'REJECTED', decidedAt: new Date() }, created.version);

    // THEN
    await expect(stale).rejects.toThrow(ConflictError);
    const stored = await budgets.findByServiceOrderId(serviceOrderId);
    expect(stored).toMatchObject({ status: 'APPROVED', version: created.version + 1 });
  });
});
