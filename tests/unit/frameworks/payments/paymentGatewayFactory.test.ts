import { createPaymentProvider } from '../../../../src/frameworks/payments/paymentGatewayFactory';
import { MercadoPagoPaymentGateway } from '../../../../src/adapters/payments/MercadoPagoPaymentGateway';
import { MockPaymentGateway } from '../../../../src/adapters/payments/MockPaymentGateway';

const mercadoPago = {
  MERCADO_PAGO_CLIENT_ID: 'client-id',
  MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://gateway.example.com/payments/notifications',
  MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
};

describe('paymentGatewayFactory', () => {
  it('builds the mercado pago adapter, the mock adapter, and throws on an unknown value', () => {
    const real = createPaymentProvider({ PAYMENT_PROVIDER: 'mercado-pago', ...mercadoPago });
    const mock = createPaymentProvider({ PAYMENT_PROVIDER: 'mock' });

    expect(real).toMatchObject({ kind: 'mercado-pago', webhookSecret: 'webhook-secret' });
    expect(real?.gateway).toBeInstanceOf(MercadoPagoPaymentGateway);
    expect(mock).toMatchObject({ kind: 'mock' });
    expect(mock?.gateway).toBeInstanceOf(MockPaymentGateway);
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'paypal' })).toThrow('paypal');
  });

  it('uses mercado pago by default when it is configured', () => {
    expect(createPaymentProvider(mercadoPago)?.kind).toBe('mercado-pago');
  });

  it('has no provider when nothing is configured', () => {
    expect(createPaymentProvider({})).toBeUndefined();
  });

  it('refuses to start when mercado pago is chosen but not configured', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'mercado-pago' })).toThrow('MERCADO_PAGO');
  });
});
