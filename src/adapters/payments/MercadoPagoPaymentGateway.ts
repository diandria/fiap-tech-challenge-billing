import {
  Checkout,
  CreateCheckoutInput,
  IPaymentGateway,
  ProviderPayment,
} from '../../use-cases/ports/IPaymentGateway';
import { IIntegrationFailures } from '../../use-cases/ports/IIntegrationFailures';
import { ILogger } from '../../use-cases/ports/ILogger';
import { toPaymentStatus } from './mercadoPagoStatus';

const API_URL = 'https://api.mercadopago.com';
const DEFAULT_TIMEOUT_MS = 5_000;

export interface AccessTokenSource {
  accessToken(): Promise<string>;
}

export interface MercadoPagoOptions {
  /** Where Mercado Pago sends payment notifications; the public webhook route of this service. */
  notificationUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface PreferenceResponse {
  id: string;
  init_point: string;
}

interface PaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
}

/**
 * Mercado Pago through its REST API, with the runtime's fetch. Two calls do
 * not justify the SDK, and a reader can follow each request end to end here.
 */
export class MercadoPagoPaymentGateway implements IPaymentGateway {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly tokens: AccessTokenSource,
    private readonly failures: IIntegrationFailures,
    private readonly logger: ILogger,
    private readonly options: MercadoPagoOptions,
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<Checkout> {
    const body = await this.call<PreferenceResponse>('create_checkout', '/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ title: input.description, quantity: 1, unit_price: input.amount, currency_id: 'BRL' }],
        external_reference: input.serviceOrderId,
        notification_url: this.options.notificationUrl,
      }),
    });
    return { preferenceId: body.id, checkoutUrl: body.init_point };
  }

  async findPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    const body = await this.call<PaymentResponse>(
      'find_payment',
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      { method: 'GET' },
      { notFoundAsNull: true },
    );
    if (!body) return null;

    let status = toPaymentStatus(body.status);
    if (!status) {
      this.logger.warn('unexpected Mercado Pago payment status; treated as pending', {
        providerPaymentId,
        providerStatus: body.status,
      });
      status = 'PENDING';
    }

    return {
      providerPaymentId: String(body.id),
      serviceOrderId: body.external_reference,
      amount: Number(body.transaction_amount),
      status,
      statusDetail: body.status_detail,
    };
  }

  /**
   * Sends one authenticated request. Any failure, the token request included,
   * is counted and thrown, so the caller retries instead of acting on a guess.
   * Only a lookup may read a 404 as "does not exist".
   */
  private call<T>(operation: string, path: string, init: RequestInit): Promise<T>;
  private call<T>(operation: string, path: string, init: RequestInit, options: { notFoundAsNull: true }): Promise<T | null>;
  private async call<T>(
    operation: string,
    path: string,
    init: RequestInit,
    options: { notFoundAsNull?: boolean } = {},
  ): Promise<T | null> {
    try {
      const token = await this.tokens.accessToken();
      const response = await this.fetchFn(`${API_URL}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 404 && options.notFoundAsNull) return null;
      if (!response.ok) {
        throw new Error(`Mercado Pago ${operation} failed with status ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (err) {
      this.failures.record('mercado_pago', operation);
      throw err;
    }
  }
}
