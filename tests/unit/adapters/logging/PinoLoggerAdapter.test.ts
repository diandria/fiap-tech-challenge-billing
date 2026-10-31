import pino from 'pino';
import { PinoLoggerAdapter } from '../../../../src/adapters/logging/PinoLoggerAdapter';

describe('PinoLoggerAdapter', () => {
  it('passes the context as the first argument, the way pino expects it', () => {
    const logger = pino({ level: 'silent' });
    const warn = jest.spyOn(logger, 'warn');
    const error = jest.spyOn(logger, 'error');
    const adapter = new PinoLoggerAdapter(logger);

    adapter.warn('unexpected status', { providerStatus: 'x' });
    adapter.error('provider down');

    expect(warn).toHaveBeenCalledWith({ providerStatus: 'x' }, 'unexpected status');
    expect(error).toHaveBeenCalledWith({}, 'provider down');
  });
});
