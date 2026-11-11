import { createHash, randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/AppError';

type LineInput = { accountId: string; debit: string; credit: string; memo?: string };
type JournalInput = {
  entityId: string;
  periodId: string;
  accountingDate: string;
  description: string;
  kind: 'JOURNAL' | 'OPENING' | 'CONTRA';
  lines: LineInput[];
};

const decimal = (value: string) => new Prisma.Decimal(value);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('Date must be YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ValidationError('Invalid calendar date.');
  return date;
};
const assertMoney = (value: string) => {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(value)) throw new ValidationError('Amounts must be non-negative INR values with at most two decimal places.');
  return decimal(value);
};

export class AccountsCoreService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listEntities() {
    // Keep the company context fixed to the Plinth legal entity.
    return this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id", "code", "legalName", "baseCurrency", "gstin", "stateCode", "status", "createdById", "createdAt", "updatedAt"
      FROM "accounting_entities" WHERE "code" = 'PLINTH-IN' ORDER BY "code" ASC`;
  }

  async initializePlinthBook(actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const [existing] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "id", "code", "legalName", "baseCurrency", "gstin", "stateCode", "status", "createdById", "createdAt", "updatedAt"
        FROM "accounting_entities" WHERE "code" = 'PLINTH-IN' LIMIT 1`;
      if (existing) return existing;
      const [count] = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS "count" FROM "accounting_entities"`;
      if (Number(count.count) > 0) {
        throw new ConflictError('An accounting book already exists. This installation supports Plinth only.');
      }
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "accounting_entities" ("id", "code", "legalName", "status", "createdById", "updatedAt")
        VALUES (${id}, 'PLINTH-IN', 'Plinth', 'CONFIGURING', ${actorId}, CURRENT_TIMESTAMP)`;
      const [entity] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "id", "code", "legalName", "baseCurrency", "gstin", "stateCode", "status", "createdById", "createdAt", "updatedAt"
        FROM "accounting_entities" WHERE "id" = ${id} LIMIT 1`;
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'accounts.plinth_book.initialize',
          resource: 'AccountingEntity',
          resourceId: String(entity.id),
          after: entity as Prisma.InputJsonObject,
          requestId,
        },
      });
      return entity;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async activateEntity(entityId: string, verificationReference: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const entity = await tx.accountingEntity.findUnique({ where: { id: entityId } });
      if (!entity) throw new NotFoundError('Accounting entity not found.');
      if (entity.status !== 'CONFIGURING') throw new ConflictError('Only a configuring entity can be activated.');
      if (entity.createdById === actorId) throw new ForbiddenError('The entity creator cannot activate their own financial book.');
      if (await tx.accountingEntity.count({ where: { status: 'ACTIVE' } })) throw new ConflictError('First rollout permits one active legal company. Additional registrations require an approved rollout.');
      const [accounts, periods] = await Promise.all([
        tx.ledgerAccount.count({ where: { entityId, status: 'ACTIVE' } }),
        tx.accountingPeriod.count({ where: { entityId, status: 'OPEN' } }),
      ]);
      if (accounts < 2 || periods < 1) throw new ValidationError('Configure at least two active accounts and one open period before activation.');
      const updated = await tx.accountingEntity.update({ where: { id: entityId }, data: { status: 'ACTIVE' } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.entity.activate', resource: 'AccountingEntity', resourceId: entityId, before: entity, after: { ...updated, verificationReference }, requestId } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listPeriods(entityId: string) {
    return this.db.accountingPeriod.findMany({ where: { entityId }, orderBy: { startsOn: 'asc' } });
  }

  async createPeriod(input: { entityId: string; code: string; fiscalYear: string; startsOn: string; endsOn: string }, actorId: string, requestId: string) {
    const start = dateOnly(input.startsOn);
    const end = dateOnly(input.endsOn);
    if (start > end) throw new ValidationError('Period start must be on or before end.');
    const year = Number(input.fiscalYear.slice(2, 6));
    if (input.fiscalYear !== `FY${year}-${String((year + 1) % 100).padStart(2, '0')}` || start < dateOnly(`${year}-04-01`) || end > dateOnly(`${year + 1}-03-31`)) throw new ValidationError('Period must fall inside its Indian financial year (1 April to 31 March).');
    return this.db.$transaction(async tx => {
      const entity = await tx.accountingEntity.findUnique({ where: { id: input.entityId } });
      if (!entity) throw new NotFoundError('Accounting entity not found.');
      const overlap = await tx.accountingPeriod.findFirst({ where: { entityId: input.entityId, startsOn: { lte: end }, endsOn: { gte: start } } });
      if (overlap) throw new ConflictError(`Period overlaps ${overlap.code}.`);
      const period = await tx.accountingPeriod.create({ data: { entityId: input.entityId, code: input.code, fiscalYear: input.fiscalYear, startsOn: start, endsOn: end } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.period.create', resource: 'AccountingPeriod', resourceId: period.id, after: period, requestId } });
      return period;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async closePeriod(id: string, expectedStatus: string, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const period = await tx.accountingPeriod.findUnique({ where: { id } });
      if (!period) throw new NotFoundError('Accounting period not found.');
      if (expectedStatus !== 'OPEN' || period.status !== 'OPEN') throw new ConflictError('Period is no longer open.');
      const [pendingJournals, pendingBills, pendingInvoices, pendingReceipts, pendingCreditNotes, pendingSalesEvents, pendingSettlements] = await Promise.all([
        tx.journalVoucher.count({ where: { periodId: id, status: { not: 'POSTED' } } }),
        tx.purchaseBill.count({ where: { entityId: period.entityId, invoiceDate: { gte: period.startsOn, lte: period.endsOn }, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } } }),
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_invoices" WHERE "entityId"=${period.entityId} AND "invoiceDate">=${period.startsOn} AND "invoiceDate"<=${period.endsOn} AND "status" IN ('DRAFT','SUBMITTED','APPROVED')`,
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_receipts" WHERE "entityId"=${period.entityId} AND "receiptDate">=${period.startsOn} AND "receiptDate"<=${period.endsOn} AND "status" IN ('RECORDED','VERIFIED')`,
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_credit_notes" WHERE "entityId"=${period.entityId} AND "creditDate">=${period.startsOn} AND "creditDate"<=${period.endsOn} AND "status" IN ('DRAFT','SUBMITTED','APPROVED')`,
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_events" WHERE "status" IN ('PENDING','FAILED')`,
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "sales_ar_marketplace_batches" WHERE "entityId"=${period.entityId} AND "settlementDate">=${period.startsOn} AND "settlementDate"<=${period.endsOn} AND "status" IN ('DRAFT','EXCEPTION')`,
      ]);
      const [invoices, receipts, creditNotes, salesEvents, settlements] = [pendingInvoices, pendingReceipts, pendingCreditNotes, pendingSalesEvents, pendingSettlements].map(rows => Number(rows[0]?.n ?? 0));
      if (pendingJournals || pendingBills || invoices || receipts || creditNotes || salesEvents || settlements) throw new ConflictError(`Period has ${pendingJournals} unposted journal vouchers, ${pendingBills} unresolved supplier bills, ${invoices} unresolved sales invoices, ${receipts} unposted customer receipts, ${creditNotes} unresolved credit notes, ${salesEvents} unprocessed Sales events and ${settlements} unresolved marketplace settlements.`);
      const changed = await tx.accountingPeriod.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CLOSED' } });
      if (changed.count !== 1) throw new ConflictError('Period changed during close.');
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.period.close', resource: 'AccountingPeriod', resourceId: id, before: { status: 'OPEN' }, after: { status: 'CLOSED' }, requestId } });
      return tx.accountingPeriod.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listAccounts(entityId: string) {
    return this.db.ledgerAccount.findMany({ where: { entityId }, orderBy: { code: 'asc' } });
  }

  async createAccount(input: { entityId: string; code: string; name: string; type: string; isControl: boolean; tallyLedger?: string }, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const entity = await tx.accountingEntity.findUnique({ where: { id: input.entityId } });
      if (!entity) throw new NotFoundError('Accounting entity not found.');
      if (entity.status !== 'CONFIGURING') throw new ConflictError('Account changes after activation require an approved chart-change workflow.');
      const account = await tx.ledgerAccount.create({ data: { ...input, code: input.code.toUpperCase() } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.account.create', resource: 'LedgerAccount', resourceId: account.id, after: account, requestId } });
      return account;
    });
  }

  async listJournals(entityId: string, page: number, limit: number) {
    const where = { entityId };
    const [items, total] = await Promise.all([
      this.db.journalVoucher.findMany({ where, include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { lineNumber: 'asc' } } }, orderBy: [{ accountingDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.db.journalVoucher.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getJournal(id: string) {
    const voucher = await this.db.journalVoucher.findUnique({ where: { id }, include: { lines: { include: { account: true }, orderBy: { lineNumber: 'asc' } } } });
    if (!voucher) throw new NotFoundError('Journal voucher not found.');
    return voucher;
  }

  async createJournal(input: JournalInput, idempotencyKey: string, actorId: string, requestId: string, reversalOfId?: string) {
    const payloadHash = hash({ input, reversalOfId });
    const existing = await this.db.journalVoucher.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.createdById !== actorId) throw new ConflictError('Idempotency key has already been used for another command.');
      return this.getJournal(existing.id);
    }
    const accountingDate = dateOnly(input.accountingDate);
    if (input.lines.length < 2) throw new ValidationError('At least two journal lines are required.');
    for (const line of input.lines) {
      const debit = assertMoney(line.debit);
      const credit = assertMoney(line.credit);
      if ((debit.gt(0) && credit.gt(0)) || (debit.isZero() && credit.isZero())) throw new ValidationError('Each journal line must have exactly one positive debit or credit.');
    }
    try {
      const voucher = await this.db.$transaction(async tx => {
        const entity = await tx.accountingEntity.findUnique({ where: { id: input.entityId } });
        if (!entity || entity.status !== 'ACTIVE') throw new ValidationError('Accounting entity is not active.');
        const period = await tx.accountingPeriod.findUnique({ where: { id: input.periodId } });
        if (!period || period.entityId !== input.entityId || period.status !== 'OPEN' || accountingDate < period.startsOn || accountingDate > period.endsOn) throw new ValidationError('Accounting date must be inside an open period for this entity.');
        const ids = [...new Set(input.lines.map(line => line.accountId))];
        const accounts = await tx.ledgerAccount.findMany({ where: { id: { in: ids }, entityId: input.entityId, status: 'ACTIVE' } });
        if (accounts.length !== ids.length || accounts.some(account => account.isControl)) throw new ValidationError('Journal accounts must be active, belong to the entity, and must not be control accounts.');
        const created = await tx.journalVoucher.create({ data: {
          entityId: input.entityId, periodId: input.periodId, accountingDate, description: input.description,
          kind: reversalOfId ? 'REVERSAL' : input.kind, reversalOfId,
          idempotencyKey, payloadHash, createdById: actorId,
          lines: { create: input.lines.map((line, index) => ({ lineNumber: index + 1, accountId: line.accountId, debit: decimal(line.debit), credit: decimal(line.credit), memo: line.memo })) },
        }, include: { lines: true } });
        await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.journal.create', resource: 'JournalVoucher', resourceId: created.id, after: { id: created.id, kind: created.kind }, requestId } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return voucher;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.db.journalVoucher.findUnique({ where: { idempotencyKey } });
        if (replay && replay.payloadHash === payloadHash && replay.createdById === actorId) return this.getJournal(replay.id);
        throw new ConflictError('Duplicate voucher, source or idempotency key.');
      }
      throw error;
    }
  }

  private async transition(id: string, from: string, to: string, expectedVersion: number, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const voucher = await tx.journalVoucher.findUnique({ where: { id }, include: { lines: true, period: true } });
      if (!voucher) throw new NotFoundError('Journal voucher not found.');
      if (voucher.status !== from || voucher.version !== expectedVersion) throw new ConflictError('Voucher state or version has changed. Refresh and retry.');
      if (to === 'APPROVED' && actorId === voucher.createdById) throw new ForbiddenError('The creator cannot approve their own voucher.');
      if (to === 'SUBMITTED') {
        const debits = voucher.lines.reduce((sum, line) => sum.plus(line.debit), decimal('0'));
        const credits = voucher.lines.reduce((sum, line) => sum.plus(line.credit), decimal('0'));
        if (voucher.lines.length < 2 || debits.isZero() || !debits.equals(credits)) throw new ValidationError('Voucher must have at least two balanced lines before submission.');
      }
      if (voucher.period.status !== 'OPEN') throw new ConflictError('Accounting period is closed.');
      const changed = await tx.journalVoucher.updateMany({ where: { id, status: from, version: expectedVersion }, data: {
        status: to, version: { increment: 1 },
        ...(to === 'SUBMITTED' ? { submittedAt: new Date() } : {}),
        ...(to === 'APPROVED' ? { approvedAt: new Date(), approvedById: actorId } : {}),
      } });
      if (changed.count !== 1) throw new ConflictError('Voucher was changed by another user.');
      await tx.auditLog.create({ data: { userId: actorId, action: `accounts.journal.${to.toLowerCase()}`, resource: 'JournalVoucher', resourceId: id, before: { status: from, version: expectedVersion }, after: { status: to, version: expectedVersion + 1 }, requestId } });
      return tx.journalVoucher.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  submitJournal(id: string, version: number, actorId: string, requestId: string) { return this.transition(id, 'DRAFT', 'SUBMITTED', version, actorId, requestId); }
  approveJournal(id: string, version: number, actorId: string, requestId: string) { return this.transition(id, 'SUBMITTED', 'APPROVED', version, actorId, requestId); }

  async postJournal(id: string, version: number, actorId: string, requestId: string) {
    return this.db.$transaction(async tx => {
      const voucher = await tx.journalVoucher.findUnique({ where: { id }, include: { lines: { include: { account: true } }, period: true, entity: true } });
      if (!voucher) throw new NotFoundError('Journal voucher not found.');
      if (voucher.status !== 'APPROVED' || voucher.version !== version) throw new ConflictError('Voucher is not approved at the requested version.');
      if (voucher.createdById === actorId) throw new ForbiddenError('The creator cannot post their own voucher.');
      if (voucher.period.status !== 'OPEN' || voucher.entity.status !== 'ACTIVE') throw new ConflictError('Entity or period is no longer open for posting.');
      if (voucher.lines.some(line => line.account.status !== 'ACTIVE' || line.account.entityId !== voucher.entityId || line.account.isControl)) throw new ValidationError('Voucher contains an inactive, foreign or control account.');
      const debits = voucher.lines.reduce((sum, line) => sum.plus(line.debit), decimal('0'));
      const credits = voucher.lines.reduce((sum, line) => sum.plus(line.credit), decimal('0'));
      if (voucher.lines.length < 2 || debits.isZero() || !debits.equals(credits)) throw new ValidationError('Journal voucher is not balanced.');
      const fiscalYear = voucher.period.fiscalYear;
      const sequence = await tx.accountingSequence.upsert({ where: { entityId_fiscalYear_kind: { entityId: voucher.entityId, fiscalYear, kind: voucher.kind } }, create: { entityId: voucher.entityId, fiscalYear, kind: voucher.kind, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
      const number = sequence.nextNumber - 1;
      const voucherNumber = `${voucher.kind.slice(0, 2)}-${fiscalYear}-${String(number).padStart(6, '0')}`;
      const changed = await tx.journalVoucher.updateMany({ where: { id, status: 'APPROVED', version }, data: { status: 'POSTED', voucherNumber, postedById: actorId, postedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictError('Voucher was posted by another user.');
      await tx.accountingOutbox.create({ data: { voucherId: id, eventType: 'JOURNAL_POSTED', payload: { voucherId: id, voucherNumber, entityId: voucher.entityId, accountingDate: voucher.accountingDate.toISOString().slice(0, 10) } } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'accounts.journal.post', resource: 'JournalVoucher', resourceId: id, before: { status: 'APPROVED' }, after: { status: 'POSTED', voucherNumber, debits: debits.toFixed(2), credits: credits.toFixed(2) }, requestId } });
      return tx.journalVoucher.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async draftReversal(id: string, input: { periodId: string; accountingDate: string; reason: string }, key: string, actorId: string, requestId: string) {
    const original = await this.getJournal(id);
    if (original.status !== 'POSTED') throw new ConflictError('Only posted vouchers can be reversed.');
    if (await this.db.journalVoucher.findUnique({ where: { reversalOfId: id } })) throw new ConflictError('A reversal already exists for this voucher.');
    return this.createJournal({ entityId: original.entityId, periodId: input.periodId, accountingDate: input.accountingDate, kind: 'JOURNAL', description: `Reversal of ${original.voucherNumber}: ${input.reason}`, lines: original.lines.map(line => ({ accountId: line.accountId, debit: line.credit.toFixed(2), credit: line.debit.toFixed(2), memo: line.memo ?? undefined })) }, key, actorId, requestId, id);
  }

  async trialBalance(entityId: string, through: string) {
    const date = dateOnly(through);
    const [accounts, movements] = await Promise.all([
      this.db.ledgerAccount.findMany({ where: { entityId }, orderBy: { code: 'asc' } }),
      this.db.journalLine.groupBy({ by: ['accountId'], where: { voucher: { entityId, status: 'POSTED', accountingDate: { lte: date } } }, _sum: { debit: true, credit: true } }),
    ]);
    const sums = new Map(movements.map(m => [m.accountId, m._sum]));
    return accounts.map(account => {
      const debit = sums.get(account.id)?.debit ?? decimal('0');
      const credit = sums.get(account.id)?.credit ?? decimal('0');
      const net = debit.minus(credit);
      return { accountId: account.id, code: account.code, name: account.name, type: account.type, debit: net.gt(0) ? net.toFixed(2) : '0.00', credit: net.lt(0) ? net.abs().toFixed(2) : '0.00' };
    });
  }
}
