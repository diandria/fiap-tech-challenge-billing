import { Router } from 'express';
import { MockPaymentController } from '../../../adapters/controllers/MockPaymentController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireRole } from '../middlewares/roleMiddleware';

/** Mounted at `/payments`, and only when the simulated provider is on. */
export function mockPaymentRoutes(controller: MockPaymentController): Router {
  const router = Router();

  /**
   * @openapi
   * /payments/mock/{serviceOrderId}:
   *   post:
   *     summary: Simulate the customer paying the order (admin only, simulated provider only)
   *     description: |
   *       Exists only with `PAYMENT_PROVIDER=mock`. Approves or refuses the pending payment of the order,
   *       which then follows the same confirmation path as a Mercado Pago notification.
   *     tags: [Payments]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serviceOrderId
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status]
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [approved, rejected]
   *     responses:
   *       200:
   *         description: The outcome of the confirmation, "confirmed" or "failed"
   *       400:
   *         description: Invalid status
   *       403:
   *         description: Not an admin token
   *       404:
   *         description: The order has no pending payment, or the simulated provider is off
   */
  router.post('/mock/:serviceOrderId', authMiddleware, requireRole('admin'), (req, res, next) => controller.decide(req, res, next));

  return router;
}
