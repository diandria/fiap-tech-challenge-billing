import { ConsoleCustomerNotifier } from '../../../../src/adapters/notifications/ConsoleCustomerNotifier';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

describe('ConsoleCustomerNotifier', () => {
  it('logs the budget notification with the order id and total, without the customer contact', async () => {
    const logger = { info: jest.fn() };

    await new ConsoleCustomerNotifier(logger).budgetReady(pendingBudget);

    expect(logger.info).toHaveBeenCalledWith(
      { event: 'budget_ready', serviceOrderId: 'os-1', budgetTotal: 191 },
      'customer notification dispatched',
    );
  });

  it('logs the payment notification with the checkout url', async () => {
    const logger = { info: jest.fn() };

    await new ConsoleCustomerNotifier(logger).paymentRequested(pendingBudget, pendingPayment);

    expect(logger.info).toHaveBeenCalledWith(
      { event: 'payment_requested', serviceOrderId: 'os-1', checkoutUrl: 'https://mp.test/checkout/pref-1' },
      'customer notification dispatched',
    );
  });
});
