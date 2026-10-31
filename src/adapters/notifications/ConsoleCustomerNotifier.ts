import { Budget } from '../../entities/Budget';
import { Payment } from '../../entities/Payment';
import { ICustomerNotifier } from '../../use-cases/ports/ICustomerNotifier';

/** The subset of a logger this adapter needs. */
export interface NotificationLogger {
  info(context: Record<string, unknown>, message: string): void;
}

/**
 * Development implementation: records the notification instead of delivering
 * it. The customer's e-mail stays out of the log line.
 */
export class ConsoleCustomerNotifier implements ICustomerNotifier {
  constructor(private readonly logger: NotificationLogger) {}

  async budgetReady(budget: Budget): Promise<void> {
    this.logger.info(
      { event: 'budget_ready', serviceOrderId: budget.serviceOrderId, budgetTotal: budget.total },
      'customer notification dispatched',
    );
  }

  async paymentRequested(budget: Budget, payment: Payment): Promise<void> {
    this.logger.info(
      { event: 'payment_requested', serviceOrderId: budget.serviceOrderId, checkoutUrl: payment.checkoutUrl },
      'customer notification dispatched',
    );
  }
}
