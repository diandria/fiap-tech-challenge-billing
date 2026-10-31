import { IMessageHandler } from '../../use-cases/ports/IMessageHandler';
import { MessageEnvelope } from '../../use-cases/messaging/MessageEnvelope';

/** Commands the OS Service sends to the billing commands queue. */
export type BillingCommandType = 'GenerateBudget' | 'RequestPayment' | 'CancelBudget';

export type CommandHandlers = Partial<Record<BillingCommandType, (envelope: MessageEnvelope) => Promise<void>>>;

/**
 * Hands each command to the handler of its type. A type with no handler
 * throws instead of being dropped: the message stays on the queue and, after
 * the last attempt, lands in the dead-letter queue, where the saga sees the
 * step as failed.
 */
export class BillingCommandHandler implements IMessageHandler {
  constructor(private readonly handlers: CommandHandlers) {}

  async handle(envelope: MessageEnvelope): Promise<void> {
    const handler = this.handlers[envelope.type as BillingCommandType];
    if (!handler) {
      throw new Error(`No handler for billing command ${envelope.type}`);
    }
    await handler(envelope);
  }
}
