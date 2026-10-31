import pino from 'pino';
import { createCustomerNotifier } from '../../../../src/frameworks/notifications/notifierFactory';
import { SnsCustomerNotifier } from '../../../../src/adapters/notifications/SnsCustomerNotifier';
import { ConsoleCustomerNotifier } from '../../../../src/adapters/notifications/ConsoleCustomerNotifier';

const log = pino({ level: 'silent' });

describe('createCustomerNotifier', () => {
  it('logs notifications by default', () => {
    expect(createCustomerNotifier({}, log)).toBeInstanceOf(ConsoleCustomerNotifier);
  });

  it('publishes to the topic with NOTIFICATION_CHANNEL=sns', () => {
    const notifier = createCustomerNotifier({ NOTIFICATION_CHANNEL: 'sns', SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:0:t' }, log);

    expect(notifier).toBeInstanceOf(SnsCustomerNotifier);
  });

  it('refuses to start with NOTIFICATION_CHANNEL=sns and no topic', () => {
    expect(() => createCustomerNotifier({ NOTIFICATION_CHANNEL: 'sns' }, log)).toThrow('SNS_TOPIC_ARN');
  });
});
