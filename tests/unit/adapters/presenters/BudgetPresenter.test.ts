import { BudgetPresenter } from '../../../../src/adapters/presenters/BudgetPresenter';
import { pendingBudget } from '../../fixtures/budget';

describe('BudgetPresenter', () => {
  it('maps a budget with and without payment', () => {
    const withoutPayment = BudgetPresenter.ok(pendingBudget);
    const withPayment = BudgetPresenter.ok(pendingBudget, { status: 'PENDING', checkoutUrl: 'https://mp.test/checkout/1' });

    expect(withoutPayment).toEqual({
      status: 200,
      body: {
        serviceOrderId: 'os-1',
        status: 'PENDING_APPROVAL',
        total: 191,
        lines: pendingBudget.lines,
        payment: null,
      },
    });
    expect(withPayment.body.payment).toEqual({ status: 'PENDING', checkoutUrl: 'https://mp.test/checkout/1' });
  });
});
