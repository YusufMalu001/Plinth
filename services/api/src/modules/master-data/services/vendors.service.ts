/* eslint-disable @typescript-eslint/no-explicit-any */
import { Vendor, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { VendorsRepository } from '../repositories/vendors.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, ForbiddenError, NotFoundError, ReferentialIntegrityError } from '../../../common/errors/AppError';
import { prisma } from '../../../database';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import { vendorScoringService } from './vendor-scoring.service';
import { notificationService } from '../../notifications/notification.service';
import { randomUUID } from 'node:crypto';

export class VendorsService {
  constructor(
    private readonly repository: VendorsRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) { }

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async createVendor(params: {
    code?: string;
    name: string;
    contactPerson?: string;
    legalName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxNumber?: string | null;
    taxId?: string | null;
    address?: Record<string, unknown> | null;
    addresses?: Array<Record<string, unknown>>;
    currency?: string;
    paymentTerms?: string | null;
    leadTimeDays?: number;
    status?: LifecycleStatus;
    activateImmediately?: boolean;
    capabilities?: Array<{
      productId?: string | null;
      materialId?: string | null;
      categoryId?: string | null;
      uomId?: string | null;
      moq?: number | null;
      unitPrice?: number | null;
      leadTimeDays?: number | null;
      notes?: string | null;
    }>;
    actorId: string;
    requestId?: string;
  }): Promise<Vendor> {
    const normalizedCode = VendorsService.normalizeCode(params.code || `VND-${randomUUID().slice(0, 8)}`);
    const existing = await this.repository.findByCode(normalizedCode);
    if (existing) {
      throw new ConflictError(`Vendor with code [${normalizedCode}] already exists.`);
    }

    const normalizedName = params.name.trim();
    const existingName = await this.repository.findByName(normalizedName);
    if (existingName) {
      throw new ConflictError(`A vendor named [${existingName.name}] already exists. Use the existing vendor or choose a different name.`);
    }

    const taxNum = params.taxNumber || params.taxId || undefined;
    const addr = params.address || (params.addresses && params.addresses[0]) || undefined;

    const created = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          code: normalizedCode,
          name: normalizedName,
          contactEmail: params.contactEmail?.trim(),
          contactPhone: params.contactPhone?.trim(),
          taxNumber: taxNum ? taxNum.trim().toUpperCase() : null,
          address: (addr || null) as Prisma.InputJsonValue,
          currency: params.currency?.trim().toUpperCase() || 'INR',
          paymentTerms: params.paymentTerms,
          status: params.activateImmediately ? 'ACTIVE' : 'DRAFT'
        }
      });
      if (params.contactPerson?.trim()) {
        await (tx as any).vendorContact.create({
          data: {
            vendorId: vendor.id,
            name: params.contactPerson.trim(),
            email: params.contactEmail?.trim(),
            phone: params.contactPhone?.trim(),
            role: 'Key Contact',
            isPrimary: true,
          },
        });
      }
      const capabilities = (params.capabilities || []).filter((cap) => cap.productId || cap.materialId || cap.categoryId);
      if (capabilities.length) {
        await (tx as any).vendorCapability.createMany({
          data: capabilities.map((cap) => ({
            vendorId: vendor.id,
            productId: cap.productId || null,
            materialId: cap.materialId || null,
            categoryId: cap.categoryId || null,
            uomId: cap.uomId || null,
            moq: cap.moq ?? null,
            unitPrice: cap.unitPrice ?? 0,
            leadTimeDays: cap.leadTimeDays ?? null,
            notes: cap.notes || null,
          })),
        });
      }
      return vendor;
    });
    if (params.legalName || params.leadTimeDays !== undefined) {
      try { await prisma.$executeRaw`UPDATE "vendors" SET "legalName" = ${params.legalName?.trim() || null}, "leadTimeDays" = ${params.leadTimeDays ?? null} WHERE "id" = ${created.id}`; } catch { /* additive columns are absent until migration */ }
    }

    if (!params.activateImmediately) {
      await notificationService.notifyRoles({
        roles: ['admin', 'super-admin'],
        type: 'APPROVAL_REQUIRED',
        title: 'Vendor approval required',
        message: `${created.name} was added by a Store Manager and is waiting for your approval.`,
        resource: 'Vendor',
        resourceId: created.id,
        href: `/vendors/${created.id}`,
        priority: 'HIGH',
        dedupeKeyPrefix: `vendor-created:${created.id}`,
      });
    }


    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'vendor.create',
      entityType: 'Vendor',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listVendors(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
    activeOnly?: boolean;
  }): Promise<{ items: Vendor[]; total: number }> {
    return this.repository.list(params);
  }

  async getVendorById(id: string): Promise<Vendor> {
    const vendor = await this.repository.findById(id);
    if (!vendor) {
      throw new NotFoundError(`Vendor [${id}] not found.`);
    }
    return vendor;
  }

  /**
   * Returns the operational vendor profile used by the dedicated vendor UI.
   * Performance is calculated from finalized receipts and immutable evaluations;
   * AI is never involved in the numeric score.
   */
  async getVendorProfile(id: string) {
    const db: any = prisma as any;
    const vendor = await db.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundError(`Vendor [${id}] not found.`);
    const optionalRows = async (table: string, order = '"createdAt" DESC', limit = 100) => {
      try { return await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "${table}" WHERE "vendorId" = '${id.replace(/'/g, "''")}' ORDER BY ${order}${limit > 0 ? ` LIMIT ${Math.floor(limit)}` : ''}`); } catch { return []; }
    };
    const rawCapabilities = await (prisma as any).vendorCapability.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: 'desc' }
    });

    const capMaterialIds = rawCapabilities.map((c: any) => c.materialId).filter(Boolean);
    const capProductIds = rawCapabilities.map((c: any) => c.productId).filter(Boolean);

    const [capMaterials, capProducts] = await Promise.all([
      capMaterialIds.length ? prisma.material.findMany({
        where: { id: { in: capMaterialIds } },
        select: { id: true, code: true, name: true, status: true, specs: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true } } }
      }) : [],
      capProductIds.length ? prisma.product.findMany({
        where: { id: { in: capProductIds } },
        select: { id: true, sku: true, name: true, status: true, metadata: true, category: { select: { id: true, code: true, name: true } }, uom: { select: { id: true, code: true, symbol: true } } }
      }) : []
    ]);

    const parentMaterialIds = capMaterials.map((material: any) => material.specs?.parentMaterialId).filter(Boolean);
    const parentProductIds = capProducts.map((product: any) => product.metadata?.parentProductId).filter(Boolean);
    const [parentMaterials, parentProducts] = await Promise.all([
      parentMaterialIds.length ? prisma.material.findMany({ where: { id: { in: parentMaterialIds } }, select: { id: true, name: true } }) : [],
      parentProductIds.length ? prisma.product.findMany({ where: { id: { in: parentProductIds } }, select: { id: true, name: true } }) : [],
    ]);
    const parentMaterialNames = new Map(parentMaterials.map((material) => [material.id, material.name]));
    const parentProductNames = new Map(parentProducts.map((product) => [product.id, product.name]));
    const capMatMap = new Map(capMaterials.map((material: any) => [material.id, {
      ...material,
      parentName: material.specs?.parentMaterialName || parentMaterialNames.get(material.specs?.parentMaterialId),
    }]));
    const capProdMap = new Map(capProducts.map((product: any) => [product.id, {
      ...product,
      parentName: product.metadata?.parentProductName || parentProductNames.get(product.metadata?.parentProductId),
    }]));

    const capabilities = rawCapabilities.map((cap: any) => ({
      ...cap,
      material: cap.materialId ? capMatMap.get(cap.materialId) || null : null,
      product: cap.productId ? capProdMap.get(cap.productId) || null : null,
    }));

    const [contacts, complianceDocuments, evaluations, scoreSnapshots] = await Promise.all([
      optionalRows('vendor_contacts', '"isPrimary" DESC, "name" ASC'), optionalRows('vendor_compliance_documents', '"expiresAt" ASC'), optionalRows('vendor_evaluations', '"periodEnd" DESC'), optionalRows('vendor_score_snapshots', '"calculatedAt" DESC')
    ]);
    vendor.contacts = contacts; vendor.capabilities = capabilities; vendor.complianceDocuments = complianceDocuments; vendor.evaluations = evaluations; vendor.scoreSnapshots = scoreSnapshots;

    const orders = await prisma.purchaseOrder.findMany({
      where: { vendorId: id },
      include: { lines: { include: { product: true, material: true, uom: true } }, goodsReceiptNotes: { include: { lines: { include: { product: true, material: true, uom: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    const directGrns = await prisma.goodsReceiptNote.findMany({
      where: { vendorId: id, poId: null },
      include: { lines: { include: { product: true, material: true, uom: true } } },
      orderBy: { createdAt: 'desc' }
    });
    const debitNotes = await optionalRows('debit_notes', '"createdAt" DESC', 0);
    const debitNoteIds = debitNotes.map((note: any) => note.id);
    let debitNoteLines: any[] = [];
    let debitNoteDocuments: any[] = [];
    if (debitNoteIds.length) {
      try { debitNoteLines = await prisma.$queryRaw`SELECT * FROM "debit_note_lines" WHERE "debitNoteId" IN (${Prisma.join(debitNoteIds)}) ORDER BY "debitNoteId"`; } catch { debitNoteLines = []; }
      try { debitNoteDocuments = await prisma.$queryRaw`SELECT * FROM "debit_note_documents" WHERE "debitNoteId" IN (${Prisma.join(debitNoteIds)}) ORDER BY "createdAt"`; } catch { debitNoteDocuments = []; }
    }
    const allGrnList = [
      ...orders.flatMap((order: any) => order.goodsReceiptNotes.map((receipt: any) => ({ order, receipt }))),
      ...directGrns.map((receipt: any) => ({ order: null, receipt }))
    ];
    const grnIds = allGrnList.map(item => item.receipt.id);
    let paymentRows: any[] = [];
    if (grnIds.length) {
      try { paymentRows = await prisma.$queryRaw`SELECT * FROM "grn_payments" WHERE "grnId" IN (${Prisma.join(grnIds)}) ORDER BY "paymentDate" DESC`; } catch { paymentRows = []; }
    }
    const verifiedStatuses = ['VERIFIED', 'CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'];
    const verifiedReceipts = allGrnList.filter(item => verifiedStatuses.includes(item.receipt.status));
    const poVerifiedReceipts = verifiedReceipts.filter(item => item.order !== null);
    const orderedQuantity = orders.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
    const receivedQuantity = verifiedReceipts.reduce((sum, item) => sum + item.receipt.lines.reduce((lineSum: number, line: { receivedQuantity: number }) => lineSum + Number(line.receivedQuantity || 0), 0), 0);
    const acceptedQuantity = verifiedReceipts.reduce((sum, item) => sum + item.receipt.lines.reduce((lineSum: number, line: { acceptedQuantity: number }) => lineSum + Number(line.acceptedQuantity || 0), 0), 0);
    const onTimeCount = poVerifiedReceipts.filter(({ order, receipt }) => {
      if (!order) return true;
      const latestNeedDate = order.lines.reduce((latest: Date | null, line: { needDate: Date }) => (!latest || line.needDate > latest ? line.needDate : latest), null as Date | null);
      return !latestNeedDate || receipt.receivedAt <= latestNeedDate;
    }).length;
    const onTimeRate = poVerifiedReceipts.length ? (onTimeCount / poVerifiedReceipts.length) * 100 : null;
    const fillRate = orderedQuantity ? Math.min(receivedQuantity / orderedQuantity, 1) * 100 : null;
    const qualityRate = receivedQuantity ? Math.min(acceptedQuantity / receivedQuantity, 1) * 100 : null;
    const complianceRate = vendor.complianceDocuments.length ? vendor.complianceDocuments.filter((document: { expiresAt: Date | null }) => !document.expiresAt || document.expiresAt >= new Date()).length / vendor.complianceDocuments.length * 100 : null;
    // Active claims (APPROVED, SUBMITTED, RECORDED) incur active deductions
    type RawNote = { status: string; totalAmount: unknown };
    const isRawNote = (n: unknown): n is RawNote =>
      typeof n === 'object' && n !== null && 'status' in n && 'totalAmount' in n;
    const activeClaims = (debitNotes as unknown[]).filter(
      (n): n is RawNote => isRawNote(n) && ['APPROVED', 'SUBMITTED', 'RECORDED'].includes(String(n.status || '').toUpperCase())
    );
    const scoredClaims = activeClaims;
    const totalOrderValue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const approvedClaimValue = scoredClaims.reduce((sum: number, note) => sum + Number(note.totalAmount || 0), 0);
    const claimRate = totalOrderValue ? approvedClaimValue / totalOrderValue : null;

    // Compute canonical score via VendorScoringEngine so score is 100% consistent everywhere
    let score: number | null = null;
    try {
      const engine = this.getScoringEngine();
      const ev = await engine.evaluateVendor(id);
      score = ev.overallScore;
    } catch {
      score = null;
    }
    const performance = {
      onTimeRate: onTimeRate === null ? null : Math.round(onTimeRate),
      qualityRate: qualityRate === null ? null : Math.round(qualityRate),
      fillRate: fillRate === null ? null : Math.round(fillRate),
      complianceRate: complianceRate === null ? null : Math.round(complianceRate),
      finalizedReceipts: verifiedReceipts.length,
      debitNoteCount: scoredClaims.length,
      debitNoteValue: approvedClaimValue,
      debitNoteRate: claimRate === null ? null : Math.round(claimRate * 10000) / 100,
    };
    return {
      ...vendor,
      metrics: { totalOrders: orders.length, totalOrderValue, orderedQuantity, receivedQuantity, acceptedQuantity, debitNoteCount: scoredClaims.length, debitNoteValue: approvedClaimValue },
      score,
      performance,
      debitNotes: debitNotes.map((note: any) => ({ ...note, taxableAmount: Number(note.taxableAmount || 0), taxAmount: Number(note.taxAmount || 0), totalAmount: Number(note.totalAmount || 0), lines: debitNoteLines.filter((line: any) => line.debitNoteId === note.id).map((line: any) => ({ ...line, expectedQuantity: Number(line.expectedQuantity), receivedQuantity: Number(line.receivedQuantity), acceptedQuantity: Number(line.acceptedQuantity), rejectedQuantity: Number(line.rejectedQuantity), damagedQuantity: Number(line.damagedQuantity), shortQuantity: Number(line.shortQuantity), unitPrice: Number(line.unitPrice), taxableAmount: Number(line.taxableAmount), taxAmount: Number(line.taxAmount), totalAmount: Number(line.totalAmount) })), documents: debitNoteDocuments.filter((document: any) => document.debitNoteId === note.id).map((document: any) => ({ fileName: document.fileName, fileUrl: document.fileUrl, createdAt: document.createdAt })) })),
      orders: orders.map(order => ({
        id: order.id,
        poNumber: order.poNumber,
        status: order.status,
        createdAt: order.createdAt,
        totalAmount: Number(order.totalAmount || 0),
        currency: order.currency,
        subtotal: Number(order.subtotal || 0),
        taxAmount: Number(order.taxAmount || 0),
        paymentTerms: order.paymentTerms,
        deliveryLocation: order.deliveryLocation,
        approvedAt: order.approvedAt,
        sentAt: order.sentAt,
        receiptCount: order.goodsReceiptNotes.length,
        debitNotes: debitNotes.filter((note: any) => note.poId === order.id).map((note: any) => ({ debitNoteNumber: note.debitNoteNumber, status: note.status, totalAmount: Number(note.totalAmount || 0), reason: note.reason, createdAt: note.createdAt })),
        lines: order.lines.map((line: any) => ({ id: line.id, productId: line.productId, materialId: line.materialId, itemName: line.material?.name || line.product?.name || 'Catalog item', itemCode: line.material?.code || line.product?.sku || '', uom: line.uom?.code || line.uom?.symbol || '', quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), taxRate: Number(line.taxRate), lineTotal: Number(line.lineTotal), needDate: line.needDate })),
        receipts: order.goodsReceiptNotes.map((receipt: any) => ({ id: receipt.id, grnNumber: receipt.grnNumber, status: receipt.status, receivedAt: receipt.receivedAt, finalizedAt: receipt.finalizedAt, lines: receipt.lines.map((line: any) => ({ productId: line.productId, materialId: line.materialId, itemName: line.material?.name || line.product?.name || 'Catalog item', itemCode: line.material?.code || line.product?.sku || '', uom: line.uom?.code || line.uom?.symbol || '', expectedQuantity: Number(line.expectedQuantity || 0), receivedQuantity: Number(line.receivedQuantity), acceptedQuantity: Number(line.acceptedQuantity), rejectedQuantity: Number(line.rejectedQuantity), damagedQuantity: Number(line.damagedQuantity) })), payments: paymentRows.filter((payment: any) => payment.grnId === receipt.id).map((payment: any) => ({ ...payment, amount: Number(payment.amount) })), debitNotes: debitNotes.filter((note: any) => note.grnId === receipt.id).map((note: any) => ({ ...note, totalAmount: Number(note.totalAmount || 0) })) }))
      }))
    };
  }

  async listVendorEvaluations(vendorId: string) {
    await this.getVendorById(vendorId);
    try { return await prisma.$queryRaw`SELECT * FROM "vendor_evaluations" WHERE "vendorId" = ${vendorId} ORDER BY "periodEnd" DESC`; } catch { return []; }
  }

  async createVendorEvaluation(vendorId: string, input: { periodStart: Date; periodEnd: Date; scores: Record<string, number>; comments?: string; evidenceUrl?: string | null }, actorId: string, requestId?: string) {
    await this.getVendorById(vendorId);
    let created: any;
    try { created = (await prisma.$queryRaw<any[]>`INSERT INTO "vendor_evaluations" ("id", "vendorId", "reviewerId", "periodStart", "periodEnd", "scores", "comments", "evidenceUrl", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${vendorId}, ${actorId}, ${input.periodStart}, ${input.periodEnd}, ${JSON.stringify(input.scores)}::jsonb, ${input.comments}, ${input.evidenceUrl}, 'SUBMITTED'::"VendorEvaluationStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`)[0]; } catch { created = await (prisma as any).vendorEvaluation.create({ data: { vendorId, reviewerId: actorId, periodStart: input.periodStart, periodEnd: input.periodEnd, scores: input.scores, comments: input.comments, evidenceUrl: input.evidenceUrl, status: 'SUBMITTED' } }); }
    await this.auditWriter.record({ actorId, action: 'vendor.evaluation.create', entityType: 'VendorEvaluation', entityId: created.id, after: created, requestId });
    return created;
  }

  async listScorecards() {
    try { return await prisma.$queryRaw`SELECT * FROM "vendor_scorecards" ORDER BY "status" ASC, "version" DESC`; } catch { return []; }
  }

  async createScorecard(input: { name: string; weights: Record<string, number>; thresholds?: Record<string, number> }, actorId: string, requestId?: string) {
    let created: any;
    try {
      const latest = await prisma.$queryRaw<Array<{ version: number }>>`SELECT "version" FROM "vendor_scorecards" WHERE "name" = ${input.name} ORDER BY "version" DESC LIMIT 1`;
      created = (await prisma.$queryRaw<any[]>`INSERT INTO "vendor_scorecards" ("id", "name", "version", "weights", "thresholds", "status", "createdBy", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${input.name}, ${(latest[0]?.version ?? 0) + 1}, ${JSON.stringify(input.weights)}::jsonb, ${JSON.stringify(input.thresholds || {})}::jsonb, 'DRAFT'::"VendorScorecardStatus", ${actorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`)[0];
    } catch {
      const db: any = prisma as any; const latest = await db.vendorScorecard.findFirst({ where: { name: input.name }, orderBy: { version: 'desc' } });
      created = await db.vendorScorecard.create({ data: { name: input.name, version: (latest?.version ?? 0) + 1, weights: input.weights, thresholds: input.thresholds, createdBy: actorId } });
    }
    await this.auditWriter.record({ actorId, action: 'vendor.scorecard.create', entityType: 'VendorScorecard', entityId: created.id, after: created, requestId });
    return created;
  }

  async activateScorecard(id: string, actorId: string, requestId?: string) {
    let card: any;
    try { card = (await prisma.$queryRaw<any[]>`SELECT * FROM "vendor_scorecards" WHERE "id" = ${id}`)[0]; } catch { const db: any = prisma as any; card = await db.vendorScorecard.findUnique({ where: { id } }); }
    if (!card) throw new NotFoundError(`Vendor scorecard [${id}] not found.`);
    const updated = await prisma.$transaction(async (tx) => {
      const txDb: any = tx as any;
      const current = await txDb.vendorScorecard.findUnique({ where: { id } });
      if (!current) throw new NotFoundError(`Vendor scorecard [${id}] not found.`);
      if (current.status === 'ACTIVE') return current;
      await txDb.vendorScorecard.updateMany({ where: { name: current.name, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
      const activated = await txDb.vendorScorecard.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: new Date() } });
      await publishIntelligenceEvent(tx as any, { type: 'VENDOR_SCORECARD_ACTIVATED', entityType: 'VendorScorecard', entityId: id, correlationId: requestId, occurredAt: activated.updatedAt, transitionId: activated.updatedAt.toISOString(), metadata: { name: activated.name, version: activated.version, status: activated.status } });
      return activated;
    });
    await this.auditWriter.record({ actorId, action: 'vendor.scorecard.activate', entityType: 'VendorScorecard', entityId: id, before: card, after: updated, requestId });
    return updated;
  }

  async updateVendor(id: string, params: {
    name?: string;
    contactPerson?: string;
    legalName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxNumber?: string | null;
    taxId?: string | null;
    address?: Record<string, unknown> | null;
    addresses?: Array<Record<string, unknown>>;
    currency?: string;
    paymentTerms?: string | null;
    leadTimeDays?: number;
    capabilities?: Array<{
      productId?: string | null;
      materialId?: string | null;
      categoryId?: string | null;
      uomId?: string | null;
      moq?: number | null;
      unitPrice?: number | null;
      leadTimeDays?: number | null;
      notes?: string | null;
    }>;
    actorId: string;
    requestId?: string;
  }): Promise<Vendor> {
    const vendor = await this.getVendorById(id);


    const taxNum = params.taxNumber !== undefined ? params.taxNumber : params.taxId;
    const addr = params.address !== undefined ? params.address : (params.addresses && params.addresses[0] ? params.addresses[0] : undefined);

    const updated = await prisma.$transaction(async (tx) => {
      if (Array.isArray(params.capabilities)) {
        await (tx as any).vendorCapability.deleteMany({ where: { vendorId: id } });
        const capabilities = params.capabilities.filter((cap) => cap.productId || cap.materialId || cap.categoryId);
        if (capabilities.length) {
          await (tx as any).vendorCapability.createMany({
            data: capabilities.map((cap) => ({
              vendorId: id,
              productId: cap.productId || null,
              materialId: cap.materialId || null,
              categoryId: cap.categoryId || null,
              uomId: cap.uomId || null,
              moq: cap.moq ?? null,
              unitPrice: cap.unitPrice ?? 0,
              leadTimeDays: cap.leadTimeDays ?? null,
              notes: cap.notes || null,
            })),
          });
        }
      }
      if (params.contactPerson !== undefined || params.contactEmail !== undefined || params.contactPhone !== undefined) {
        const contacts = (tx as any).vendorContact;
        const contactData = {
          ...(params.contactPerson !== undefined ? { name: params.contactPerson.trim() } : {}),
          ...(params.contactEmail !== undefined ? { email: params.contactEmail?.trim() || null } : {}),
          ...(params.contactPhone !== undefined ? { phone: params.contactPhone?.trim() || null } : {}),
        };
        const primaryContacts = await contacts.updateMany({ where: { vendorId: id, isPrimary: true }, data: contactData });
        if (primaryContacts.count === 0) {
          const existingContact = await contacts.findFirst({ where: { vendorId: id }, orderBy: { createdAt: 'asc' } });
          if (existingContact) {
            await contacts.update({ where: { id: existingContact.id }, data: { ...contactData, isPrimary: true } });
          } else if (params.contactPerson?.trim()) {
            await contacts.create({ data: { vendorId: id, name: params.contactPerson.trim(), email: params.contactEmail?.trim() || null, phone: params.contactPhone?.trim() || null, role: 'Key Contact', isPrimary: true } });
          }
        }
      }
      const saved = await (tx as any).vendor.update({
        where: { id }, data: {
          ...(params.name ? { name: params.name.trim() } : {}),
          ...(params.contactEmail !== undefined ? { contactEmail: params.contactEmail ? params.contactEmail.trim() : null } : {}),
          ...(params.contactPhone !== undefined ? { contactPhone: params.contactPhone ? params.contactPhone.trim() : null } : {}),
          ...(taxNum !== undefined ? { taxNumber: taxNum ? taxNum.trim().toUpperCase() : null } : {}),
          ...(addr !== undefined ? { address: (addr || null) as Prisma.InputJsonValue } : {}),
          ...(params.currency ? { currency: params.currency.trim().toUpperCase() } : {}),
          ...(params.paymentTerms !== undefined ? { paymentTerms: params.paymentTerms } : {}),
          ...(params.leadTimeDays !== undefined ? { leadTimeDays: params.leadTimeDays } : {}),
          ...(params.legalName !== undefined ? { legalName: params.legalName?.trim() || null } : {}),
        }
      });
      await publishIntelligenceEvent(tx as any, { type: 'VENDOR_CHANGED', entityType: 'Vendor', entityId: id, correlationId: params.requestId, occurredAt: saved.updatedAt, transitionId: saved.updatedAt.toISOString(), metadata: { status: saved.status } });
      return saved;
    });
    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'vendor.update',
      entityType: 'Vendor',
      entityId: updated.id,
      before: vendor,
      after: updated,
      requestId: params.requestId
    });

    return updated;
  }

  async deleteVendor(id: string, actorId: string, requestId?: string): Promise<{ id: string }> {
    if (!(await this.permissionChecker.can(actorId, 'delete', 'Vendor'))) {
      throw new ForbiddenError(`Actor [${actorId}] lacks permission to delete vendors.`);
    }
    const vendor = await this.getVendorById(id);
    try {
      await prisma.vendor.delete({ where: { id } });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2003') {
        throw new ConflictError(`Vendor [${vendor.name}] is referenced by existing business records and cannot be deleted. Deactivate it instead.`);
      }
      throw error;
    }
    await this.auditWriter.record({
      actorId,
      action: 'vendor.delete',
      entityType: 'Vendor',
      entityId: id,
      before: vendor,
      requestId,
    });
    return { id };
  }

  async transitionStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<Vendor> {
    const vendor = await this.getVendorById(params.id);

    const draftApproval = ['DRAFT', 'PENDING_VALIDATION'].includes(vendor.status) && params.targetStatus === 'ACTIVE';
    if (!draftApproval) MasterDataLifecycleService.validateTransition(vendor.status, params.targetStatus, 'Vendor');

    if (params.targetStatus === 'APPROVED' || params.targetStatus === 'ACTIVE') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'Vendor'
      });
    }

    if (params.targetStatus === 'INACTIVE' && !(await this.permissionChecker.can(params.actorId, 'deactivate', 'Vendor'))) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to deactivate [Vendor].`);
    }

    if (params.targetStatus === 'INACTIVE') {
      const activeTransactions = await this.repository.countActiveTransactionalReferences(params.id);
      if (activeTransactions > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate Vendor [${vendor.code}]. It has active purchase commitments (${activeTransactions} active POs).`,
          { activeTransactions }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await (tx as any).vendor.update({ where: { id: params.id }, data: { status: params.targetStatus, deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null } });
      await publishIntelligenceEvent(tx as any, { type: 'VENDOR_CHANGED', entityType: 'Vendor', entityId: saved.id, correlationId: params.requestId, occurredAt: saved.updatedAt, transitionId: saved.updatedAt.toISOString(), metadata: { status: saved.status } });
      return saved;
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'vendor.status_change',
      entityType: 'Vendor',
      entityId: updated.id,
      before: { status: vendor.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
  getScoringEngine() {
    return vendorScoringService.getEngine();
  }

  async scoreVendors(filterType: 'MATERIAL' | 'OUTSOURCING' | 'ALL' = 'ALL', targetVendorId?: string) {
    return vendorScoringService.scoreVendors(filterType, targetVendorId);
  }
}
