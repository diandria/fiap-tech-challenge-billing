import { PrismaClient } from '@prisma/client';

/**
 * Single client instance. Only the composition root (main.ts) and the test
 * setup know this module: gateways receive the client through their constructor.
 */
export const prisma = new PrismaClient({ log: ['warn', 'error'] });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
