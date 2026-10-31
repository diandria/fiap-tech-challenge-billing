import { BudgetCustomer, BudgetLine, BudgetLineKind } from '../../entities/Budget';
import { ValidationError } from '../../entities/errors/AppError';

export interface GenerateBudgetPayload {
  customer: BudgetCustomer;
  lines: BudgetLine[];
}

const LINE_KINDS: BudgetLineKind[] = ['SERVICE', 'ITEM'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(source: Record<string, unknown>, field: string, path: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return value;
}

function readCustomer(value: unknown): BudgetCustomer {
  if (!isRecord(value)) throw new ValidationError('customer is required');
  return {
    id: requireText(value, 'id', 'customer'),
    name: requireText(value, 'name', 'customer'),
    email: requireText(value, 'email', 'customer'),
  };
}

function readLine(value: unknown, index: number): BudgetLine {
  const path = `lines[${index}]`;
  if (!isRecord(value)) throw new ValidationError(`${path} is not an object`);

  const { kind, unitPrice, quantity } = value;
  if (!LINE_KINDS.includes(kind as BudgetLineKind)) {
    throw new ValidationError(`${path}.kind must be SERVICE or ITEM`);
  }
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new ValidationError(`${path}.unitPrice must be a non-negative number`);
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError(`${path}.quantity must be a positive integer`);
  }

  return {
    kind: kind as BudgetLineKind,
    referenceId: requireText(value, 'referenceId', path),
    description: requireText(value, 'description', path),
    unitPrice,
    quantity,
  };
}

/**
 * Reads the GenerateBudget payload. A command that does not match the
 * contract is a permanent error: retrying it cannot fix it, so it ends in the
 * dead-letter queue, where the saga sees the step as failed.
 */
export function readGenerateBudgetPayload(payload: Record<string, unknown>): GenerateBudgetPayload {
  if (!Array.isArray(payload.lines)) throw new ValidationError('lines must be a list');
  return {
    customer: readCustomer(payload.customer),
    lines: payload.lines.map(readLine),
  };
}
