import { Request, Response, NextFunction } from 'express';
import { requireCustomer } from '../../../../src/frameworks/http/middlewares/roleMiddleware';
import { ForbiddenError } from '../../../../src/entities/errors/AppError';
import { JwtPayload } from '../../../../src/frameworks/http/middlewares/authMiddleware';

const staff: JwtPayload = { type: 'staff', userId: 'u1', role: 'admin' };
const customer: JwtPayload = { type: 'customer', sub: 'c1', cpf: '52998224725', name: 'Ana' };

function reqAs(user?: JwtPayload): Request {
  return { user } as Request;
}

describe('requireCustomer', () => {
  it('should allow a customer token GIVEN a customer-only route WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireCustomer(reqAs(customer), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  // An admin token does not pass either: without `sub` there is no owner to
  // compare against.
  it('should reject a staff token GIVEN a customer-only route WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireCustomer(reqAs(staff), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('should reject GIVEN no authenticated user WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireCustomer(reqAs(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
