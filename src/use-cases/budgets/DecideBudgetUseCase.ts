import { Budget, BudgetDecision, decide } from '../../entities/Budget';
import { ValidationError } from '../../entities/errors/AppError';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { assertCanAccess } from './budgetAccess';

const CONFIRMATION_CODE_LENGTH = 4;

export interface DecideBudgetInput {
  serviceOrderId: string;
  decision: BudgetDecision;
  /** First four digits of the customer's CPF, typed to confirm the decision. */
  code: string;
  requester: { customerId: string; cpf: string };
}

const REPLY_TYPE: Record<BudgetDecision, string> = {
  APPROVED: 'BudgetApproved',
  REJECTED: 'BudgetRejected',
};

export class DecideBudgetUseCase {
  constructor(private readonly unitOfWork: IUnitOfWork) {}

  /**
   * Records the customer's decision and tells the saga. The new status and
   * the reply commit together; a concurrent decision on the same budget fails
   * on the version instead of producing two replies.
   */
  async execute(input: DecideBudgetInput): Promise<Budget> {
    return this.unitOfWork.run(async ({ budgets, outbox }) => {
      const budget = assertCanAccess(
        await budgets.findByServiceOrderId(input.serviceOrderId),
        input.requester.customerId,
      );

      const decided = decide(budget, input.decision, new Date());
      verifyConfirmationCode(input.requester.cpf, input.code);

      const saved = await budgets.updateStatus(
        budget.id,
        { status: decided.status, decidedAt: decided.decidedAt },
        budget.version,
      );

      await outbox.add({
        destination: 'saga-replies',
        type: REPLY_TYPE[input.decision],
        serviceOrderId: budget.serviceOrderId,
        payload: { budgetId: budget.id },
      });

      return saved;
    });
  }
}

/** The code is compared with the CPF in the token, which the issuing function signs with digits only. */
function verifyConfirmationCode(cpf: string, code: string): void {
  const expected = cpf.slice(0, CONFIRMATION_CODE_LENGTH);
  if (expected.length !== CONFIRMATION_CODE_LENGTH || code !== expected) {
    throw new ValidationError('Invalid confirmation code');
  }
}
