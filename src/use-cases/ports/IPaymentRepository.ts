import { Payment, Settlement } from '../../entities/Payment';

export interface NewPayment {
  budgetId: string;
  preferenceId: string;
  checkoutUrl: string;
  amount: number;
}

export interface IPaymentRepository {
  /** Stores a pending payment. A second payment for the same budget is refused by the database. */
  create(payment: NewPayment): Promise<Payment>;
  findByBudgetId(budgetId: string): Promise<Payment | null>;
  /**
   * Records how a pending payment ended. Returns false when the payment was no
   * longer pending: another notification for it got there first.
   */
  settle(id: string, settlement: Settlement & { providerPaymentId: string }): Promise<boolean>;
}
