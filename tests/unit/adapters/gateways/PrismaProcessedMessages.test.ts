import { PrismaProcessedMessages } from '../../../../src/adapters/gateways/PrismaProcessedMessages';
import { PrismaExecutor } from '../../../../src/adapters/gateways/prismaExecutor';

function makePrisma(count: number) {
  return { processedMessage: { createMany: jest.fn().mockResolvedValue({ count }) } };
}

describe('PrismaProcessedMessages', () => {
  it('should report a first delivery GIVEN a message id not yet recorded WHEN marking it', async () => {
    const prisma = makePrisma(1);

    const first = await new PrismaProcessedMessages(prisma as unknown as PrismaExecutor).markProcessed('m-1', 'GenerateBudget');

    expect(first).toBe(true);
    expect(prisma.processedMessage.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'm-1', type: 'GenerateBudget' }],
      skipDuplicates: true,
    });
  });

  it('should report a repeat GIVEN a message id already recorded WHEN marking it', async () => {
    const prisma = makePrisma(0);

    expect(await new PrismaProcessedMessages(prisma as unknown as PrismaExecutor).markProcessed('m-1', 'GenerateBudget')).toBe(false);
  });
});
