import { Request, Response, NextFunction } from 'express';
import { BudgetDecision } from '../../entities/Budget';
import { ForbiddenError, ValidationError } from '../../entities/errors/AppError';
import { GetBudgetUseCase } from '../../use-cases/budgets/GetBudgetUseCase';
import { DecideBudgetUseCase } from '../../use-cases/budgets/DecideBudgetUseCase';
import { BudgetPresenter } from '../presenters/BudgetPresenter';

const DECISIONS: BudgetDecision[] = ['APPROVED', 'REJECTED'];

function requesterCustomerId(req: Request): string | undefined {
  return req.user?.type === 'customer' ? req.user.sub : undefined;
}

export class BudgetController {
  constructor(
    private readonly getBudget: GetBudgetUseCase,
    private readonly decideBudget: DecideBudgetUseCase,
  ) {}

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { budget, payment } = await this.getBudget.execute({
        serviceOrderId: req.params.id,
        requesterCustomerId: requesterCustomerId(req),
      });
      const { status, body } = BudgetPresenter.ok(budget, payment);
      res.status(status).json(body);
    } catch (err) { next(err); }
  }

  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // The route already requires a customer token; this narrows the type.
      if (req.user?.type !== 'customer') throw new ForbiddenError();

      const { status: decision, code } = req.body;
      if (!DECISIONS.includes(decision)) {
        throw new ValidationError(`Unsupported budget status: ${decision}`);
      }

      const budget = await this.decideBudget.execute({
        serviceOrderId: req.params.id,
        decision,
        code: typeof code === 'string' ? code : '',
        requester: { customerId: req.user.sub, cpf: req.user.cpf },
      });
      const { status, body } = BudgetPresenter.ok(budget);
      res.status(status).json(body);
    } catch (err) { next(err); }
  }
}
