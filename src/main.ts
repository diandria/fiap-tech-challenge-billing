import 'dotenv/config';
// First runtime import: auto-instrumentation has to patch http and express
// before those modules load.
import './frameworks/tracing/start';
import { SQSClient } from '@aws-sdk/client-sqs';
import { createApp } from './app';
import { budgetRoutes } from './frameworks/http/routes/budgetRoutes';
import { BudgetController } from './adapters/controllers/BudgetController';
import { PostgresBudgetRepository } from './adapters/gateways/PostgresBudgetRepository';
import { prisma, disconnectPrisma } from './frameworks/database/prismaClient';
import { databaseReadiness } from './frameworks/database/readinessProbe';
import { logger } from './frameworks/logging/logger';
import { readQueueConfig, QueueConfig } from './frameworks/messaging/queueConfig';
import { OutboxRelay } from './frameworks/messaging/OutboxRelay';
import { SqsQueuePoller } from './frameworks/messaging/SqsQueuePoller';
import { PrometheusIntegrationFailures } from './frameworks/metrics/PrometheusIntegrationFailures';
import { AsyncLocalStorageTraceContext } from './frameworks/logging/AsyncLocalStorageTraceContext';
import { PrismaUnitOfWork } from './adapters/gateways/PrismaUnitOfWork';
import { PrismaOutboxStore } from './adapters/gateways/PrismaOutboxStore';
import { SqsMessageSender } from './adapters/messaging/SqsMessageSender';
import { BillingCommandHandler } from './adapters/messaging/BillingCommandHandler';
import { PublishPendingMessagesUseCase } from './use-cases/messaging/PublishPendingMessagesUseCase';
import { GenerateBudgetUseCase } from './use-cases/budgets/GenerateBudgetUseCase';
import { CancelBudgetUseCase } from './use-cases/budgets/CancelBudgetUseCase';
import { GetBudgetUseCase } from './use-cases/budgets/GetBudgetUseCase';
import { DecideBudgetUseCase } from './use-cases/budgets/DecideBudgetUseCase';
import { IUnitOfWork } from './use-cases/ports/IUnitOfWork';

const PORT = process.env.PORT ?? 3000;

interface Messaging {
  stop(): Promise<void>;
}

function startMessaging(queues: QueueConfig, unitOfWork: IUnitOfWork): Messaging {
  const sqs = new SQSClient({});
  const sender = new SqsMessageSender(sqs, queues.destinations, new PrometheusIntegrationFailures());
  const relay = new OutboxRelay(new PublishPendingMessagesUseCase(new PrismaOutboxStore(prisma), sender), logger);

  const generateBudget = new GenerateBudgetUseCase(unitOfWork);
  const cancelBudget = new CancelBudgetUseCase(unitOfWork);
  const commands = new BillingCommandHandler({
    GenerateBudget: (command) => generateBudget.execute(command),
    CancelBudget: (command) => cancelBudget.execute(command),
  });
  const poller = new SqsQueuePoller(sqs, { name: 'billing-commands', url: queues.billingCommands }, commands, logger);

  relay.start();
  poller.start();
  logger.info('saga messaging started');

  return {
    async stop() {
      await poller.stop();
      await relay.stop();
    },
  };
}

async function main(): Promise<void> {
  const queues = readQueueConfig();
  const unitOfWork = new PrismaUnitOfWork(prisma, new AsyncLocalStorageTraceContext());
  const budgetController = new BudgetController(
    new GetBudgetUseCase(new PostgresBudgetRepository(prisma)),
    new DecideBudgetUseCase(unitOfWork),
  );
  const app = createApp(databaseReadiness(prisma), { budgets: budgetRoutes(budgetController) });
  let messaging: Messaging | undefined;

  // The HTTP server starts before the database connects, so the probes answer during startup.
  const server = app.listen(PORT, () => { logger.info({ port: PORT }, 'server started'); });
  process.on('SIGTERM', () => {
    server.close(async () => {
      await messaging?.stop();
      await disconnectPrisma();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 25_000).unref();
  });

  await prisma.$connect();

  if (queues) {
    messaging = startMessaging(queues, unitOfWork);
  } else {
    logger.warn('saga queues are not configured; the service runs without messaging');
  }
}

main().catch((err) => { logger.error({ err }, 'fatal error during startup'); process.exit(1); });
