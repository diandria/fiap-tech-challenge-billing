import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { IOutbox } from '../../use-cases/ports/IOutbox';
import { ITraceContext } from '../../use-cases/ports/ITraceContext';
import { OutgoingMessage } from '../../use-cases/messaging/MessageEnvelope';
import { PrismaExecutor } from './prismaExecutor';

export class PrismaOutbox implements IOutbox {
  constructor(
    private readonly prisma: PrismaExecutor,
    private readonly traceContext: ITraceContext,
  ) {}

  async add(message: OutgoingMessage): Promise<void> {
    await this.prisma.outboxMessage.create({
      data: {
        id: randomUUID(),
        destination: message.destination,
        type: message.type,
        serviceOrderId: message.serviceOrderId,
        payload: message.payload as Prisma.InputJsonObject,
        // The consumer continues this trace, so the hop through the queue does
        // not break the request's trace in two.
        traceparent: this.traceContext.currentTraceparent() ?? null,
      },
    });
  }
}
