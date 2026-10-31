import { Budget } from '../../entities/Budget';
import { IBudgetRepository } from '../ports/IBudgetRepository';
import { assertCanAccess } from './budgetAccess';

export interface GetBudgetInput {
  serviceOrderId: string;
  /** Set for customer tokens; staff may read any budget. */
  requesterCustomerId?: string;
}

export class GetBudgetUseCase {
  constructor(private readonly budgets: IBudgetRepository) {}

  async execute(input: GetBudgetInput): Promise<Budget> {
    const budget = await this.budgets.findByServiceOrderId(input.serviceOrderId);
    return assertCanAccess(budget, input.requesterCustomerId);
  }
}
