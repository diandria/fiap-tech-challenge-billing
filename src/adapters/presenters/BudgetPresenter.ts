import { Budget } from '../../entities/Budget';
import { Payment } from '../../entities/Payment';

export const BudgetPresenter = {
  ok(budget: Budget, payment: Payment | null = null) {
    return {
      status: 200,
      body: {
        serviceOrderId: budget.serviceOrderId,
        status: budget.status,
        total: budget.total,
        lines: budget.lines.map((line) => ({
          kind: line.kind,
          referenceId: line.referenceId,
          description: line.description,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
        })),
        // Only what the customer needs to pay: the charge status and where to pay it.
        payment: payment ? { status: payment.status, checkoutUrl: payment.checkoutUrl } : null,
      },
    };
  },
};
