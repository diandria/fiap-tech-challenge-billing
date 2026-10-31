import { ProviderPaymentStatus } from '../../use-cases/ports/IPaymentGateway';

/**
 * Mercado Pago payment statuses and what each one means here. Anything not in
 * the table is treated as pending: a payment is never confirmed or refused on
 * a status nobody looked at.
 */
const STATUS: Record<string, ProviderPaymentStatus> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'REJECTED',
  pending: 'PENDING',
  in_process: 'PENDING',
  authorized: 'PENDING',
};

export function toPaymentStatus(providerStatus: string): ProviderPaymentStatus | undefined {
  return STATUS[providerStatus];
}
