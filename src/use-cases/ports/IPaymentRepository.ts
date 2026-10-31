import { Payment } from '../../entities/Payment';

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
}
