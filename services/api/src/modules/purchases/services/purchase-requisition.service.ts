/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { PurchaseRequisition, ApprovalDecision, PrStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { UpdatePrInput } from '@plinth/validation';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { 
  NotFoundError, 
  InvalidStateTransitionError, 
  DuplicateError,
  ForbiddenError,
  ValidationError
} from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';

export class PurchaseRequisitionService {
  constructor(
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async createPR(
    data: {
      prNumber?: string;
      departmentId: string;
      preferredVendorId?: string;
      needDate: Date;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      businessJustification?: string;
      deliveryLocation?: string;
      costCenter?: string;
      projectCode?: string;
      requestedBudget?: number;
      notes?: string;
      lines: Array<{
        productId?: string;
        materialId?: string;
        uomId: string;
        requestedQuantity: number;
        estimatedUnitCost?: number;
        specifications?: string;
        preferredMake?: string;
        needDateOverride?: Date;
      }>;
    },
    actorId: string,
    options?: { requestId?: string }
  ): Promise<PurchaseRequisition> {
    const canRequest = await this.permissionChecker.can(actorId, 'request', 'PurchaseRequisition');
    if (!canRequest) throw new ForbiddenError(`Lacks permission to request PurchaseRequisition.`);

    let finalPrNumber = data.prNumber;
    if (!finalPrNumber) {
      const year = new Date().getFullYear();
      let isUnique = false;
      let attempt = 0;
      try { const sequenceRows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('pr_number_seq') AS value`; attempt = Number(sequenceRows[0]?.value || 1) - 1; } catch { attempt = await prisma.purchaseRequisition.count({ where: { prNumber: { startsWith: `PR-${year}-` } } }); }
      
      while (!isUnique) {
        attempt++;
        finalPrNumber = `PR-${year}-${String(attempt).padStart(4, '0')}`;
        const existing = await prisma.purchaseRequisition.findUnique({
          where: { prNumber: finalPrNumber }
        });
        if (!existing) isUnique = true;
      }
    } else {
      // 1. Hard duplicate check for prNumber
      const existing = await prisma.purchaseRequisition.findUnique({
        where: { prNumber: finalPrNumber }
      });
      if (existing) {
        throw new DuplicateError(`Purchase Requisition with number [${finalPrNumber}] already exists.`);
      }
    }

    // Requisitions for the same product/material are valid and intentionally
    // do not trigger a duplicate warning. Only the PR number itself is unique.
    if (data.preferredVendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: data.preferredVendorId } });
      if (!vendor || !['APPROVED', 'ACTIVE'].includes(vendor.status)) {
        throw new ValidationError('Preferred vendor must be an approved, active vendor.');
      }
    }

    // 3. Create the PR
    const pr = await prisma.purchaseRequisition.create({
      data: {
        prNumber: finalPrNumber as string,
        requesterId: actorId,
        departmentId: data.departmentId,
        preferredVendorId: data.preferredVendorId,
        needDate: data.needDate,
        priority: data.priority,
        businessJustification: data.businessJustification,
        deliveryLocation: data.deliveryLocation || 'Main Receiving Dock / Stores',
        costCenter: data.costCenter,
        projectCode: data.projectCode,
        requestedBudget: data.requestedBudget,
        notes: data.notes,
        status: 'DRAFT',
        lines: {
          create: data.lines.map(line => ({
            productId: line.productId,
            materialId: line.materialId,
            uomId: line.uomId,
            requestedQuantity: line.requestedQuantity,
            estimatedUnitCost: line.estimatedUnitCost,
            specifications: line.specifications,
            preferredMake: line.preferredMake,
            needDateOverride: line.needDateOverride
          }))
        }
      },
      include: { lines: true }
    });

    void this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.create',
      entityType: 'PurchaseRequisition',
      entityId: pr.id,
      after: pr,
      requestId: options?.requestId
    }).catch(() => undefined);

    void this.persistRevision(pr, actorId, false).catch(() => undefined);

    return pr;
  }

  async updatePR(id: string, data: UpdatePrInput['body'], actorId: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);

    // Preserve the exact pre-edit revision. This is best-effort while an older
    // installation is being migrated; deployed environments persist the snapshot
    // before applying the editable draft/change-request update.
    await this.persistRevision(pr, actorId, pr.status === 'CHANGES_REQUESTED');

    const canUpdate = await this.permissionChecker.can(actorId, 'request', 'PurchaseRequisition');
    if (!canUpdate) {
      throw new ForbiddenError(`Actor [${actorId}] lacks permission to update PurchaseRequisition.`);
    }

    const canAdminEdit = pr.status === 'SUBMITTED' && await this.permissionChecker.can(actorId, 'approve', 'PurchaseRequisition');
    if (pr.status !== 'DRAFT' && pr.status !== 'CHANGES_REQUESTED' && !canAdminEdit) {
      throw new InvalidStateTransitionError(
        `Cannot update PR from state [${pr.status}]. Editable states are DRAFT, CHANGES_REQUESTED, or SUBMITTED for an Admin.`,
        { currentStatus: pr.status }
      );
    }

    const wasReturned = pr.status === 'CHANGES_REQUESTED';
    const updated = await prisma.purchaseRequisition.update({
      where: { id },
      data: {
        ...(wasReturned ? { status: 'SUBMITTED', submittedAt: new Date(), approvalStage: 'STORE_REVIEW' as const } : {}),
        departmentId: data.departmentId,
        preferredVendorId: data.preferredVendorId,
        needDate: data.needDate,
        priority: data.priority,
        businessJustification: data.businessJustification,
        deliveryLocation: data.deliveryLocation,
        costCenter: data.costCenter,
        projectCode: data.projectCode,
        requestedBudget: data.requestedBudget,
        notes: data.notes,
        ...(data.lines ? {
          lines: {
            deleteMany: {},
            create: data.lines.map(line => ({
              productId: line.productId,
              materialId: line.materialId,
              uomId: line.uomId,
              requestedQuantity: line.requestedQuantity,
              estimatedUnitCost: line.estimatedUnitCost,
              specifications: line.specifications,
              preferredMake: line.preferredMake,
              needDateOverride: line.needDateOverride
            }))
          }
        } : {})
      },
      include: { lines: true }
    });

    if (wasReturned) {
      await this._notifyReviewers(
        ['store-manager', 'procurement-manager', 'procurement_manager', 'operations-manager', 'admin', 'super-admin'],
        'APPROVAL_REQUIRED',
        `${pr.prNumber} was revised and resubmitted`,
        `The requester updated the changes requested on ${pr.prNumber}. It is ready for review again.`,
        pr.id
      );
    }

    await this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.update',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      requestId
    });

    return updated;
  }

  private async persistRevision(pr: PurchaseRequisition, actorId: string, locked: boolean): Promise<void> {
    try {
      if (typeof (prisma as any).$queryRaw !== 'function' || typeof (prisma as any).$executeRaw !== 'function') return;
      const existing = await prisma.$queryRaw<Array<{ revisionNumber: number }>>`SELECT "revisionNumber" FROM "purchase_requisition_revisions" WHERE "prId" = ${pr.id} ORDER BY "revisionNumber" DESC LIMIT 1`;
      const revisionNumber = Number(existing[0]?.revisionNumber ?? 0) + 1;
      await prisma.$executeRaw`INSERT INTO "purchase_requisition_revisions" ("id", "prId", "revisionNumber", "snapshot", "createdBy", "isLocked", "submittedAt") VALUES (gen_random_uuid(), ${pr.id}, ${revisionNumber}, ${JSON.stringify(pr)}::jsonb, ${actorId}, ${locked}, ${pr.submittedAt})`;
    } catch {
      // Older databases may not have the additive revision table yet.
    }
  }

  async submitPR(id: string, actorId: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);
    
    // Authorization check
    const canSubmit = await this.permissionChecker.can(actorId, 'submit', 'PurchaseRequisition');
    if (!canSubmit) {
      throw new ForbiddenError(`Actor [${actorId}] lacks permission to submit PurchaseRequisition.`);
    }

    if (pr.status !== 'DRAFT' && pr.status !== 'CHANGES_REQUESTED') {
      throw new InvalidStateTransitionError(
        `Cannot submit PR from state [${pr.status}].`,
        { currentStatus: pr.status, targetStatus: 'SUBMITTED' }
      );
    }

    if (!pr.lines || pr.lines.length === 0) {
      throw new ValidationError(`Cannot submit PR without any lines.`);
    }
    if (!pr.preferredVendorId) throw new ValidationError('Select an approved vendor before submitting this requisition.');
    const deliveryLocation = pr.deliveryLocation || 'Main Receiving Dock / Stores';

    const updated = await prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        ...(!pr.deliveryLocation ? { deliveryLocation } : {}),
        ...(pr.approvalStage !== undefined ? { approvalStage: 'STORE_REVIEW' as const } : {}),
        submittedAt: new Date()
      }
    });

    // Notification fan-out is intentionally eventual: the PR state is already
    // committed, so a slow/contended notification query must not hold the
    // browser request open until its timeout. The notification itself remains
    // persisted and the SSE bridge refreshes clients when it is available.
    void this._notifyReviewers(
      ['store-manager', 'procurement-manager', 'procurement_manager', 'operations-manager', 'admin', 'super-admin'],
      'APPROVAL_REQUIRED',
      `Purchase requisition ${pr.prNumber} needs review`,
      `${pr.requester?.name || pr.requester?.email || 'An inventory manager'} submitted ${pr.prNumber}.`,
      pr.id
    ).catch(() => undefined);

    void this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.submit',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      requestId
    }).catch(() => undefined);

    return updated;
  }

  async approvePR(id: string, actorId: string, reason?: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);

    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'PurchaseRequisition');
    if (!canApprove) {
      throw new ForbiddenError(`Actor [${actorId}] lacks permission to approve PurchaseRequisition.`);
    }

    // Creator != Approver check
    if (pr.requesterId === actorId) {
      const canSelfApprove = await this.permissionChecker.can(actorId, 'self_approve', 'PurchaseRequisition');
      if (!canSelfApprove) {
        throw new ForbiddenError(`Actor [${actorId}] created this PR and cannot self-approve without explicit 'self_approve' authorization.`);
      }
    }

    if (pr.status !== 'SUBMITTED') {
      throw new InvalidStateTransitionError(
        `Cannot approve PR from state [${pr.status}]. Must be SUBMITTED.`,
        { currentStatus: pr.status, targetStatus: 'APPROVED' }
      );
    }

    // New production workflow: vendor-backed PRs are routed through Store Review
    // and Admin Review. Admin may final-approve at either stage; final approval
    // creates an approved PO atomically so users never re-enter PR data.
    if (pr.preferredVendorId) {
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { role: true, userRoles: { select: { role: { select: { name: true } } } } }
      });
      const roleNames = new Set(actor?.userRoles.map(item => item.role.name) ?? []);
      const isAdmin = actor?.role === 'admin' || roleNames.has('admin') || roleNames.has('super-admin');

      if (!isAdmin && pr.approvalStage === 'ADMIN_REVIEW') {
        throw new ForbiddenError('Final approval is restricted to an administrator.');
      }

      if (!isAdmin) {
        const [updated, approval] = await prisma.$transaction([
          prisma.purchaseRequisition.update({
            where: { id },
            data: { approvalStage: 'ADMIN_REVIEW' }
          }),
          prisma.procurementApproval.create({
            data: { prId: id, actorId, decision: ApprovalDecision.APPROVED, stage: 'STORE_REVIEW', reason }
          })
        ]);
        await this._notifyReviewers(
          ['admin', 'super-admin'],
          'APPROVAL_REQUIRED',
          `${pr.prNumber} is ready for final approval`,
          `Store review is complete. Admin approval will automatically create the purchase order.`,
          pr.id
        );
        await this.auditWriter.record({ actorId, action: 'purchase_requisition.store_approve', entityType: 'PurchaseRequisition', entityId: id, before: pr, after: updated, metadata: { approvalId: approval.id, reason }, requestId });
        return updated;
      }

      const finalPoNumber = await this._nextPoNumber();
      const poLines = pr.lines.map((line) => {
        const itemTax = line.productId ? line.product?.metadata : line.material?.specs;
        const taxFields = itemTax && typeof itemTax === 'object' && !Array.isArray(itemTax) ? itemTax as Record<string, unknown> : {};
        const taxability = String(taxFields.taxability ?? '').trim().toLowerCase();
        const parsedRate = Number(taxFields.gstRate ?? taxFields.taxRate ?? 0);
        const taxRate = taxability && taxability !== 'taxable' ? 0 : Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0;
        return { line, taxRate };
      });
      const subtotal = poLines.reduce((sum, { line }) => sum + line.requestedQuantity * Number(line.estimatedUnitCost || 0), 0);
      const taxAmount = poLines.reduce((sum, { line, taxRate }) => sum + line.requestedQuantity * Number(line.estimatedUnitCost || 0) * taxRate / 100, 0);
      const result = await prisma.$transaction(async tx => {
        // Claim the submitted PR before creating its PO. The conditional update
        // serializes concurrent Admin clicks and makes PO creation exactly once.
        const claim = await tx.purchaseRequisition.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'PO_CREATED', approvalStage: 'COMPLETED', approvedAt: new Date() } });
        if (claim.count !== 1) throw new InvalidStateTransitionError(`Purchase requisition [${id}] was already approved or changed; refresh before retrying.`);
        const po = await tx.purchaseOrder.create({
          data: {
            poNumber: finalPoNumber,
            vendorId: pr.preferredVendorId as string,
            prId: id,
            status: 'DRAFT',
            currency: pr.preferredVendor?.currency || 'INR',
            paymentTerms: pr.preferredVendor?.paymentTerms,
            deliveryLocation: pr.deliveryLocation,
            subtotal,
            taxAmount,
            totalAmount: subtotal + taxAmount,
            lines: {
              create: poLines.map(({ line, taxRate }) => ({
                productId: line.productId,
                materialId: line.materialId,
                uomId: line.uomId,
                quantity: line.requestedQuantity,
                needDate: line.needDateOverride || pr.needDate,
                unitPrice: Number(line.estimatedUnitCost || 0),
                taxRate,
                lineTotal: line.requestedQuantity * Number(line.estimatedUnitCost || 0)
              }))
            }
          }
        });
        const updated = await tx.purchaseRequisition.update({
          where: { id },
          data: { status: 'PO_CREATED', approvalStage: 'COMPLETED', approvedAt: new Date() }
        });
        const validActorId = await this._resolveValidActorId(actorId);
        const approval = await tx.procurementApproval.create({
          data: { prId: id, actorId: validActorId, decision: ApprovalDecision.APPROVED, stage: 'ADMIN_REVIEW', reason }
        });
        return { updated, po, approval };
      });

      const finalPo = await prisma.purchaseOrder.findUnique({ where: { id: result.po.id }, include: { lines: true, vendor: true } }) || result.po;

      await this._notifyUsers(
        [pr.requesterId],
        'APPROVED',
        `${pr.prNumber} approved — ${finalPo.poNumber} created`,
        `Final approval is complete. Draft purchase order ${finalPo.poNumber} is ready for Admin review and confirmation before vendor dispatch.`,
        `/procurement/purchase-orders/${finalPo.id}`,
        finalPo.id,
        'PurchaseOrder'
      );
      await this.auditWriter.record({ actorId, action: 'purchase_requisition.final_approve_and_create_po', entityType: 'PurchaseRequisition', entityId: id, before: pr, after: result.updated, metadata: { approvalId: result.approval.id, purchaseOrderId: finalPo.id, poNumber: finalPo.poNumber, reason }, requestId });
      return result.updated;
    }

    const [updated, approval] = await prisma.$transaction([
      prisma.purchaseRequisition.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date()
        }
      }),
      prisma.procurementApproval.create({
        data: {
          prId: id,
          actorId,
          decision: ApprovalDecision.APPROVED,
          reason
        }
      })
    ]);

    await this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.approve',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      metadata: { approvalId: approval.id, reason },
      requestId
    });

    await this._notifyUsers(
      [pr.requesterId],
      'APPROVED',
      `Requisition Approved (${pr.prNumber})`,
      `Purchase requisition ${pr.prNumber} has been approved.`,
      `/procurement/requisitions/${id}`,
      id,
      'PurchaseRequisition'
    );

    return updated;
  }

  async rejectPR(id: string, actorId: string, reason: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);

    const canReject = await this.permissionChecker.can(actorId, 'reject', 'PurchaseRequisition');
    if (!canReject) throw new ForbiddenError(`Lacks permission to reject PR.`);

    if (pr.status !== 'SUBMITTED') {
      throw new InvalidStateTransitionError(`Cannot reject PR from state [${pr.status}].`);
    }

    if (!reason) {
      throw new ValidationError(`Rejecting a PR requires a reason.`);
    }

    const [updated, approval] = await prisma.$transaction([
      prisma.purchaseRequisition.update({
        where: { id },
        data: { status: 'REJECTED' }
      }),
      prisma.procurementApproval.create({
        data: {
          prId: id,
          actorId,
          decision: ApprovalDecision.REJECTED,
          reason
        }
      })
    ]);

    await this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.reject',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      metadata: { approvalId: approval.id, reason },
      requestId
    });

    await this._notifyUsers(
      [pr.requesterId],
      'CHANGES_REQUESTED',
      `Requisition Rejected (${pr.prNumber})`,
      `Purchase requisition ${pr.prNumber} was rejected. Reason: ${reason}`,
      `/procurement/requisitions/${id}`,
      id,
      'PurchaseRequisition'
    );

    return updated;
  }

  async requestChangesPR(id: string, actorId: string, reason: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);

    const canRequestChanges = await this.permissionChecker.can(actorId, 'request_changes', 'PurchaseRequisition');
    if (!canRequestChanges) throw new ForbiddenError(`Lacks permission to request changes on PR.`);

    if (pr.status !== 'SUBMITTED') {
      throw new InvalidStateTransitionError(`Cannot request changes on PR from state [${pr.status}].`);
    }

    if (!reason) {
      throw new ValidationError(`Requesting changes requires a reason.`);
    }

    const [updated, approval] = await prisma.$transaction([
      prisma.purchaseRequisition.update({
        where: { id },
        data: {
          status: 'CHANGES_REQUESTED',
          ...(pr.approvalStage !== undefined ? { approvalStage: 'RETURNED' as const } : {})
        }
      }),
      prisma.procurementApproval.create({
        data: {
          prId: id,
          actorId,
          decision: ApprovalDecision.CHANGES_REQUESTED,
          reason
        }
      })
    ]);

    await this._notifyUsers([pr.requesterId], 'CHANGES_REQUESTED', `Changes requested for ${pr.prNumber}`, reason, `/procurement/requisitions/${id}`, id);

    await this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.request_changes',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      metadata: { approvalId: approval.id, reason },
      requestId
    });

    return updated;
  }

  async cancelPR(id: string, actorId: string, requestId?: string): Promise<PurchaseRequisition> {
    const pr = await this._getPR(id);

    const canCancel = await this.permissionChecker.can(actorId, 'cancel', 'PurchaseRequisition');
    if (!canCancel) throw new ForbiddenError(`Lacks permission to cancel PR.`);

    // Can cancel if it's DRAFT, CHANGES_REQUESTED, SUBMITTED, APPROVED (but not if already PO'd, etc. which we'd check if we linked them back tightly, but for now just basic states)
    if (['REJECTED', 'CANCELLED'].includes(pr.status)) {
      throw new InvalidStateTransitionError(`PR is already in terminal state [${pr.status}].`);
    }

    // Check if it has any linked PurchaseOrders that aren't cancelled
    const linkedPOs = await prisma.purchaseOrder.findMany({
      where: { prId: id, status: { not: 'CANCELLED' } }
    });
    if (linkedPOs.length > 0) {
      throw new InvalidStateTransitionError(`Cannot cancel PR because it has active Purchase Orders linked to it.`);
    }

    const updated = await prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    await this.auditWriter.record({
      actorId,
      action: 'purchase_requisition.cancel',
      entityType: 'PurchaseRequisition',
      entityId: id,
      before: pr,
      after: updated,
      requestId
    });

    return updated;
  }

  async getPR(id: string): Promise<PurchaseRequisition> {
    return this._getPR(id);
  }

  async listRevisions(id: string) {
    await this._getPR(id);
    try {
      return await prisma.$queryRaw`SELECT "id", "prId", "revisionNumber", "snapshot", "createdBy", "createdAt", "submittedAt", "isLocked" FROM "purchase_requisition_revisions" WHERE "prId" = ${id} ORDER BY "revisionNumber" DESC`;
    } catch {
      return [];
    }
  }

  async recommendVendors(id: string, actorId: string, requestId?: string) {
    const pr = await this._getPR(id);
    if (pr.preferredVendorId || !['DRAFT', 'CHANGES_REQUESTED'].includes(pr.status)) {
      throw new InvalidStateTransitionError('Vendor recommendations are locked after vendor selection or PR submission.');
    }
    const vendors: any[] = await (prisma as any).vendor.findMany({ where: { status: { in: ['APPROVED', 'ACTIVE'] } }, include: { _count: { select: { PurchaseOrder: true, goodsReceiptNotes: true } } }, take: 100 });
    const candidates = vendors.map(vendor => ({ vendorId: vendor.id, vendorCode: vendor.code, vendorName: vendor.name, deterministicScore: Math.round(Math.min(100, 60 + (vendor._count?.PurchaseOrder ?? 0) * 2 + (vendor._count?.goodsReceiptNotes ?? 0))), rationale: (vendor._count?.PurchaseOrder ?? 0) ? 'Established PO and receipt history' : 'Approved supplier with no prior receipt history' }));
    candidates.sort((a, b) => b.deterministicScore - a.deterministicScore);
    let advisory = candidates.slice(0, 5).map((candidate, index) => ({ ...candidate, rank: index + 1, aiReason: candidate.rationale }));
    const key = process.env.OPENROUTER_API_KEY;
    if (key && config.openRouterVendorAdvisoryEnabled && config.openRouterVendorModel && advisory.length) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.openRouterVendorModel, messages: [{ role: 'user', content: `Rank these eligible vendors for a requisition. Advisory only; preserve deterministic scores and return JSON array of {vendorId,reason}. Requirements: ${JSON.stringify({ needDate: pr.needDate, priority: pr.priority, lines: pr.lines.map(line => ({ productId: line.productId, materialId: line.materialId, quantity: line.requestedQuantity, uomId: line.uomId })) })}. Candidates: ${JSON.stringify(advisory.map(({ vendorId, vendorName, deterministicScore }) => ({ vendorId, vendorName, deterministicScore })))}.` }], response_format: { type: 'json_schema', json_schema: { name: 'vendor_advice', strict: true, schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { vendorId: { type: 'string' }, reason: { type: 'string' } }, required: ['vendorId', 'reason'] } } } } }) });
        if (response.ok) { const body: any = await response.json(); const parsed = JSON.parse(body?.choices?.[0]?.message?.content || '[]'); advisory = advisory.map(candidate => ({ ...candidate, aiReason: parsed.find((item: any) => item.vendorId === candidate.vendorId)?.reason || candidate.aiReason })); }
      } catch { /* AI is advisory; deterministic ranking remains available. */ }
    }
    // Persist the run and candidates for auditability and later score-history
    // analysis. Compatibility installations can still serve the live ranking
    // while the additive migration is being rolled out.
    void (async () => { try {
      // A vendor may be selected while the advisory provider is responding.
      // Re-check the requisition before writing a recommendation snapshot so a
      // completed selection always remains the terminal recommendation state.
      const latest = await prisma.purchaseRequisition.findUnique({ where: { id }, select: { preferredVendorId: true, status: true } });
      if (!latest || latest.preferredVendorId || !['DRAFT', 'CHANGES_REQUESTED'].includes(latest.status)) return;
      const runId = randomUUID();
      const model = key && config.openRouterVendorAdvisoryEnabled ? config.openRouterVendorModel || null : null;
      const inputSnapshot = { needDate: pr.needDate, priority: pr.priority, lines: pr.lines.map(line => ({ productId: line.productId, materialId: line.materialId, quantity: line.requestedQuantity, uomId: line.uomId })) };
      await prisma.$executeRaw`INSERT INTO "vendor_recommendation_runs" ("id", "prId", "requestedBy", "modelId", "promptVersion", "status", "inputSnapshot", "output", "completedAt") VALUES (${runId}, ${id}, ${actorId}, ${model}, 'vendor-ranking-v1', 'COMPLETED'::"AiRunStatus", ${JSON.stringify(inputSnapshot)}::jsonb, ${JSON.stringify(advisory)}::jsonb, CURRENT_TIMESTAMP)`;
      if (advisory.length) {
        const rows = advisory.map(candidate => Prisma.sql`(${randomUUID()}, ${runId}, ${candidate.vendorId}, ${candidate.deterministicScore}, ${candidate.rank}, ${candidate.aiReason})`);
        await prisma.$executeRaw(Prisma.sql`INSERT INTO "vendor_recommendation_candidates" ("id", "runId", "vendorId", "deterministicScore", "aiRank", "explanation") VALUES ${Prisma.join(rows)}`);
      }
      await this.auditWriter.record({ actorId, action: 'purchase_requisition.vendor_recommendations', entityType: 'PurchaseRequisition', entityId: id, metadata: { candidateCount: advisory.length, model: model || 'deterministic-only' }, requestId });
    } catch { /* migration is deployed independently; live advisory remains usable */ } })();
    return { prId: id, generatedAt: new Date(), advisoryOnly: true, candidates: advisory };
  }

  async selectVendor(id: string, vendorId: string, actorId: string, overrideReason?: string, requestId?: string) {
    const pr = await this._getPR(id);
    if (!(await this.permissionChecker.can(actorId, 'request', 'PurchaseRequisition'))) throw new ForbiddenError('Lacks permission to select a vendor for this requisition.');
    const canAdminEdit = pr.status === 'SUBMITTED' && await this.permissionChecker.can(actorId, 'approve', 'PurchaseRequisition');
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(pr.status) && !canAdminEdit) throw new InvalidStateTransitionError(`Vendor selection is locked in state [${pr.status}].`);
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || !['APPROVED', 'ACTIVE'].includes(vendor.status)) throw new ValidationError('Selected vendor must be approved and active.');
    let recommended = false;
    try {
      const rows = await prisma.$queryRaw<Array<{ vendorId: string }>>`SELECT c."vendorId" FROM "vendor_recommendation_candidates" c JOIN "vendor_recommendation_runs" r ON r."id" = c."runId" WHERE r."prId" = ${id} ORDER BY r."createdAt" DESC LIMIT 5`;
      recommended = rows.some(row => row.vendorId === vendorId);
    } catch { /* recommendation history is optional during migration */ }
    if (!recommended && !overrideReason?.trim()) throw new ValidationError('Selecting outside the recommended shortlist requires an audited reason.');
    const updated = await prisma.purchaseRequisition.update({ where: { id }, data: { preferredVendorId: vendorId } });
    await this.persistRevision(updated, actorId, false);
    await this.auditWriter.record({ actorId, action: 'purchase_requisition.vendor_selected', entityType: 'PurchaseRequisition', entityId: id, after: updated, metadata: { vendorId, recommended, overrideReason: overrideReason?.trim() || null }, requestId });
    return updated;
  }

  async getNextPrNumber(): Promise<{ nextNumber: string }> {
    const year = new Date().getFullYear();
    let isUnique = false;
    let attempt = await prisma.purchaseRequisition.count({
      where: { prNumber: { startsWith: `PR-${year}-` } }
    });
    let nextNumber = '';
    while (!isUnique) {
      attempt++;
      nextNumber = `PR-${year}-${String(attempt).padStart(4, '0')}`;
      const existing = await prisma.purchaseRequisition.findUnique({
        where: { prNumber: nextNumber }
      });
      if (!existing) isUnique = true;
    }
    return { nextNumber };
  }

  async listPRs(options: { skip?: number; take?: number; status?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; startDate?: string; endDate?: string }): Promise<{ items: PurchaseRequisition[]; total: number }> {
    const where: import('@prisma/client').Prisma.PurchaseRequisitionWhereInput = {};
    if (options.status) where.status = options.status as PrStatus;
    if (options.search) {
      where.OR = [
        { prNumber: { contains: options.search, mode: 'insensitive' } },
        { notes: { contains: options.search, mode: 'insensitive' } }
      ];
    }
    
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = new Date(options.startDate);
      if (options.endDate) where.createdAt.lte = new Date(options.endDate);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = { createdAt: 'desc' }; // default
    if (options.sortBy) {
      const direction = options.sortOrder === 'asc' ? 'asc' : 'desc';
      switch (options.sortBy) {
        case 'prNumber':
          orderBy = { prNumber: direction };
          break;
        case 'department':
          orderBy = { department: { name: direction } };
          break;
        case 'needDate':
          orderBy = { needDate: direction };
          break;
        case 'lines':
          orderBy = { lines: { _count: direction } };
          break;
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    const [items, total] = await Promise.all([
      prisma.purchaseRequisition.findMany({
        where,
        skip: options.skip,
        take: options.take,
        include: {
          lines: {
            select: { id: true }
          },
          department: true,
          preferredVendor: { select: { id: true, code: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          purchaseOrders: { select: { id: true, poNumber: true, status: true, createdAt: true } }
        },
        orderBy
      }),
      prisma.purchaseRequisition.count({ where })
    ]);
    return { items, total };
  }

  private async _getPR(id: string) {
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: true,
            material: true,
            uom: true
          }
        },
        department: true,
        preferredVendor: true,
        requester: { select: { id: true, name: true, email: true } },
        purchaseOrders: { select: { id: true, poNumber: true, status: true, createdAt: true } },
        approvals: {
          include: {
            actor: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });
    if (!pr) throw new NotFoundError(`PurchaseRequisition [${id}] not found.`);
    return pr;
  }

  private async _nextPoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    try { const sequenceRows = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('po_number_seq') AS value`; const value = Number(sequenceRows[0]?.value || 0); return `PO-${year}-${String(value).padStart(5, '0')}`; } catch { const count = await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${year}-` } } }); return `PO-${year}-${String(count + 1).padStart(5, '0')}`; }
  }

  private async _notifyReviewers(roleNames: string[], type: 'APPROVAL_REQUIRED', title: string, message: string, resourceId: string) {
    const userClient = (prisma as typeof prisma & { user?: typeof prisma.user }).user;
    if (!userClient?.findMany) throw new Error('Prisma User client is unavailable; cannot resolve notification recipients.');
    // Support both the canonical RBAC slugs and legacy role labels created by
    // earlier seeds (for example "Store Manager" or "store_manager").
    const aliases = new Set<string>();
    for (const roleName of roleNames) {
      const normalized = roleName.trim().toLowerCase();
      aliases.add(normalized);
      aliases.add(normalized.replaceAll('-', '_'));
      aliases.add(normalized.replaceAll('-', ' '));
      aliases.add(normalized.replaceAll('_', '-'));
    }
    const users = await userClient.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { in: ['admin', 'manager'] } },
          { userRoles: { some: { role: { name: { in: [...aliases] } } } } },
          // Permission-driven fallback keeps notifications working for custom
          // roles (for example "Operations Manager") whose display name does
          // not match the canonical store-manager slug.
          { userRoles: { some: { role: { permissions: { some: { permission: { action: 'approve', resource: 'PurchaseRequisition' } } } } } } }
        ]
      },
      select: { id: true }
    });
    await this._notifyUsers(users.map(user => user.id), type, title, message, `/procurement/requisitions/${resourceId}`, resourceId);
  }

  private async _notifyUsers(userIds: string[], type: 'APPROVAL_REQUIRED' | 'APPROVED' | 'CHANGES_REQUESTED', title: string, message: string, href: string, resourceId: string, resource = 'PurchaseRequisition') {
    const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!recipients.length) return;
    await notificationService.notifyUsers({
      recipientIds: recipients,
      type,
      title,
      message,
      href,
      resource,
      resourceId
    });
  }

  private async _resolveValidActorId(actorId: string): Promise<string> {
    if (!actorId || actorId === 'system') {
      const fallback = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      if (fallback) return fallback.id;
    }
    const user = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
    if (user) return user.id;
    const fallback = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    return fallback?.id || actorId;
  }
}
