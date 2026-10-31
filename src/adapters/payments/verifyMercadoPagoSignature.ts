import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignatureInput {
  /** The `x-signature` header, "ts=<seconds>,v1=<hex hmac>". */
  xSignature: string | undefined;
  /** The `x-request-id` header. */
  xRequestId: string | undefined;
  /** The `data.id` query string parameter. */
  dataId: string | undefined;
  secret: string;
}

function parseHeader(header: string): { ts?: string; v1?: string } {
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2).map((piece) => piece?.trim());
    if (key && value) parts[key.toLowerCase()] = value;
  }
  return { ts: parts.ts, v1: parts.v1 };
}

/**
 * Builds the signed manifest the way the official SDK does: each pair that has
 * a value, in this order, every one ending in ";".
 */
function manifest(dataId: string | undefined, requestId: string | undefined, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(';')};`;
}

/**
 * Tells whether a notification was signed by Mercado Pago with the secret of
 * this application. It proves who called; what happened to the payment is
 * still read from the API, never from the notification body.
 */
export function verifyMercadoPagoSignature(input: SignatureInput): boolean {
  if (!input.xSignature) return false;

  const { ts, v1 } = parseHeader(input.xSignature);
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;

  const expected = createHmac('sha256', input.secret)
    .update(manifest(input.dataId?.trim(), input.xRequestId?.trim(), ts))
    .digest('hex');

  const received = Buffer.from(v1);
  const computed = Buffer.from(expected);
  return received.length === computed.length && timingSafeEqual(received, computed);
}
