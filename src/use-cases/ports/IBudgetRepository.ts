import { Budget, BudgetCustomer, BudgetLine } from '../../entities/Budget';

export interface NewBudget {
  serviceOrderId: string;
  customer: BudgetCustomer;
  lines: BudgetLine[];
  total: number;
}

export interface IBudgetRepository {
  /** Stores a pending budget with its lines and returns it with its id. */
  create(budget: NewBudget): Promise<Budget>;
}
