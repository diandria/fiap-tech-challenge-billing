import { Prisma } from '@prisma/client';
import { Budget } from '../../entities/Budget';
import { ConflictError } from '../../entities/errors/AppError';
import { BudgetStatusChange, IBudgetRepository, NewBudget } from '../../use-cases/ports/IBudgetRepository';
import { PrismaExecutor } from './prismaExecutor';

type BudgetRow = Prisma.BudgetGetPayload<{ include: { lines: true } }>;

function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    serviceOrderId: row.serviceOrderId,
    customer: { id: row.customerId, name: row.customerName, email: row.customerEmail },
    lines: row.lines.map((line) => ({
      kind: line.kind,
      referenceId: line.referenceId,
      description: line.description,
      unitPrice: Number(line.unitPrice),
      quantity: line.quantity,
    })),
    total: Number(row.total),
    status: row.status,
    version: row.version,
    ...(row.decidedAt ? { decidedAt: row.decidedAt } : {}),
    createdAt: row.createdAt,
  };
}

export class PostgresBudgetRepository implements IBudgetRepository {
  constructor(private readonly prisma: PrismaExecutor) {}

  async create(budget: NewBudget): Promise<Budget> {
    const row = await this.prisma.budget.create({
      data: {
        serviceOrderId: budget.serviceOrderId,
        customerId: budget.customer.id,
        customerName: budget.customer.name,
        customerEmail: budget.customer.email,
        total: budget.total,
        lines: { create: budget.lines },
      },
      include: { lines: true },
    });
    return toBudget(row);
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget | null> {
    const row = await this.prisma.budget.findUnique({ where: { serviceOrderId }, include: { lines: true } });
    return row ? toBudget(row) : null;
  }

  async updateStatus(id: string, change: BudgetStatusChange, expectedVersion: number): Promise<Budget> {
    // The version in the filter makes the write conditional: a concurrent
    // change already incremented it, so this one matches no row.
    const { count } = await this.prisma.budget.updateMany({
      where: { id, version: expectedVersion },
      data: { ...change, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError('Budget was changed by another request; read it again');
    }

    const row = await this.prisma.budget.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    return toBudget(row);
  }
}
