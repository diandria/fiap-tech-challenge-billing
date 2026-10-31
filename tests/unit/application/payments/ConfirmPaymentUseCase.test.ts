import { ConfirmPaymentUseCase } from '../../../../src/use-cases/payments/ConfirmPaymentUseCase';
import { IPaymentGateway, ProviderPayment } from '../../../../src/use-cases/ports/IPaymentGateway';
import { makeRepositories, makeUnitOfWork, FakeRepositories } from '../../fixtures/unitOfWork';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

const approvedBudget = { ...pendingBudget, status: 'APPROVED' as const };

function reported(overrides: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    providerPaymentId: '1234567890',
    serviceOrderId: 'os-1',
    amount: 191,
    status: 'APPROVED',
    statusDetail: 'accredited',
    ...overrides,
  };
}

function setup(providerPayment: ProviderPayment | null = reported()) {
  const repositories = makeRepositories();
  repositories.budgets.findByServiceOrderId.mockResolvedValue(approvedBudget);
  repositories.payments.findByBudgetId.mockResolvedValue(pendingPayment);
  const gateway: jest.Mocked<IPaymentGateway> = {
    createCheckout: jest.fn(),
    findPayment: jest.fn().mockResolvedValue(providerPayment),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const useCase = new ConfirmPaymentUseCase(makeUnitOfWork(repositories), repositories.budgets, repositories.payments, gateway, logger);
  return { repositories, gateway, logger, useCase };
}

function expectNoWrites(repositories: FakeRepositories): void {
  expect(repositories.payments.settle).not.toHaveBeenCalled();
  expect(repositories.outbox.add).not.toHaveBeenCalled();
}

describe('ConfirmPaymentUseCase', () => {
  it('marks the payment approved and adds PaymentConfirmed for an approved payment', async () => {
    const { repositories, gateway, useCase } = setup();

    const result = await useCase.execute({ providerPaymentId: '1234567890' });

    expect(result).toBe('confirmed');
    expect(gateway.findPayment).toHaveBeenCalledWith('1234567890');
    expect(repositories.payments.settle).toHaveBeenCalledWith('p-1', { status: 'APPROVED', providerPaymentId: '1234567890' });
    expect(repositories.outbox.add).toHaveBeenCalledWith({
      destination: 'saga-replies',
      type: 'PaymentConfirmed',
      serviceOrderId: 'os-1',
      payload: { paymentId: 'p-1', amount: 191 },
    });
  });

  it('marks the payment rejected and adds PaymentFailed for a rejected payment', async () => {
    const { repositories, useCase } = setup(reported({ status: 'REJECTED', statusDetail: 'cc_rejected_other_reason' }));

    const result = await useCase.execute({ providerPaymentId: '1234567890' });

    expect(result).toBe('failed');
    expect(repositories.payments.settle).toHaveBeenCalledWith('p-1', {
      status: 'REJECTED',
      providerPaymentId: '1234567890',
      failureReason: 'cc_rejected_other_reason',
    });
    expect(repositories.outbox.add).toHaveBeenCalledWith({
      destination: 'saga-replies',
      type: 'PaymentFailed',
      serviceOrderId: 'os-1',
      payload: { paymentId: 'p-1', reason: 'cc_rejected_other_reason' },
    });
  });

  it('adds PaymentFailed with AMOUNT_MISMATCH when the amount differs', async () => {
    const { repositories, useCase } = setup(reported({ amount: 100 }));

    expect(await useCase.execute({ providerPaymentId: '1234567890' })).toBe('failed');
    expect(repositories.outbox.add).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PaymentFailed',
      payload: { paymentId: 'p-1', reason: 'AMOUNT_MISMATCH' },
    }));
  });

  it('returns pending and changes nothing for a pending payment', async () => {
    const { repositories, useCase } = setup(reported({ status: 'PENDING', statusDetail: 'pending_contingency' }));

    expect(await useCase.execute({ providerPaymentId: '1234567890' })).toBe('pending');
    expectNoWrites(repositories);
  });

  it('returns ignored for a payment that is already final', async () => {
    const { repositories, useCase } = setup();
    repositories.payments.findByBudgetId.mockResolvedValue({ ...pendingPayment, status: 'APPROVED' });

    expect(await useCase.execute({ providerPaymentId: '1234567890' })).toBe('ignored');
    expectNoWrites(repositories);
  });

  it('returns ignored when a concurrent notification settled the payment first', async () => {
    const { repositories, useCase } = setup();
    repositories.payments.settle.mockResolvedValue(false);

    expect(await useCase.execute({ providerPaymentId: '1234567890' })).toBe('ignored');
    expect(repositories.outbox.add).not.toHaveBeenCalled();
  });

  it.each([
    ['the provider does not know the payment', null, null],
    ['no budget matches the external reference', reported(), 'budget'],
    ['the budget has no charge', reported(), 'payment'],
  ])('returns ignored and logs a warning when %s', async (_case, providerPayment, missing) => {
    const { repositories, logger, useCase } = setup(providerPayment);
    if (missing === 'budget') repositories.budgets.findByServiceOrderId.mockResolvedValue(null);
    if (missing === 'payment') repositories.payments.findByBudgetId.mockResolvedValue(null);

    expect(await useCase.execute({ providerPaymentId: '1234567890' })).toBe('ignored');
    expect(logger.warn).toHaveBeenCalled();
    expectNoWrites(repositories);
  });
});
