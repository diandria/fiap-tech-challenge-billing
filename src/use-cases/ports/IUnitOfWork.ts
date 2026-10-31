import { IBudgetRepository } from './IBudgetRepository';
import { IOutbox } from './IOutbox';
import { IPaymentRepository } from './IPaymentRepository';
import { IProcessedMessages } from './IProcessedMessages';

/** Repositories whose writes commit or roll back together. */
export interface TransactionalRepositories {
  budgets: IBudgetRepository;
  payments: IPaymentRepository;
  outbox: IOutbox;
  processedMessages: IProcessedMessages;
}

/**
 * Output port for a local ACID transaction. Everything `work` writes through
 * the given repositories is committed together, or not at all when it throws.
 */
export interface IUnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
