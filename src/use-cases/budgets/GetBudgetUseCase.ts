import { Budget } from '../../entities/Budget';
import { Payment } from '../../entities/Payment';
import { IBudgetRepository } from '../ports/IBudgetRepository';
import { IPaymentRepository } from '../ports/IPaymentRepository';
import { assertCanAccess } from './budgetAccess';

export interface GetBudgetInput {
  serviceOrderId: string;
  /** Set for customer tokens; staff may read any budget. */
  requesterCustomerId?: string;
}

export interface BudgetView {
  budget: Budget;
  /** The charge, once the approved budget was sent to the provider. */
  payment: Payment | null;
}

export class GetBudgetUseCase {
  constructor(
    private readonly budgets: IBudgetRepository,
    private readonly payments: IPaymentRepository,
  ) {}

  async execute(input: GetBudgetInput): Promise<BudgetView> {
    const budget = assertCanAccess(
      await this.budgets.findByServiceOrderId(input.serviceOrderId),
      input.requesterCustomerId,
    );
    return { budget, payment: await this.payments.findByBudgetId(budget.id) };
  }
}
