import { Budget } from '../../entities/Budget';

/** What the customer needs to pay: the charge status and where to pay it. */
export interface PaymentView {
  status: string;
  checkoutUrl: string;
}

export const BudgetPresenter = {
  ok(budget: Budget, payment: PaymentView | null = null) {
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
        payment,
      },
    };
  },
};
