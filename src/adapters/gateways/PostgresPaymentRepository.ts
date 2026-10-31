import { Payment as PaymentRow } from '@prisma/client';
import { Payment, Settlement } from '../../entities/Payment';
import { IPaymentRepository, NewPayment } from '../../use-cases/ports/IPaymentRepository';
import { PrismaExecutor } from './prismaExecutor';

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    budgetId: row.budgetId,
    preferenceId: row.preferenceId,
    ...(row.providerPaymentId ? { providerPaymentId: row.providerPaymentId } : {}),
    checkoutUrl: row.checkoutUrl,
    amount: Number(row.amount),
    status: row.status,
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    createdAt: row.createdAt,
  };
}

export class PostgresPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaExecutor) {}

  async create(payment: NewPayment): Promise<Payment> {
    return toPayment(await this.prisma.payment.create({ data: payment }));
  }

  async findByBudgetId(budgetId: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({ where: { budgetId } });
    return row ? toPayment(row) : null;
  }

  async settle(id: string, settlement: Settlement & { providerPaymentId: string }): Promise<boolean> {
    // Conditional on PENDING: of two notifications for the same payment, the
    // second waits for the first row lock and then matches nothing.
    const { count } = await this.prisma.payment.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: settlement.status,
        providerPaymentId: settlement.providerPaymentId,
        failureReason: settlement.failureReason ?? null,
      },
    });
    return count === 1;
  }
}
