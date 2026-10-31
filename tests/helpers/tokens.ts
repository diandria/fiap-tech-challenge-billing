import jwt from 'jsonwebtoken';

/** Signs a customer token in the same shape the authentication function issues. */
export function signCustomerToken(customerId: string, cpf = '52998224725'): string {
  return jwt.sign(
    { type: 'customer', sub: customerId, cpf, name: 'Customer' },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );
}

/** Signs a staff token in the same shape the OS Service login issues. */
export function signStaffToken(role = 'attendant'): string {
  return jwt.sign(
    { type: 'staff', userId: 'u-1', role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );
}
