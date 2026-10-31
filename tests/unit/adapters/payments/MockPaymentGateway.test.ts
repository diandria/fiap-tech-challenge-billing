import { MockPaymentGateway } from '../../../../src/adapters/payments/MockPaymentGateway';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';

describe('MockPaymentGateway', () => {
  it('resolves the payment it decided with the same status and amount', async () => {
    const gateway = new MockPaymentGateway();

    const approvedId = gateway.decide({ serviceOrderId, amount: 191, status: 'APPROVED' });
    const rejectedId = gateway.decide({ serviceOrderId, amount: 35.5, status: 'REJECTED' });

    expect(approvedId).toBe(`mock:approved:${serviceOrderId}:191.00`);
    expect(await gateway.findPayment(approvedId)).toEqual({
      providerPaymentId: approvedId,
      serviceOrderId,
      amount: 191,
      status: 'APPROVED',
      statusDetail: 'mock',
    });
    expect(await gateway.findPayment(rejectedId)).toMatchObject({ status: 'REJECTED', amount: 35.5 });
  });

  it('works across instances, because the id carries the whole decision', async () => {
    const id = new MockPaymentGateway().decide({ serviceOrderId, amount: 191, status: 'APPROVED' });

    expect(await new MockPaymentGateway().findPayment(id)).toMatchObject({ status: 'APPROVED' });
  });

  it('returns null for an id it did not produce', async () => {
    const gateway = new MockPaymentGateway();

    expect(await gateway.findPayment('1234567890')).toBeNull();
    expect(await gateway.findPayment(`mock:refunded:${serviceOrderId}:191.00`)).toBeNull();
    expect(await gateway.findPayment('mock:approved:not-an-order:191.00')).toBeNull();
  });

  it('creates a checkout whose link is the decision route of the order', async () => {
    const checkout = await new MockPaymentGateway().createCheckout({ serviceOrderId, description: 'x', amount: 191 });

    expect(checkout).toEqual({
      preferenceId: `mock-pref-${serviceOrderId}`,
      checkoutUrl: `/payments/mock/${serviceOrderId}`,
    });
  });
});
