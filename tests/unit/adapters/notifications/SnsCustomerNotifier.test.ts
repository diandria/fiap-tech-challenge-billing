import { SNSClient } from '@aws-sdk/client-sns';
import { SnsCustomerNotifier } from '../../../../src/adapters/notifications/SnsCustomerNotifier';
import { runWithTraceContext } from '../../../../src/frameworks/logging/context';
import { AsyncLocalStorageTraceContext } from '../../../../src/frameworks/logging/AsyncLocalStorageTraceContext';
import { pendingBudget } from '../../fixtures/budget';
import { pendingPayment } from '../../fixtures/payment';

const TOPIC = 'arn:aws:sns:us-east-1:000000000000:car-repair-shop-notifications';

function makeNotifier(send = jest.fn().mockResolvedValue({ MessageId: 'm-1' })) {
  const failures = { record: jest.fn() };
  const notifier = new SnsCustomerNotifier({ send } as unknown as SNSClient, TOPIC, failures, new AsyncLocalStorageTraceContext());
  return { notifier, send, failures };
}

function published(send: jest.Mock) {
  const { input } = send.mock.calls[0][0];
  return { topic: input.TopicArn, payload: JSON.parse(input.Message) };
}

describe('SnsCustomerNotifier', () => {
  it('publishes BUDGET_READY with the budget total', async () => {
    const { notifier, send } = makeNotifier();

    await runWithTraceContext({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }, () => notifier.budgetReady(pendingBudget));

    const { topic, payload } = published(send);
    expect(topic).toBe(TOPIC);
    expect(payload).toEqual({
      eventType: 'BUDGET_READY',
      occurredAt: expect.any(String),
      traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      serviceOrder: { id: 'os-1', status: 'WAITING_APPROVAL', budgetTotal: 191 },
      customer: { id: 'c-1', name: 'Maria Souza', email: 'maria@example.com' },
    });
  });

  it('publishes PAYMENT_REQUESTED with the checkout url', async () => {
    const { notifier, send } = makeNotifier();

    await notifier.paymentRequested({ ...pendingBudget, status: 'APPROVED' }, pendingPayment);

    const { payload } = published(send);
    expect(payload).toMatchObject({
      eventType: 'PAYMENT_REQUESTED',
      serviceOrder: { id: 'os-1', status: 'APPROVED', budgetTotal: 191 },
      payment: { checkoutUrl: 'https://mp.test/checkout/pref-1' },
    });
    expect(payload.traceparent).toBeUndefined();
  });

  it('records an integration failure and rethrows when the topic refuses the message', async () => {
    const { notifier, failures } = makeNotifier(jest.fn().mockRejectedValue(new Error('AuthorizationError')));

    await expect(notifier.budgetReady(pendingBudget)).rejects.toThrow('AuthorizationError');

    expect(failures.record).toHaveBeenCalledWith('sns', 'budget_ready');
  });
});
