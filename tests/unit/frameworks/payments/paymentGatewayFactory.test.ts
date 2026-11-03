import { createPaymentProvider } from '../../../../src/frameworks/payments/paymentGatewayFactory';
import { MercadoPagoPaymentGateway } from '../../../../src/adapters/payments/MercadoPagoPaymentGateway';

const mercadoPago = {
  MERCADO_PAGO_CLIENT_ID: 'client-id',
  MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://gateway.example.com/payments/notifications',
  MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
};

describe('paymentGatewayFactory', () => {
  it('builds the mercado pago adapter with the webhook secret', () => {
    const provider = createPaymentProvider({ PAYMENT_PROVIDER: 'mercado-pago', ...mercadoPago });

    expect(provider?.webhookSecret).toBe('webhook-secret');
    expect(provider?.gateway).toBeInstanceOf(MercadoPagoPaymentGateway);
  });

  it.each(['mock', 'paypal'])('refuses the provider %s', (choice) => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: choice })).toThrow(`Unknown PAYMENT_PROVIDER "${choice}"`);
  });

  it('uses mercado pago by default when it is configured', () => {
    expect(createPaymentProvider(mercadoPago)?.gateway).toBeInstanceOf(MercadoPagoPaymentGateway);
  });

  it('has no provider when nothing is configured', () => {
    expect(createPaymentProvider({})).toBeUndefined();
  });

  it('refuses to start when mercado pago is chosen but not configured', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'mercado-pago' })).toThrow('MERCADO_PAGO');
  });
});
