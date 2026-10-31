import { DecideBudgetUseCase, DecideBudgetInput } from '../../../../src/use-cases/budgets/DecideBudgetUseCase';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../src/entities/errors/AppError';
import { makeRepositories, makeUnitOfWork } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';

function input(overrides: Partial<DecideBudgetInput> = {}): DecideBudgetInput {
  return {
    serviceOrderId: 'os-1',
    decision: 'APPROVED',
    code: '5299',
    requester: { customerId: 'c-1', cpf: '52998224725' },
    ...overrides,
  };
}

describe('DecideBudgetUseCase', () => {
  it('approves a pending budget and adds BudgetApproved to the outbox', async () => {
    const repositories = makeRepositories();

    const budget = await new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input());

    expect(repositories.budgets.updateStatus).toHaveBeenCalledWith(
      'b-1',
      { status: 'APPROVED', decidedAt: expect.any(Date) },
      pendingBudget.version,
    );
    expect(repositories.outbox.add).toHaveBeenCalledWith({
      destination: 'saga-replies',
      type: 'BudgetApproved',
      serviceOrderId: 'os-1',
      payload: { budgetId: 'b-1' },
    });
    expect(budget.status).toBe('APPROVED');
  });

  it('rejects a pending budget and adds BudgetRejected to the outbox', async () => {
    const repositories = makeRepositories();

    await new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input({ decision: 'REJECTED' }));

    expect(repositories.budgets.updateStatus).toHaveBeenCalledWith(
      'b-1',
      { status: 'REJECTED', decidedAt: expect.any(Date) },
      pendingBudget.version,
    );
    expect(repositories.outbox.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'BudgetRejected', payload: { budgetId: 'b-1' } }));
  });

  it('throws ForbiddenError when the requester is not the owner', async () => {
    const repositories = makeRepositories();

    await expect(
      new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input({ requester: { customerId: 'c-2', cpf: '52998224725' } })),
    ).rejects.toThrow(ForbiddenError);

    expect(repositories.budgets.updateStatus).not.toHaveBeenCalled();
    expect(repositories.outbox.add).not.toHaveBeenCalled();
  });

  it('throws ValidationError for a wrong confirmation code', async () => {
    const repositories = makeRepositories();

    await expect(
      new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input({ code: '1234' })),
    ).rejects.toThrow('Invalid confirmation code');

    expect(repositories.budgets.updateStatus).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the budget is no longer pending', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue({ ...pendingBudget, status: 'APPROVED' });

    await expect(
      new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input()),
    ).rejects.toThrow(ValidationError);

    expect(repositories.outbox.add).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the order has no budget', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(null);

    await expect(
      new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input()),
    ).rejects.toThrow(NotFoundError);
  });

  it('checks ownership before the status, so a stranger learns nothing about the budget', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue({ ...pendingBudget, status: 'APPROVED' });

    await expect(
      new DecideBudgetUseCase(makeUnitOfWork(repositories)).execute(input({ requester: { customerId: 'c-2', cpf: '' } })),
    ).rejects.toThrow(ForbiddenError);
  });
});
