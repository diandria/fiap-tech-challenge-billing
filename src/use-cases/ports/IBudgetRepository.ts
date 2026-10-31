import { Budget, BudgetCustomer, BudgetLine, BudgetStatus } from '../../entities/Budget';

export interface NewBudget {
  serviceOrderId: string;
  customer: BudgetCustomer;
  lines: BudgetLine[];
  total: number;
}

export interface BudgetStatusChange {
  status: BudgetStatus;
  decidedAt?: Date;
}

export interface IBudgetRepository {
  /** Stores a pending budget with its lines and returns it with its id. */
  create(budget: NewBudget): Promise<Budget>;
  findByServiceOrderId(serviceOrderId: string): Promise<Budget | null>;
  /**
   * Writes the change only if the budget is still at `expectedVersion`, and
   * throws ConflictError otherwise: someone else changed it after it was read.
   */
  updateStatus(id: string, change: BudgetStatusChange, expectedVersion: number): Promise<Budget>;
}
