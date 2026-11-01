export interface MercadoPagoCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * test: only tokens Mercado Pago marks as not live are used, so no real charge
 * can happen. production: real charges, set on purpose.
 */
export type MercadoPagoEnvironment = 'test' | 'production';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  live_mode?: boolean;
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
    private readonly environment: MercadoPagoEnvironment,
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
        test_token: this.environment === 'test' ? 'true' : 'false',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago token request failed with status ${response.status}`);
    }

    const body = (await response.json()) as TokenResponse;
    // Anything but an explicit "not live" counts as live: a production
    // credential set by mistake must fail here, before a checkout exists.
    if (this.environment === 'test' && body.live_mode !== false) {
      throw new Error(
        `Mercado Pago returned a token not marked as test (live_mode=${String(body.live_mode)}) `
        + 'while MERCADO_PAGO_ENVIRONMENT is test; no charge is created with it',
      );
    }
    this.cached = {
      token: body.access_token,
      expiresAt: this.now().getTime() + body.expires_in * 1000,
    };
    return body.access_token;
  }
}
