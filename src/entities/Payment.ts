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

/** What the provider reports about a payment, in this service's terms. */
export interface ReportedPayment {
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  amount: number;
  statusDetail: string;
}

export interface Settlement {
  status: 'APPROVED' | 'REJECTED';
  failureReason?: string;
}

function inCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Decides how a pending payment ends, or returns null while the provider
 * still has it pending. An approval of any amount other than the one charged
 * counts as a refusal: a repair is never released for less than its budget.
 */
export function settle(payment: Payment, reported: ReportedPayment): Settlement | null {
  if (reported.status === 'PENDING') return null;
  if (reported.status === 'REJECTED') {
    return { status: 'REJECTED', failureReason: reported.statusDetail };
  }
  if (inCents(reported.amount) !== inCents(payment.amount)) {
    return { status: 'REJECTED', failureReason: 'AMOUNT_MISMATCH' };
  }
  return { status: 'APPROVED' };
}
