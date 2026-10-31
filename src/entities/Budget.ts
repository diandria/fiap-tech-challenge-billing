import { ValidationError } from './errors/AppError';

export type BudgetStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type BudgetDecision = 'APPROVED' | 'REJECTED';

export type BudgetLineKind = 'SERVICE' | 'ITEM';

/**
 * One priced line, as the OS Service had it at diagnosis time. The price is
 * a snapshot: a later change in the catalog does not change a budget already
 * sent to the customer.
 */
export interface BudgetLine {
  kind: BudgetLineKind;
  referenceId: string;
  description: string;
  unitPrice: number;
  quantity: number;
}

export interface BudgetCustomer {
  id: string;
  name: string;
  email: string;
}

export interface Budget {
  id: string;
  serviceOrderId: string;
  customer: BudgetCustomer;
  lines: BudgetLine[];
  total: number;
  status: BudgetStatus;
  /** Incremented on every write; lets an update detect that it read a stale budget. */
  version: number;
  decidedAt?: Date;
  createdAt: Date;
}

/** The only place where the total is computed, so it is rounded to cents the same way everywhere. */
export function calculateTotal(lines: BudgetLine[]): number {
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return Math.round(total * 100) / 100;
}

/** Records the customer's decision. Only a pending budget can be decided, and only once. */
export function decide(budget: Budget, decision: BudgetDecision, decidedAt: Date): Budget {
  if (budget.status !== 'PENDING_APPROVAL') {
    throw new ValidationError(`Budget is ${budget.status}; only a pending budget can be decided`);
  }
  return { ...budget, status: decision, decidedAt };
}

/**
 * Compensation for a saga that will not reach payment. A budget already
 * rejected or cancelled is returned as is: the compensation still succeeds,
 * because the saga waits for its reply to close.
 */
export function cancel(budget: Budget): Budget {
  if (budget.status === 'PENDING_APPROVAL' || budget.status === 'APPROVED') {
    return { ...budget, status: 'CANCELLED' };
  }
  return budget;
}
