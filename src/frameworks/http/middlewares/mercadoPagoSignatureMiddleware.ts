import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../../entities/errors/AppError';
import { verifyMercadoPagoSignature } from '../../../adapters/payments/verifyMercadoPagoSignature';

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Refuses with 401 any notification that does not carry a valid Mercado Pago signature. */
export function mercadoPagoSignatureMiddleware(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const valid = verifyMercadoPagoSignature({
      xSignature: req.header('x-signature'),
      xRequestId: req.header('x-request-id'),
      dataId: text(req.query['data.id']),
      secret,
    });
    if (!valid) {
      return next(new UnauthorizedError('Invalid notification signature'));
    }
    next();
  };
}
