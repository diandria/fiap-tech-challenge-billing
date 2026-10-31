import { calculateTotal } from '../../entities/Budget';
import { IUnitOfWork } from '../ports/IUnitOfWork';
import { MessageEnvelope } from '../messaging/MessageEnvelope';
import { readGenerateBudgetPayload } from './generateBudgetPayload';

export class GenerateBudgetUseCase {
  constructor(private readonly unitOfWork: IUnitOfWork) {}

  /**
   * Creates the budget of a service order and replies with its total. The
   * budget, the reply and the processed-message record commit together, so a
   * repeated command neither creates a second budget nor sends a second reply.
   */
  async execute(command: MessageEnvelope): Promise<void> {
    const { customer, lines } = readGenerateBudgetPayload(command.payload);

    await this.unitOfWork.run(async ({ budgets, outbox, processedMessages }) => {
      if (!(await processedMessages.markProcessed(command.messageId, command.type))) return;

      const budget = await budgets.create({
        serviceOrderId: command.serviceOrderId,
        customer,
        lines,
        total: calculateTotal(lines),
      });

      await outbox.add({
        destination: 'saga-replies',
        type: 'BudgetGenerated',
        serviceOrderId: command.serviceOrderId,
        payload: { budgetId: budget.id, total: budget.total },
      });
    });
  }
}
