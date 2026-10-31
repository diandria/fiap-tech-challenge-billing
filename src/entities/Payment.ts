export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** The charge of an approved budget. One per budget. */
export interface Payment {
  id: string;
  budgetId: string;
  /** The provider's checkout, created before the customer pays. */
  preferenceId: string;
  /** Set once the provider reports a payment for the checkout. */
  providerPaymentId?: string;
  checkoutUrl: string;
  amount: number;
  status: PaymentStatus;
  failureReason?: string;
  createdAt: Date;
}
