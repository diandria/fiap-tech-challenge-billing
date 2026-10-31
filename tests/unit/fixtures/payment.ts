import { Payment } from '../../../src/entities/Payment';

export const pendingPayment: Payment = {
  id: 'p-1',
  budgetId: 'b-1',
  preferenceId: 'pref-1',
  checkoutUrl: 'https://mp.test/checkout/pref-1',
  amount: 191,
  status: 'PENDING',
  createdAt: new Date('2026-10-31T11:00:00.000Z'),
};
