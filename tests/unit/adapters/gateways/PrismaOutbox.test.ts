import { PrismaOutbox } from '../../../../src/adapters/gateways/PrismaOutbox';
import { PrismaExecutor } from '../../../../src/adapters/gateways/prismaExecutor';

const message = {
  destination: 'saga-replies' as const,
  type: 'BudgetGenerated',
  serviceOrderId: '11111111-1111-4111-8111-111111111111',
  payload: {},
};

function makePrisma() {
  return { outboxMessage: { create: jest.fn().mockResolvedValue({}) } };
}

describe('PrismaOutbox', () => {
  it('should store the message with a fresh uuid and the current traceparent GIVEN a traced context WHEN adding', async () => {
    const prisma = makePrisma();
    const outbox = new PrismaOutbox(prisma as unknown as PrismaExecutor, { currentTraceparent: () => '00-abc-def-01' });

    await outbox.add(message);

    const { data } = prisma.outboxMessage.create.mock.calls[0][0];
    expect(data).toMatchObject({ ...message, traceparent: '00-abc-def-01' });
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should store no traceparent GIVEN no active trace WHEN adding', async () => {
    const prisma = makePrisma();
    const outbox = new PrismaOutbox(prisma as unknown as PrismaExecutor, { currentTraceparent: () => undefined });

    await outbox.add(message);

    const { data } = prisma.outboxMessage.create.mock.calls[0][0];
    expect(data.traceparent).toBeNull();
  });

  it('should give each message its own id GIVEN two messages WHEN adding', async () => {
    const prisma = makePrisma();
    const outbox = new PrismaOutbox(prisma as unknown as PrismaExecutor, { currentTraceparent: () => undefined });

    await outbox.add(message);
    await outbox.add(message);

    const [first, second] = prisma.outboxMessage.create.mock.calls.map((call) => call[0].data.id);
    expect(first).not.toBe(second);
  });
});
