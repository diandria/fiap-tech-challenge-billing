export interface MercadoPagoCredentials {
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const RENEW_BEFORE_EXPIRY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Exchanges the application credentials for an access token and keeps it
 * until shortly before it expires. A token copied by hand from the panel
 * would live in a secret forever; this one is short-lived and renewed alone.
 */
export class MercadoPagoTokenProvider {
  private cached?: { token: string; expiresAt: number };

  constructor(
    private readonly credentials: MercadoPagoCredentials,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** A cached token, renewed when less than a minute of validity is left. */
  async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - this.now().getTime() > RENEW_BEFORE_EXPIRY_MS) {
      return this.cached.token;
    }

    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago token request failed with status ${response.status}`);
    }

    const body = (await response.json()) as TokenResponse;
    this.cached = {
      token: body.access_token,
      expiresAt: this.now().getTime() + body.expires_in * 1000,
    };
    return body.access_token;
  }
}
