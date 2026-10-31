export type BudgetStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

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
