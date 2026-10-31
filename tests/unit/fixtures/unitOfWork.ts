import { IUnitOfWork } from '../../../src/use-cases/ports/IUnitOfWork';
import { IBudgetRepository } from '../../../src/use-cases/ports/IBudgetRepository';
import { pendingBudget } from './budget';

export interface FakeRepositories {
  budgets: jest.Mocked<IBudgetRepository>;
  outbox: { add: jest.Mock };
  processedMessages: { markProcessed: jest.Mock };
}

export const makeRepositories = (): FakeRepositories => ({
  budgets: { create: jest.fn().mockResolvedValue(pendingBudget) },
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
