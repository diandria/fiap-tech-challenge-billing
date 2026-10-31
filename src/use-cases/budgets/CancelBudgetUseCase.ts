import { cancel } from '../../entities/Budget';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { MessageEnvelope } from '../messaging/MessageEnvelope';

export class CancelBudgetUseCase {
  constructor(private readonly unitOfWork: IUnitOfWork) {}

  /**
   * Cancels the budget of an order and always replies BudgetCancelled, even
   * when there was nothing to cancel. A compensation that fails would leave
   * the saga waiting forever, so the only failures left are the ones a retry
   * can fix, like the database being down.
   */
  async execute(command: MessageEnvelope): Promise<void> {
    await this.unitOfWork.run(async ({ budgets, outbox, processedMessages }) => {
      if (!(await processedMessages.markProcessed(command.messageId, command.type))) return;

      const budget = await budgets.findByServiceOrderId(command.serviceOrderId);
      if (budget) {
        const cancelled = cancel(budget);
        if (cancelled !== budget) {
          await budgets.updateStatus(budget.id, { status: cancelled.status }, budget.version);
        }
      }

      await outbox.add({
        destination: 'saga-replies',
        type: 'BudgetCancelled',
        serviceOrderId: command.serviceOrderId,
        payload: {},
      });
    });
  }
}
