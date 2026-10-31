import { BudgetLine, calculateTotal, cancel, decide } from '../../../src/entities/Budget';
import { ValidationError } from '../../../src/entities/errors/AppError';
import { pendingBudget } from '../fixtures/budget';

function line(unitPrice: number, quantity: number): BudgetLine {
  return { kind: 'ITEM', referenceId: 'i-1', description: 'Oil filter', unitPrice, quantity };
}

describe('calculateTotal', () => {
  it('sums unit price times quantity across lines', () => {
    expect(calculateTotal([line(120, 1), line(35.5, 2)])).toBe(191);
  });

  it('rounds to cents', () => {
    expect(calculateTotal([line(0.1, 1), line(0.2, 1)])).toBe(0.3);
    expect(calculateTotal([line(19.999, 3)])).toBe(60);
  });

  it('is zero for a budget without lines', () => {
    expect(calculateTotal([])).toBe(0);
  });
});

describe('decide', () => {
  const decidedAt = new Date('2026-10-31T12:00:00.000Z');

  it.each(['APPROVED', 'REJECTED'] as const)('moves a pending budget to %s and records when', (decision) => {
    const decided = decide(pendingBudget, decision, decidedAt);

    expect(decided.status).toBe(decision);
    expect(decided.decidedAt).toEqual(decidedAt);
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELLED'] as const)('refuses to decide a %s budget', (status) => {
    expect(() => decide({ ...pendingBudget, status }, 'APPROVED', decidedAt)).toThrow(ValidationError);
  });
});

describe('cancel', () => {
  it.each(['PENDING_APPROVAL', 'APPROVED'] as const)('moves pending and approved budgets to CANCELLED (%s)', (status) => {
    expect(cancel({ ...pendingBudget, status }).status).toBe('CANCELLED');
  });

  it.each(['REJECTED', 'CANCELLED'] as const)('leaves rejected and cancelled budgets unchanged (%s)', (status) => {
    const budget = { ...pendingBudget, status };

    expect(cancel(budget)).toBe(budget);
  });
});
