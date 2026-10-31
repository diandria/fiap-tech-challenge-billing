import { Router } from 'express';
import { PaymentNotificationController } from '../../../adapters/controllers/PaymentNotificationController';
import { mercadoPagoSignatureMiddleware } from '../middlewares/mercadoPagoSignatureMiddleware';

/**
 * Mounted at `/payments`. Public because Mercado Pago calls it, but every
 * request must carry the provider's signature. Left out of the API docs: it
 * is a contract with the provider, not with people.
 */
export function paymentNotificationRoutes(controller: PaymentNotificationController, webhookSecret: string): Router {
  const router = Router();

  router.post('/notifications', mercadoPagoSignatureMiddleware(webhookSecret), (req, res, next) => controller.receive(req, res, next));

  return router;
}
