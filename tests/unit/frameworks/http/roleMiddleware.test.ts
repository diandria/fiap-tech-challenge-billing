import { Request, Response, NextFunction } from 'express';
import { requireCustomer, requireRole } from '../../../../src/frameworks/http/middlewares/roleMiddleware';
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

describe('requireRole', () => {
  it('should allow GIVEN a staff token with an accepted role WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireRole('admin')(reqAs(staff), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject GIVEN a staff token with another role WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireRole('admin')(reqAs({ type: 'staff', userId: 'u2', role: 'mechanic' }), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('should reject a customer token GIVEN a staff-only route WHEN authorizing', () => {
    const next = jest.fn() as NextFunction;

    requireRole('admin')(reqAs(customer), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
