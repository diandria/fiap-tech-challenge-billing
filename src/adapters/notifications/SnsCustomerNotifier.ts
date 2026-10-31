import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Budget } from '../../entities/Budget';
import { Payment } from '../../entities/Payment';
import { ICustomerNotifier } from '../../use-cases/ports/ICustomerNotifier';
import { IIntegrationFailures } from '../../use-cases/ports/IIntegrationFailures';
import { ITraceContext } from '../../use-cases/ports/ITraceContext';

type EventType = 'BUDGET_READY' | 'PAYMENT_REQUESTED';

/**
 * Publishes customer events to the notifications topic of Phase 3, in the
 * ADR-003 contract extended by ADR-015. The notifications function, in
 * another repository, validates the same shape.
 */
export class SnsCustomerNotifier implements ICustomerNotifier {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
    private readonly failures: IIntegrationFailures,
    private readonly traceContext: ITraceContext,
  ) {}

  async budgetReady(budget: Budget): Promise<void> {
    // The saga only asks for a budget while the order waits for approval.
    await this.publish('BUDGET_READY', 'budget_ready', this.payload('BUDGET_READY', budget, 'WAITING_APPROVAL'));
  }

  async paymentRequested(budget: Budget, payment: Payment): Promise<void> {
    await this.publish('PAYMENT_REQUESTED', 'payment_requested', {
      ...this.payload('PAYMENT_REQUESTED', budget, 'APPROVED'),
      payment: { checkoutUrl: payment.checkoutUrl },
    });
  }

  private payload(eventType: EventType, budget: Budget, orderStatus: string): Record<string, unknown> {
    const traceparent = this.traceContext.currentTraceparent();
    return {
      eventType,
      occurredAt: new Date().toISOString(),
      // Omitted outside a trace: an invalid traceparent would tie unrelated events together.
      ...(traceparent && { traceparent }),
      serviceOrder: { id: budget.serviceOrderId, status: orderStatus, budgetTotal: budget.total },
      customer: { id: budget.customer.id, name: budget.customer.name, email: budget.customer.email },
    };
  }

  /** Counts the failure and rethrows; the use case decides that a failed notice changes nothing. */
  private async publish(eventType: EventType, operation: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.sns.send(new PublishCommand({ TopicArn: this.topicArn, Message: JSON.stringify(payload) }));
    } catch (err) {
      this.failures.record('sns', operation);
      throw err;
    }
  }
}
