import { Prisma } from '@prisma/client';
import { Budget } from '../../entities/Budget';
import { IBudgetRepository, NewBudget } from '../../use-cases/ports/IBudgetRepository';
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
}
