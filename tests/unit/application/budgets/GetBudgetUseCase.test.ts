import { GetBudgetUseCase } from '../../../../src/use-cases/budgets/GetBudgetUseCase';
import { ForbiddenError, NotFoundError } from '../../../../src/entities/errors/AppError';
import { makeRepositories } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';

describe('GetBudgetUseCase', () => {
  it('returns the budget to its owner', async () => {
    const { budgets } = makeRepositories();

    const budget = await new GetBudgetUseCase(budgets).execute({ serviceOrderId: 'os-1', requesterCustomerId: 'c-1' });

    expect(budgets.findByServiceOrderId).toHaveBeenCalledWith('os-1');
    expect(budget).toBe(pendingBudget);
  });

  it('returns the budget to staff, who have no customer id', async () => {
    const { budgets } = makeRepositories();

    expect(await new GetBudgetUseCase(budgets).execute({ serviceOrderId: 'os-1' })).toBe(pendingBudget);
  });

  it('throws ForbiddenError for another customer', async () => {
    const { budgets } = makeRepositories();

    await expect(
      new GetBudgetUseCase(budgets).execute({ serviceOrderId: 'os-1', requesterCustomerId: 'c-2' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError when the order has no budget', async () => {
    const { budgets } = makeRepositories();
    budgets.findByServiceOrderId.mockResolvedValue(null);

    await expect(new GetBudgetUseCase(budgets).execute({ serviceOrderId: 'os-1' })).rejects.toThrow(NotFoundError);
  });
});
