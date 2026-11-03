import { readMercadoPagoConfig } from '../../../../src/frameworks/payments/mercadoPagoConfig';

const complete = {
  MERCADO_PAGO_CLIENT_ID: 'client-id',
  MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://gateway.example.com/payments/notifications',
  MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
};

describe('readMercadoPagoConfig', () => {
  it('returns undefined when no variable is set', () => {
    expect(readMercadoPagoConfig({})).toBeUndefined();
  });

  it('returns the credentials and the notification url when all are set', () => {
    expect(readMercadoPagoConfig(complete)).toEqual({
      credentials: { clientId: 'client-id', clientSecret: 'client-secret' },
      environment: 'test',
      notificationUrl: 'https://gateway.example.com/payments/notifications',
      webhookSecret: 'webhook-secret',
      apiUrl: 'https://api.mercadopago.com',
    });
  });

  // The provider's address: Mercado Pago itself unless configured, for example
  // the payment service that stands in for it inside the cluster.
  it('reads the provider address, without a trailing slash', () => {
    expect(readMercadoPagoConfig({ ...complete, MERCADO_PAGO_API_URL: 'http://payment-api.car-repair-shop-payment.svc.cluster.local/' })?.apiUrl)
      .toBe('http://payment-api.car-repair-shop-payment.svc.cluster.local');
  });

  it('refuses a provider address that is not an http(s) url', () => {
    expect(() => readMercadoPagoConfig({ ...complete, MERCADO_PAGO_API_URL: 'payment-api:3000' })).toThrow('MERCADO_PAGO_API_URL');
  });

  // Test is the default so that forgetting the variable can never mean real charges.
  it('reads the environment, test unless production is set on purpose', () => {
    expect(readMercadoPagoConfig({ ...complete, MERCADO_PAGO_ENVIRONMENT: 'production' })?.environment).toBe('production');
    expect(readMercadoPagoConfig({ ...complete, MERCADO_PAGO_ENVIRONMENT: 'test' })?.environment).toBe('test');
  });

  it('refuses an unknown environment instead of guessing', () => {
    expect(() => readMercadoPagoConfig({ ...complete, MERCADO_PAGO_ENVIRONMENT: 'sandbox' })).toThrow('MERCADO_PAGO_ENVIRONMENT');
  });

  it('throws naming the missing variable when only part is set', () => {
    const { MERCADO_PAGO_CLIENT_SECRET: _ignored, ...partial } = complete;

    expect(() => readMercadoPagoConfig(partial)).toThrow('MERCADO_PAGO_CLIENT_SECRET');
  });
});
