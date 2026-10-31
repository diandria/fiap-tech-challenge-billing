import { NotFoundError, ValidationError } from '../../entities/errors/AppError';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { IBudgetRepository } from '../ports/IBudgetRepository';
import { IPaymentRepository } from '../ports/IPaymentRepository';
import { IPaymentGateway } from '../ports/IPaymentGateway';
import { ICustomerNotifier } from '../ports/ICustomerNotifier';
import { ILogger } from '../ports/ILogger';
import { MessageEnvelope } from '../messaging/MessageEnvelope';

export class RequestPaymentUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly budgets: IBudgetRepository,
    private readonly payments: IPaymentRepository,
    private readonly gateway: IPaymentGateway,
    private readonly notifier: ICustomerNotifier,
    private readonly logger: ILogger,
  ) {}

  /**
   * Creates the charge of an approved budget. Nothing is replied here: the
   * saga moves on when the provider reports the payment.
   *
   * The provider is called outside the database transaction, because holding
   * a transaction open while waiting on an external API is how a pool runs out
   * of connections. If saving fails after the checkout was created, the command
   * comes back and creates another checkout; the first one is left unused at
   * the provider, which is harmless.
   *
   * The customer gets the link after the commit; a notice that fails is logged
   * and changes nothing.
   */
  async execute(command: MessageEnvelope): Promise<void> {
    const budget = await this.budgets.findByServiceOrderId(command.serviceOrderId);
    if (!budget) throw new NotFoundError('Budget');

    // A charge for a budget that is not approved means the saga is out of
    // step; the command must end in the dead-letter queue, not be ignored.
    if (budget.status !== 'APPROVED') {
      throw new ValidationError(`Budget is ${budget.status}; only an approved budget can be charged`);
    }

    if (await this.payments.findByBudgetId(budget.id)) return;

    const checkout = await this.gateway.createCheckout({
      serviceOrderId: budget.serviceOrderId,
      description: `Ordem de serviço ${budget.serviceOrderId.slice(0, 8)}`,
      amount: budget.total,
    });

    const payment = await this.unitOfWork.run(async ({ payments, processedMessages }) => {
      if (!(await processedMessages.markProcessed(command.messageId, command.type))) return null;

      return payments.create({
        budgetId: budget.id,
        preferenceId: checkout.preferenceId,
        checkoutUrl: checkout.checkoutUrl,
        amount: budget.total,
      });
    });

    if (!payment) return;
    try {
      await this.notifier.paymentRequested(budget, payment);
    } catch (err) {
      this.logger.warn('customer was not sent the payment link', { serviceOrderId: budget.serviceOrderId, err });
    }
  }
}
