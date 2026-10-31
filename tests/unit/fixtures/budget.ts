import { Budget } from '../../../src/entities/Budget';

export const pendingBudget: Budget = {
  id: 'b-1',
  serviceOrderId: 'os-1',
  customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@example.com' },
  lines: [
    { kind: 'SERVICE', referenceId: 's-1', description: 'Oil change', unitPrice: 120, quantity: 1 },
    { kind: 'ITEM', referenceId: 'i-1', description: 'Oil filter', unitPrice: 35.5, quantity: 2 },
  ],
  total: 191,
  status: 'PENDING_APPROVAL',
  version: 0,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
};
