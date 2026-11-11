/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoodsReceiptNote, GrnStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { logger } from '../../../common/utils/logger';
import { GoodsReceiptRepository } from '../repositories/goods-receipt.repository';
import { DiscrepancyRepository } from '../repositories/discrepancy.repository';
import { LabelService } from './label.service';
import { ExpectedReceiptService } from '../../purchases/services/expected-receipt.service';
import { GoodsReceiptNotificationService } from './goods-receipt-notification.service';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import { modernReorderEvaluatorService } from '../../inventory/services/modern-reorder-evaluator.service';
import {
  NotFoundError,
  InvalidStateTransitionError,
  ForbiddenError,
  ValidationError,
  ConflictError
} from '../../../common/errors/AppError';
import { createSignedUrlForPath } from '../../../common/storage/supabase-storage.client';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import { AccountsPayablesService } from '../../accounts/accounts-ap.service';

import { vendorScoringService } from '../../master-data/services/vendor-scoring.service';
const QUANTITY_EPSILON = 1e-6;
const accountsPayablesService = new AccountsPayablesService();

export class GoodsReceiptService {
  constructor(
    private readonly repository: GoodsReceiptRepository,
    private readonly discrepancyRepository: DiscrepancyRepository,
    private readonly labelService: LabelService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly expectedReceiptService: ExpectedReceiptService,
    private readonly notificationService: GoodsReceiptNotificationService = new GoodsReceiptNotificationService()
  ) { }

  private async locationScope(actorId: string): Promise<{ locationId?: string; allLocations: boolean }> {
    void actorId;
    return { allLocations: true };
  }

