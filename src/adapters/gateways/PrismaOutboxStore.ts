import { IOutboxStore, PendingMessage } from '../../use-cases/ports/IOutboxStore';
import { MessageDestination } from '../../use-cases/messaging/MessageEnvelope';
import { PrismaExecutor } from './prismaExecutor';

export class PrismaOutboxStore implements IOutboxStore {
  constructor(private readonly prisma: PrismaExecutor) {}

  async findPending(limit: number): Promise<PendingMessage[]> {
    // Messages written in the same transaction share a creation time. The saga
    // never writes two of them to the same destination, so the order that
    // matters, per destination and order, is preserved.
    const rows = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({
      messageId: row.id,
      destination: row.destination as MessageDestination,
      type: row.type,
      serviceOrderId: row.serviceOrderId,
      occurredAt: row.createdAt.toISOString(),
      ...(row.traceparent ? { traceparent: row.traceparent } : {}),
      payload: row.payload as Record<string, unknown>,
    }));
  }

  async markPublished(messageId: string): Promise<void> {
    await this.prisma.outboxMessage.update({
      where: { id: messageId },
      data: { publishedAt: new Date() },
    });
  }
}
