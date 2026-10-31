import { Prisma, PrismaClient } from '@prisma/client';

/** The full client, or the client of an interactive transaction already in progress. */
export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;
