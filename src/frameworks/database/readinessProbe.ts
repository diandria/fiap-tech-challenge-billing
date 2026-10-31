import { PrismaClient } from '@prisma/client';
import { ReadinessCheck } from '../http/routes/healthRoutes';

/**
 * A trivial query, to prove the connection answers. SELECT 1 touches no table,
 * so the probe does not depend on the schema being migrated.
 */
export function databaseReadiness(prisma: PrismaClient): ReadinessCheck {
  return () => prisma.$queryRaw`SELECT 1`;
}
