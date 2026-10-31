import { IPaymentGateway, ProviderPayment } from '../../src/use-cases/ports/IPaymentGateway';

/** Stands in for the payment provider: checkouts get predictable links, and payments are whatever the test sets. */
export class FakePaymentGateway implements IPaymentGateway {
  readonly payments = new Map<string, ProviderPayment>();
  private checkouts = 0;

  async createCheckout(input: { serviceOrderId: string }) {
    this.checkouts += 1;
    const preferenceId = `pref-${this.checkouts}-${input.serviceOrderId.slice(0, 8)}`;
    return { preferenceId, checkoutUrl: `https://checkout.test/${preferenceId}` };
  }

  async findPayment(providerPaymentId: string) {
    return this.payments.get(providerPaymentId) ?? null;
  }
}
