import { GetBudgetUseCase } from '../../../../src/use-cases/budgets/GetBudgetUseCase';
import { ForbiddenError, NotFoundError } from '../../../../src/entities/errors/AppError';
import { makeRepositories } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

describe('GetBudgetUseCase', () => {
  it('returns the budget to its owner, without payment before the charge exists', async () => {
    const { budgets, payments } = makeRepositories();

    const view = await new GetBudgetUseCase(budgets, payments).execute({ serviceOrderId: 'os-1', requesterCustomerId: 'c-1' });

    expect(budgets.findByServiceOrderId).toHaveBeenCalledWith('os-1');
    expect(view).toEqual({ budget: pendingBudget, payment: null });
  });

  it('returns the payment of the budget once the charge exists', async () => {
    const { budgets, payments } = makeRepositories();
    payments.findByBudgetId.mockResolvedValue(pendingPayment);

    const view = await new GetBudgetUseCase(budgets, payments).execute({ serviceOrderId: 'os-1' });

    expect(payments.findByBudgetId).toHaveBeenCalledWith('b-1');
    expect(view.payment).toBe(pendingPayment);
  });

  it('returns the budget to staff, who have no customer id', async () => {
    const { budgets, payments } = makeRepositories();

    expect((await new GetBudgetUseCase(budgets, payments).execute({ serviceOrderId: 'os-1' })).budget).toBe(pendingBudget);
  });

  it('throws ForbiddenError for another customer', async () => {
    const { budgets, payments } = makeRepositories();

    await expect(
      new GetBudgetUseCase(budgets, payments).execute({ serviceOrderId: 'os-1', requesterCustomerId: 'c-2' }),
    ).rejects.toThrow(ForbiddenError);
    expect(payments.findByBudgetId).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the order has no budget', async () => {
    const { budgets, payments } = makeRepositories();
    budgets.findByServiceOrderId.mockResolvedValue(null);

    await expect(new GetBudgetUseCase(budgets, payments).execute({ serviceOrderId: 'os-1' })).rejects.toThrow(NotFoundError);
  });
});
