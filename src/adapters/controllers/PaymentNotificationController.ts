import { Request, Response, NextFunction } from 'express';
import { ConfirmPaymentUseCase } from '../../use-cases/payments/ConfirmPaymentUseCase';

export class PaymentNotificationController {
  constructor(private readonly confirmPayment: ConfirmPaymentUseCase) {}

  /**
   * Receives a signed Mercado Pago notification. Only the payment id is taken
   * from it, and only from the signed query string; the outcome comes from the
   * provider's API. Anything other than a payment notification is acknowledged
   * and dropped, so the provider stops resending it.
   */
  async receive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerPaymentId = req.query['data.id'];
      if (req.query.type === 'payment' && typeof providerPaymentId === 'string' && providerPaymentId !== '') {
        await this.confirmPayment.execute({ providerPaymentId });
      }
      res.status(200).json({ received: true });
    } catch (err) { next(err); }
  }
}
