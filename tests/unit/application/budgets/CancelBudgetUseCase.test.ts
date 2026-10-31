import { CancelBudgetUseCase } from '../../../../src/use-cases/budgets/CancelBudgetUseCase';
import { MessageEnvelope } from '../../../../src/use-cases/messaging/MessageEnvelope';
import { makeRepositories, makeUnitOfWork } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';

const command: MessageEnvelope = {
  messageId: 'm-9',
  type: 'CancelBudget',
  serviceOrderId: 'os-1',
  occurredAt: '2026-10-31T10:00:00.000Z',
  payload: { reason: 'PAYMENT_FAILED' },
};

const budgetCancelled = {
  destination: 'saga-replies',
  type: 'BudgetCancelled',
  serviceOrderId: 'os-1',
  payload: {},
};

describe('CancelBudgetUseCase', () => {
  it('cancels an approved budget and replies BudgetCancelled', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue({ ...pendingBudget, status: 'APPROVED' });

    await new CancelBudgetUseCase(makeUnitOfWork(repositories)).execute(command);

    expect(repositories.budgets.updateStatus).toHaveBeenCalledWith('b-1', { status: 'CANCELLED' }, pendingBudget.version);
    expect(repositories.outbox.add).toHaveBeenCalledWith(budgetCancelled);
  });

  it('replies BudgetCancelled even when nothing changed', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue({ ...pendingBudget, status: 'REJECTED' });

    await new CancelBudgetUseCase(makeUnitOfWork(repositories)).execute(command);

    expect(repositories.budgets.updateStatus).not.toHaveBeenCalled();
    expect(repositories.outbox.add).toHaveBeenCalledWith(budgetCancelled);
  });

  it('replies BudgetCancelled when there is no budget for the order', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(null);

    await new CancelBudgetUseCase(makeUnitOfWork(repositories)).execute(command);

    expect(repositories.outbox.add).toHaveBeenCalledWith(budgetCancelled);
  });

  it('does nothing for a command already processed, whose reply already went out', async () => {
    const repositories = makeRepositories();
    repositories.processedMessages.markProcessed.mockResolvedValue(false);

    await new CancelBudgetUseCase(makeUnitOfWork(repositories)).execute(command);

    expect(repositories.processedMessages.markProcessed).toHaveBeenCalledWith('m-9', 'CancelBudget');
    expect(repositories.budgets.updateStatus).not.toHaveBeenCalled();
    expect(repositories.outbox.add).not.toHaveBeenCalled();
  });
});
