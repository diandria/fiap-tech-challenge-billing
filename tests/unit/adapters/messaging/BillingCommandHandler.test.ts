import { BillingCommandHandler } from '../../../../src/adapters/messaging/BillingCommandHandler';
import { MessageEnvelope } from '../../../../src/use-cases/messaging/MessageEnvelope';

function command(type: string): MessageEnvelope {
  return {
    messageId: 'm-1',
    type,
    serviceOrderId: 'os-1',
    occurredAt: '2026-10-31T10:00:00.000Z',
    payload: {},
  };
}

describe('BillingCommandHandler', () => {
  it('routes each command type to its handler', async () => {
    const generateBudget = jest.fn().mockResolvedValue(undefined);
    const requestPayment = jest.fn().mockResolvedValue(undefined);
    const cancelBudget = jest.fn().mockResolvedValue(undefined);
    const handler = new BillingCommandHandler({
      GenerateBudget: generateBudget,
      RequestPayment: requestPayment,
      CancelBudget: cancelBudget,
    });

    await handler.handle(command('GenerateBudget'));
    await handler.handle(command('RequestPayment'));
    await handler.handle(command('CancelBudget'));

    expect(generateBudget).toHaveBeenCalledWith(command('GenerateBudget'));
    expect(requestPayment).toHaveBeenCalledWith(command('RequestPayment'));
    expect(cancelBudget).toHaveBeenCalledWith(command('CancelBudget'));
  });

  it('throws for an unknown command type', async () => {
    const handler = new BillingCommandHandler({ GenerateBudget: jest.fn() });

    await expect(handler.handle(command('ShipParts'))).rejects.toThrow('ShipParts');
  });

  it('throws for a known command type with no handler registered', async () => {
    const handler = new BillingCommandHandler({ GenerateBudget: jest.fn() });

    await expect(handler.handle(command('CancelBudget'))).rejects.toThrow('CancelBudget');
  });

  it('propagates the failure of the command handler, so the message is delivered again', async () => {
    const handler = new BillingCommandHandler({ GenerateBudget: jest.fn().mockRejectedValue(new Error('database down')) });

    await expect(handler.handle(command('GenerateBudget'))).rejects.toThrow('database down');
  });
});
