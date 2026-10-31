import { PrismaClient } from '@prisma/client';
import { IUnitOfWork, TransactionalRepositories } from '../../use-cases/ports/IUnitOfWork';
import { ITraceContext } from '../../use-cases/ports/ITraceContext';
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
        outbox: new PrismaOutbox(tx, this.traceContext),
        processedMessages: new PrismaProcessedMessages(tx),
      }),
    );
  }
}
