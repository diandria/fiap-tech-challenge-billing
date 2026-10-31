import { IProcessedMessages } from '../../use-cases/ports/IProcessedMessages';
import { PrismaExecutor } from './prismaExecutor';

export class PrismaProcessedMessages implements IProcessedMessages {
  constructor(private readonly prisma: PrismaExecutor) {}

  async markProcessed(messageId: string, type: string): Promise<boolean> {
    // Skipping duplicates instead of catching the unique violation: in
    // PostgreSQL a failed statement aborts the whole transaction, and the
    // caller still needs it.
    const { count } = await this.prisma.processedMessage.createMany({
      data: [{ messageId, type }],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
