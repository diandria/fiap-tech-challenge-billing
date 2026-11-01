import 'dotenv/config';
// First runtime import: auto-instrumentation has to patch http and express
// before those modules load.
import './frameworks/tracing/start';
import { SQSClient } from '@aws-sdk/client-sqs';
import { createApp, AppRoutes } from './app';
import { budgetRoutes } from './frameworks/http/routes/budgetRoutes';
import { paymentNotificationRoutes } from './frameworks/http/routes/paymentNotificationRoutes';
import { PaymentNotificationController } from './adapters/controllers/PaymentNotificationController';
import { BudgetController } from './adapters/controllers/BudgetController';
import { PostgresBudgetRepository } from './adapters/gateways/PostgresBudgetRepository';
import { PostgresPaymentRepository } from './adapters/gateways/PostgresPaymentRepository';
import { prisma, disconnectPrisma } from './frameworks/database/prismaClient';
import { databaseReadiness } from './frameworks/database/readinessProbe';
import { logger } from './frameworks/logging/logger';
import { readQueueConfig, QueueConfig } from './frameworks/messaging/queueConfig';
import { OutboxRelay } from './frameworks/messaging/OutboxRelay';
import { registerOutboxBacklog } from './frameworks/metrics/outboxBacklog';
import { SqsQueuePoller } from './frameworks/messaging/SqsQueuePoller';
import { PrometheusIntegrationFailures } from './frameworks/metrics/PrometheusIntegrationFailures';
import { AsyncLocalStorageTraceContext } from './frameworks/logging/AsyncLocalStorageTraceContext';
import { PrismaUnitOfWork } from './adapters/gateways/PrismaUnitOfWork';
import { PrismaOutboxStore } from './adapters/gateways/PrismaOutboxStore';
import { SqsMessageSender } from './adapters/messaging/SqsMessageSender';
import { BillingCommandHandler, CommandHandlers } from './adapters/messaging/BillingCommandHandler';
import { PublishPendingMessagesUseCase } from './use-cases/messaging/PublishPendingMessagesUseCase';
import { GenerateBudgetUseCase } from './use-cases/budgets/GenerateBudgetUseCase';
import { CancelBudgetUseCase } from './use-cases/budgets/CancelBudgetUseCase';
import { GetBudgetUseCase } from './use-cases/budgets/GetBudgetUseCase';
import { DecideBudgetUseCase } from './use-cases/budgets/DecideBudgetUseCase';
import { IUnitOfWork } from './use-cases/ports/IUnitOfWork';
import { IPaymentGateway } from './use-cases/ports/IPaymentGateway';
import { RequestPaymentUseCase } from './use-cases/payments/RequestPaymentUseCase';
import { ConfirmPaymentUseCase } from './use-cases/payments/ConfirmPaymentUseCase';
import { PinoLoggerAdapter } from './adapters/logging/PinoLoggerAdapter';
import { createPaymentProvider, PaymentProvider } from './frameworks/payments/paymentGatewayFactory';
import { createCustomerNotifier } from './frameworks/notifications/notifierFactory';
import { ICustomerNotifier } from './use-cases/ports/ICustomerNotifier';
import { mockPaymentRoutes } from './frameworks/http/routes/mockPaymentRoutes';
import { MockPaymentController } from './adapters/controllers/MockPaymentController';

const PORT = process.env.PORT ?? 3000;

interface Messaging {
  stop(): Promise<void>;
}

/** The webhook for the real provider; the simulated payment route for the mock, and never both. */
function paymentRoutes(provider: PaymentProvider, getBudget: GetBudgetUseCase, unitOfWork: IUnitOfWork) {
  const confirmPayment = new ConfirmPaymentUseCase(
    unitOfWork,
    new PostgresBudgetRepository(prisma),
    new PostgresPaymentRepository(prisma),
    provider.gateway,
    new PinoLoggerAdapter(logger),
  );

  if (provider.kind === 'mock') {
    logger.warn('PAYMENT_PROVIDER=mock: payments are simulated and no charge reaches Mercado Pago');
    return mockPaymentRoutes(new MockPaymentController(getBudget, confirmPayment, provider.gateway));
  }
  return paymentNotificationRoutes(new PaymentNotificationController(confirmPayment), provider.webhookSecret);
}

function startMessaging(
  queues: QueueConfig,
  unitOfWork: IUnitOfWork,
  notifier: ICustomerNotifier,
  paymentGateway?: IPaymentGateway,
): Messaging {
  const appLogger = new PinoLoggerAdapter(logger);
  const sqs = new SQSClient({});
  const sender = new SqsMessageSender(sqs, queues.destinations, new PrometheusIntegrationFailures());
  const outbox = new PrismaOutboxStore(prisma);
  const relay = new OutboxRelay(new PublishPendingMessagesUseCase(outbox, sender), logger);
  registerOutboxBacklog(() => outbox.countPending(), logger);

  const generateBudget = new GenerateBudgetUseCase(unitOfWork, notifier, appLogger);
  const cancelBudget = new CancelBudgetUseCase(unitOfWork);
  const handlers: CommandHandlers = {
    GenerateBudget: (command) => generateBudget.execute(command),
    CancelBudget: (command) => cancelBudget.execute(command),
  };

  if (paymentGateway) {
    const requestPayment = new RequestPaymentUseCase(
      unitOfWork,
      new PostgresBudgetRepository(prisma),
      new PostgresPaymentRepository(prisma),
      paymentGateway,
      notifier,
      appLogger,
    );
    handlers.RequestPayment = (command) => requestPayment.execute(command);
  } else {
    logger.warn('no payment provider is configured; RequestPayment commands will fail until one is');
  }

  const commands = new BillingCommandHandler(handlers);
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
  const paymentProvider = createPaymentProvider();
  const notifier = createCustomerNotifier(process.env, logger);

  const unitOfWork = new PrismaUnitOfWork(prisma, new AsyncLocalStorageTraceContext());
  const budgets = new PostgresBudgetRepository(prisma);
  const payments = new PostgresPaymentRepository(prisma);

  const getBudget = new GetBudgetUseCase(budgets, payments);
  const routes: AppRoutes = {
    budgets: budgetRoutes(new BudgetController(getBudget, new DecideBudgetUseCase(unitOfWork))),
    payments: paymentProvider && paymentRoutes(paymentProvider, getBudget, unitOfWork),
  };

  const app = createApp(databaseReadiness(prisma), routes);
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
    messaging = startMessaging(queues, unitOfWork, notifier, paymentProvider?.gateway);
  } else {
    logger.warn('saga queues are not configured; the service runs without messaging');
  }
}

main().catch((err) => { logger.error({ err }, 'fatal error during startup'); process.exit(1); });
