import {
  Checkout,
  CreateCheckoutInput,
  IPaymentGateway,
  ProviderPayment,
} from '../../use-cases/ports/IPaymentGateway';

type MockDecision = 'APPROVED' | 'REJECTED';

const MOCK_ID = /^mock:(approved|rejected):([0-9a-f-]{36}):(\d+\.\d{2})$/;

/**
 * Simulated payment provider, for end-to-end runs and as a fallback when the
 * sandbox is unavailable. It plays the provider only: budget, charge,
 * confirmation and the reply to the saga run exactly as in production.
 *
 * It keeps no state. The payment id it hands out carries the decision, the
 * order and the amount, so any replica resolves it.
 */
export class MockPaymentGateway implements IPaymentGateway {
  async createCheckout(input: CreateCheckoutInput): Promise<Checkout> {
    return {
      preferenceId: `mock-pref-${input.serviceOrderId}`,
      // Points at the route that plays the customer paying, so the flow has a link as with the real provider.
      checkoutUrl: `/payments/mock/${input.serviceOrderId}`,
    };
  }

  /** Builds the provider payment id that findPayment will resolve, e.g. "mock:approved:<orderId>:180.00". */
  decide(input: { serviceOrderId: string; amount: number; status: MockDecision }): string {
    return `mock:${input.status.toLowerCase()}:${input.serviceOrderId}:${input.amount.toFixed(2)}`;
  }

  async findPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    const match = MOCK_ID.exec(providerPaymentId);
    if (!match) return null;

    const [, status, serviceOrderId, amount] = match;
    return {
      providerPaymentId,
      serviceOrderId,
      amount: Number(amount),
      status: status === 'approved' ? 'APPROVED' : 'REJECTED',
      statusDetail: 'mock',
    };
  }
}