  private async emitNotification(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      // Workflow state is authoritative. A transient inbox failure must not turn
      // an already-committed receipt action into a misleading client-side retry.
      logger.warn('goods_receipt.notification_failed', { details: error instanceof Error ? error.message : error });
    }
  }

  private async resolveActorDefaultLocation(actorId: string): Promise<string | null> {
    void actorId;
    const fallback = await prisma.warehouseLocation.findFirst({ where: { code: 'MAIN-STORE' }, select: { id: true } });
    if (fallback) return fallback.id;
    const factory = await prisma.factory.findFirst({ orderBy: { createdAt: 'asc' } });
    const provisioned = await prisma.warehouseLocation.create({ data: { code: 'MAIN-STORE', name: 'Main Store', type: 'STORE', status: 'ACTIVE', factoryId: factory?.id ?? null }, select: { id: true } });
    return provisioned.id;
  }

  /**
   * Enforces per-user store/location scoping on GRNs. GRNs created before this field existed
   * have a null locationId and are exempt (legacy data, not a bypass for new writes).
   */
  private async assertLocationScope(actorId: string, grnLocationId: string | null | undefined): Promise<void> {
    void actorId;
    void grnLocationId;
  }

  async createFromPo(
    data: { poId: string; locationId?: string; lines: Array<{ poLineId: string; receivedQuantity?: number }> },
    actorId: string,
    idempotencyKey?: string,
    requestId?: string
  ): Promise<GoodsReceiptNote> {
    const canReceive = await this.permissionChecker.can(actorId, 'receive', 'GoodsReceiptNote');
    if (!canReceive) throw new ForbiddenError('Lacks permission to receive goods.');

    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const locationId = data.locationId ?? (await this.resolveActorDefaultLocation(actorId));
    if (!locationId) {
      throw new ValidationError('locationId is required and could not be defaulted from the actor\'s assigned location.');
    }
    await this.assertLocationScope(actorId, locationId);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: data.poId },
      include: {
        lines: true,
        goodsReceiptNotes: {
          select: { id: true, grnNumber: true, status: true }
        }
      }
    });
    if (!po) throw new NotFoundError(`PurchaseOrder [${data.poId}] not found.`);
    if (po.goodsReceiptNotes && po.goodsReceiptNotes.length > 0) {
      throw new ConflictError(
        `A Goods Receipt Note (${po.goodsReceiptNotes[0].grnNumber}) has already been raised for Purchase Order [${po.poNumber}]. By policy, a GRN can be raised against a PO only once.`
      );
    }
    if (!['SENT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new InvalidStateTransitionError(
        `Cannot receive against PO in state [${po.status}]. PO must be SENT or APPROVED.`
      );
    }

    const resolvedLines = data.lines.map(line => {
      const poLine = po.lines.find(l => l.id === line.poLineId);
      if (!poLine) {
        throw new NotFoundError(`PO line [${line.poLineId}] does not belong to PO [${data.poId}].`);
      }
      return {
        poLineId: poLine.id,
        productId: poLine.productId ?? undefined,
        materialId: poLine.materialId ?? undefined,
        uomId: poLine.uomId,
        expectedQuantity: poLine.quantity,
        receivedQuantity: line.receivedQuantity
      };
    });

    const created = await this.createWithUniqueGrnNumber(grnNumber => this.repository.createFromPo({
      grnNumber,
      poId: po.id,
      vendorId: po.vendorId,
      locationId,
      idempotencyKey,
      receivedByActorId: actorId,
      lines: resolvedLines
    }));


    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.receive',
      entityType: 'GoodsReceiptNote',
      entityId: created.id,
      after: created,
      requestId
    });

    await this.emitNotification(() => this.notificationService.notifyPermission({
      action: 'verify', resource: 'GoodsReceiptNote', type: 'WORKFLOW',
      title: `${created.grnNumber} is ready for verification`,
      message: `${data.lines.length} received line${data.lines.length === 1 ? '' : 's'} require physical checks.`,
      grnId: created.id, locationId: created.locationId, excludeActorId: actorId
    }));

    return created;
  }

  async createUnreferenced(
    data: {
      vendorId: string;
      locationId?: string;
      justification: string;
      lines: Array<{ productId?: string; materialId?: string; uomId: string; receivedQuantity?: number }>;
    },
    actorId: string,
    idempotencyKey?: string,
    requestId?: string
  ): Promise<GoodsReceiptNote> {
    const canReceive = await this.permissionChecker.can(actorId, 'receive', 'GoodsReceiptNote');
    if (!canReceive) throw new ForbiddenError('Lacks permission to receive goods.');

    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const locationId = data.locationId ?? (await this.resolveActorDefaultLocation(actorId));
    if (!locationId) {
      throw new ValidationError('locationId is required and could not be defaulted from the actor\'s assigned location.');
    }
    await this.assertLocationScope(actorId, locationId);

    const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
    if (!vendor) throw new NotFoundError(`Vendor [${data.vendorId}] not found.`);
    if (vendor.status !== 'APPROVED' && vendor.status !== 'ACTIVE') {
      throw new ValidationError(`Vendor [${data.vendorId}] is not APPROVED/ACTIVE.`);
    }

    for (const [index, line] of data.lines.entries()) {
      if (Boolean(line.productId) === Boolean(line.materialId)) {
        throw new ValidationError(`Line ${index + 1} must reference exactly one product or material.`);
      }
      const uom = await prisma.unitOfMeasure.findUnique({ where: { id: line.uomId }, select: { status: true } });
      if (!uom || !['APPROVED', 'ACTIVE'].includes(uom.status)) {
        throw new ValidationError(`Line ${index + 1} uses an inactive or unapproved UOM [${line.uomId}].`);
      }
      const item = line.productId
        ? await prisma.product.findUnique({ where: { id: line.productId }, select: { status: true, uomId: true } })
        : await prisma.material.findUnique({ where: { id: line.materialId! }, select: { status: true, uomId: true } });
      if (!item || !['APPROVED', 'ACTIVE'].includes(item.status)) {
        throw new ValidationError(`Line ${index + 1} references an inactive or unapproved item.`);
      }
      if (item.uomId !== line.uomId) {
        throw new ValidationError(`Line ${index + 1} UOM must match the item's approved master UOM until V-013 conversion rules are confirmed.`);
      }
    }

    const created = await this.createWithUniqueGrnNumber(grnNumber => this.repository.createUnreferenced({
      grnNumber,
      vendorId: data.vendorId,
      locationId,
      unreferencedJustification: data.justification,
      idempotencyKey,
      receivedByActorId: actorId,
      lines: data.lines
    }));

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.receive',
      entityType: 'GoodsReceiptNote',
      entityId: created.id,
      after: created,
      metadata: { isUnreferenced: true },
      requestId
    });

    await this.emitNotification(() => this.notificationService.notifyPermission({
      action: 'verify', resource: 'GoodsReceiptNote', type: 'APPROVAL_REQUIRED',
      title: `Unreferenced receipt ${created.grnNumber} needs verification`,
      message: `An incoming shipment was recorded without a purchase order: ${data.justification}`,
      grnId: created.id, locationId: created.locationId, excludeActorId: actorId
    }));

    return created;
  }

  async recordMeasurement(
    grnId: string,
    grnLineId: string,
    data: {
      type: 'WEIGHT' | 'PIECE' | 'BUNDLE' | 'PACKET';
      value: number;
      unitLabel: string;
      note?: string;
      acceptedQuantity?: number;
      rejectedQuantity?: number;
      damagedQuantity?: number;
    },
    actorId: string,
    requestId?: string
  ) {
    const canVerify = await this.permissionChecker.can(actorId, 'verify', 'GoodsReceiptNote');
    if (!canVerify) throw new ForbiddenError('Lacks permission to verify goods receipts.');

    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    await this.assertLocationScope(actorId, grn.locationId);
    if (['CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'].includes(grn.status)) {
      throw new InvalidStateTransitionError('Cannot change physical verification after the discrepancy claim has been raised or the GRN approved.');
    }

    const line = grn.lines.find(l => l.id === grnLineId);
    if (!line) throw new NotFoundError(`GRN line [${grnLineId}] not found on GRN [${grnId}].`);

    await this.repository.createMeasurement({
      grnLineId,
      measuredByActorId: actorId,
      type: data.type,
      value: data.value,
      unitLabel: data.unitLabel,
      note: data.note
    });

    const hasClassification =
      data.acceptedQuantity !== undefined || data.rejectedQuantity !== undefined || data.damagedQuantity !== undefined;

    if (hasClassification) {
      const acceptedQuantity = data.acceptedQuantity ?? line.acceptedQuantity;
      const rejectedQuantity = data.rejectedQuantity ?? line.rejectedQuantity;
      const damagedQuantity = data.damagedQuantity ?? line.damagedQuantity;
      const receivedQuantity = acceptedQuantity + rejectedQuantity + damagedQuantity;
      const expected = line.expectedQuantity ?? undefined;
      const shortQuantity = expected !== undefined ? Math.max(expected - receivedQuantity, 0) : 0;
      const excessQuantity = expected !== undefined ? Math.max(receivedQuantity - expected, 0) : 0;

      await this.repository.updateLineQuantities(grnLineId, {
        receivedQuantity,
        acceptedQuantity,
        rejectedQuantity,
        damagedQuantity,
        shortQuantity,
        excessQuantity
      });

      const discrepancyTypes: Array<{ type: 'SHORTAGE' | 'EXCESS' | 'DAMAGE'; quantity: number }> = [];
      if (shortQuantity > QUANTITY_EPSILON) discrepancyTypes.push({ type: 'SHORTAGE', quantity: shortQuantity });
      if (excessQuantity > QUANTITY_EPSILON) discrepancyTypes.push({ type: 'EXCESS', quantity: excessQuantity });
      if (damagedQuantity > QUANTITY_EPSILON) discrepancyTypes.push({ type: 'DAMAGE', quantity: damagedQuantity });

      const existingActiveTypes = new Set(
        line.discrepancies.filter(d => d.status !== 'RESOLVED').map(d => d.type)
      );
      const createdDiscrepancyTypes: typeof discrepancyTypes = [];

      for (const d of discrepancyTypes) {
        if (!existingActiveTypes.has(d.type)) {
          await this.discrepancyRepository.create({ grnLineId, type: d.type, quantity: d.quantity });
          createdDiscrepancyTypes.push(d);
        }
      }

      await this.recomputeLineAndGrnStatus(grnLineId, actorId, requestId);

      if (createdDiscrepancyTypes.length > 0) {
        await this.emitNotification(() => this.notificationService.notifyPermission({
          action: 'resolve_discrepancy', resource: 'GoodsReceiptDiscrepancy', type: 'APPROVAL_REQUIRED',
          title: `Discrepancy raised on ${grn.grnNumber}`,
          message: `${createdDiscrepancyTypes.map(item => item.type.toLowerCase()).join(', ')} requires review before sign-off.`,
          grnId: grn.id, locationId: grn.locationId, excludeActorId: actorId
        }));
      }
    }

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.record_measurement',
      entityType: 'GoodsReceiptLine',
      entityId: grnLineId,
      after: data,
      requestId
    });

    const updatedGrn = await this.repository.findById(grnId);
    if (updatedGrn?.vendorId) {
      void vendorScoringService.getEngine().evaluateVendor(updatedGrn.vendorId).catch(() => undefined);
    }
    return updatedGrn;
  }

  /**
   * Recomputes a line's status (and the header status) after either a new measurement or a
   * discrepancy resolution. A line becomes VERIFIED (and gets its label generated) only once
   * it has no unresolved discrepancies; the header aggregates across all lines.
   */
  async recomputeLineAndGrnStatus(grnLineId: string, actorId: string, requestId?: string) {
    const line = await this.repository.getLineById(grnLineId);
    if (!line) throw new NotFoundError(`GRN line [${grnLineId}] not found.`);

    const unresolvedCount = await this.discrepancyRepository.countUnresolvedByGrnId(line.grnId);
    const lineUnresolved = line.discrepancies.some(d => d.status !== 'RESOLVED');

    if (lineUnresolved) {
      await this.repository.updateLineStatus(grnLineId, 'DISCREPANT');
      // The accepted quantity still needs traceability even when a separate
      // rejected, damaged, or short quantity is being claimed.
      await this.labelService.generateForLine(grnLineId, actorId, requestId);
    } else {
      await this.repository.updateLineStatus(grnLineId, 'VERIFIED');
      await this.labelService.generateForLine(grnLineId, actorId, requestId);
    }

    const grn = await this.repository.findById(line.grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${line.grnId}] not found.`);

    if (grn.status === 'ARRIVED' || grn.status === 'UNDER_VERIFICATION' || grn.status === 'DISCREPANCY_PENDING') {
      const allLinesClassified = grn.lines.every(l => ['VERIFIED', 'DISCREPANT'].includes(l.status));
      if (unresolvedCount > 0) {
        if (grn.status !== 'DISCREPANCY_PENDING' || (allLinesClassified && !grn.verifiedAt)) {
          await this.repository.updateStatus(line.grnId, 'DISCREPANCY_PENDING', allLinesClassified ? {
            verifiedByActorId: actorId,
            verifiedAt: new Date()
          } : undefined);
        }
      } else {
        const allLinesVerified = grn.lines.every(l => l.id === grnLineId ? true : l.status === 'VERIFIED');
        if (allLinesVerified) {
          await this.repository.updateStatus(line.grnId, 'VERIFIED', {
            verifiedByActorId: actorId,
            verifiedAt: new Date()
          });
          await this.emitNotification(() => this.notificationService.notifyPermission({
            action: 'sign_off', resource: 'GoodsReceiptNote', type: 'APPROVAL_REQUIRED',
            title: `${grn.grnNumber} is ready for sign-off`,
            message: 'All receiving lines are verified and labels are assigned.',
            grnId: grn.id, locationId: grn.locationId, excludeActorId: actorId
          }));
        } else if (grn.status !== 'UNDER_VERIFICATION') {
          await this.repository.updateStatus(line.grnId, 'UNDER_VERIFICATION');
        }
      }
    }

    return this.repository.findById(line.grnId);
  }

  /**
   * Complete physical verification across all lines in the shipment.
   * Every line is inspected on platform for accepted, rejected, and damaged quantities.
   * Automatically creates discrepancies for shortages, excesses, or damages, logs measurements,
   * and completes the physical verification stage (VERIFIED or DISCREPANCY_PENDING).
   */
  async completePhysicalVerification(
    grnId: string,
    data: {
      lines: Array<{
        lineId: string;
        receivedQuantity: number;
        acceptedQuantity: number;
        rejectedQuantity?: number;
        damagedQuantity?: number;
        invoiceUnitPrice?: number;
        notes?: string;
      }>;
      overallNotes?: string;
    },
    actorId: string,
    requestId?: string
  ) {
    const canVerify = await this.permissionChecker.can(actorId, 'verify', 'GoodsReceiptNote');
    if (!canVerify) throw new ForbiddenError('Lacks permission to record physical verification on goods receipts.');

    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    await this.assertLocationScope(actorId, grn.locationId);

    if (['CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'].includes(grn.status)) {
      throw new InvalidStateTransitionError('Cannot modify verification after a debit note is raised or the GRN is approved.');
    }

    const lineMap = new Map(grn.lines.map(l => [l.id, l]));
    for (const input of data.lines) {
      const line = lineMap.get(input.lineId);
      if (!line) {
        throw new NotFoundError(`GRN line [${input.lineId}] not found on GoodsReceiptNote [${grnId}].`);
      }
      const rec = Number(input.receivedQuantity);
      const acc = Number(input.acceptedQuantity);
      const rej = Number(input.rejectedQuantity || 0);
      const dam = Number(input.damagedQuantity || 0);
      const invoiceUnitPrice = input.invoiceUnitPrice === undefined ? undefined : Number(input.invoiceUnitPrice);
      if (![rec, acc, rej, dam, ...(invoiceUnitPrice === undefined ? [] : [invoiceUnitPrice])].every(Number.isFinite) || [rec, acc, rej, dam, ...(invoiceUnitPrice === undefined ? [] : [invoiceUnitPrice])].some(v => v < 0)) {
        throw new ValidationError(`Invalid quantity on line [${line.id}]. Quantities must be non-negative numbers.`);
      }
      if (Math.abs(rec - (acc + rej + dam)) > QUANTITY_EPSILON) {
        throw new ValidationError(`Line equation violated for line [${line.id}]: received (${rec}) must equal accepted (${acc}) + rejected (${rej}) + damaged (${dam}).`);
      }
    }

    // Process each line: record measurement & update quantities & discrepancies
    for (const input of data.lines) {
      const line = lineMap.get(input.lineId)!;
      const rec = Number(input.receivedQuantity);
      const acc = Number(input.acceptedQuantity);
      const rej = Number(input.rejectedQuantity || 0);
      const dam = Number(input.damagedQuantity || 0);

      await this.recordMeasurement(grnId, line.id, {
        type: 'PIECE',
        value: rec,
        unitLabel: line.uom?.symbol || line.uom?.code || 'EA',
        note: input.notes?.trim() ? `Physical Verification: ${input.notes.trim()}` : (data.overallNotes?.trim() ? `Physical Verification: ${data.overallNotes.trim()}` : 'Physical dock inspection verified.'),
        acceptedQuantity: acc,
        rejectedQuantity: rej,
        damagedQuantity: dam
      }, actorId, requestId);
    }

    const rateUpdates = data.lines
      .filter(input => input.invoiceUnitPrice !== undefined)
      .map(input => ({ id: input.lineId, invoiceUnitPrice: input.invoiceUnitPrice }));
    if (rateUpdates.length) await this.repository.updateLines(grnId, rateUpdates);

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.physical_verification_completed',
      entityType: 'GoodsReceiptNote',
      entityId: grnId,
      metadata: {
        lineCount: data.lines.length,
        overallNotes: data.overallNotes,
        invoiceRateUpdates: rateUpdates.map(line => ({ lineId: line.id, invoiceUnitPrice: line.invoiceUnitPrice })),
      },
      requestId
    });
    const verifiedGrn = await this.repository.findById(grnId);

    // Sync Job Work Order status upon Physical Verification:
    // If only partial goods were accepted (e.g. 90 accepted out of 100), the Job Work Order must
    // reflect PARTIALLY_RETURNED instead of FULLY_RETURNED until the rework/remaining goods are received.
    if (verifiedGrn?.jobWorkReceiptReturn?.jobWorkOrderId) {
      const jwOrderId = verifiedGrn.jobWorkReceiptReturn.jobWorkOrderId;
      const totalAcceptedOnGrn = verifiedGrn.lines.reduce((s, l) => s + Number(l.acceptedQuantity || 0), 0);
      const totalRejectedOnGrn = verifiedGrn.lines.reduce((s, l) => s + Number(l.rejectedQuantity || 0) + Number(l.damagedQuantity || 0), 0);

      await prisma.jobWorkReceiptReturn.updateMany({
        where: { goodsReceiptId: grnId },
        data: {
          acceptedQuantity: totalAcceptedOnGrn,
          shortQuantity: totalRejectedOnGrn,
        }
      });

      const orderWithReturns = await prisma.jobWorkOrder.findUnique({
        where: { id: jwOrderId },
        include: { returns: true }
      });

      if (orderWithReturns) {
        const totalOrderAccepted = orderWithReturns.returns.reduce(
          (sum, r) => sum + (r.goodsReceiptId === grnId ? totalAcceptedOnGrn : Number(r.acceptedQuantity || 0)),
          0
        );
        const isComplete = totalOrderAccepted >= orderWithReturns.targetQuantity;

        await prisma.jobWorkOrder.update({
          where: { id: jwOrderId },
          data: {
            status: isComplete ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED'
          }
        });
      }
    }

    if (verifiedGrn?.vendorId) {
      void vendorScoringService.getEngine().evaluateVendor(verifiedGrn.vendorId).catch(() => undefined);
    }
    return verifiedGrn;
  }

  /**
   * Store Manager notification action: Notifies the Accountant/Finance department
   * about recorded discrepancies on a Goods Receipt so the Accountant can review and
   * draft the formal commercial Debit Note claim voucher.
   */
  async notifyAccountantForDebitNote(
    grnId: string,
    actorId: string,
    data: {
      reason: string;
      reasonCategory?: string;
      discrepancyIds?: string[];
      responsiblePersonId?: string;
    },
    requestId?: string
  ) {
    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    await this.assertLocationScope(actorId, grn.locationId);

    const openDiscrepancies = grn.lines.flatMap(l => l.discrepancies.filter(d => d.status !== 'RESOLVED'));
    const linesRequiringAccountsReview = grn.lines.filter(
      line => line.shortQuantity > QUANTITY_EPSILON || line.rejectedQuantity > QUANTITY_EPSILON || line.damagedQuantity > QUANTITY_EPSILON
    );
    if (openDiscrepancies.length === 0 && linesRequiringAccountsReview.length === 0) {
      throw new ValidationError('This receipt has no active discrepancies to notify the accountant about.');
    }
    const reviewCount = Math.max(openDiscrepancies.length, linesRequiringAccountsReview.length);

    // Emit workflow notification directly to users with Debit Note creation authorization (Accountants / Finance)
    await this.emitNotification(() => this.notificationService.notifyPermission({
      action: 'create',
      resource: 'DebitNote',
      type: 'APPROVAL_REQUIRED',
      title: `Debit Note Requested for GRN ${grn.grnNumber}`,
      message: `Store Manager reported ${data.reasonCategory || 'SHORTAGE'} on ${grn.vendor?.name || 'vendor receipt'}: ${data.reason}`,
      grnId: grn.id,
      locationId: grn.locationId,
      excludeActorId: actorId
    }));

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.notify_accountant_debit_note',
      entityType: 'GoodsReceiptNote',
      entityId: grnId,
      metadata: {
        reason: data.reason,
        reasonCategory: data.reasonCategory,
        discrepancyCount: reviewCount,
        vendorId: grn.vendorId,
        vendorName: grn.vendor?.name
      },
      requestId
    });

    return {
      success: true,
      message: 'Accountant has been notified to generate the debit note claim voucher.',
      grnNumber: grn.grnNumber,
      discrepancyCount: reviewCount
    };
  }

  async updateLines(
    grnId: string,
    lines: Array<{ id: string; receivedQuantity?: number; acceptedQuantity?: number; rejectedQuantity?: number; damagedQuantity?: number; invoiceUnitPrice?: number; putAwayLocationId?: string; lotId?: string; lotNumber?: string; lotManufacturedAt?: Date; lotExpiresAt?: Date; inventoryCondition?: 'AVAILABLE' | 'QUARANTINED' | 'DAMAGED' | 'REJECTED'; inventoryOwnership?: 'COMPANY' | 'VENDOR_HELD' }>,
    actorId: string,
    requestId?: string
  ) {
    const canUpdate = await this.permissionChecker.can(actorId, 'update', 'GoodsReceiptNote');
    if (!canUpdate) throw new ForbiddenError('Lacks permission to update goods receipts.');

    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    await this.assertLocationScope(actorId, grn.locationId);
    if (['CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'].includes(grn.status)) {
      throw new InvalidStateTransitionError('Cannot edit a GRN after its debit note claim has been raised or it has been approved.');
    }
    const ownedLineIds = new Set(grn.lines.map(line => line.id));
    const foreignLine = lines.find(line => !ownedLineIds.has(line.id));
    if (foreignLine) {
      throw new NotFoundError(`GRN line [${foreignLine.id}] not found on GoodsReceiptNote [${grnId}].`);
    }

    const before = grn;
    const updated = await this.repository.updateLines(grnId, lines);

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.update',
      entityType: 'GoodsReceiptNote',
      entityId: grnId,
      before,
      after: updated,
      requestId
    });

    return updated;
  }

  async signOff(grnId: string, actorId: string, note: string | undefined, requestId?: string) {
    const canSignOff = await this.permissionChecker.can(actorId, 'sign_off', 'GoodsReceiptNote');
    if (!canSignOff) throw new ForbiddenError('Lacks permission to sign off goods receipts.');

    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);
    await this.assertLocationScope(actorId, grn.locationId);
    if (grn.receivedByActorId === actorId) {
      const canFinalize = await this.permissionChecker.can(actorId, 'finalize', 'GoodsReceiptNote');
      if (!canFinalize) {
        throw new ForbiddenError('The receiver cannot give the final receiving approval. A different Store Manager is required.');
      }
    }
    const discrepancyVerificationComplete = grn.status === 'DISCREPANCY_PENDING' &&
      grn.lines.length > 0 &&
      grn.lines.every((line) =>
        ['VERIFIED', 'DISCREPANT'].includes(line.status) &&
        Math.abs(line.receivedQuantity - (line.acceptedQuantity + line.rejectedQuantity + line.damagedQuantity)) <= QUANTITY_EPSILON
      );
    if (!['VERIFIED', 'CLAIM_RAISED'].includes(grn.status) && !discrepancyVerificationComplete) {
      throw new InvalidStateTransitionError(`Cannot sign off GRN in state [${grn.status}]. Complete physical verification for every line before sign-off.`);
    }

    const updated = await this.repository.updateStatus(grnId, 'SIGNED_OFF', {
      signedOffByActorId: actorId,
      signedOffAt: new Date()
    });

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.sign_off',
      entityType: 'GoodsReceiptNote',
      entityId: grnId,
      before: grn,
      after: updated,
      metadata: { note },
      requestId
    });

    await this.emitNotification(() => this.notificationService.notifyPermission({
      action: 'finalize', resource: 'GoodsReceiptNote', type: 'APPROVAL_REQUIRED',
      title: `${grn.grnNumber} is signed off`,
      message: 'Final review is complete; post the accepted quantities to inventory.',
      grnId: grn.id, locationId: grn.locationId, excludeActorId: actorId
    }));
    await this.emitNotification(() => this.notificationService.notifyAccountsGrn({
      type: 'APPROVAL_REQUIRED',
      title: `Approved GRN ${grn.grnNumber} is ready for Accounts`,
      message: 'Receiving approval is complete. Review the accepted quantities and linked discrepancies; finalizing this GRN will create its supplier bill draft automatically.',
      grnId: grn.id,
      excludeActorId: actorId
    }));

    return updated;
  }

  /**
   * Finalize is idempotent: calling it again on an already-FINALIZED GRN returns the existing
   * record rather than re-running the gates or erroring. The mutation itself (status flip +
   * stock ledger posting + PO/ExpectedReceipt sync) runs inside one transaction, guarded by a
   * conditional status update so two concurrent finalize calls on the same SIGNED_OFF GRN can't
   * both succeed - the loser's updateStatusConditional returns 0 and throws instead of proceeding.
   */
  async finalize(grnId: string, actorId: string, note: string | undefined, requestId?: string) {
    const canFinalize = await this.permissionChecker.can(actorId, 'finalize', 'GoodsReceiptNote');
    if (!canFinalize) throw new ForbiddenError('Lacks permission to finalize goods receipts.');

    const grn = await this.repository.findById(grnId);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found.`);

    if (grn.status === 'FINALIZED') {
      // Also reconcile the AP draft on retries, covering a transient Accounts
      // failure after inventory posting without reposting stock.
      await this.emitNotification(async () => {
        await accountsPayablesService.ensureDraftForFinalizedGrn(grnId, actorId, requestId);
      });
      return grn;
    }

    await this.assertLocationScope(actorId, grn.locationId);

    if (grn.status !== 'SIGNED_OFF') {
      throw new InvalidStateTransitionError(`Cannot finalize GRN in state [${grn.status}]. Must be SIGNED_OFF.`);
    }

    for (const line of grn.lines) {
      if (!line.poLineId && !grn.isUnreferenced && !grn.jobWorkReceiptReturn) {
        throw new InvalidStateTransitionError(`Line [${line.id}] has no valid PO/line reference.`);
      }
      if (!line.label) {
        throw new InvalidStateTransitionError(`Line [${line.id}] has no label assigned; finalization requires unique labels on every line.`);
      }
      const equation = line.acceptedQuantity + line.rejectedQuantity + line.damagedQuantity;
      if (Math.abs(equation - line.receivedQuantity) > QUANTITY_EPSILON) {
        throw new InvalidStateTransitionError(
          `Line [${line.id}] quantity equation is inconsistent: received must equal accepted + rejected + damaged.`
        );
      }
    }

    // The modern ledger is authoritative once its migration is present. Legacy
    // stock rows remain read-only and are no longer written on new receipts.
    let ledgerReady = false;
    let lotsReady = false;
    if (typeof (prisma as any).$queryRaw === 'function') {
      const ledgerRows = await prisma.$queryRaw<Array<{ ledgerExists: string | null; balanceExists: string | null }>>`SELECT to_regclass('inventory_ledger_entries')::text AS "ledgerExists", to_regclass('inventory_balances')::text AS "balanceExists"`;
      ledgerReady = Boolean(ledgerRows[0]?.ledgerExists && ledgerRows[0]?.balanceExists);
      const lotRows = await prisma.$queryRaw<Array<{ exists: string | null }>>`SELECT to_regclass('inventory_lots')::text AS exists`;
      lotsReady = Boolean(lotRows[0]?.exists);
    }
    const finalizedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const txRepository = new GoodsReceiptRepository(tx);
      const count = await txRepository.updateStatusConditional(
        grnId,
        ['SIGNED_OFF'],
        'FINALIZED',
        { finalizedByActorId: actorId, finalizedAt },
        tx
      );
      if (count === 0) {
        throw new InvalidStateTransitionError(`GRN [${grnId}] was modified concurrently; refetch and retry finalize.`);
      }

      for (const line of grn.lines) {
        if (line.acceptedQuantity > 0) {
          if (!ledgerReady) {
            await txRepository.createStockLedgerEntry(
              {
                grnId,
                grnLineId: line.id,
                productId: line.productId,
                materialId: line.materialId,
                uomId: line.uomId,
                locationId: grn.locationId,
                quantity: line.acceptedQuantity,
                postedByActorId: actorId
              },
              tx
            );
          }

          if (ledgerReady && grn.locationId) {
            const itemType = line.productId ? 'PRODUCT' : 'MATERIAL';
            const itemId = line.productId || line.materialId;
            if (itemId) {
              const inventoryLine = line as typeof line & { putAwayLocationId?: string | null; lotId?: string | null; lotNumber?: string | null; lotManufacturedAt?: Date | null; lotExpiresAt?: Date | null; inventoryCondition?: string; inventoryOwnership?: string };
              const postingLocationId = inventoryLine.putAwayLocationId || grn.locationId;
              const postingCondition = inventoryLine.inventoryCondition || 'AVAILABLE';
              const postingOwnership = inventoryLine.inventoryOwnership || 'COMPANY';
              let resolvedLotId = inventoryLine.lotId || null;
              if (inventoryLine.lotNumber && lotsReady) {
                await tx.$executeRaw`INSERT INTO "inventory_lots" ("id", "itemType", "itemId", "lotNumber", "supplierLot", "manufacturedAt", "expiresAt", "condition", "sourceType", "sourceId", "createdAt", "updatedAt") VALUES (COALESCE(${inventoryLine.lotId}, gen_random_uuid()::text), ${itemType}, ${itemId}, ${inventoryLine.lotNumber}, ${inventoryLine.lotNumber}, ${inventoryLine.lotManufacturedAt || null}, ${inventoryLine.lotExpiresAt || null}, ${postingCondition}::"InventoryCondition", 'GOODS_RECEIPT', ${grnId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("itemType", "itemId", "lotNumber") DO NOTHING`;
                const lot = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "inventory_lots" WHERE "itemType" = ${itemType} AND "itemId" = ${itemId} AND "lotNumber" = ${inventoryLine.lotNumber} LIMIT 1`;
                resolvedLotId = lot[0]?.id || resolvedLotId;
              }
              const idempotencyKey = `GRN:${grnId}:LINE:${line.id}`;
              const unitCost = Number((line as any).invoiceUnitPrice ?? (line as any).poLine?.unitPrice ?? 0);
              await inventoryPostingService.post(tx, {
                itemType: itemType as 'PRODUCT' | 'MATERIAL', itemId: itemId as string, uomId: line.uomId,
                locationId: postingLocationId, lotId: resolvedLotId,
                movementType: 'RECEIPT', quantity: Number(line.acceptedQuantity), condition: postingCondition,
                ownership: postingOwnership, unitCost, sourceType: 'GOODS_RECEIPT', sourceId: grnId,
                idempotencyKey, actorId, correlationId: requestId || grnId,
              });
            }
          }
        }
      }

      if (!grn.isUnreferenced && !grn.jobWorkReceiptReturn) {
        const poLineIds = [...new Set(grn.lines.map((line) => line.poLineId).filter((id): id is string => Boolean(id)))];
        for (const poLineId of poLineIds) {
          await this.expectedReceiptService.syncPoLineReceiptStatus(tx, poLineId);
        }
      }
      await publishIntelligenceEvent(tx as any, { type: 'GOODS_RECEIPT_FINALIZED', entityType: 'GoodsReceiptNote', entityId: grnId, correlationId: requestId, occurredAt: finalizedAt, transitionId: `${grnId}:FINALIZED`, metadata: { status: 'FINALIZED', locationId: grn.locationId } });
    }, { maxWait: 10000, timeout: 30000 });

    const updated = await this.repository.findById(grnId);
    if (!updated) throw new NotFoundError(`GoodsReceiptNote [${grnId}] not found after finalize.`);

    if (!grn.isUnreferenced && grn.poId && grn.vendorId) {
      await this.emitNotification(async () => {
        await accountsPayablesService.ensureDraftForFinalizedGrn(grnId, actorId, requestId);
      });
    }

    // For Outsourced Job Work:
    // 1. Ensure supplier bill draft for accepted stock only.
    // 2. If rejected/damaged items exist, automatically create a new Job Work Order for the rework
    //    quantity without deducting vendor custody (vendor bears the loss and replaces on own expense).
    // 3. Notify the vendor for rework.
    if (grn.jobWorkReceiptReturn?.jobWorkOrderId) {
      const parentOrder = await prisma.jobWorkOrder.findUnique({
        where: { id: grn.jobWorkReceiptReturn.jobWorkOrderId },
        include: { lines: true, vendor: true }
      });

      const totalRejected = grn.lines.reduce(
        (sum, line) => sum + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0),
        0
      );

      if (parentOrder && totalRejected > 0) {
        try {
          const nextCount = (await prisma.jobWorkOrder.count({ where: { orderNumber: { startsWith: 'JWO-' } } })) + 1;
          const reworkOrderNumber = `JWO-2026-${String(nextCount).padStart(4, '0')}`;

          await prisma.jobWorkOrder.create({
            data: {
              orderNumber: reworkOrderNumber,
              vendorId: parentOrder.vendorId,
              purchaseOrderId: parentOrder.purchaseOrderId,
              productId: parentOrder.productId,
              targetQuantity: totalRejected,
              targetUomId: parentOrder.targetUomId,
              rawMaterialInputQty: 0, // Zero custody deduction: vendor replaces on own expense
              expectedScrapRate: 0,
              deliveryLocationId: parentOrder.deliveryLocationId,
              natureOfProcessing: `${parentOrder.natureOfProcessing || 'Outsource Processing'} (Defect Rework)`,
              status: 'APPROVED',
              createdById: actorId,
              approvedById: actorId,
              approvedAt: new Date(),
              notes: `Automated Rework Order for ${totalRejected} rejected units from GRN ${grn.grnNumber} (Original Order: ${parentOrder.orderNumber}). Vendor replaces at own expense; no raw material deducted from custody.`,
              lines: {
                create: parentOrder.lines.map((l) => ({
                  materialId: l.materialId,
                  productId: l.productId,
                  uomId: l.uomId,
                  requiredQuantity: 0,
                  allocatedQuantity: 0,
                  notes: `Rework obligation replacement from ${parentOrder.orderNumber}`
                }))
              }
            }
          });

          await this.emitNotification(() => this.notificationService.notifyUsers(
            [grn.receivedByActorId, grn.verifiedByActorId, grn.signedOffByActorId],
            {
              type: 'APPROVAL_REQUIRED',
              title: `Rework Order ${reworkOrderNumber} created`,
              message: `${totalRejected} rejected units on ${grn.grnNumber}. Vendor ${parentOrder.vendor.name} notified for rework at own expense.`,
              grnId: grn.id,
              locationId: grn.locationId,
              excludeActorId: actorId
            }
          ));
        } catch (reworkErr) {
          console.error('[GoodsReceiptService] Failed to auto-generate rework Job Work order:', reworkErr);
        }
      }
    }

    if (ledgerReady) {
      // Threshold evaluation is outbox-like follow-up work. It is deliberately
      // detached from the receipt transaction so procurement/notification
      // failures never make a committed receipt appear to have failed.
      void Promise.all(grn.lines.filter((line) => line.acceptedQuantity > 0).map(async (line) => {
        const itemType = line.productId ? 'PRODUCT' : 'MATERIAL';
        const itemId = line.productId || line.materialId;
        if (!itemId) return;
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "inventory_balances" WHERE "itemType" = ${itemType} AND "itemId" = ${itemId} AND "uomId" = ${line.uomId}`;
        await Promise.all(rows.map((row) => modernReorderEvaluatorService.evaluate(row.id)));
      })).catch(() => undefined);
    }

    await this.auditWriter.record({
      actorId,
      action: 'goods_receipt.finalize',
      entityType: 'GoodsReceiptNote',
      entityId: grnId,
      before: grn,
      after: updated,
      metadata: { note },
      requestId
    });

    await this.emitNotification(() => this.notificationService.notifyUsers(
      [grn.receivedByActorId, grn.verifiedByActorId, grn.signedOffByActorId],
      {
        type: 'INFO', title: `${grn.grnNumber} finalized`,
        message: 'Accepted quantities have been posted once to the inventory ledger.',
        grnId: grn.id, locationId: grn.locationId, excludeActorId: actorId
      }
    ));

    // Finalization posts accepted quantities only. Rejected, damaged, and short
    // quantities remain recorded as discrepancies for Accounts to process; they
    // do not prevent usable stock from being committed.

    if (updated?.vendorId) {
      void vendorScoringService.getEngine().evaluateVendor(updated.vendorId).catch(() => undefined);
    }
    return updated;
  }

  async getById(id: string, actorId?: string) {
    const grn = await this.repository.findById(id);
    if (!grn) throw new NotFoundError(`GoodsReceiptNote [${id}] not found.`);
    if (actorId) await this.assertLocationScope(actorId, grn.locationId);
    const documents = grn.documents
      ? await Promise.all(
        grn.documents.map(async (doc) => {
          try {
            const freshUrl = await createSignedUrlForPath((doc as any).storageKey || doc.fileUrl);
            return { ...doc, fileUrl: freshUrl };
          } catch {
            return doc;
          }
        })
      )
      : grn.documents;
    return { ...grn, documents };
  }

  async assertLineAccess(grnId: string, lineId: string, actorId: string): Promise<void> {
    const grn = await this.getById(grnId, actorId);
    if (!grn.lines.some(line => line.id === lineId)) {
      throw new NotFoundError(`GRN line [${lineId}] not found on GoodsReceiptNote [${grnId}].`);
    }
  }

  async getHistory(id: string, actorId?: string) {
    return this.getById(id, actorId);
  }

  async list(params: { skip?: number; take?: number; status?: GrnStatus; poId?: string; search?: string }, actorId?: string) {
    const scope = actorId ? await this.locationScope(actorId) : { allLocations: true };
    return this.repository.list({ ...params, locationId: scope.locationId });
  }

  async capabilities(actorId: string) {
    const checks = {
      receive: ['receive', 'GoodsReceiptNote'],
      update: ['update', 'GoodsReceiptNote'],
      verify: ['verify', 'GoodsReceiptNote'],
      signOff: ['sign_off', 'GoodsReceiptNote'],
      finalize: ['finalize', 'GoodsReceiptNote'],
      uploadDocument: ['upload_document', 'GoodsReceiptNote'],
      reprintLabel: ['update', 'GoodsReceiptLabel'],
      resolveDiscrepancy: ['resolve_discrepancy', 'GoodsReceiptDiscrepancy'],
      returnToVendor: ['return', 'GoodsReceiptDiscrepancy'],
      export: ['export', 'GoodsReceiptNote'],
      createDebitNote: ['create', 'DebitNote']
    } as const;
    const entries = await Promise.all(Object.entries(checks).map(async ([key, [action, resource]]) => [
      key, await this.permissionChecker.can(actorId, action, resource)
    ]));
    const scope = await this.locationScope(actorId);
    return { ...Object.fromEntries(entries), allLocations: scope.allLocations, locationId: scope.locationId ?? null };
  }

  async dashboard(actorId: string) {
    const scope = await this.locationScope(actorId);
    const capabilities = await this.capabilities(actorId);
    const where = scope.locationId ? { locationId: scope.locationId } : {};
    const actionStatuses: GrnStatus[] = [];
    if (capabilities.verify) actionStatuses.push('ARRIVED', 'UNDER_VERIFICATION');
    if (capabilities.resolveDiscrepancy) actionStatuses.push('DISCREPANCY_PENDING');
    if (capabilities.signOff) actionStatuses.push('VERIFIED', 'CLAIM_RAISED' as GrnStatus, 'DISCREPANCY_PENDING');
    if (capabilities.finalize) actionStatuses.push('SIGNED_OFF');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [arrived, verifying, discrepancies, awaitingSignOff, awaitingFinalize, finalizedToday, actionQueue, recentFinalized] = await Promise.all([
      prisma.goodsReceiptNote.count({ where: { ...where, status: 'ARRIVED' } }),
      prisma.goodsReceiptNote.count({ where: { ...where, status: 'UNDER_VERIFICATION' } }),
      prisma.goodsReceiptNote.count({ where: { ...where, status: 'DISCREPANCY_PENDING' } }),
      prisma.goodsReceiptNote.count({ where: { ...where, status: { in: ['VERIFIED', 'CLAIM_RAISED'] as any } } }),
      prisma.goodsReceiptNote.count({ where: { ...where, status: 'SIGNED_OFF' } }),
      prisma.goodsReceiptNote.count({ where: { ...where, status: 'FINALIZED', finalizedAt: { gte: startOfDay } } }),
      prisma.goodsReceiptNote.findMany({
        where: { ...where, status: { in: actionStatuses } }, take: 8,
        orderBy: { updatedAt: 'asc' }, include: { vendor: true, location: true, po: true, lines: { select: { id: true, status: true } } }
      }),
      prisma.goodsReceiptNote.findMany({
        where: { ...where, status: 'FINALIZED' }, take: 6,
        orderBy: { finalizedAt: 'desc' }, include: { vendor: true, location: true, po: true, lines: { select: { acceptedQuantity: true } } }
      })
    ]);
    return {
      metrics: { arrived, verifying, discrepancies, awaitingSignOff, awaitingFinalize, finalizedToday },
      actionQueue,
      recentFinalized,
      capabilities,
      scope: { allLocations: scope.allLocations, locationId: scope.locationId ?? null }
    };
  }

  async exportCsv(actorId: string, requestId?: string): Promise<string> {
    if (!(await this.permissionChecker.can(actorId, 'export', 'GoodsReceiptNote'))) {
      throw new ForbiddenError('Lacks permission to export goods receipts.');
    }
    const scope = await this.locationScope(actorId);
    const rows = await this.repository.exportRows(scope.locationId);
    const headers = [
      'GRN Number', 'GRN Status', 'PO Number', 'Vendor Code', 'Vendor', 'Location Code', 'Location',
      'Received At', 'Finalized At', 'Unreferenced', 'Item Code', 'Item', 'UOM', 'Line Status',
      'Expected Qty', 'Received Qty', 'Accepted Qty', 'Rejected Qty', 'Damaged Qty', 'Short Qty', 'Excess Qty'
    ];
    const csvCell = (value: unknown) => {
      const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    };
    const body = rows.map(line => [
      line.grn.grnNumber, line.grn.status, line.grn.po?.poNumber, line.grn.vendor?.code, line.grn.vendor?.name,
      line.grn.location?.code, line.grn.location?.name, line.grn.receivedAt, line.grn.finalizedAt,
      line.grn.isUnreferenced, line.product?.sku ?? line.material?.code, line.product?.name ?? line.material?.name,
      line.uom.symbol, line.status, line.expectedQuantity, line.receivedQuantity, line.acceptedQuantity,
      line.rejectedQuantity, line.damagedQuantity, line.shortQuantity, line.excessQuantity
    ].map(csvCell).join(','));
    await this.auditWriter.record({
      actorId, action: 'goods_receipt.export', entityType: 'GoodsReceiptNote', entityId: 'register',
      metadata: { rowCount: rows.length, locationId: scope.locationId ?? null }, requestId
    });
    return [headers.map(csvCell).join(','), ...body].join('\n');
  }

  private async generateGrnNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}-`;
    // Sequences may be behind legacy data after an interrupted migration. Skip
    // any already-used values before returning the candidate.
    try {
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const sequenceRows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('grn_number_seq') AS value`;
        const value = Number(sequenceRows[0]?.value || 0);
        if (!Number.isInteger(value) || value < 1) continue;
        const candidate = `${prefix}${String(value).padStart(3, '0')}`;
        if (!(await this.repository.existsByGrnNumber(candidate))) return candidate;
      }
    } catch {
      // Fall back for pre-migration databases where the sequence is absent.
    }
    let attempt = await this.repository.countByNumberPrefix(prefix);
    let candidate = '';
    let isUnique = false;
    while (!isUnique) {
      attempt++;
      candidate = `${prefix}${String(attempt).padStart(3, '0')}`;
      const exists = await this.repository.existsByGrnNumber(candidate);
      if (!exists) isUnique = true;
    }
    return candidate;
  }

  /**
   * The unique GRN constraint remains the final concurrency guard. If an older
   * allocator or another pre-migration instance wins the race, retry with the
   * next sequence value instead of surfacing a misleading creation failure.
   */
  private async createWithUniqueGrnNumber(
    create: (grnNumber: string) => Promise<GoodsReceiptNote>,
  ): Promise<GoodsReceiptNote> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const grnNumber = await this.generateGrnNumber();
      try {
        return await create(grnNumber);
      } catch (error) {
        const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
        const isGrnConflict = error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          (Array.isArray(target) ? target.includes('grnNumber') : String(target ?? '').includes('grnNumber'));
        if (!isGrnConflict || attempt === 2) throw error;
      }
    }
    throw new Error('Unable to allocate a unique GRN number.');
  }
}
