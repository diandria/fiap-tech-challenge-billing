/** Payment status in the service's own terms; no provider status leaks past the adapter. */
export type ProviderPaymentStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

export interface CreateCheckoutInput {
  serviceOrderId: string;
  description: string;
  amount: number;
}

export interface Checkout {
  preferenceId: string;
  /** Where the customer goes to pay. */
  checkoutUrl: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  serviceOrderId: string;
  amount: number;
  status: ProviderPaymentStatus;
  statusDetail: string;
}

/** Output port for the payment provider. */
export interface IPaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<Checkout>;
  /** The payment as the provider has it now, or null when the provider does not know the id. */
  findPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
}
