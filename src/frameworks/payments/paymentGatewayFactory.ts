import { IPaymentGateway } from '../../use-cases/ports/IPaymentGateway';
import { MercadoPagoPaymentGateway } from '../../adapters/payments/MercadoPagoPaymentGateway';
import { MercadoPagoTokenProvider } from '../../adapters/payments/MercadoPagoTokenProvider';
import { MockPaymentGateway } from '../../adapters/payments/MockPaymentGateway';
import { PinoLoggerAdapter } from '../../adapters/logging/PinoLoggerAdapter';
import { PrometheusIntegrationFailures } from '../metrics/PrometheusIntegrationFailures';
import { logger } from '../logging/logger';
import { readMercadoPagoConfig } from './mercadoPagoConfig';

export type PaymentProvider =
  | { kind: 'mercado-pago'; gateway: IPaymentGateway; webhookSecret: string }
  | { kind: 'mock'; gateway: MockPaymentGateway };

/**
 * Picks the payment provider from `PAYMENT_PROVIDER`. The choice lives here so
 * no use case knows which provider answers. Unset means Mercado Pago when it
 * is configured, and no provider otherwise, which is the local default.
 */
export function createPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider | undefined {
  const choice = env.PAYMENT_PROVIDER;

  if (choice === 'mock') {
    return { kind: 'mock', gateway: new MockPaymentGateway() };
  }
  if (choice !== undefined && choice !== 'mercado-pago') {
    throw new Error(`Unknown PAYMENT_PROVIDER "${choice}"; use mercado-pago or mock`);
  }

  const config = readMercadoPagoConfig(env);
  if (!config) {
    if (choice === 'mercado-pago') {
      throw new Error('PAYMENT_PROVIDER=mercado-pago requires the MERCADO_PAGO_* variables');
    }
    return undefined;
  }

  return {
    kind: 'mercado-pago',
    gateway: new MercadoPagoPaymentGateway(
      new MercadoPagoTokenProvider(config.credentials),
      new PrometheusIntegrationFailures(),
      new PinoLoggerAdapter(logger),
      { notificationUrl: config.notificationUrl },
    ),
    webhookSecret: config.webhookSecret,
  };
}
