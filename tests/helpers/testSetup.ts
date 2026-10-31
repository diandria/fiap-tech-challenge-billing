import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { Application } from 'express';
import { createApp, AppRoutes } from '../../src/app';
import { databaseReadiness } from '../../src/frameworks/database/readinessProbe';
import { budgetRoutes } from '../../src/frameworks/http/routes/budgetRoutes';
import { BudgetController } from '../../src/adapters/controllers/BudgetController';
import { PostgresBudgetRepository } from '../../src/adapters/gateways/PostgresBudgetRepository';
import { PostgresPaymentRepository } from '../../src/adapters/gateways/PostgresPaymentRepository';
import { paymentNotificationRoutes } from '../../src/frameworks/http/routes/paymentNotificationRoutes';
import { PaymentNotificationController } from '../../src/adapters/controllers/PaymentNotificationController';
import { ConfirmPaymentUseCase } from '../../src/use-cases/payments/ConfirmPaymentUseCase';
import { IPaymentGateway } from '../../src/use-cases/ports/IPaymentGateway';
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

export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

const silentLogger = { warn: () => undefined, error: () => undefined };

/** The app wired as in production; the payment routes exist only when a gateway is given. */
export function createTestApp(paymentGateway?: IPaymentGateway): Application {
  const unitOfWork = new PrismaUnitOfWork(prisma, new AsyncLocalStorageTraceContext());
  const budgets = new PostgresBudgetRepository(prisma);
  const payments = new PostgresPaymentRepository(prisma);

  const routes: AppRoutes = {
    budgets: budgetRoutes(new BudgetController(new GetBudgetUseCase(budgets, payments), new DecideBudgetUseCase(unitOfWork))),
  };
  if (paymentGateway) {
    const confirmPayment = new ConfirmPaymentUseCase(unitOfWork, budgets, payments, paymentGateway, silentLogger);
    routes.payments = paymentNotificationRoutes(new PaymentNotificationController(confirmPayment), TEST_WEBHOOK_SECRET);
  }
  return createApp(databaseReadiness(prisma), routes);
}
