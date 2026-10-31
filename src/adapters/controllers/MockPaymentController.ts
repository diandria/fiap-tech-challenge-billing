import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ValidationError } from '../../entities/errors/AppError';
import { GetBudgetUseCase } from '../../use-cases/budgets/GetBudgetUseCase';
import { ConfirmPaymentUseCase } from '../../use-cases/payments/ConfirmPaymentUseCase';
import { MockPaymentGateway } from '../payments/MockPaymentGateway';

const DECISIONS = { approved: 'APPROVED', rejected: 'REJECTED' } as const;

/**
 * Plays the customer paying, or failing to, at the simulated provider. The
 * outcome then goes through the same confirmation a real notification does.
 */
export class MockPaymentController {
  constructor(
    private readonly getBudget: GetBudgetUseCase,
    private readonly confirmPayment: ConfirmPaymentUseCase,
    private readonly gateway: MockPaymentGateway,
  ) {}

  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const decision = DECISIONS[req.body?.status as keyof typeof DECISIONS];
      if (!decision) throw new ValidationError('status must be approved or rejected');

      const serviceOrderId = req.params.serviceOrderId;
      const { payment } = await this.getBudget.execute({ serviceOrderId });
      if (!payment || payment.status !== 'PENDING') throw new NotFoundError('Pending payment');

      const providerPaymentId = this.gateway.decide({ serviceOrderId, amount: payment.amount, status: decision });
      const result = await this.confirmPayment.execute({ providerPaymentId });
      res.status(200).json({ result });
    } catch (err) { next(err); }
  }
}
