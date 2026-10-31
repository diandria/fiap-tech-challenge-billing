import { MercadoPagoPaymentGateway } from '../../../../src/adapters/payments/MercadoPagoPaymentGateway';

const notificationUrl = 'https://gateway.example.com/payments/webhook';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeGateway(fetchFn: jest.Mock) {
  const tokens = { accessToken: jest.fn().mockResolvedValue('provider-token') };
  const failures = { record: jest.fn() };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const gateway = new MercadoPagoPaymentGateway(tokens, failures, logger, { notificationUrl, fetchFn });
  return { gateway, failures, logger };
}

function payment(status: string) {
  return {
    id: 1234567890,
    status,
    status_detail: 'accredited',
    external_reference: 'os-1',
    transaction_amount: 191,
  };
}

describe('MercadoPagoPaymentGateway', () => {
  it('creates a preference with the order id as external reference and returns the checkout url', async () => {
    const fetchFn = jest.fn().mockResolvedValue(json({
      id: 'pref-1',
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
      sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
    }, 201));
    const { gateway } = makeGateway(fetchFn);

    const checkout = await gateway.createCheckout({ serviceOrderId: 'os-1', description: 'Service order os-1', amount: 191 });

    expect(checkout).toEqual({
      preferenceId: 'pref-1',
      checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1',
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      items: [{ title: 'Service order os-1', quantity: 1, unit_price: 191, currency_id: 'BRL' }],
      external_reference: 'os-1',
      notification_url: notificationUrl,
    });
  });

  it('sends the provider token as bearer', async () => {
    const fetchFn = jest.fn().mockResolvedValue(json(payment('approved')));
    const { gateway } = makeGateway(fetchFn);

    await gateway.findPayment('1234567890');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments/1234567890');
    expect(init.headers.Authorization).toBe('Bearer provider-token');
  });

  it.each([
    ['approved', 'APPROVED'],
    ['rejected', 'REJECTED'],
    ['cancelled', 'REJECTED'],
    ['pending', 'PENDING'],
    ['in_process', 'PENDING'],
    ['authorized', 'PENDING'],
  ])('maps each provider status to the domain status (%s)', async (providerStatus, domainStatus) => {
    const { gateway } = makeGateway(jest.fn().mockResolvedValue(json(payment(providerStatus))));

    const found = await gateway.findPayment('1234567890');

    expect(found).toEqual({
      providerPaymentId: '1234567890',
      serviceOrderId: 'os-1',
      amount: 191,
      status: domainStatus,
      statusDetail: 'accredited',
    });
  });

  it('treats an unexpected provider status as pending and logs it', async () => {
    const { gateway, logger } = makeGateway(jest.fn().mockResolvedValue(json(payment('charged_back'))));

    const found = await gateway.findPayment('1234567890');

    expect(found?.status).toBe('PENDING');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ providerStatus: 'charged_back' }));
  });

  it('returns null for an unknown payment', async () => {
    const { gateway, failures } = makeGateway(jest.fn().mockResolvedValue(json({ message: 'Payment not found' }, 404)));

    expect(await gateway.findPayment('999')).toBeNull();
    expect(failures.record).not.toHaveBeenCalled();
  });

  it('treats a 404 when creating a checkout as a failure, not as a missing payment', async () => {
    const { gateway, failures } = makeGateway(jest.fn().mockResolvedValue(json({ message: 'not found' }, 404)));

    await expect(gateway.createCheckout({ serviceOrderId: 'os-1', description: 'x', amount: 1 })).rejects.toThrow('404');
    expect(failures.record).toHaveBeenCalledWith('mercado_pago', 'create_checkout');
  });

  it('records an integration failure and throws on 5xx and on timeout', async () => {
    const serverError = makeGateway(jest.fn().mockResolvedValue(json({ message: 'internal error' }, 502)));
    const timeout = makeGateway(jest.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError')));

    await expect(serverError.gateway.createCheckout({ serviceOrderId: 'os-1', description: 'x', amount: 1 })).rejects.toThrow('502');
    await expect(timeout.gateway.findPayment('1')).rejects.toThrow('timeout');

    expect(serverError.failures.record).toHaveBeenCalledWith('mercado_pago', 'create_checkout');
    expect(timeout.failures.record).toHaveBeenCalledWith('mercado_pago', 'find_payment');
  });

  it('records an integration failure when the token cannot be obtained', async () => {
    const fetchFn = jest.fn();
    const failures = { record: jest.fn() };
    const tokens = { accessToken: jest.fn().mockRejectedValue(new Error('Mercado Pago token request failed with status 401')) };
    const gateway = new MercadoPagoPaymentGateway(tokens, failures, { warn: jest.fn(), error: jest.fn() }, { notificationUrl, fetchFn });

    await expect(gateway.findPayment('1')).rejects.toThrow('401');

    expect(failures.record).toHaveBeenCalledWith('mercado_pago', 'find_payment');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
