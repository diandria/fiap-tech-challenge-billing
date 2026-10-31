import { IUnitOfWork } from '../../../src/use-cases/ports/IUnitOfWork';
import { Budget } from '../../../src/entities/Budget';
import { BudgetStatusChange, IBudgetRepository } from '../../../src/use-cases/ports/IBudgetRepository';
import { IPaymentRepository } from '../../../src/use-cases/ports/IPaymentRepository';
import { pendingBudget } from './budget';
import { pendingPayment } from './payment';

export interface FakeRepositories {
  budgets: jest.Mocked<IBudgetRepository>;
  payments: jest.Mocked<IPaymentRepository>;
  outbox: { add: jest.Mock };
  processedMessages: { markProcessed: jest.Mock };
}

export const makeRepositories = (): FakeRepositories => ({
  budgets: {
    create: jest.fn().mockResolvedValue(pendingBudget),
    findByServiceOrderId: jest.fn().mockResolvedValue(pendingBudget),
    updateStatus: jest.fn<Promise<Budget>, [string, BudgetStatusChange, number]>(
      async (_id, change) => ({ ...pendingBudget, ...change, version: pendingBudget.version + 1 }),
    ),
  },
  payments: {
    create: jest.fn().mockResolvedValue(pendingPayment),
    findByBudgetId: jest.fn().mockResolvedValue(null),
    settle: jest.fn().mockResolvedValue(true),
  },
  outbox: { add: jest.fn() },
  processedMessages: { markProcessed: jest.fn().mockResolvedValue(true) },
});

/**
 * Hands the given repositories to the work. Rolling back is the real unit of
 * work's job; tests assert that a failure leaves `run` rejected.
 */
export const makeUnitOfWork = (repositories: FakeRepositories): IUnitOfWork & { run: jest.Mock } => ({
  run: jest.fn((work) => work(repositories)),
});
