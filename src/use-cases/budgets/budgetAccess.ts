import { Budget } from '../../entities/Budget';
import { ForbiddenError, NotFoundError } from '../../entities/errors/AppError';

/**
 * Budget ownership. A missing `requesterCustomerId` means a staff call,
 * already authorised by the route. It is checked before anything else about
 * the budget, so another customer learns nothing about it, not even its status.
 */
export function assertCanAccess(budget: Budget | null, requesterCustomerId?: string): Budget {
  if (!budget) throw new NotFoundError('Budget');
  if (requesterCustomerId && budget.customer.id !== requesterCustomerId) {
    throw new ForbiddenError();
  }
  return budget;
}
