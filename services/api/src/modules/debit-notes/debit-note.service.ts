/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { notificationService } from '../notifications/notification.service';
import { vendorScoringService } from '../master-data/services/vendor-scoring.service';
import { calculateDebitNotePenalty } from '../master-data/services/vendor-scoring-math';

const cents = (value: number) => Math.round(value * 100) / 100;

export class DebitNoteService {
  private async recordDebitNoteScoringEvent(note: any, actorId: string, statusOverride?: string) {
    try {
      if (!note.vendorId) return;
      const engine = vendorScoringService.getEngine();
      const policy = await engine.getActivePolicy();
      const eligibleAmount =
        policy.taxBasis === 'EXCLUSIVE'
          ? Number(note.taxableAmount || note.totalAmount || 0)
          : Number(note.totalAmount || 0);

      let affectedValue = 0;
      if (note.poId) {
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: note.poId },
          select: { totalAmount: true, subtotal: true },
        });
        if (po) {
          affectedValue =
            policy.taxBasis === 'EXCLUSIVE'
              ? Number(po.subtotal || po.totalAmount || 0)
              : Number(po.totalAmount || 0);
        }
      }
      if (affectedValue <= 0 && note.evidence && typeof note.evidence === 'object' && note.evidence !== null) {
        const ev = note.evidence as Record<string, unknown>;
        if (typeof ev.affectedInvoiceValue === 'number') {
          affectedValue = ev.affectedInvoiceValue;
        }
      }

      const currentStatus = (statusOverride || note.status || 'RECORDED').toUpperCase();
      const penaltyCalc = calculateDebitNotePenalty(
        {
          debitNoteId: note.id,
          vendorId: note.vendorId,
          poId: note.poId,
          grnId: note.grnId,
          invoiceNumber: note.invoiceNumber,
          eligibleDebitNoteAmount: eligibleAmount,
          affectedInvoiceValue: affectedValue,
          currency: note.currency || 'INR',
          status: currentStatus,
          reason: note.reason,
          incidentId: note.incidentId || note.grnId || note.id,
        },
        policy
      );

      if (penaltyCalc.eligible) {
        await engine.recordEvent({
          idempotencyKey: `DN-${currentStatus}-${note.id}`,
          vendorId: note.vendorId,
          eventType: 'DEBIT_NOTE_PENALTY',
          component: 'DISCREPANCY',
          sourceEntityType: 'DebitNote',
          sourceEntityId: note.id,
          incidentId: note.incidentId || note.grnId || note.id,
          debitNoteId: note.id,
          poId: note.poId,
          grnId: note.grnId,
          eligibleAmount,
          affectedInvoiceValue: affectedValue,
          currency: note.currency || 'INR',
          penaltyPoints: penaltyCalc.penaltyPoints,
          scoreContribution: -penaltyCalc.overallScoreImpact,
          debitNoteRatio: penaltyCalc.debitNoteRatio,
          severityLabel: penaltyCalc.severityLabel,
          effectiveDate: new Date(),
          createdBy: actorId,
        });
      }
      await engine.evaluateVendor(note.vendorId);
    } catch (scoringErr) {
      console.warn('[DebitNoteService] Scoring event recording notice:', scoringErr);
    }
  }

  constructor(private readonly permissions: PermissionChecker, private readonly audit: AuditWriter) {}
  async list(status?: string, grnId?: string) {
    const safeStatus = status && /^[A-Z_]+$/.test(status) ? status : undefined;
    const rows = safeStatus && grnId
      ? await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "status" = ${safeStatus}::"DebitNoteWorkflowStatus" AND "grnId" = ${grnId} ORDER BY "createdAt" DESC LIMIT 200`
      : safeStatus
        ? await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "status" = ${safeStatus}::"DebitNoteWorkflowStatus" ORDER BY "createdAt" DESC LIMIT 200`
        : grnId
          ? await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "grnId" = ${grnId} ORDER BY "createdAt" DESC LIMIT 200`
          : await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" ORDER BY "createdAt" DESC LIMIT 200`;

    if (!rows.length) return [];

    const vendorIds = Array.from(new Set(rows.map(r => r.vendorId).filter(Boolean)));
    const grnIds = Array.from(new Set(rows.map(r => r.grnId).filter(Boolean)));
    const poIds = Array.from(new Set(rows.map(r => r.poId).filter(Boolean)));

    const [vendors, grns, pos] = await Promise.all([
      vendorIds.length ? prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        select: { id: true, name: true, code: true, legalName: true }
      }) : [],
      grnIds.length ? prisma.goodsReceiptNote.findMany({
        where: { id: { in: grnIds } },
        select: { id: true, grnNumber: true, status: true }
      }) : [],
      poIds.length ? prisma.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        select: { id: true, poNumber: true, status: true }
      }) : [],
    ]);

    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const grnMap = new Map(grns.map(g => [g.id, g]));
    const poMap = new Map(pos.map(p => [p.id, p]));

    return rows.map(row => ({
      ...row,
      vendor: row.vendorId ? vendorMap.get(row.vendorId) || null : null,
      grn: row.grnId ? grnMap.get(row.grnId) || null : null,
      po: row.poId ? poMap.get(row.poId) || null : null,
    }));
  }

  async getById(id: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];
    const lines = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_note_lines" WHERE "debitNoteId" = ${id} ORDER BY "description"`;

    const [vendor, po, grn, creator, approver] = await Promise.all([
      note.vendorId ? prisma.vendor.findUnique({
        where: { id: note.vendorId },
        select: { id: true, name: true, code: true, taxNumber: true, contactEmail: true, contactPhone: true, address: true, legalName: true }
      }) : null,
      note.poId ? prisma.purchaseOrder.findUnique({
        where: { id: note.poId },
        select: { id: true, poNumber: true, totalAmount: true, status: true, paymentTerms: true, deliveryLocation: true, currency: true, createdAt: true }
      }) : null,
      note.grnId ? prisma.goodsReceiptNote.findUnique({
        where: { id: note.grnId },
        select: { id: true, grnNumber: true, status: true, receivedAt: true }
      }) : null,
      note.createdBy ? prisma.user.findUnique({
        where: { id: note.createdBy },
        select: { id: true, name: true, email: true, role: true }
      }) : null,
      note.approvedBy ? prisma.user.findUnique({
        where: { id: note.approvedBy },
        select: { id: true, name: true, email: true, role: true }
      }) : null,
    ]);

    const enrichedLines = await Promise.all(lines.map(async (line) => {
      let itemCode = '—';
      let uomSymbol = 'EA';
      if (line.productId) {
        const product = await prisma.product.findUnique({ where: { id: line.productId }, select: { sku: true, uom: { select: { symbol: true } } } });
        if (product?.sku) itemCode = product.sku;
        if (product?.uom?.symbol) uomSymbol = product.uom.symbol;
      } else if (line.materialId) {
        const material = await prisma.material.findUnique({ where: { id: line.materialId }, select: { code: true, uom: { select: { symbol: true } } } });
        if (material?.code) itemCode = material.code;
        if (material?.uom?.symbol) uomSymbol = material.uom.symbol;
      }
      return { ...line, itemCode, uomSymbol };
    }));

    const evidence = note.evidence ?? {};
    return { ...note, evidence, lines: enrichedLines, vendor, po, grn, creator, approver };
  }

  async updateGrnClaim(id: string, actorId: string, input: {
    reason?: string;
    lines: Array<{ id: string; unitPrice: number; taxRate?: number; reason?: string }>;
  }, requestId?: string) {
    if (!(await this.permissions.can(actorId, 'update', 'DebitNote'))) {
      throw new ForbiddenError('Lacks permission to update debit notes.');
    }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new ValidationError('At least one debit note line is required.');
    }

    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    const note = notes[0];
    if (!note) throw new NotFoundError('Debit note not found.');
    if (!note.grnId || !['DRAFT', 'RECORDED'].includes(note.status)) {
      throw new ValidationError('Only an unsubmitted GRN debit note can be edited.');
    }

    const existingLines = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_note_lines" WHERE "debitNoteId" = ${id} ORDER BY "description"`;
    const byId = new Map(existingLines.map((line) => [line.id, line]));
    if (input.lines.length !== existingLines.length || input.lines.some((line) => !byId.has(line.id))) {
      throw new ValidationError('The submitted lines must match the debit note lines.');
    }

    const updatedLines = input.lines.map((inputLine) => {
      const line = byId.get(inputLine.id);
      if (!line) throw new ValidationError('Debit note line not found.');
      const unitPrice = Number(inputLine.unitPrice);
      const taxRate = Number(inputLine.taxRate ?? line.taxRate ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new ValidationError('Unit price must be non-negative and tax rate must be between 0 and 100.');
      }
      const quantity = Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
      const taxableAmount = cents(quantity * unitPrice);
      const taxAmount = cents(taxableAmount * taxRate / 100);
      return { id: line.id, unitPrice, taxRate, taxableAmount, taxAmount, totalAmount: cents(taxableAmount + taxAmount), reason: inputLine.reason?.trim() || line.reason || null };
    });
    const taxableTotal = cents(updatedLines.reduce((sum, line) => sum + line.taxableAmount, 0));
    const taxTotal = cents(updatedLines.reduce((sum, line) => sum + line.taxAmount, 0));
    const total = cents(taxableTotal + taxTotal);
    const reason = input.reason?.trim() || note.reason;

    await prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw<any[]>`SELECT "status"::text AS "status" FROM "debit_notes" WHERE "id" = ${id} FOR UPDATE`;
      if (!current[0] || !['DRAFT', 'RECORDED'].includes(current[0].status)) {
        throw new ValidationError('This debit note has already moved forward and can no longer be edited.');
      }
      for (const line of updatedLines) {
        await tx.$executeRaw`UPDATE "debit_note_lines" SET "unitPrice" = ${line.unitPrice}, "taxRate" = ${line.taxRate}, "taxableAmount" = ${line.taxableAmount}, "taxAmount" = ${line.taxAmount}, "totalAmount" = ${line.totalAmount}, "reason" = ${line.reason} WHERE "id" = ${line.id} AND "debitNoteId" = ${id}`;
      }
      await tx.$executeRaw`UPDATE "debit_notes" SET "reason" = ${reason}, "taxableAmount" = ${taxableTotal}, "taxAmount" = ${taxTotal}, "totalAmount" = ${total}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}`;
    }, { isolationLevel: 'Serializable' });

    await this.audit.record({
      actorId,
      action: 'debit_note.update_grn_claim',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { debitNoteNumber: note.debitNoteNumber, taxableAmount: taxableTotal, taxAmount: taxTotal, totalAmount: total, lines: updatedLines },
      requestId,
    });
    return this.getById(id);
  }

  async createFromGrn(grnId: string, actorId: string, reason: string, requestId?: string, options?: { discrepancyIds?: string[]; reasonCategory?: string; responsiblePersonId?: string }) {
    if (!(await this.permissions.can(actorId, 'create', 'DebitNote'))) throw new ForbiddenError('Lacks permission to create debit notes.');
    if (!reason?.trim()) throw new ValidationError('A discrepancy reason is required.');
    const grn = await prisma.goodsReceiptNote.findUnique({ where: { id: grnId }, include: { vendor: true, po: { include: { lines: true } }, lines: { include: { poLine: true, product: true, material: true, discrepancies: true } } } });
    if (!grn?.vendorId) throw new NotFoundError('GRN or vendor not found.');
    if (!['VERIFIED', 'DISCREPANCY_PENDING', 'CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'].includes(grn.status)) {
      throw new ValidationError('A debit note can only be raised after physical verification has been completed and the GRN is verified.');
    }
    if (grn.lines.some(line => !['VERIFIED', 'DISCREPANT'].includes(line.status))) {
      throw new ValidationError('Complete physical verification for every GRN line before raising a debit note.');
    }
    let lines = grn.lines.filter(line => line.shortQuantity > 0 || line.rejectedQuantity > 0 || line.damagedQuantity > 0);
    if (options?.discrepancyIds?.length) {
      const selected = new Set(options.discrepancyIds);
      const selectedLines = grn.lines.filter(line => line.discrepancies.some(discrepancy => selected.has(discrepancy.id)));
      if (!selectedLines.length) throw new ValidationError('Selected discrepancies do not belong to this receipt.');
      lines = selectedLines.filter(line => line.shortQuantity > 0 || line.rejectedQuantity > 0 || line.damagedQuantity > 0);
    }
    if (!lines.length) throw new ValidationError('This receipt has no recorded discrepancy.');
    const claimRate = (line: typeof lines[number]) => {
      const verifiedInvoiceRate = Number(line.invoiceUnitPrice || 0);
      return verifiedInvoiceRate > 0
        ? { unitPrice: verifiedInvoiceRate, source: 'GRN_PHYSICAL_VERIFICATION' as const }
        : { unitPrice: Number(line.poLine?.unitPrice || 0), source: 'PURCHASE_ORDER' as const };
    };
    const unpricedClaimLine = lines.find((line) =>
      (Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0)) > 0 &&
      (!Number.isFinite(claimRate(line).unitPrice) || claimRate(line).unitPrice <= 0)
    );
    if (unpricedClaimLine) {
      throw new ValidationError(`A valid PO unit price is required before creating a debit note for ${unpricedClaimLine.product?.name || unpricedClaimLine.material?.name || 'a receipt line'}.`);
    }
    const id = randomUUID(); const number = await this.nextNumber();
    let priceTotal = 0;
    let taxTotal = 0;
    const lineEvidence: Array<Record<string, unknown>> = [];
    await prisma.$transaction(async (tx) => {
      const existingClaims = await tx.$queryRaw<any[]>`SELECT "id", "debitNoteNumber" FROM "debit_notes" WHERE "grnId" = ${grnId} LIMIT 1`;
      if (existingClaims.length) throw new ValidationError(`A debit note claim (${existingClaims[0].debitNoteNumber}) already exists for this GRN.`);
      await tx.$executeRaw`INSERT INTO "debit_notes" ("id", "debitNoteNumber", "vendorId", "poId", "grnId", "currency", "status", "reason", "taxableAmount", "taxAmount", "totalAmount", "evidence", "createdBy", "updatedAt") VALUES (${id}, ${number}, ${grn.vendorId}, ${grn.poId}, ${grnId}, ${grn.po?.currency || 'INR'}, 'RECORDED'::"DebitNoteWorkflowStatus", ${reason.trim()}, 0, 0, 0, ${JSON.stringify({ source: 'GRN', grnNumber: grn.grnNumber, discrepancyIds: options?.discrepancyIds || [], reasonCategory: options?.reasonCategory || null, responsiblePersonId: options?.responsiblePersonId || actorId })}::jsonb, ${actorId}, CURRENT_TIMESTAMP)`;
      for (const line of lines) {
        const claimedQuantity = Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
        const quantityForDebit = claimedQuantity > 0 ? claimedQuantity : Number(line.expectedQuantity || 0);
        const { unitPrice, source: rateSource } = claimRate(line);
        const lineAmount = cents(quantityForDebit * unitPrice);
        const taxRate = Number(line.poLine?.taxRate || 0);
        const lineTax = cents(lineAmount * taxRate / 100);
        priceTotal += lineAmount;
        taxTotal += lineTax;
        const physicalReasons = line.discrepancies.filter((d) => d.status !== 'RESOLVED').map((d) => `${d.type} ${d.quantity}`).join(', ');
        const lineReason = physicalReasons || reason.trim();
        await tx.$executeRaw`INSERT INTO "debit_note_lines" ("id", "debitNoteId", "grnLineId", "productId", "materialId", "description", "expectedQuantity", "receivedQuantity", "acceptedQuantity", "rejectedQuantity", "damagedQuantity", "shortQuantity", "unitPrice", "taxRate", "taxableAmount", "taxAmount", "totalAmount", "reason") VALUES (${randomUUID()}, ${id}, ${line.id}, ${line.productId}, ${line.materialId}, ${line.product?.name || line.material?.name || 'Receipt discrepancy'}, ${line.expectedQuantity || 0}, ${line.receivedQuantity}, ${line.acceptedQuantity}, ${line.rejectedQuantity}, ${line.damagedQuantity}, ${line.shortQuantity}, ${unitPrice}, ${taxRate}, ${lineAmount}, ${lineTax}, ${cents(lineAmount + lineTax)}, ${lineReason})`;
        (lineEvidence as Array<Record<string, unknown>>).push({ grnLineId: line.id, poLineId: line.poLineId, claimQuantity: quantityForDebit, unitPrice, rateSource, taxRate, taxableAmount: lineAmount, taxAmount: lineTax, totalAmount: cents(lineAmount + lineTax), reason: lineReason });
      }
      const evidence = { source: 'GRN', grnNumber: grn.grnNumber, discrepancyIds: options?.discrepancyIds || [], reasonCategory: options?.reasonCategory || null, responsiblePersonId: options?.responsiblePersonId || actorId, lines: lineEvidence };
      await tx.$executeRaw`UPDATE "debit_notes" SET "taxableAmount" = ${cents(priceTotal)}, "taxAmount" = ${cents(taxTotal)}, "totalAmount" = ${cents(priceTotal + taxTotal)}, "evidence" = ${JSON.stringify(evidence)}::jsonb WHERE "id" = ${id}`;
      await tx.$executeRaw`UPDATE "goods_receipt_notes" SET "status" = 'CLAIM_RAISED'::"GrnStatus", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${grnId} AND "status" IN ('DISCREPANCY_PENDING', 'VERIFIED', 'CLAIM_RAISED')`;
      await tx.$executeRaw`UPDATE "goods_receipt_discrepancies" SET "status" = 'UNDER_REVIEW'::"DiscrepancyStatus", "debitNoteStatus" = 'PROPOSED'::"DebitNoteStatus", "debitNoteNotes" = ${`Debit note ${number} created; Accounts review is pending.`}, "updatedAt" = CURRENT_TIMESTAMP WHERE "grnLineId" IN (${Prisma.join(lines.map(line => line.id))}) AND "status" <> 'RESOLVED'`;
    }, { isolationLevel: 'Serializable' });
    await this.audit.record({ actorId, action: 'debit_note.create', entityType: 'DebitNote', entityId: id, metadata: { grnId, debitNoteNumber: number, taxableAmount: cents(priceTotal), taxAmount: cents(taxTotal), totalAmount: cents(priceTotal + taxTotal), lines: lineEvidence }, requestId });
    await notificationService.notifyRoles({ roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'], title: `Debit note ${number} needs review`, message: `A debit note for physical shortages, rejected, or damaged quantities on GRN ${grn.grnNumber} is ready for Accounts review.`, resource: 'DebitNote', resourceId: id, href: `/accounts/debit-notes`, excludeUserIds: [actorId] }).catch(() => []);
    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    if (result[0]) {
      await this.recordDebitNoteScoringEvent(result[0], actorId, 'RECORDED');
    }
    return result[0];
  }

  async createFromBill(billId: string, actorId: string, input: any, requestId?: string) {
    if (!(await this.permissions.can(actorId, 'create', 'DebitNote'))) {
      throw new ForbiddenError('Lacks permission to create debit notes.');
    }
    const bill = await prisma.purchaseBill.findUnique({
      where: { id: billId },
      include: { lines: true, vendor: true }
    });
    if (!bill) throw new NotFoundError('Supplier bill not found.');

    const reason = (input.reason || input.reasonDescription || 'Supplier return / bill adjustment').trim();
    const id = randomUUID();
    const number = await this.nextNumber();
    const lines = Array.isArray(input.lines) ? input.lines : [];

    const taxable = cents(Number(input.taxableAmount ?? lines.reduce((s: number, l: any) => s + Number(l.taxableAmount || 0), 0)));
    const tax = cents(Number(input.taxAmount ?? lines.reduce((s: number, l: any) => s + Number(l.taxAmount || 0), 0)));
    const total = cents(Number(input.totalAmount ?? (taxable + tax)));

    await prisma.$executeRaw`
      INSERT INTO "debit_notes" (
        "id", "debitNoteNumber", "vendorId", "invoiceNumber", "currency",
        "status", "reason", "taxableAmount", "taxAmount", "totalAmount",
        "evidence", "createdBy", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${bill.vendorId}, ${bill.supplierInvoiceNumber}, ${bill.currency || 'INR'},
        'APPROVED'::"DebitNoteWorkflowStatus", ${reason},
        ${taxable}, ${tax}, ${total},
        ${JSON.stringify({
          source: 'BILL',
          billId: bill.id,
          supplierInvoiceNumber: bill.supplierInvoiceNumber,
          reasonCategory: input.reasonCode || input.reasonCategory || 'RETURN',
          restockInventory: Boolean(input.restockInventory)
        })}::jsonb,
        ${actorId}, CURRENT_TIMESTAMP
      )
    `;

    for (const line of lines) {
      const lineQty = Number(line.quantity || line.creditQuantity || 0);
      if (lineQty <= 0) continue;
      const unitPrice = Number(line.unitPrice || 0);
      const taxRate = Number(line.taxRate || line.gstRate || 0);
      const lineTaxable = cents(Number(line.taxableAmount ?? (lineQty * unitPrice)));
      const lineTax = cents(Number(line.taxAmount ?? ((lineTaxable * taxRate) / 100)));
      const lineTotal = cents(Number(line.totalAmount ?? (lineTaxable + lineTax)));

      await prisma.$executeRaw`
        INSERT INTO "debit_note_lines" (
          "id", "debitNoteId", "productId", "materialId", "description",
          "expectedQuantity", "receivedQuantity", "acceptedQuantity", "rejectedQuantity",
          "damagedQuantity", "shortQuantity", "unitPrice", "taxRate",
          "taxableAmount", "taxAmount", "totalAmount", "reason"
        ) VALUES (
          ${randomUUID()}, ${id}, ${line.productId || null}, ${line.materialId || null},
          ${line.description || 'Bill adjustment'}, ${lineQty}, ${lineQty}, 0,
          ${lineQty}, 0, 0, ${unitPrice}, ${taxRate},
          ${lineTaxable}, ${lineTax}, ${lineTotal}, ${line.reason || reason}
        )
      `;
    }

    await this.audit.record({
      actorId,
      action: 'debit_note.create_from_bill',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { billId, debitNoteNumber: number, totalAmount: total },
      requestId,
    });

    await notificationService.notifyRoles({
      roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'],
      title: `Debit note ${number} created`,
      message: `A debit note of ₹${total.toFixed(2)} against bill ${bill.supplierInvoiceNumber} was issued by Accounts.`,
      resource: 'DebitNote',
      resourceId: id,
      href: `/accounts/purchases/bills/${bill.id}`,
      excludeUserIds: [actorId]
    }).catch(() => []);

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    return result[0];
  }

  async sendToVendor(id: string, actorId: string, options?: { email?: string; notes?: string }, requestId?: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];

    const vendor = note.vendorId ? await prisma.vendor.findUnique({
      where: { id: note.vendorId },
      select: { id: true, name: true, contactEmail: true }
    }) : null;

    const targetEmail = options?.email?.trim() || vendor?.contactEmail || 'vendor@example.com';
    const sentAt = new Date().toISOString();
    const updatedEvidence = {
      ...(typeof note.evidence === 'object' && note.evidence !== null ? note.evidence : {}),
      sentToVendorAt: sentAt,
      sentToEmail: targetEmail,
      vendorNotes: options?.notes?.trim() || null,
      sentByActorId: actorId,
    };

    await prisma.$executeRaw`
      UPDATE "debit_notes"
      SET "status" = CASE WHEN "status" = 'RECORDED' THEN 'SUBMITTED'::"DebitNoteWorkflowStatus" ELSE "status" END,
          "evidence" = ${JSON.stringify(updatedEvidence)}::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `;

    await this.audit.record({
      actorId,
      action: 'debit_note.send_to_vendor',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { targetEmail, debitNoteNumber: note.debitNoteNumber },
      requestId,
    });

    await notificationService.notifyRoles({
      roles: ['accounts_preparer', 'accounts_reviewer', 'finance_manager', 'admin'],
      title: `Debit Note ${note.debitNoteNumber} sent to vendor`,
      message: `Debit claim transmitted to ${vendor?.name || 'vendor'} (${targetEmail}).`,
      resource: 'DebitNote',
      resourceId: id,
      href: `/debit-notes/${id}`,
      excludeUserIds: [actorId],
    }).catch(() => []);

    return {
      success: true,
      debitNoteNumber: note.debitNoteNumber,
      sentToEmail: targetEmail,
      sentAt,
    };
  }
  async submit(id: string, actorId: string, requestId?: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];

    await prisma.$executeRaw`
      UPDATE "debit_notes"
      SET "status" = 'SUBMITTED'::"DebitNoteWorkflowStatus",
          "submittedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `;

    await this.audit.record({
      actorId,
      action: 'debit_note.submit',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { debitNoteNumber: note.debitNoteNumber },
      requestId,
    });

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    if (result[0]) {
      await this.recordDebitNoteScoringEvent(result[0], actorId, 'SUBMITTED');
    }
    return result[0];
  }

  async approve(id: string, actorId: string, requestId?: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];

    await prisma.$executeRaw`
      UPDATE "debit_notes"
      SET "status" = 'APPROVED'::"DebitNoteWorkflowStatus",
          "approvedBy" = ${actorId},
          "approvedAt" = CURRENT_TIMESTAMP,
    `;

    await this.recordDebitNoteScoringEvent(note, actorId, 'APPROVED');

    await this.audit.record({
      actorId,
      action: 'debit_note.approve',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { debitNoteNumber: note.debitNoteNumber },
      requestId,
    });

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    return result[0];
  }

  async cancel(id: string, actorId: string, requestId?: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];

    await prisma.$executeRaw`
      UPDATE "debit_notes"
      SET "status" = 'CANCELLED'::"DebitNoteWorkflowStatus",
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `;

    // Reverse scoring event if was previously approved
    try {
      const engine = vendorScoringService.getEngine();
      const activeEvent = await prisma.$queryRaw<any[]>`
        SELECT * FROM "vendor_scoring_events"
        WHERE "debitNoteId" = ${id} AND "status" = 'ACTIVE' AND "eventType" = 'DEBIT_NOTE_PENALTY'
        LIMIT 1
      `;
      if (activeEvent && activeEvent[0]) {
        await engine.reverseEvent(activeEvent[0].id, actorId);
      }
    } catch (err) {
      console.warn('[DebitNoteService] Scoring reversal notice:', err);
    }

    await this.audit.record({
      actorId,
      action: 'debit_note.cancel',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { debitNoteNumber: note.debitNoteNumber },
      requestId,
    });

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    return result[0];
  }

  async reject(id: string, actorId: string, reason?: string, requestId?: string) {
    const notes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id} LIMIT 1`;
    if (!notes[0]) throw new NotFoundError('Debit note not found.');
    const note = notes[0];

    await prisma.$executeRaw`
      UPDATE "debit_notes"
      SET "status" = 'REJECTED'::"DebitNoteWorkflowStatus",
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `;

    try {
      const engine = vendorScoringService.getEngine();
      const activeEvent = await prisma.$queryRaw<any[]>`
        SELECT * FROM "vendor_scoring_events"
        WHERE "debitNoteId" = ${id} AND "status" = 'ACTIVE' AND "eventType" = 'DEBIT_NOTE_PENALTY'
        LIMIT 1
      `;
      if (activeEvent && activeEvent[0]) {
        await engine.reverseEvent(activeEvent[0].id, actorId);
      }
    } catch (err) {
      console.warn('[DebitNoteService] Scoring reversal notice:', err);
    }

    await this.audit.record({
      actorId,
      action: 'debit_note.reject',
      entityType: 'DebitNote',
      entityId: id,
      metadata: { debitNoteNumber: note.debitNoteNumber, reason },
      requestId,
    });

    const result = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "id" = ${id}`;
    return result[0];
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    try {
      const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('debit_note_seq') AS value`;
      return `DN-${year}-${String(Number(rows[0]?.value || 0)).padStart(5, '0')}`;
    } catch {
      // Compatibility fallback for databases that have not applied the additive
      // migration yet. The UUID suffix keeps this path collision-safe.
      return `DN-${year}-${randomUUID().slice(0, 8).toUpperCase()}`;
    }
  }

}
