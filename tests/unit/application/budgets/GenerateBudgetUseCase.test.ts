import { GenerateBudgetUseCase } from '../../../../src/use-cases/budgets/GenerateBudgetUseCase';
import { MessageEnvelope } from '../../../../src/use-cases/messaging/MessageEnvelope';
import { makeRepositories, makeUnitOfWork } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';

function makeNotifier() {
  return { budgetReady: jest.fn().mockResolvedValue(undefined), paymentRequested: jest.fn() };
}

const silentLogger = { warn: jest.fn(), error: jest.fn() };

const payload = {
  customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@example.com' },
  lines: [
    { kind: 'SERVICE', referenceId: 's-1', description: 'Oil change', unitPrice: 120, quantity: 1 },
    { kind: 'ITEM', referenceId: 'i-1', description: 'Oil filter', unitPrice: 35.5, quantity: 2 },
  ],
};

function command(overrides: Record<string, unknown> = {}): MessageEnvelope {
  return {
    messageId: 'm-1',
    type: 'GenerateBudget',
    serviceOrderId: 'os-1',
    occurredAt: '2026-10-31T10:00:00.000Z',
    payload: { ...payload, ...overrides },
  };
}

describe('GenerateBudgetUseCase', () => {
  it('saves a pending budget and adds BudgetGenerated to the outbox', async () => {
    const repositories = makeRepositories();

    await new GenerateBudgetUseCase(makeUnitOfWork(repositories), makeNotifier(), silentLogger).execute(command());

    expect(repositories.budgets.create).toHaveBeenCalledWith({
      serviceOrderId: 'os-1',
      customer: payload.customer,
      lines: payload.lines,
      total: 191,
    });
    expect(repositories.outbox.add).toHaveBeenCalledWith({
      destination: 'saga-replies',
      type: 'BudgetGenerated',
      serviceOrderId: 'os-1',
      payload: { budgetId: pendingBudget.id, total: pendingBudget.total },
    });
  });

  it('records the command as processed in the same unit of work', async () => {
    const repositories = makeRepositories();

    await new GenerateBudgetUseCase(makeUnitOfWork(repositories), makeNotifier(), silentLogger).execute(command());

    expect(repositories.processedMessages.markProcessed).toHaveBeenCalledWith('m-1', 'GenerateBudget');
  });

  it('does nothing for a command already processed', async () => {
    const repositories = makeRepositories();
    repositories.processedMessages.markProcessed.mockResolvedValue(false);

    await new GenerateBudgetUseCase(makeUnitOfWork(repositories), makeNotifier(), silentLogger).execute(command());

    expect(repositories.budgets.create).not.toHaveBeenCalled();
    expect(repositories.outbox.add).not.toHaveBeenCalled();
  });

  it('rejects a payload without customer email', async () => {
    const repositories = makeRepositories();
    const unitOfWork = makeUnitOfWork(repositories);

    await expect(
      new GenerateBudgetUseCase(unitOfWork, makeNotifier(), silentLogger).execute(command({ customer: { id: 'c-1', name: 'Maria Souza' } })),
    ).rejects.toThrow('customer.email');

    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown kind', { kind: 'LABOR' }],
    ['a negative unit price', { unitPrice: -1 }],
    ['a zero quantity', { quantity: 0 }],
    ['a fractional quantity', { quantity: 1.5 }],
    ['a missing description', { description: undefined }],
  ])('rejects a line with %s', async (_case, change) => {
    const lines = [{ ...payload.lines[0], ...change }];

    await expect(
      new GenerateBudgetUseCase(makeUnitOfWork(makeRepositories()), makeNotifier(), silentLogger).execute(command({ lines })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // The position tells whoever reads the dead-letter queue which line broke the contract.
  it('names the invalid line by its position', async () => {
    const lines = [payload.lines[0], { ...payload.lines[0], quantity: 0 }];

    await expect(
      new GenerateBudgetUseCase(makeUnitOfWork(makeRepositories()), makeNotifier(), silentLogger).execute(command({ lines })),
    ).rejects.toThrow('lines[1].quantity must be a positive integer');
  });

  it('rejects a payload whose lines are not a list', async () => {
    await expect(
      new GenerateBudgetUseCase(makeUnitOfWork(makeRepositories()), makeNotifier(), silentLogger).execute(command({ lines: 'none' })),
    ).rejects.toThrow('lines');
  });

  it('accepts a budget without lines, with total zero', async () => {
    const repositories = makeRepositories();

    await new GenerateBudgetUseCase(makeUnitOfWork(repositories), makeNotifier(), silentLogger).execute(command({ lines: [] }));

    expect(repositories.budgets.create).toHaveBeenCalledWith(expect.objectContaining({ lines: [], total: 0 }));
  });

  it('tells the customer the budget is ready once it is stored', async () => {
    const notifier = makeNotifier();

    await new GenerateBudgetUseCase(makeUnitOfWork(makeRepositories()), notifier, silentLogger).execute(command());

    expect(notifier.budgetReady).toHaveBeenCalledWith(pendingBudget);
  });

  it('does not tell the customer again for a repeated command', async () => {
    const repositories = makeRepositories();
    repositories.processedMessages.markProcessed.mockResolvedValue(false);
    const notifier = makeNotifier();

    await new GenerateBudgetUseCase(makeUnitOfWork(repositories), notifier, silentLogger).execute(command());

    expect(notifier.budgetReady).not.toHaveBeenCalled();
  });

  it('logs and keeps the budget when the notifier fails', async () => {
    const repositories = makeRepositories();
    const notifier = makeNotifier();
    notifier.budgetReady.mockRejectedValue(new Error('topic unavailable'));
    const logger = { warn: jest.fn(), error: jest.fn() };

    await expect(
      new GenerateBudgetUseCase(makeUnitOfWork(repositories), notifier, logger).execute(command()),
    ).resolves.toBeUndefined();

    expect(repositories.budgets.create).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ serviceOrderId: 'os-1' }));
  });
});
