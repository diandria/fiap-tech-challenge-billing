import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { Application } from 'express';
import { createApp } from '../../src/app';
import { databaseReadiness } from '../../src/frameworks/database/readinessProbe';
import { budgetRoutes } from '../../src/frameworks/http/routes/budgetRoutes';
import { BudgetController } from '../../src/adapters/controllers/BudgetController';
import { PostgresBudgetRepository } from '../../src/adapters/gateways/PostgresBudgetRepository';
import { PostgresPaymentRepository } from '../../src/adapters/gateways/PostgresPaymentRepository';
import { PrismaUnitOfWork } from '../../src/adapters/gateways/PrismaUnitOfWork';
import { AsyncLocalStorageTraceContext } from '../../src/frameworks/logging/AsyncLocalStorageTraceContext';
import { GetBudgetUseCase } from '../../src/use-cases/budgets/GetBudgetUseCase';
import { DecideBudgetUseCase } from '../../src/use-cases/budgets/DecideBudgetUseCase';

let container: StartedPostgreSqlContainer | undefined;
export let prisma: PrismaClient;

export async function connectTestDB(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });

  prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
  await prisma.$connect();
}

export async function disconnectTestDB(): Promise<void> {
  await prisma?.$disconnect();
  await container?.stop();
}

export async function clearTestDB(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE payments, budget_lines, budgets, outbox_messages, processed_messages');
}

export function createTestApp(): Application {
  const unitOfWork = new PrismaUnitOfWork(prisma, new AsyncLocalStorageTraceContext());
  const budgetController = new BudgetController(
    new GetBudgetUseCase(new PostgresBudgetRepository(prisma), new PostgresPaymentRepository(prisma)),
    new DecideBudgetUseCase(unitOfWork),
  );
  return createApp(databaseReadiness(prisma), { budgets: budgetRoutes(budgetController) });
}
