import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BudgetController } from '../../../adapters/controllers/BudgetController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireCustomer } from '../middlewares/roleMiddleware';

/**
 * Mounted at `/service-orders`: the customer keeps calling the same path and
 * body, and the API Gateway decides which service answers.
 */
export function budgetRoutes(controller: BudgetController): Router {
  const router = Router();

  // The confirmation code has only four digits; the limit keeps guessing it
  // out of reach. Keyed by caller and order, so one order cannot lock others.
  const decisionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.ip}-${req.params.id}`,
    message: { error: 'Too many attempts, please try again later' },
  });

  /**
   * @openapi
   * /service-orders/{id}/budget:
   *   get:
   *     summary: Budget of a service order (owner customer or staff)
   *     tags: [Budgets]
   *     security:
   *       - customerBearerAuth: []
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: Budget with its lines and, after the charge is created, the payment
   *       401:
   *         description: Missing or invalid token
   *       403:
   *         description: The order belongs to another customer
   *       404:
   *         description: The order has no budget
   */
  router.get('/:id/budget', authMiddleware, (req, res, next) => controller.get(req, res, next));

  /**
   * @openapi
   * /service-orders/{id}/budget:
   *   patch:
   *     summary: Customer budget decision, approve or reject (owner customer only)
   *     description: |
   *       Requires the customer token issued at `POST /auth/cpf`, and the order must belong to that customer.
   *       The 4-digit `code` (first 4 digits of the CPF) confirms the customer intended this decision.
   *       Rate-limited to 5 requests per hour per IP and order.
   *     tags: [Budgets]
   *     security:
   *       - customerBearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status, code]
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [APPROVED, REJECTED]
   *               code:
   *                 type: string
   *                 description: First 4 digits of the customer CPF.
   *                 example: "5299"
   *     responses:
   *       200:
   *         description: Decided budget
   *       400:
   *         description: Invalid status, budget no longer pending, or wrong code
   *       403:
   *         description: The order belongs to another customer, or the token is not a customer token
   *       404:
   *         description: The order has no budget
   *       409:
   *         description: The budget changed while the decision was being recorded
   *       429:
   *         description: Too many attempts
   */
  router.patch('/:id/budget', decisionLimiter, authMiddleware, requireCustomer, (req, res, next) => controller.decide(req, res, next));

  return router;
}
