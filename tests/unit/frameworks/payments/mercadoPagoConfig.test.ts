import { readMercadoPagoConfig } from '../../../../src/frameworks/payments/mercadoPagoConfig';

const complete = {
  MERCADO_PAGO_CLIENT_ID: 'client-id',
  MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://gateway.example.com/payments/webhook',
};

describe('readMercadoPagoConfig', () => {
  it('returns undefined when no variable is set', () => {
    expect(readMercadoPagoConfig({})).toBeUndefined();
  });

  it('returns the credentials and the notification url when all are set', () => {
    expect(readMercadoPagoConfig(complete)).toEqual({
      credentials: { clientId: 'client-id', clientSecret: 'client-secret' },
      notificationUrl: 'https://gateway.example.com/payments/webhook',
    });
  });

  it('throws naming the missing variable when only part is set', () => {
    const { MERCADO_PAGO_CLIENT_SECRET: _ignored, ...partial } = complete;

    expect(() => readMercadoPagoConfig(partial)).toThrow('MERCADO_PAGO_CLIENT_SECRET');
  });
});
