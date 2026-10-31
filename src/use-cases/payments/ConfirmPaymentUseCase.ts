import { settle } from '../../entities/Payment';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { IBudgetRepository } from '../ports/IBudgetRepository';
import { IPaymentRepository } from '../ports/IPaymentRepository';
import { IPaymentGateway } from '../ports/IPaymentGateway';
import { ILogger } from '../ports/ILogger';

export type ConfirmationResult = 'confirmed' | 'failed' | 'pending' | 'ignored';

export interface ConfirmPaymentInput {
  providerPaymentId: string;
}

export class ConfirmPaymentUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly budgets: IBudgetRepository,
    private readonly payments: IPaymentRepository,
    private readonly gateway: IPaymentGateway,
    private readonly logger: ILogger,
  ) {}

  /**
   * Settles the payment a notification points to and tells the saga. What
   * happened is always read from the provider, never taken from the
   * notification. A notification that leads nowhere is ignored rather than
   * refused: refusing would make the provider resend it forever.
   */
  async execute(input: ConfirmPaymentInput): Promise<ConfirmationResult> {
    const reported = await this.gateway.findPayment(input.providerPaymentId);
    if (!reported) {
      this.logger.warn('payment notification for a payment the provider does not know', { ...input });
      return 'ignored';
    }

    const budget = await this.budgets.findByServiceOrderId(reported.serviceOrderId);
    const payment = budget ? await this.payments.findByBudgetId(budget.id) : null;
    if (!budget || !payment) {
      this.logger.warn('payment notification that matches no charge of this service', {
        ...input,
        serviceOrderId: reported.serviceOrderId,
      });
      return 'ignored';
    }

    if (payment.status !== 'PENDING') return 'ignored';

    const settlement = settle(payment, reported);
    if (!settlement) return 'pending';

    return this.unitOfWork.run(async ({ payments, outbox }) => {
      const settled = await payments.settle(payment.id, { ...settlement, providerPaymentId: reported.providerPaymentId });
      if (!settled) return 'ignored';

      if (settlement.status === 'APPROVED') {
        await outbox.add({
          destination: 'saga-replies',
          type: 'PaymentConfirmed',
          serviceOrderId: budget.serviceOrderId,
          payload: { paymentId: payment.id, amount: payment.amount },
        });
        return 'confirmed';
      }

      await outbox.add({
        destination: 'saga-replies',
        type: 'PaymentFailed',
        serviceOrderId: budget.serviceOrderId,
        payload: { paymentId: payment.id, reason: settlement.failureReason },
      });
      return 'failed';
    });
  }
}
