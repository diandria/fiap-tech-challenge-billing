import { calculateTotal } from '../../entities/Budget';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { ICustomerNotifier } from '../ports/ICustomerNotifier';
import { ILogger } from '../ports/ILogger';
import { MessageEnvelope } from '../messaging/MessageEnvelope';
import { readGenerateBudgetPayload } from './generateBudgetPayload';

export class GenerateBudgetUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly notifier: ICustomerNotifier,
    private readonly logger: ILogger,
  ) {}

  /**
   * Creates the budget of a service order and replies with its total. The
   * budget, the reply and the processed-message record commit together, so a
   * repeated command neither creates a second budget nor sends a second reply.
   * The customer is told afterwards, outside the transaction: a notice that
   * fails must not undo the budget.
   */
  async execute(command: MessageEnvelope): Promise<void> {
    const { customer, lines } = readGenerateBudgetPayload(command.payload);

    const budget = await this.unitOfWork.run(async ({ budgets, outbox, processedMessages }) => {
      if (!(await processedMessages.markProcessed(command.messageId, command.type))) return null;

      const created = await budgets.create({
        serviceOrderId: command.serviceOrderId,
        customer,
        lines,
        total: calculateTotal(lines),
      });

      await outbox.add({
        destination: 'saga-replies',
        type: 'BudgetGenerated',
        serviceOrderId: command.serviceOrderId,
        payload: { budgetId: created.id, total: created.total },
      });
      return created;
    });

    if (!budget) return;
    try {
      await this.notifier.budgetReady(budget);
    } catch (err) {
      this.logger.warn('customer was not told the budget is ready', { serviceOrderId: budget.serviceOrderId, err });
    }
  }
}
