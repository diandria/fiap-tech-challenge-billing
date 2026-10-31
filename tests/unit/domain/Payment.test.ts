import { settle } from '../../../src/entities/Payment';
import { pendingPayment } from '../fixtures/payment';

describe('settle', () => {
  it('approves when the provider approved the amount of the payment', () => {
    expect(settle(pendingPayment, { status: 'APPROVED', amount: 191, statusDetail: 'accredited' })).toEqual({ status: 'APPROVED' });
  });

  it('refuses with the provider detail when the provider rejected', () => {
    expect(settle(pendingPayment, { status: 'REJECTED', amount: 191, statusDetail: 'cc_rejected_other_reason' }))
      .toEqual({ status: 'REJECTED', failureReason: 'cc_rejected_other_reason' });
  });

  it('refuses an approval of a different amount, so a service is never released for less', () => {
    expect(settle(pendingPayment, { status: 'APPROVED', amount: 190.99, statusDetail: 'accredited' }))
      .toEqual({ status: 'REJECTED', failureReason: 'AMOUNT_MISMATCH' });
  });

  it('compares amounts in cents', () => {
    expect(settle({ ...pendingPayment, amount: 0.3 }, { status: 'APPROVED', amount: 0.1 + 0.2, statusDetail: 'accredited' }))
      .toEqual({ status: 'APPROVED' });
  });

  it('settles nothing while the provider still has the payment pending', () => {
    expect(settle(pendingPayment, { status: 'PENDING', amount: 191, statusDetail: 'pending_contingency' })).toBeNull();
  });
});
