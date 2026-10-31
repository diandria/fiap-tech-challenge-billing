import { Logger } from 'pino';
import { ILogger } from '../../use-cases/ports/ILogger';

/**
 * Concrete implementation of the logging output port. It sits in the adapters
 * layer, which is where knowing the library is legitimate.
 */
export class PinoLoggerAdapter implements ILogger {
  constructor(private readonly logger: Logger) {}

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(context, message);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.logger.error(context, message);
  }
}
