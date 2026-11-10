import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database';
import { NotFoundError, ValidationError } from '../../common/errors/AppError';

export interface CreateExpenseInput {
  entityId: string;
  category:
    | 'TRANSPORTATION'
    | 'ELECTRICIAN_MAINTENANCE'
    | 'LABOUR_WAGES'
    | 'WAREHOUSE_OPERATIONS'
    | 'UTILITIES_ELECTRICITY'
    | 'OFFICE_SUPPLIES'
    | 'FUEL_CONVEYANCE'
    | 'TEA_REFRESHMENTS'
    | 'FREIGHT_COURIER'
    | 'PROFESSIONAL_LEGAL'
    | 'MISCELLANEOUS';
  title: string;
  description?: string | null;
  amount: string | number;
  taxAmount?: string | number | null;
  expenseDate: string; // YYYY-MM-DD
  payeeName: string;
  payeeContact?: string | null;
  paymentStatus?: 'PAID' | 'PENDING';
  paymentMode?: 'CASH' | 'PETTY_CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT';
  referenceNumber?: string | null;
  paidThroughAccountId?: string | null;
  expenseAccountId?: string | null;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  receiptFileType?: string | null;
  receiptFileSize?: number | null;
  notes?: string | null;
}

const decimal = (val: string | number) => new Prisma.Decimal(String(val || 0));

