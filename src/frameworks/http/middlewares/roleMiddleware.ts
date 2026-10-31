import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../../entities/errors/AppError';

/**
 * Authorises routes only a customer may reach. Employees are rejected because
 * the ownership check needs the token's `sub`, which a staff token has not.
 */
export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.type !== 'customer') {
    return next(new ForbiddenError());
  }
  next();
}
