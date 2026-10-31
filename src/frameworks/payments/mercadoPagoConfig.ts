import { MercadoPagoCredentials } from '../../adapters/payments/MercadoPagoTokenProvider';

export interface MercadoPagoConfig {
  credentials: MercadoPagoCredentials;
  notificationUrl: string;
  /** Signs every notification; shown in the application's webhook settings. */
  webhookSecret: string;
}

const VARIABLES = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'MERCADO_PAGO_NOTIFICATION_URL',
  'MERCADO_PAGO_WEBHOOK_SECRET',
] as const;

/**
 * Reads the Mercado Pago configuration. None set means there is no payment
 * provider; only part of it set is a mistake, and failing at startup beats
 * failing at the first charge.
 */
export function readMercadoPagoConfig(env: Record<string, string | undefined> = process.env): MercadoPagoConfig | undefined {
  const missing = VARIABLES.filter((name) => !env[name]);
  if (missing.length === VARIABLES.length) return undefined;
  if (missing.length > 0) {
    throw new Error(`Mercado Pago is partially configured; missing ${missing.join(', ')}`);
  }

  return {
    credentials: {
      clientId: env.MERCADO_PAGO_CLIENT_ID as string,
      clientSecret: env.MERCADO_PAGO_CLIENT_SECRET as string,
    },
    notificationUrl: env.MERCADO_PAGO_NOTIFICATION_URL as string,
    webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET as string,
  };
}
