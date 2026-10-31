import { PrismaClient } from '@prisma/client';
import { IUnitOfWork, TransactionalRepositories } from '../../use-cases/ports/IUnitOfWork';
import { ITraceContext } from '../../use-cases/ports/ITraceContext';
import { PostgresBudgetRepository } from './PostgresBudgetRepository';
import { PostgresPaymentRepository } from './PostgresPaymentRepository';
import { PrismaOutbox } from './PrismaOutbox';
import { PrismaProcessedMessages } from './PrismaProcessedMessages';

export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly traceContext: ITraceContext,
  ) {}

  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work({
        budgets: new PostgresBudgetRepository(tx),
        payments: new PostgresPaymentRepository(tx),
        outbox: new PrismaOutbox(tx, this.traceContext),
        processedMessages: new PrismaProcessedMessages(tx),
      }),
    );
  }
}
