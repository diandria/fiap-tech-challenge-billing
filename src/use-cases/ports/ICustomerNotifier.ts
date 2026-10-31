import { Budget } from '../../entities/Budget';
import { Payment } from '../../entities/Payment';

/**
 * Output port for telling the customer what happened to their order. Delivery
 * is best effort (ADR-003 in the OS Service repository): a failure is logged
 * and never undoes the change that triggered it.
 */
export interface ICustomerNotifier {
  budgetReady(budget: Budget): Promise<void>;
  paymentRequested(budget: Budget, payment: Payment): Promise<void>;
}
