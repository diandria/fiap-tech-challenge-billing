import { MercadoPagoTokenProvider } from '../../../../src/adapters/payments/MercadoPagoTokenProvider';

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };

/** A token response; `mode` is the live_mode fields, which a test may leave out entirely. */
function tokenResponse(accessToken: string, expiresIn: number, mode: { live_mode?: boolean } = { live_mode: false }): Response {
  return new Response(
    JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: expiresIn, ...mode }),
    { status: 200 },
  );
}

describe('MercadoPagoTokenProvider', () => {
  it('requests a token with the client credentials grant', async () => {
    const fetchFn = jest.fn().mockResolvedValue(tokenResponse('token-1', 21600));

    const token = await new MercadoPagoTokenProvider(credentials, 'test', fetchFn).accessToken();

    expect(token).toBe('token-1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'client_credentials',
      test_token: 'true',
    });
  });

  // The guard against real charges: in the test environment only a token the
  // provider itself marks as not live is used. A production credential set by
  // mistake fails here, before any checkout is created with it.
  it.each([
    ['marked as live', { live_mode: true }],
    ['without the live_mode field', {}],
  ])('refuses a token %s in the test environment', async (_case, mode) => {
    const fetchFn = jest.fn().mockResolvedValue(tokenResponse('live-token', 21600, mode));

    await expect(new MercadoPagoTokenProvider(credentials, 'test', fetchFn).accessToken()).rejects.toThrow('live');
  });

  it('does not keep a refused token, so the next charge asks again', async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce(tokenResponse('live-token', 21600, { live_mode: true }))
      .mockResolvedValueOnce(tokenResponse('test-token', 21600, { live_mode: false }));
    const provider = new MercadoPagoTokenProvider(credentials, 'test', fetchFn);

    await expect(provider.accessToken()).rejects.toThrow('live');

    expect(await provider.accessToken()).toBe('test-token');
  });

  it('uses a live token in the production environment', async () => {
    const fetchFn = jest.fn().mockResolvedValue(tokenResponse('live-token', 21600, { live_mode: true }));

    const token = await new MercadoPagoTokenProvider(credentials, 'production', fetchFn).accessToken();

    expect(token).toBe('live-token');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({ test_token: 'false' });
  });

  it('reuses the token while it is valid and renews it near expiry', async () => {
    let now = new Date('2026-10-31T10:00:00.000Z');
    const fetchFn = jest.fn()
      .mockResolvedValueOnce(tokenResponse('token-1', 3600))
      .mockResolvedValueOnce(tokenResponse('token-2', 3600));
    const provider = new MercadoPagoTokenProvider(credentials, 'test', fetchFn, () => now);

    const first = await provider.accessToken();
    now = new Date('2026-10-31T10:30:00.000Z');
    const stillValid = await provider.accessToken();
    now = new Date('2026-10-31T10:59:30.000Z');
    const renewed = await provider.accessToken();

    expect([first, stillValid, renewed]).toEqual(['token-1', 'token-1', 'token-2']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws when the provider refuses the credentials', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('{"error":"invalid_client"}', { status: 401 }));

    await expect(new MercadoPagoTokenProvider(credentials, 'test', fetchFn).accessToken()).rejects.toThrow('401');
  });
});
