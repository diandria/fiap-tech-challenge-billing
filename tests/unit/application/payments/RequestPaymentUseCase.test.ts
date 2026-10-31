import { RequestPaymentUseCase } from '../../../../src/use-cases/payments/RequestPaymentUseCase';
import { MessageEnvelope } from '../../../../src/use-cases/messaging/MessageEnvelope';
import { IPaymentGateway } from '../../../../src/use-cases/ports/IPaymentGateway';
import { ValidationError } from '../../../../src/entities/errors/AppError';
import { makeRepositories, makeUnitOfWork, FakeRepositories } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

const command: MessageEnvelope = {
  messageId: 'm-7',
  type: 'RequestPayment',
  serviceOrderId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  occurredAt: '2026-10-31T11:00:00.000Z',
  payload: {},
};

const approvedBudget = { ...pendingBudget, serviceOrderId: command.serviceOrderId, status: 'APPROVED' as const };

function makeGateway(): jest.Mocked<IPaymentGateway> {
  return {
    createCheckout: jest.fn().mockResolvedValue({ preferenceId: 'pref-1', checkoutUrl: 'https://mp.test/checkout/pref-1' }),
    findPayment: jest.fn(),
  };
}

function makeUseCase(repositories: FakeRepositories, gateway: IPaymentGateway) {
  return new RequestPaymentUseCase(makeUnitOfWork(repositories), repositories.budgets, repositories.payments, gateway);
}

describe('RequestPaymentUseCase', () => {
  it('creates a checkout for the approved budget total and saves a pending payment', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(approvedBudget);
    const gateway = makeGateway();

    await makeUseCase(repositories, gateway).execute(command);

    expect(gateway.createCheckout).toHaveBeenCalledWith({
      serviceOrderId: command.serviceOrderId,
      description: 'Ordem de serviço 0f8fad5b',
      amount: 191,
    });
    expect(repositories.payments.create).toHaveBeenCalledWith({
      budgetId: 'b-1',
      preferenceId: 'pref-1',
      checkoutUrl: 'https://mp.test/checkout/pref-1',
      amount: 191,
    });
    expect(repositories.processedMessages.markProcessed).toHaveBeenCalledWith('m-7', 'RequestPayment');
  });

  it('does nothing when a payment already exists for the budget', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(approvedBudget);
    repositories.payments.findByBudgetId.mockResolvedValue(pendingPayment);
    const gateway = makeGateway();

    await makeUseCase(repositories, gateway).execute(command);

    expect(gateway.createCheckout).not.toHaveBeenCalled();
    expect(repositories.payments.create).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the budget is not approved', async () => {
    const repositories = makeRepositories();
    const gateway = makeGateway();

    await expect(makeUseCase(repositories, gateway).execute(command)).rejects.toThrow(ValidationError);

    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the order has no budget', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(null);

    await expect(makeUseCase(repositories, makeGateway()).execute(command)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('saves nothing when the gateway fails', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(approvedBudget);
    const gateway = makeGateway();
    gateway.createCheckout.mockRejectedValue(new Error('Mercado Pago create_checkout failed with status 502'));

    await expect(makeUseCase(repositories, gateway).execute(command)).rejects.toThrow('502');

    expect(repositories.payments.create).not.toHaveBeenCalled();
    expect(repositories.processedMessages.markProcessed).not.toHaveBeenCalled();
  });

  it('saves nothing when a concurrent delivery of the same command already did', async () => {
    const repositories = makeRepositories();
    repositories.budgets.findByServiceOrderId.mockResolvedValue(approvedBudget);
    repositories.processedMessages.markProcessed.mockResolvedValue(false);

    await makeUseCase(repositories, makeGateway()).execute(command);

    expect(repositories.payments.create).not.toHaveBeenCalled();
  });
});
