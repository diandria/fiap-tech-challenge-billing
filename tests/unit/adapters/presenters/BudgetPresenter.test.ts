import { BudgetPresenter } from '../../../../src/adapters/presenters/BudgetPresenter';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

describe('BudgetPresenter', () => {
  it('maps a budget with and without payment', () => {
    const withoutPayment = BudgetPresenter.ok(pendingBudget);
    const withPayment = BudgetPresenter.ok(pendingBudget, pendingPayment);

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
    expect(withPayment.body.payment).toEqual({ status: 'PENDING', checkoutUrl: 'https://mp.test/checkout/pref-1' });
  });
});
