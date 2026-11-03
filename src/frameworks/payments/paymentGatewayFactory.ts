import { IPaymentGateway } from '../../use-cases/ports/IPaymentGateway';
import { MercadoPagoPaymentGateway } from '../../adapters/payments/MercadoPagoPaymentGateway';
import { MercadoPagoTokenProvider } from '../../adapters/payments/MercadoPagoTokenProvider';
import { PinoLoggerAdapter } from '../../adapters/logging/PinoLoggerAdapter';
import { PrometheusIntegrationFailures } from '../metrics/PrometheusIntegrationFailures';
import { logger } from '../logging/logger';
import { readMercadoPagoConfig } from './mercadoPagoConfig';

export interface PaymentProvider {
  gateway: IPaymentGateway;
  /** Verifies the provider's notifications. */
  webhookSecret: string;
}

/**
 * Builds the payment provider: the Mercado Pago adapter, pointed at
 * MERCADO_PAGO_API_URL, which is Mercado Pago itself or a service with the
 * same contract. No use case knows which one answers. `PAYMENT_PROVIDER` only
 * accepts `mercado-pago`; unset, the provider exists when it is configured.
 */
export function createPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider | undefined {
  const choice = env.PAYMENT_PROVIDER;

  if (choice !== undefined && choice !== 'mercado-pago') {
    throw new Error(`Unknown PAYMENT_PROVIDER "${choice}"; use mercado-pago`);
  }

  const config = readMercadoPagoConfig(env);
  if (!config) {
    if (choice === 'mercado-pago') {
      throw new Error('PAYMENT_PROVIDER=mercado-pago requires the MERCADO_PAGO_* variables');
    }
    return undefined;
  }

  return {
    gateway: new MercadoPagoPaymentGateway(
      new MercadoPagoTokenProvider(config.credentials, config.environment, { apiUrl: config.apiUrl }),
      new PrometheusIntegrationFailures(),
      new PinoLoggerAdapter(logger),
      { notificationUrl: config.notificationUrl, apiUrl: config.apiUrl },
    ),
    webhookSecret: config.webhookSecret,
  };
}
