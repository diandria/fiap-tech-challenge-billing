import { MercadoPagoTokenProvider } from '../../../../src/adapters/payments/MercadoPagoTokenProvider';

const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };

function tokenResponse(accessToken: string, expiresIn: number): Response {
  return new Response(JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: expiresIn }), { status: 200 });
}

describe('MercadoPagoTokenProvider', () => {
  it('requests a token with the client credentials grant', async () => {
    const fetchFn = jest.fn().mockResolvedValue(tokenResponse('token-1', 21600));

    const token = await new MercadoPagoTokenProvider(credentials, fetchFn).accessToken();

    expect(token).toBe('token-1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'client_credentials',
    });
  });

  it('reuses the token while it is valid and renews it near expiry', async () => {
    let now = new Date('2026-10-31T10:00:00.000Z');
    const fetchFn = jest.fn()
      .mockResolvedValueOnce(tokenResponse('token-1', 3600))
      .mockResolvedValueOnce(tokenResponse('token-2', 3600));
    const provider = new MercadoPagoTokenProvider(credentials, fetchFn, () => now);

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

    await expect(new MercadoPagoTokenProvider(credentials, fetchFn).accessToken()).rejects.toThrow('401');
  });
});
