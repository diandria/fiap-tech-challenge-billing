import { PrismaClient } from '@prisma/client';
import { PrismaUnitOfWork } from '../../../../src/adapters/gateways/PrismaUnitOfWork';
import { PrismaOutbox } from '../../../../src/adapters/gateways/PrismaOutbox';
import { PrismaProcessedMessages } from '../../../../src/adapters/gateways/PrismaProcessedMessages';

describe('PrismaUnitOfWork', () => {
  it('should run the work inside one interactive transaction GIVEN work WHEN run is called', async () => {
    const tx = {};
    const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
    const work = jest.fn().mockResolvedValue('stored');

    const result = await new PrismaUnitOfWork(prisma as unknown as PrismaClient, { currentTraceparent: () => undefined }).run(work);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe('stored');
    const repositories = work.mock.calls[0][0];
    expect(repositories.outbox).toBeInstanceOf(PrismaOutbox);
    expect(repositories.processedMessages).toBeInstanceOf(PrismaProcessedMessages);
  });
});
