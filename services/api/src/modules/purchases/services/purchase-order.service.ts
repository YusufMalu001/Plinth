import { PurchaseOrder, ApprovalDecision, PoStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';
import { 
  NotFoundError, 
  InvalidStateTransitionError, 
  ForbiddenError,
  ValidationError,
  DuplicateError
} from '../../../common/errors/AppError';
import { notificationService } from '../../notifications/notification.service';
import { purchaseOrderEmailService } from './purchase-order-email.service';
import { VendorScoringEngine } from '../../master-data/services/vendor-scoring-engine.service';

const vendorScoringEngine = new VendorScoringEngine(prisma);

function itemTaxRate(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const item = value as Record<string, unknown>;
  const taxability = String(item.taxability ?? '').trim().toLowerCase();
  if (taxability && taxability !== 'taxable') return 0;
  const rate = Number(item.gstRate ?? item.taxRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

async function getItemTaxRate(productId?: string, materialId?: string): Promise<number> {
  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { metadata: true } });
    return itemTaxRate(product?.metadata);
  }
  if (materialId) {
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { specs: true } });
    return itemTaxRate(material?.specs);
  }
  return 0;
}

export class PurchaseOrderService {
  constructor(
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async generatePO(
    data: {
      poNumber?: string;
      prId?: string;
      vendorId: string;
      departmentId?: string;
      needDate?: Date;
      priority?: string;
      costCenter?: string;
      projectCode?: string;
      requestedBudget?: number;
      notes?: string;
      businessJustification?: string;
      paymentTerms?: string;
      deliveryLocation?: string;
      dispatchedThrough?: string;
      otherReferences?: string;
      termsOfDelivery?: string;
      lines: Array<{
        productId?: string;
        materialId?: string;
        uomId: string;
        quantity: number;
        unitPrice?: number;
        needDate: Date;
      }>;
    },
    actorId: string,
    requestId?: string
  ): Promise<PurchaseOrder> {
    const canCreate = await this.permissionChecker.can(actorId, 'create', 'PurchaseOrder');
    if (!canCreate) throw new ForbiddenError(`Lacks permission to create PO.`);

    let finalPoNumber = data.poNumber?.trim() || undefined;
    if (!finalPoNumber) {
      const year = new Date().getFullYear();
      let isUnique = false;
      const existingNumbers = await prisma.purchaseOrder.findMany({
        where: { poNumber: { startsWith: `PO-${year}-` } },
        select: { poNumber: true },
      });
      let attempt = existingNumbers.reduce((max, row) => {
        const suffix = Number(row.poNumber.slice(`PO-${year}-`.length));
        return Number.isSafeInteger(suffix) && suffix > max ? suffix : max;
      }, 0);
      
      while (!isUnique) {
        attempt++;
        finalPoNumber = `PO-${year}-${String(attempt).padStart(3, '0')}`;
        const existing = await prisma.purchaseOrder.findUnique({
          where: { poNumber_revisionNumber: { poNumber: finalPoNumber, revisionNumber: 1 } }
        });
        if (!existing) isUnique = true;
      }
    } else {
      const existing = await prisma.purchaseOrder.findUnique({
        where: { poNumber_revisionNumber: { poNumber: finalPoNumber, revisionNumber: 1 } }
      });
      if (existing) throw new DuplicateError(`PO with number [${finalPoNumber}] already exists.`);
    }

    if (data.lines.length === 0) {
      throw new ValidationError('At least one PO line is required.');
    }

    for (const line of data.lines) {
      const hasProduct = Boolean(line.productId);
      const hasMaterial = Boolean(line.materialId);
      if (!hasProduct && !hasMaterial) {
        throw new ValidationError('Each PO line must reference a product or material.');
      }

    }

    // 2. Validate Vendor live
    const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
    if (!vendor) throw new NotFoundError(`Vendor not found.`);
    if (vendor.status !== 'ACTIVE' && vendor.status !== 'APPROVED') {
      throw new ValidationError(`Vendor must be active before a purchase order can be created.`);
    }

    // 3. Validate Products/Materials live
    for (const line of data.lines) {
      if (line.productId) {
        const product = await prisma.product.findUnique({ where: { id: line.productId } });
        if (!product) throw new NotFoundError(`Product [${line.productId}] not found.`);
        if (product.status !== 'APPROVED' && product.status !== 'ACTIVE') {
          throw new ValidationError(`Product [${line.productId}] is not APPROVED/ACTIVE.`);
        }
      }
      if (line.materialId) {
        const material = await prisma.material.findUnique({ where: { id: line.materialId } });
        if (!material) throw new NotFoundError(`Material [${line.materialId}] not found.`);
        if (material.status !== 'APPROVED' && material.status !== 'ACTIVE') {
          throw new ValidationError(`Material [${line.materialId}] is not APPROVED/ACTIVE.`);
        }
      }
    }

    const linesWithTax = await Promise.all(data.lines.map(async (line) => ({ ...line, taxRate: await getItemTaxRate(line.productId, line.materialId) })));
    const subtotal = linesWithTax.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0), 0);
    const taxAmount = linesWithTax.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0) * line.taxRate / 100, 0);
    const totalAmount = subtotal + taxAmount;

    const po = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
      data: {
        poNumber: finalPoNumber as string,
        vendorId: data.vendorId,
        prId: data.prId,
        status: 'DRAFT',
        revisionNumber: 1,
        paymentTerms: data.paymentTerms,
        deliveryLocation: data.deliveryLocation,
        dispatchedThrough: data.dispatchedThrough,
        otherReferences: data.otherReferences,
        termsOfDelivery: data.termsOfDelivery,
        subtotal,
        taxAmount,
        totalAmount,
        lines: {
          create: linesWithTax.map(l => ({
            productId: l.productId,
            materialId: l.materialId,
            uomId: l.uomId,
            quantity: l.quantity,
            unitPrice: Number(l.unitPrice || 0),
            taxRate: l.taxRate,
            lineTotal: l.quantity * Number(l.unitPrice || 0),
            needDate: l.needDate
          }))
        }
      },
      include: { lines: true }
      });
      await publishIntelligenceEvent(tx as any, { type: 'PO_CREATED', entityType: 'PurchaseOrder', entityId: created.id, correlationId: requestId, occurredAt: created.createdAt, transitionId: created.id, metadata: { status: created.status, vendorId: created.vendorId } });
      return created;
    });

    await this.auditWriter.record({
      actorId,
      action: 'purchase_order.create',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      after: po,
      metadata: { departmentId: data.departmentId, needDate: data.needDate, priority: data.priority, costCenter: data.costCenter, projectCode: data.projectCode, requestedBudget: data.requestedBudget, notes: data.notes, businessJustification: data.businessJustification },
      requestId
    });

    const userClient = (prisma as typeof prisma & { user?: typeof prisma.user }).user;
    const actor = userClient?.findUnique ? await userClient.findUnique({
      where: { id: actorId },
      select: { role: true, userRoles: { select: { role: { select: { name: true } } } } }
    }) : null;
    const normalizeRole = (role: unknown) => String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const roleNames = new Set(actor?.userRoles.map(item => normalizeRole(item.role.name)) ?? []);
    const isAdmin = normalizeRole(actor?.role) === 'admin' || roleNames.has('admin') || roleNames.has('super_admin');

    if (isAdmin) {
      await notificationService.createAndDispatch({
        recipientId: actorId,
        type: 'WORKFLOW',
        title: `Purchase Order Draft Created (${po.poNumber})`,
        message: `Your PO ${po.poNumber} is saved as a draft. Review or edit it, then confirm to send it to the vendor.`,
        resource: 'PurchaseOrder',
        resourceId: po.id,
        href: `/procurement/purchase-orders/${po.id}`
      });
      return po;
    }

    // Store Manager created PO awaiting approval
    await notificationService.notifyRoles({
      roles: ['admin'],
      type: 'APPROVAL_REQUIRED',
      title: `Purchase Order Awaiting Approval (${po.poNumber})`,
      message: `${po.poNumber} was created by a non-admin user and is awaiting Admin approval.`,
      resource: 'PurchaseOrder',
      resourceId: po.id,
      href: `/procurement/purchase-orders/${po.id}`
    });
    await notificationService.createAndDispatch({
      recipientId: actorId,
      type: 'WORKFLOW',
      title: `Purchase Order Submitted (${po.poNumber})`,
      message: `Your PO ${po.poNumber} was created and submitted for Admin approval.`,
      resource: 'PurchaseOrder',
      resourceId: po.id,
      href: `/procurement/purchase-orders/${po.id}`
    });
    return po;
  }

  async recommendVendorsForOrder(input: { needDate?: Date; priority?: string; lines: Array<{ materialId?: string; quantity: number; unitPrice?: number }> }) {
    type VendorRow = { id: string; code: string; name: string };
    const vendors = await prisma.vendor.findMany({
      where: { status: { in: ['APPROVED', 'ACTIVE'] } },
      select: { id: true, code: true, name: true },
      take: 100
    }) satisfies VendorRow[];

    // Evaluate each vendor using the canonical scoring engine (same logic as scorecard/directory)
    const policy = await vendorScoringEngine.getActivePolicy();
    const scored = await Promise.all(
      vendors.map(async (vendor) => {
        let deterministicScore = 50; // neutral fallback when no scorecard data
        let rationale = 'Approved supplier with limited history';
        try {
          const ev = await vendorScoringEngine.evaluateVendor(vendor.id, { policy });
          deterministicScore = ev.overallScore ?? 50;
          rationale = ev.confidenceStatus === 'SUFFICIENT_EVIDENCE'
            ? 'Scored from verified delivery, quality and compliance history'
            : ev.confidenceStatus === 'PROVISIONAL'
            ? 'Provisional score — limited transaction history available'
            : 'Approved supplier with limited history';
        } catch {
          // keep neutral score if engine fails for this vendor
        }
        return {
          vendorId: vendor.id,
          vendorCode: vendor.code,
          vendorName: vendor.name,
          deterministicScore,
          rank: 0,
          rationale,
          aiReason: rationale,
        };
      })
    );

    const candidates = scored
      .sort((a, b) => b.deterministicScore - a.deterministicScore)
      .slice(0, 5);
    let ranked = candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    const key = process.env.OPENROUTER_API_KEY;
    if (key && config.openRouterVendorAdvisoryEnabled && config.openRouterVendorModel && ranked.length) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.openRouterVendorModel,
            messages: [{ role: 'user', content: `Rank these approved vendors for a purchase order. Consider delivery reliability, quality, fill quantity, discrepancy history, price context and operational history. Return JSON array only with vendorId and reason. Requirements: ${JSON.stringify(input)}. Candidates: ${JSON.stringify(ranked.map(({ vendorId, vendorName, deterministicScore }) => ({ vendorId, vendorName, deterministicScore })))}.` }],
            response_format: { type: 'json_object' }
          })
        });
        if (response.ok) {
          const body: unknown = await response.json();
          // Narrow choices[0].message.content via successive `in` guards — no inline cast
          let raw = '[]';
          if (body && typeof body === 'object' && 'choices' in body) {
            const choices = body.choices;
            if (Array.isArray(choices) && choices.length > 0) {
              const first: unknown = choices[0];
              if (first && typeof first === 'object' && 'message' in first) {
                const msg = first.message;
                if (msg && typeof msg === 'object' && 'content' in msg) {
                  const c = msg.content;
                  if (typeof c === 'string') raw = c;
                }
              }
            }
          }
          const parsed: unknown = JSON.parse(raw);
          // Extract the advice array from possible shapes
          let adviceArr: Array<unknown> = [];
          if (Array.isArray(parsed)) {
            adviceArr = parsed;
          } else if (parsed && typeof parsed === 'object' && 'candidates' in parsed && Array.isArray(parsed.candidates)) {
            adviceArr = parsed.candidates;
          } else if (parsed && typeof parsed === 'object' && 'vendors' in parsed && Array.isArray(parsed.vendors)) {
            adviceArr = parsed.vendors;
          }
          ranked = ranked.map((candidate) => {
            const match = adviceArr.find((item) =>
              item && typeof item === 'object' && 'vendorId' in item && item.vendorId === candidate.vendorId
            );
            const reason = match && typeof match === 'object' && 'reason' in match && typeof match.reason === 'string'
              ? match.reason
              : candidate.aiReason;
            return { ...candidate, aiReason: reason };
          });
        }
      } catch { /* deterministic ranking remains available when AI is unavailable */ }
    }
    return { generatedAt: new Date(), provider: key ? 'openrouter' : 'deterministic', candidates: ranked };
  }

  async approvePO(id: string, actorId: string, reason?: string, requestId?: string): Promise<PurchaseOrder> {
    const po = await this._getPO(id);

    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'PurchaseOrder');
    if (!canApprove) throw new ForbiddenError(`Lacks permission to approve PO.`);

    if (po.sourcePr && po.sourcePr.requesterId === actorId) {
      const canSelfApprove = await this.permissionChecker.can(actorId, 'self_approve', 'PurchaseOrder');
      if (!canSelfApprove) {
        throw new ForbiddenError(`Actor created the source PR and cannot self-approve the PO without 'self_approve' authorization.`);
      }
    }

    if (po.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(`Cannot approve PO from state [${po.status}]. Must be DRAFT.`);
    }

    const replenishmentEventClient = (prisma as any).replenishmentEvent;
    const replenishmentSource = replenishmentEventClient?.findFirst
      ? await replenishmentEventClient.findFirst({ where: { purchaseOrderId: id }, select: { id: true } })
      : null;
    if (replenishmentSource && po.lines.some((line) => Number(line.unitPrice) <= 0)) {
      throw new ValidationError('Enter and save a positive unit rate for every Hermes replenishment line before approving this PO.');
    }

    // Deliver the vendor copy while the order is still a draft. Approval and
    // expected-receipt creation happen only after SMTP accepts the message, so
    // a failed delivery cannot leave a draft PO looking approved.
    const delivery = await purchaseOrderEmailService.send(id, 'approval');
    const validActorId = await this._resolveValidActorId(actorId);
    const { updated, approval } = await prisma.$transaction(async (tx) => {
      const sentAt = delivery.sentAt ?? new Date();
      const claim = await tx.purchaseOrder.updateMany({
        where: { id, status: 'DRAFT', sentAt: null },
        data: { status: 'APPROVED', approvedAt: sentAt, sentAt },
      });
      if (claim.count !== 1) {
        throw new InvalidStateTransitionError(`Purchase order [${id}] was already approved or changed; refresh before retrying.`);
      }

      const record = await tx.procurementApproval.create({ data: { poId: id, actorId, decision: ApprovalDecision.APPROVED, reason } });
      const lines = await tx.purchaseOrderLine.findMany({ where: { poId: id } });
      const existing = await tx.expectedReceipt.findMany({
        where: { poLineId: { in: lines.map(line => line.id) } },
        select: { poLineId: true },
      });
      const existingLineIds = new Set(existing.map(receipt => receipt.poLineId));
      for (const line of lines) {
        if (!existingLineIds.has(line.id)) {
          await tx.expectedReceipt.create({
            data: { poLineId: line.id, expectedQuantity: line.quantity, expectedDate: line.needDate, status: 'PENDING' },
          });
        }
      }
      await tx.transmissionLog.create({ data: { poId: id, actorId: validActorId, method: 'EMAIL', note: 'Initial PO dispatch' } });
      const approved = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!approved) throw new NotFoundError(`PurchaseOrder [${id}] not found after approval.`);
      await publishIntelligenceEvent(tx as any, {
        type: 'PO_APPROVED', entityType: 'PurchaseOrder', entityId: id, correlationId: requestId,
        occurredAt: approved.approvedAt ?? approved.updatedAt, transitionId: approved.updatedAt.toISOString(),
        metadata: { status: 'APPROVED', vendorId: po.vendorId },
      });
      return { updated: approved, approval: record };
    });

    await this.auditWriter.record({
      actorId, action: 'purchase_order.approve', entityType: 'PurchaseOrder', entityId: id, before: po, after: updated, metadata: { approvalId: approval.id, dispatchedAfterApproval: true, deliveryId: delivery.id, reason }, requestId
    });

    // Notify Store Managers, Admins, and source PR Requester (if any)
    const requesterId = po.sourcePr?.requesterId;
    await notificationService.notifyRoles({
      roles: ['store-manager', 'admin'],
      type: 'APPROVED',
      title: `Purchase Order Approved (${updated.poNumber})`,
      message: `PO ${updated.poNumber} has been approved and issued.`,
      resource: 'PurchaseOrder',
      resourceId: updated.id,
      href: `/procurement/purchase-orders/${updated.id}`,
      excludeUserIds: requesterId ? [requesterId] : undefined
    });
    if (requesterId) {
      await notificationService.createAndDispatch({
        recipientId: requesterId,
        type: 'APPROVED',
        title: `Purchase Order Approved (${updated.poNumber})`,
        message: `PO ${updated.poNumber} linked to your requisition has been approved and issued.`,
        resource: 'PurchaseOrder',
        resourceId: updated.id,
        href: `/procurement/purchase-orders/${updated.id}`
      });
    }

    return updated;
  }

  async rejectPO(id: string, actorId: string, reason: string, requestId?: string): Promise<PurchaseOrder> {
    return this.cancelPO(id, actorId, reason, requestId);
  }

  async requestChangesPO(id: string, actorId: string, reason: string, requestId?: string): Promise<PurchaseOrder> {
    const po = await this._getPO(id);

    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'PurchaseOrder');
    const canRequestChanges = await this.permissionChecker.can(actorId, 'request_changes', 'PurchaseOrder');
    if (!canApprove && !canRequestChanges) throw new ForbiddenError(`Lacks permission to request changes on PO.`);

    if (po.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(`Cannot request changes on PO from state [${po.status}]. Must be DRAFT.`);
    }

    if (!reason || !reason.trim()) {
      throw new ValidationError(`Requesting changes requires a reason.`);
    }

    const [updated, approval] = await prisma.$transaction([
      prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'DRAFT' }
      }),
      prisma.procurementApproval.create({
        data: { poId: id, actorId, decision: ApprovalDecision.CHANGES_REQUESTED, reason: reason.trim() }
      })
    ]);

    await this.auditWriter.record({
      actorId, action: 'purchase_order.request_changes', entityType: 'PurchaseOrder', entityId: id, before: po, after: updated, metadata: { approvalId: approval.id, reason }, requestId
    });

    const requesterId = po.sourcePr?.requesterId;
    await notificationService.notifyRoles({
      roles: ['store-manager', 'admin'],
      type: 'CHANGES_REQUESTED',
      title: `Purchase Order Changes Requested (${updated.poNumber})`,
      message: `Changes requested on PO ${updated.poNumber}. Reason: ${reason}`,
      resource: 'PurchaseOrder',
      resourceId: updated.id,
      href: `/procurement/purchase-orders/${updated.id}`,
      excludeUserIds: requesterId ? [requesterId] : undefined
    });
    if (requesterId) {
      await notificationService.createAndDispatch({
        recipientId: requesterId,
        type: 'CHANGES_REQUESTED',
        title: `Purchase Order Changes Requested (${updated.poNumber})`,
        message: `Changes requested on PO ${updated.poNumber}. Reason: ${reason}`,
        resource: 'PurchaseOrder',
        resourceId: updated.id,
        href: `/procurement/purchase-orders/${updated.id}`
      });
    }

    return updated;
  }

  async updatePO(
    id: string,
    actorId: string,
    data: {
      vendorId?: string;
      departmentId?: string;
      needDate?: Date;
      priority?: string;
      costCenter?: string;
      projectCode?: string;
      requestedBudget?: number;
      notes?: string;
      businessJustification?: string;
      paymentTerms?: string;
      deliveryLocation?: string;
      dispatchedThrough?: string;
      otherReferences?: string;
      termsOfDelivery?: string;
      lines?: Array<{
        id?: string;
        productId?: string;
        materialId?: string;
        uomId: string;
        quantity: number;
        unitPrice?: number;
        needDate: Date;
      }>;
    },
    requestId?: string
  ): Promise<PurchaseOrder> {
    const oldPo = await this._getPO(id);

    const canUpdate =
      (await this.permissionChecker.can(actorId, 'update', 'PurchaseOrder')) ||
      (await this.permissionChecker.can(actorId, 'create', 'PurchaseOrder')) ||
      (await this.permissionChecker.can(actorId, 'revise', 'PurchaseOrder'));
    if (!canUpdate) throw new ForbiddenError(`Lacks permission to update PO.`);

    if (oldPo.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(`Cannot directly update PO in status [${oldPo.status}]. Use Revise for issued orders.`);
    }

    let updatedCurrency: string | undefined;
    if (data.vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
      if (!vendor) throw new NotFoundError(`Vendor not found.`);
      if (vendor.status !== 'APPROVED' && vendor.status !== 'ACTIVE') {
        throw new ValidationError(`Vendor must be APPROVED or ACTIVE.`);
      }
      if (data.vendorId !== oldPo.vendorId) updatedCurrency = vendor.currency || oldPo.currency;
    }

    if (data.lines && data.lines.length === 0) {
      throw new ValidationError('At least one PO line is required.');
    }

    if (data.lines) {
      const selectedVendorId = data.vendorId || oldPo.vendorId;
      const productIds = data.lines.flatMap((line) => line.productId ? [line.productId] : []);
      const materialIds = data.lines.flatMap((line) => line.materialId ? [line.materialId] : []);
      const [products, materials] = await Promise.all([
        productIds.length
          ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true, metadata: true } })
          : Promise.resolve([]),
        materialIds.length
          ? prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, categoryId: true, specs: true } })
          : Promise.resolve([]),
      ]);
      const productsById = new Map(products.map((item) => [item.id, item]));
      const materialsById = new Map(materials.map((item) => [item.id, item]));
      const productCapabilityIds = new Set(productIds);
      const materialCapabilityIds = new Set(materialIds);
      const productCapabilityIdsByItem = new Map<string, Set<string>>();
      const materialCapabilityIdsByItem = new Map<string, Set<string>>();
      const itemCategories = new Map<string, string>();

      for (const product of products) {
        const parentId = (product.metadata as Record<string, unknown> | null)?.parentProductId;
        const relatedIds = new Set([product.id]);
        if (typeof parentId === 'string' && parentId) {
          productCapabilityIds.add(parentId);
          relatedIds.add(parentId);
        }
        productCapabilityIdsByItem.set(product.id, relatedIds);
        if (product.categoryId) itemCategories.set(`product:${product.id}`, product.categoryId);
      }
      for (const material of materials) {
        const parentId = (material.specs as Record<string, unknown> | null)?.parentMaterialId;
        const relatedIds = new Set([material.id]);
        if (typeof parentId === 'string' && parentId) {
          materialCapabilityIds.add(parentId);
          relatedIds.add(parentId);
        }
        materialCapabilityIdsByItem.set(material.id, relatedIds);
        if (material.categoryId) itemCategories.set(`material:${material.id}`, material.categoryId);
      }

      const categoryIds = [...new Set(itemCategories.values())];
      const vendorCapabilities = productCapabilityIds.size || materialCapabilityIds.size || categoryIds.length
        ? await prisma.vendorCapability.findMany({
            where: {
              vendorId: selectedVendorId,
              OR: [
                ...(productCapabilityIds.size ? [{ productId: { in: [...productCapabilityIds] } }] : []),
                ...(materialCapabilityIds.size ? [{ materialId: { in: [...materialCapabilityIds] } }] : []),
                ...(categoryIds.length ? [{ categoryId: { in: categoryIds }, productId: null, materialId: null }] : []),
              ],
            },
            select: { productId: true, materialId: true, categoryId: true },
          })
        : [];
      for (const line of data.lines) {
        const hasProduct = Boolean(line.productId);
        const hasMaterial = Boolean(line.materialId);
        if (!hasProduct && !hasMaterial) {
          throw new ValidationError('Each PO line must reference a product or material.');
        }
        if (line.productId && !productsById.has(line.productId)) throw new NotFoundError(`Product [${line.productId}] not found.`);
        if (line.materialId && !materialsById.has(line.materialId)) throw new NotFoundError(`Material [${line.materialId}] not found.`);
        const itemId = line.productId || line.materialId!;
        const isCoveredByVendor = vendorCapabilities.some((capability) =>
          line.productId
            ? (capability.productId != null && Boolean(productCapabilityIdsByItem.get(itemId)?.has(capability.productId))) ||
              (!capability.productId && !capability.materialId && capability.categoryId === itemCategories.get(`product:${itemId}`))
            : (capability.materialId != null && Boolean(materialCapabilityIdsByItem.get(itemId)?.has(capability.materialId))) ||
              (!capability.productId && !capability.materialId && capability.categoryId === itemCategories.get(`material:${itemId}`))
        );
        const isExistingUnmappedPair = selectedVendorId === oldPo.vendorId && oldPo.lines.some((oldLine) =>
          line.productId ? oldLine.productId === itemId : oldLine.materialId === itemId
        );
        if (!isCoveredByVendor && !isExistingUnmappedPair) {
          const itemName = line.productId ? `Product [${itemId}]` : `Material [${itemId}]`;
          throw new ValidationError(`${itemName} is not linked to supplier [${selectedVendorId}]. Select a supplier that supplies this item.`);
        }
      }
    }

    const linesWithTax = data.lines
      ? await Promise.all(data.lines.map(async (line) => ({ ...line, taxRate: await getItemTaxRate(line.productId, line.materialId) })))
      : undefined;
    const calculatedSubtotal = linesWithTax?.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0), 0);
    const calculatedTax = linesWithTax?.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0) * line.taxRate / 100, 0);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
        await tx.purchaseOrderLine.createMany({
          data: linesWithTax!.map((l) => ({
            poId: id,
            productId: l.productId,
            materialId: l.materialId,
            uomId: l.uomId,
            quantity: l.quantity,
            unitPrice: Number(l.unitPrice || 0),
            taxRate: l.taxRate,
            lineTotal: l.quantity * Number(l.unitPrice || 0),
            needDate: l.needDate
          }))
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(data.vendorId ? { vendorId: data.vendorId } : {}),
          ...(updatedCurrency ? { currency: updatedCurrency } : {}),
          ...(data.paymentTerms !== undefined ? { paymentTerms: data.paymentTerms } : {}),
          ...(data.deliveryLocation !== undefined ? { deliveryLocation: data.deliveryLocation } : {}),
          ...(data.dispatchedThrough !== undefined ? { dispatchedThrough: data.dispatchedThrough } : {}),
          ...(data.otherReferences !== undefined ? { otherReferences: data.otherReferences } : {}),
          ...(data.termsOfDelivery !== undefined ? { termsOfDelivery: data.termsOfDelivery } : {}),
          ...(calculatedSubtotal !== undefined ? { subtotal: calculatedSubtotal, taxAmount: calculatedTax, totalAmount: calculatedSubtotal + (calculatedTax || 0) } : {})
        },
        include: {
          lines: {
            include: {
              product: true,
              material: true,
              uom: true
            }
          },
          vendor: true
        }
      });
      await publishIntelligenceEvent(tx as any, { type: 'PO_CHANGED', entityType: 'PurchaseOrder', entityId: id, correlationId: requestId, occurredAt: updated.updatedAt, transitionId: updated.updatedAt.toISOString(), metadata: { status: updated.status, vendorId: updated.vendorId } });
      return updated;
    });

    await this.auditWriter.record({
      actorId,
      action: 'purchase_order.update',
      entityType: 'PurchaseOrder',
      entityId: id,
      before: oldPo,
      after: updated,
      metadata: { departmentId: data.departmentId, notes: data.notes },
      requestId
    });

    return updated;
  }

  async sendPO(id: string, actorId: string, method: string = 'MANUAL', requestId?: string): Promise<PurchaseOrder> {
    const po = await this._getPO(id);

    const canSend = await this.permissionChecker.can(actorId, 'issue', 'PurchaseOrder');
    if (!canSend) throw new ForbiddenError(`Lacks permission to issue PO.`);

    if (po.status !== 'APPROVED') {
      throw new InvalidStateTransitionError(`Cannot send PO from state [${po.status}]. Must be APPROVED.`);
    }

    const updated = await this._dispatchApprovedPO(id, actorId, method);

    await this.auditWriter.record({
      actorId, action: 'purchase_order.send', entityType: 'PurchaseOrder', entityId: id, before: po, after: updated, metadata: { method }, requestId
    });

    await notificationService.notifyRoles({
      roles: ['store-manager', 'admin'],
      type: 'WORKFLOW',
      title: `Purchase Order Dispatched (${updated.poNumber})`,
      message: `PO ${updated.poNumber} was dispatched to vendor via ${method}.`,
      resource: 'PurchaseOrder',
      resourceId: updated.id,
      href: `/procurement/purchase-orders/${updated.id}`
    });

    return updated;
  }

  async resendPOEmail(id: string, actorId: string, requestId?: string) {
    const po = await this._getPO(id);
    const canSend = await this.permissionChecker.can(actorId, 'issue', 'PurchaseOrder');
    if (!canSend) throw new ForbiddenError('Lacks permission to resend a PO email.');
    if (!po.sentAt) throw new InvalidStateTransitionError(`Cannot resend a PO that has not been sent.`);
    const delivery = await purchaseOrderEmailService.send(id, 'resend');
    await this.auditWriter.record({ actorId, action: 'purchase_order.email_resend', entityType: 'PurchaseOrder', entityId: id, before: po, after: delivery, metadata: { recipient: delivery.recipient, attempt: delivery.attempt }, requestId });
    return delivery;
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

  private async _dispatchApprovedPO(id: string, actorId: string, method: string): Promise<PurchaseOrder> {
    // Deliver the vendor copy before changing the state. If email is misconfigured
    // or the vendor address is missing, the PO remains approved and can be retried.
    await purchaseOrderEmailService.send(id, 'initial');
    const validActorId = await this._resolveValidActorId(actorId);
    const { updated } = await prisma.$transaction(async (tx) => {
      const claim = await tx.purchaseOrder.updateMany({
        where: { id, status: 'APPROVED', sentAt: null },
        data: { sentAt: new Date() }
      });
      if (claim.count !== 1) throw new InvalidStateTransitionError(`Purchase order [${id}] was already issued or changed; refresh before retrying.`);

      const lines = await tx.purchaseOrderLine.findMany({ where: { poId: id } });
      const existing = await tx.expectedReceipt.findMany({ where: { poLineId: { in: lines.map(line => line.id) } }, select: { poLineId: true } });
      const existingLineIds = new Set(existing.map(receipt => receipt.poLineId));
      for (const line of lines) {
        if (!existingLineIds.has(line.id)) {
          await tx.expectedReceipt.create({ data: { poLineId: line.id, expectedQuantity: line.quantity, expectedDate: line.needDate, status: 'PENDING' } });
        }
      }
      await tx.transmissionLog.create({ data: { poId: id, actorId: validActorId, method, note: 'Initial PO dispatch' } });
      const updated = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!updated) throw new NotFoundError(`PurchaseOrder [${id}] not found after issue.`);
      return { updated };
    });
    return updated;
  }

  async revisePO(
    id: string,
    actorId: string,
    modifications: { lines: Array<{ productId?: string; materialId?: string; uomId: string; quantity: number; unitPrice?: number; needDate: Date; }> },
    reason?: string,
    requestId?: string
  ): Promise<PurchaseOrder> {
    const oldPo = await this._getPO(id);

    const canRevise = await this.permissionChecker.can(actorId, 'revise', 'PurchaseOrder');
    if (!canRevise) throw new ForbiddenError(`Lacks permission to revise PO.`);

    if (['CANCELLED', 'SUPERSEDED', 'COMPLETED', 'FULLY_RECEIVED'].includes(oldPo.status)) {
      throw new InvalidStateTransitionError(`Cannot revise PO in terminal state [${oldPo.status}].`);
    }

    const nextRevision = oldPo.revisionNumber + 1;
    const linesWithTax = await Promise.all(modifications.lines.map(async (line) => ({ ...line, taxRate: await getItemTaxRate(line.productId, line.materialId) })));
    const subtotal = linesWithTax.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0), 0);
    const taxAmount = linesWithTax.reduce((sum, line) => sum + line.quantity * Number(line.unitPrice || 0) * line.taxRate / 100, 0);

    // A revision is a new version of the same PO, not a second PO instance.
    // Keep the identity/number stable so list views, receipts and vendor links
    // continue to point at the edited order.
    const revisedPo = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
      const next = await tx.purchaseOrder.update({
        where: { id },
        data: {
          revisionNumber: nextRevision,
          status: 'DRAFT',
          approvedAt: null,
          sentAt: null,
          previousRevisionId: null,
          subtotal,
          taxAmount,
          totalAmount: subtotal + taxAmount,
          lines: {
            create: linesWithTax.map(l => ({
              productId: l.productId,
              materialId: l.materialId,
              uomId: l.uomId,
              quantity: l.quantity,
              unitPrice: Number((l as { unitPrice?: number }).unitPrice || 0),
              taxRate: l.taxRate,
              lineTotal: l.quantity * Number((l as { unitPrice?: number }).unitPrice || 0),
              needDate: l.needDate
            }))
          }
        },
        include: { lines: true }
      });

      // Older/imported SENT orders may not have sentAt populated. The status
      // still records that the vendor received the original PO, so revisions
      // must leave a transmission trail in either case.
      if (oldPo.sentAt || oldPo.status === 'SENT') {
        const validActorId = await this._resolveValidActorId(actorId);
        await tx.transmissionLog.create({
          data: { poId: id, actorId: validActorId, method: 'SYSTEM', note: `PO revised to revision ${nextRevision}. Reason: ${reason || 'N/A'}` }
        });
      }
      return next;
    });

    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true, userRoles: { select: { role: { select: { name: true } } } } }
    });
    const normalizeRole = (role: unknown) => String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const isAdmin = normalizeRole(actor?.role) === 'admin' || actor?.userRoles.some(({ role }) => ['admin', 'super_admin'].includes(normalizeRole(role.name)));
    const newPo = isAdmin ? await this.approvePO(id, actorId, 'Revised and approved by Admin', requestId) : revisedPo;

    await this.auditWriter.record({
      actorId, action: 'purchase_order.revise', entityType: 'PurchaseOrder', entityId: newPo.id, before: oldPo, after: newPo, metadata: { reason, inPlace: true }, requestId
    });

    return newPo;
  }

  async cancelPO(id: string, actorId: string, reason?: string, requestId?: string): Promise<PurchaseOrder> {
    const po = await this._getPO(id);

    const canCancel = await this.permissionChecker.can(actorId, 'cancel', 'PurchaseOrder');
    if (!canCancel) throw new ForbiddenError(`Lacks permission to cancel PO.`);

    if (po.status === 'CANCELLED' || po.status === 'SUPERSEDED') {
      throw new InvalidStateTransitionError(`PO is already in state [${po.status}].`);
    }

    // Check for partial receipts
    const receipts = await prisma.expectedReceipt.findMany({
      where: { poLine: { poId: id } }
    });
    
    // Check if any expected receipt is partially or fully received
    const hasReceipts = receipts.some(r => r.status === 'PARTIALLY_RECEIVED' || r.status === 'FULLY_RECEIVED');
    if (hasReceipts) {
      throw new InvalidStateTransitionError(`Cannot cancel PO once partial or full receipt exists.`);
    }

    const validActorId = po.sentAt ? await this._resolveValidActorId(actorId) : null;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      if (validActorId) {
        await tx.transmissionLog.create({ data: { poId: id, actorId: validActorId, method: 'SYSTEM', note: `PO Cancelled. Reason: ${reason || 'N/A'}` } });
      }
      await publishIntelligenceEvent(tx as any, { type: 'PO_CANCELLED', entityType: 'PurchaseOrder', entityId: id, correlationId: requestId, occurredAt: result.updatedAt, transitionId: result.updatedAt.toISOString(), metadata: { status: 'CANCELLED', vendorId: po.vendorId } });
      return result;
    });

    await this.auditWriter.record({
      actorId, action: 'purchase_order.cancel', entityType: 'PurchaseOrder', entityId: id, before: po, after: updated, metadata: { reason }, requestId
    });

    return updated;
  }

  async deletePO(id: string, actorId: string, requestId?: string, poNumber?: string): Promise<void> {
    // Resolve a stale register ID by its visible PO number only when there is
    // exactly one matching draft. This keeps deletion safe and draft-only.
    let po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po && poNumber) {
      const matches = await prisma.purchaseOrder.findMany({ where: { poNumber, status: 'DRAFT' }, take: 2 });
      if (matches.length === 1) po = matches[0];
    }
    if (!po) throw new NotFoundError('Purchase order could not be found. Refresh the register and try again.');

    if (po.status !== 'DRAFT') {
      throw new InvalidStateTransitionError('Only draft purchase orders can be deleted. Cancel an approved purchase order instead.');
    }
    
    // We assume the route has a rolesGuard, but we also check permission here
    const canDelete = await this.permissionChecker.can(actorId, 'delete', 'PurchaseOrder');
    if (!canDelete) throw new ForbiddenError(`Lacks permission to delete PO.`);

    // Delete lines first due to FK constraints if cascade isn't set up
    await prisma.$transaction([
      prisma.purchaseOrderLine.deleteMany({ where: { poId: po.id } }),
      prisma.purchaseOrder.delete({ where: { id: po.id } })
    ]);

    await this.auditWriter.record({
      actorId, action: 'purchase_order.delete', entityType: 'PurchaseOrder', entityId: po.id, before: po, metadata: {}, requestId
    });
  }

  async getPO(id: string) {
    // Loading a detail page must remain read-only. Issuing an APPROVED PO here
    // made overlapping page queries race: one request issued it while another
    // failed the state claim and returned an error instead of the PO.
    const po = await this._getPO(id);
    const replenishmentEvent = await prisma.replenishmentEvent.findFirst({
      where: { purchaseOrderId: id },
      select: { decisionReason: true },
      orderBy: { evaluatedAt: 'desc' },
    });
    const lines = await Promise.all(po.lines.map(async (line) => {
      const priorLines = await prisma.purchaseOrderLine.findMany({
        where: {
          productId: line.productId,
          materialId: line.materialId,
          uomId: line.uomId,
          poId: { not: id },
          unitPrice: { gt: 0 },
          purchaseOrder: {
            currency: po.currency,
            status: { notIn: [PoStatus.CANCELLED, PoStatus.REJECTED, PoStatus.SUPERSEDED] },
            createdAt: { lte: po.createdAt },
          },
        },
        select: {
          quantity: true,
          unitPrice: true,
          purchaseOrder: {
            select: { poNumber: true, createdAt: true, vendor: { select: { name: true } } },
          },
        },
        orderBy: { purchaseOrder: { createdAt: 'desc' } },
      });
      const averageUnitPrice = priorLines.length
        ? priorLines.reduce((sum, prior) => sum + Number(prior.unitPrice), 0) / priorLines.length
        : null;
      const taxRate = Number(line.taxRate) > 0
        ? Number(line.taxRate)
        : itemTaxRate(line.productId ? line.product?.metadata : line.material?.specs);
      return {
        ...line,
        taxRate,
        pricingEvidence: {
          averageUnitPrice,
          currency: po.currency,
          uom: line.uom.symbol || line.uom.code,
          matchedLineCount: priorLines.length,
          basis: 'Arithmetic average of positive unit rates on earlier purchase order lines for the same item, unit, and currency; cancelled, rejected, superseded, and this PO are excluded.',
          decisionReason: replenishmentEvent?.decisionReason ?? null,
          records: priorLines.map((prior) => ({
            poNumber: prior.purchaseOrder.poNumber,
            createdAt: prior.purchaseOrder.createdAt,
            vendorName: prior.purchaseOrder.vendor.name,
            quantity: prior.quantity,
            unitPrice: Number(prior.unitPrice),
          })),
        },
      };
    }));
    const calculatedTax = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice) * Number(line.taxRate || 0) / 100, 0);
    const taxAmount = Number(po.taxAmount) > 0 ? Number(po.taxAmount) : calculatedTax;
    const subtotal = Number(po.subtotal) || lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
    return { ...po, lines, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
  }

  async getNextPoNumber(): Promise<{ nextNumber: string }> {
    const year = new Date().getFullYear();
    let isUnique = false;
    const existingNumbers = await prisma.purchaseOrder.findMany({
      where: { poNumber: { startsWith: `PO-${year}-` } },
      select: { poNumber: true },
    });
    let attempt = existingNumbers.reduce((max, row) => {
      const suffix = Number(row.poNumber.slice(`PO-${year}-`.length));
      return Number.isSafeInteger(suffix) && suffix > max ? suffix : max;
    }, 0);
    let nextNumber = '';
    while (!isUnique) {
      attempt++;
      nextNumber = `PO-${year}-${String(attempt).padStart(3, '0')}`;
      const existing = await prisma.purchaseOrder.findUnique({
        where: { poNumber_revisionNumber: { poNumber: nextNumber, revisionNumber: 1 } }
      });
      if (!existing) isUnique = true;
    }
    return { nextNumber };
  }

  async listPOs(options: { skip?: number; take?: number; status?: string; vendorId?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; startDate?: string; endDate?: string }): Promise<{ items: PurchaseOrder[]; total: number }> {
    const where: import('@prisma/client').Prisma.PurchaseOrderWhereInput = {};
    if (options.status === 'APPROVED') where.status = { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'] };
    else if (options.status === 'CANCELLED') where.status = { in: ['CANCELLED', 'REJECTED', 'SUPERSEDED'] };
    else if (options.status) where.status = options.status as PoStatus;
    if (options.vendorId) where.vendorId = options.vendorId;
    if (options.search) {
      where.OR = [
        { poNumber: { contains: options.search, mode: 'insensitive' } },
        { vendor: { name: { contains: options.search, mode: 'insensitive' } } },
        { vendor: { code: { contains: options.search, mode: 'insensitive' } } },
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
        case 'poNumber':
          orderBy = { poNumber: direction };
          break;
        case 'vendor':
          orderBy = { vendor: { name: direction } };
          break;
        case 'lines':
          orderBy = { lines: { _count: direction } };
          break;
        case 'totalAmount':
          orderBy = { totalAmount: direction };
          break;
        case 'status':
          orderBy = { status: direction };
          break;
        case 'createdAt':
          orderBy = { createdAt: direction };
          break;
      }
    }

    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip: options.skip,
        take: options.take,
        include: {
          lines: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              taxRate: true,
              lineTotal: true,
              needDate: true,
              material: { select: { id: true, code: true, name: true } },
              product: { select: { id: true, sku: true, name: true } },
              uom: { select: { id: true, code: true, symbol: true } }
            }
          },
          vendor: { select: { id: true, code: true, name: true } },
          sourcePr: { select: { id: true, prNumber: true } },
          goodsReceiptNotes: { select: { id: true, grnNumber: true, status: true } },
        },
        orderBy
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    // Self-heal approved orders created by the older PR conversion path so
    // the register never leaves an approved PO waiting for a manual send.
    await Promise.all(items.filter(item => item.status === 'APPROVED').map(async item => {
      try { Object.assign(item, await this._dispatchApprovedPO(item.id, 'system', 'SYSTEM')); } catch { /* another request may have dispatched it */ }
    }));
    return { items, total };
  }

  async getVendorHistory(vendorId: string): Promise<Record<string, unknown>> {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundError(`Vendor [${vendorId}] not found.`);

    const pos = await prisma.purchaseOrder.findMany({
      where: { vendorId },
      include: {
        lines: true,
        goodsReceiptNotes: { include: { lines: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    // Query active debit notes raised against this vendor
    let allDebitNotes: any[] = [];
    try {
      allDebitNotes = await prisma.$queryRaw<any[]>`SELECT * FROM "debit_notes" WHERE "vendorId" = ${vendorId} OR "poId" IN (${pos.length ? Prisma.join(pos.map(p => p.id)) : '00000000-0000-0000-0000-000000000000'})`;
    } catch {
      allDebitNotes = [];
    }
    const activeDebitNotes = allDebitNotes.filter((dn) => !['CANCELLED', 'REJECTED'].includes(dn.status));
    const debitNotesCount = activeDebitNotes.length;

    const totalValue = pos.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0);
    const receipts = pos.flatMap(po => po.goodsReceiptNotes.map(grn => ({ po, grn })));
    const finalizedReceipts = receipts.filter(({ grn }) => grn.status === 'FINALIZED');
    const onTimeReceipts = finalizedReceipts.filter(({ po, grn }) => {
      const promisedDate = po.lines.reduce<Date | null>((latest, line) => !latest || line.needDate > latest ? line.needDate : latest, null);
      return promisedDate ? grn.receivedAt <= promisedDate : true;
    });
    const receivedQuantity = finalizedReceipts.reduce((sum, { grn }) => sum + grn.lines.reduce((lineSum, line) => lineSum + line.receivedQuantity, 0), 0);
    const acceptedQuantity = finalizedReceipts.reduce((sum, { grn }) => sum + grn.lines.reduce((lineSum, line) => lineSum + line.acceptedQuantity, 0), 0);
    const hasHistory = pos.length > 0 || finalizedReceipts.length > 0 || debitNotesCount > 0;
    const onTimeRate = finalizedReceipts.length ? Math.round((onTimeReceipts.length / finalizedReceipts.length) * 100) : null;
    const qualityRate = receivedQuantity ? Math.round((acceptedQuantity / receivedQuantity) * 100) : null;
    const completionRate = pos.length ? Math.round((pos.filter(po => ['FULLY_RECEIVED', 'CLOSED'].includes(po.status)).length / pos.length) * 100) : null;
    let score: number | null = null;
    if (hasHistory) {
      const ot = onTimeRate ?? 80;
      const qr = qualityRate ?? 80;
      const cr = completionRate ?? 80;
      score = Math.round(ot * 0.4 + qr * 0.4 + cr * 0.2);
      if (debitNotesCount > 0) {
        score = Math.max(10, score - (debitNotesCount * 7));
      }
    }
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      totalOrders: pos.length,
      totalValue,
      score,
      performance: { onTimeRate, qualityRate, completionRate, finalizedReceipts: finalizedReceipts.length, debitNoteCount: debitNotesCount },
      orders: pos.map(po => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        createdAt: po.createdAt,
        totalAmount: Number(po.totalAmount || 0),
        receiptCount: po.goodsReceiptNotes.length
      }))
    };
  }

  private async _getPO(id: string) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            product: true,
            material: true,
            uom: true
          }
        },
        vendor: true,
        sourcePr: true,
        transmissions: true,
        approvals: {
          include: {
            actor: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        goodsReceiptNotes: { select: { id: true, grnNumber: true, status: true, receivedAt: true } },
      }
    });
    if (!po) throw new NotFoundError(`PurchaseOrder [${id}] not found.`);
    return po;
  }
}
