import { SNSClient } from '@aws-sdk/client-sns';
import { ICustomerNotifier } from '../../use-cases/ports/ICustomerNotifier';
import { SnsCustomerNotifier } from '../../adapters/notifications/SnsCustomerNotifier';
import { ConsoleCustomerNotifier, NotificationLogger } from '../../adapters/notifications/ConsoleCustomerNotifier';
import { PrometheusIntegrationFailures } from '../metrics/PrometheusIntegrationFailures';
import { AsyncLocalStorageTraceContext } from '../logging/AsyncLocalStorageTraceContext';

/**
 * Picks the notification channel from the environment, as the OS Service
 * does. Missing configuration fails at startup, not at the first notice.
 */
export function createCustomerNotifier(
  env: Record<string, string | undefined>,
  logger: NotificationLogger,
): ICustomerNotifier {
  if (env.NOTIFICATION_CHANNEL !== 'sns') {
    return new ConsoleCustomerNotifier(logger);
  }

  const topicArn = env.SNS_TOPIC_ARN;
  if (!topicArn) {
    throw new Error('NOTIFICATION_CHANNEL=sns requires SNS_TOPIC_ARN');
  }

  return new SnsCustomerNotifier(new SNSClient({}), topicArn, new PrometheusIntegrationFailures(), new AsyncLocalStorageTraceContext());
}