export class AccountsExpenseService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listExpenses(params: {
    entityId: string;
    search?: string;
    category?: string;
    paymentStatus?: string;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      entityId,
      search,
      category,
      paymentStatus,
      date,
      dateFrom,
      dateTo,
      page = 1,
      limit = 25,
    } = params;

    const where: Prisma.MiscellaneousExpenseWhereInput = {
      entityId,
    };

    if (category) {
      where.category = category as any;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus as any;
    }

    if (date) {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      where.expenseDate = parsed;
    } else if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) {
        where.expenseDate.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        where.expenseDate.lte = new Date(`${dateTo}T00:00:00.000Z`);
      }
    }

    if (search) {
      where.OR = [
        { expenseNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { payeeName: { contains: search, mode: 'insensitive' } },
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items, allExpensesForMetrics] = await Promise.all([
      this.db.miscellaneousExpense.count({ where }),
      this.db.miscellaneousExpense.findMany({
        where,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          paidThroughAccount: { select: { id: true, code: true, name: true, type: true } },
          expenseAccount: { select: { id: true, code: true, name: true, type: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.db.miscellaneousExpense.findMany({
        where: { entityId },
        select: {
          totalAmount: true,
          paymentStatus: true,
          category: true,
        },
      }),
    ]);

    const totalAmount = allExpensesForMetrics.reduce((sum, e) => sum + Number(e.totalAmount), 0);
    const paidAmount = allExpensesForMetrics
      .filter((e) => e.paymentStatus === 'PAID')
      .reduce((sum, e) => sum + Number(e.totalAmount), 0);
    const pendingAmount = allExpensesForMetrics
      .filter((e) => e.paymentStatus === 'PENDING')
      .reduce((sum, e) => sum + Number(e.totalAmount), 0);
    const categoriesSet = new Set(allExpensesForMetrics.map((e) => e.category));

    return {
      items,
      total,
      page,
      limit,
      summary: {
        totalAmount,
        paidAmount,
        pendingAmount,
        categoryCount: categoriesSet.size,
      },
    };
  }

  async getExpense(id: string) {
    const expense = await this.db.miscellaneousExpense.findUnique({
      where: { id },
      include: {
        entity: { select: { id: true, code: true, legalName: true, baseCurrency: true } },
        paidThroughAccount: { select: { id: true, code: true, name: true, type: true } },
        expenseAccount: { select: { id: true, code: true, name: true, type: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!expense) {
      throw new NotFoundError('Miscellaneous expense not found.');
    }

    return expense;
  }

  async createExpense(input: CreateExpenseInput, actorId: string, requestId: string) {
    if (!input.entityId) {
      throw new ValidationError('Accounting entity is required.');
    }
    if (!input.title || !input.title.trim()) {
      throw new ValidationError('Expense title / purpose is required.');
    }
    if (!input.payeeName || !input.payeeName.trim()) {
      throw new ValidationError('Payee / contractor name is required.');
    }
    if (!input.expenseDate) {
      throw new ValidationError('Expense date is required.');
    }

    const baseAmount = decimal(input.amount);
    if (baseAmount.lessThanOrEqualTo(0)) {
      throw new ValidationError('Expense amount must be greater than zero.');
    }

    const taxAmount = decimal(input.taxAmount || 0);
    if (taxAmount.lessThan(0)) {
      throw new ValidationError('Tax amount cannot be negative.');
    }

    const totalAmount = baseAmount.add(taxAmount);

    return this.db.$transaction(async (tx) => {
      // 1. Verify Entity
      const entity = await tx.accountingEntity.findUnique({ where: { id: input.entityId } });
      if (!entity) {
        throw new NotFoundError('Accounting entity not found.');
      }

      // 2. Determine Fiscal Year from date
      const expDate = new Date(`${input.expenseDate}T00:00:00.000Z`);
      if (Number.isNaN(expDate.getTime())) {
        throw new ValidationError('Invalid expense date.');
      }

      const year = expDate.getUTCMonth() >= 3 ? expDate.getUTCFullYear() : expDate.getUTCFullYear() - 1;
      const fiscalYear = `FY${year}-${String((year + 1) % 100).padStart(2, '0')}`;

      // 3. Atomically increment Expense sequence
      const sequence = await tx.accountingSequence.upsert({
        where: {
          entityId_fiscalYear_kind: {
            entityId: input.entityId,
            fiscalYear,
            kind: 'EXPENSE',
          },
        },
        create: {
          entityId: input.entityId,
          fiscalYear,
          kind: 'EXPENSE',
          nextNumber: 2,
        },
        update: {
          nextNumber: { increment: 1 },
        },
      });

      const seqNumber = sequence.nextNumber - 1;
      const expenseNumber = `EXP-${fiscalYear}-${String(seqNumber).padStart(5, '0')}`;

      // 4. Validate accounts if provided
      if (input.paidThroughAccountId) {
        const acc = await tx.ledgerAccount.findUnique({ where: { id: input.paidThroughAccountId } });
        if (!acc || acc.entityId !== input.entityId) {
          throw new ValidationError('Paid through account does not exist or belong to this entity.');
        }
      }

      if (input.expenseAccountId) {
        const acc = await tx.ledgerAccount.findUnique({ where: { id: input.expenseAccountId } });
        if (!acc || acc.entityId !== input.entityId) {
          throw new ValidationError('Expense ledger account does not exist or belong to this entity.');
        }
      }

      // 5. Create Expense Record
      const expense = await tx.miscellaneousExpense.create({
        data: {
          expenseNumber,
          entityId: input.entityId,
          category: input.category,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          amount: baseAmount,
          taxAmount,
          totalAmount,
          expenseDate: expDate,
          payeeName: input.payeeName.trim(),
          payeeContact: input.payeeContact?.trim() || null,
          paymentStatus: input.paymentStatus || 'PAID',
          paymentMode: input.paymentMode || 'CASH',
          referenceNumber: input.referenceNumber?.trim() || null,
          paidThroughAccountId: input.paidThroughAccountId || null,
          expenseAccountId: input.expenseAccountId || null,
          receiptUrl: input.receiptUrl || null,
          receiptFileName: input.receiptFileName || null,
          receiptFileType: input.receiptFileType || null,
          receiptFileSize: input.receiptFileSize || null,
          notes: input.notes?.trim() || null,
          createdById: actorId,
        },
        include: {
          paidThroughAccount: true,
          expenseAccount: true,
        },
      });

      // 6. If both accounts are provided and payment is PAID, link a journal voucher for financial posting
      if (
        expense.paymentStatus === 'PAID' &&
        input.paidThroughAccountId &&
        input.expenseAccountId
      ) {
        const openPeriod = await tx.accountingPeriod.findFirst({
          where: {
            entityId: input.entityId,
            status: 'OPEN',
            startsOn: { lte: expDate },
            endsOn: { gte: expDate },
          },
        });

        if (openPeriod) {
          const jvSeq = await tx.accountingSequence.upsert({
            where: {
              entityId_fiscalYear_kind: {
                entityId: input.entityId,
                fiscalYear,
                kind: 'JOURNAL',
              },
            },
            create: {
              entityId: input.entityId,
              fiscalYear,
              kind: 'JOURNAL',
              nextNumber: 2,
            },
            update: {
              nextNumber: { increment: 1 },
            },
          });
          const jvNumber = `JR-${fiscalYear}-${String(jvSeq.nextNumber - 1).padStart(6, '0')}`;

          const jv = await tx.journalVoucher.create({
            data: {
              entityId: input.entityId,
              periodId: openPeriod.id,
              voucherNumber: jvNumber,
              kind: 'JOURNAL',
              status: 'POSTED',
              accountingDate: expDate,
              description: `Miscellaneous Expense [${expenseNumber}] - ${expense.title} paid to ${expense.payeeName}`,
              sourceModule: 'EXPENSE',
              sourceId: expense.id,
              idempotencyKey: `exp-jv-${expense.id}`,
              payloadHash: expense.id,
              createdById: actorId,
              postedById: actorId,
              postedAt: new Date(),
              lines: {
                create: [
                  {
                    lineNumber: 1,
                    accountId: input.expenseAccountId,
                    debit: totalAmount,
                    credit: new Prisma.Decimal(0),
                    memo: `${expense.category}: ${expense.title}`,
                    partyType: 'PAYEE',
                    partyId: expense.payeeName,
                  },
                  {
                    lineNumber: 2,
                    accountId: input.paidThroughAccountId,
                    debit: new Prisma.Decimal(0),
                    credit: totalAmount,
                    memo: `Disbursement via ${expense.paymentMode} ref: ${expense.referenceNumber || 'N/A'}`,
                    partyType: 'PAYEE',
                    partyId: expense.payeeName,
                  },
                ],
              },
            },
          });

          await tx.miscellaneousExpense.update({
            where: { id: expense.id },
            data: { journalVoucherId: jv.id },
          });
        }
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.expense.create',
          resource: 'MiscellaneousExpense',
          resourceId: expense.id,
          after: expense as unknown as Prisma.InputJsonObject,
          requestId,
        },
      });

      return expense;
    });
  }

  async updateExpense(id: string, input: Partial<CreateExpenseInput>, actorId: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.miscellaneousExpense.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError('Expense not found.');
      }

      const dataToUpdate: Prisma.MiscellaneousExpenseUpdateInput = {};

      if (input.title !== undefined) dataToUpdate.title = input.title.trim();
      if (input.description !== undefined) dataToUpdate.description = input.description?.trim() || null;
      if (input.category !== undefined) dataToUpdate.category = input.category;
      if (input.payeeName !== undefined) dataToUpdate.payeeName = input.payeeName.trim();
      if (input.payeeContact !== undefined) dataToUpdate.payeeContact = input.payeeContact?.trim() || null;
      if (input.paymentStatus !== undefined) dataToUpdate.paymentStatus = input.paymentStatus;
      if (input.paymentMode !== undefined) dataToUpdate.paymentMode = input.paymentMode;
      if (input.referenceNumber !== undefined) dataToUpdate.referenceNumber = input.referenceNumber?.trim() || null;
      if (input.paidThroughAccountId !== undefined) dataToUpdate.paidThroughAccount = input.paidThroughAccountId ? { connect: { id: input.paidThroughAccountId } } : { disconnect: true };
      if (input.expenseAccountId !== undefined) dataToUpdate.expenseAccount = input.expenseAccountId ? { connect: { id: input.expenseAccountId } } : { disconnect: true };
      if (input.receiptUrl !== undefined) dataToUpdate.receiptUrl = input.receiptUrl || null;
      if (input.receiptFileName !== undefined) dataToUpdate.receiptFileName = input.receiptFileName || null;
      if (input.receiptFileType !== undefined) dataToUpdate.receiptFileType = input.receiptFileType || null;
      if (input.receiptFileSize !== undefined) dataToUpdate.receiptFileSize = input.receiptFileSize || null;
      if (input.notes !== undefined) dataToUpdate.notes = input.notes?.trim() || null;

      if (input.amount !== undefined || input.taxAmount !== undefined) {
        const baseAmount = input.amount !== undefined && input.amount !== null ? decimal(input.amount) : existing.amount;
        const taxAmount = input.taxAmount !== undefined && input.taxAmount !== null ? decimal(input.taxAmount) : (input.taxAmount === null ? new Prisma.Decimal(0) : existing.taxAmount);
        dataToUpdate.amount = baseAmount;
        dataToUpdate.taxAmount = taxAmount;
        dataToUpdate.totalAmount = baseAmount.add(taxAmount);
      }

      const updated = await tx.miscellaneousExpense.update({
        where: { id },
        data: dataToUpdate,
        include: {
          paidThroughAccount: true,
          expenseAccount: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.expense.update',
          resource: 'MiscellaneousExpense',
          resourceId: id,
          before: existing as unknown as Prisma.InputJsonObject,
          after: updated as unknown as Prisma.InputJsonObject,
          requestId,
        },
      });

      return updated;
    });
  }

  async deleteExpense(id: string, actorId: string, requestId: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.miscellaneousExpense.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError('Expense not found.');
      }

      await tx.miscellaneousExpense.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.expense.delete',
          resource: 'MiscellaneousExpense',
          resourceId: id,
          before: existing as unknown as Prisma.InputJsonObject,
          requestId,
        },
      });

      return { success: true };
    });
  }
}

export const accountsExpenseService = new AccountsExpenseService();
