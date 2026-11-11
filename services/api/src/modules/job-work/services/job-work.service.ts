import {
  PrismaClient,
  Prisma,
  JobWorkOrderStatus,
  JobWorkCustodyEntryType,
  JobWorkReconciliationStatus,
  StockOwnership,
  StockDirection
} from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { JobWorkRepository } from '../repositories/job-work.repository';
import { PermissionChecker, AuditWriter, VendorCustodyBalanceDto, JobWorkAnalyticsDto } from '@plinth/types';
import {
  ForbiddenError,
  NotFoundError,
  InvalidStateTransitionError,
  ValidationError
} from '../../../common/errors/AppError';
import { StockLedgerRepository } from '../../inventory/repositories/stock-ledger.repository';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';
import type {
  CreateJobWorkOrderInput,
  IssueJobWorkMaterialInput,
  ReceiveJobWorkReturnInput,
  CreateJobWorkReconciliationInput
} from '@plinth/validation';
import { jobWorkOrderEmailService } from './job-work-order-email.service';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export class JobWorkService {
  constructor(
    private readonly repository: JobWorkRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly stockLedgerRepo: StockLedgerRepository = new StockLedgerRepository()
  ) {}

  // 1. Create Job Work Order
  async createOrder(
    input: CreateJobWorkOrderInput,
    actorId: string,
    options?: { requestId?: string }
  ) {
    const canCreate = await this.permissionChecker.can(actorId, 'create', 'JobWorkOrder');
    if (!canCreate) throw new ForbiddenError('Lacks permission to create Job Work Orders.');

    const vendor = await defaultPrisma.vendor.findUnique({
      where: { id: input.vendorId }
    });
    if (!vendor) throw new NotFoundError(`Vendor [${input.vendorId}] not found.`);
    if (!['ACTIVE', 'APPROVED'].includes(vendor.status)) throw new ValidationError('Vendor must be active before creating a job-work order.');

    if (input.purchaseOrderId) {
      const po = await defaultPrisma.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        include: { lines: true }
      });
      if (!po) throw new NotFoundError(`Purchase Order [${input.purchaseOrderId}] not found.`);
    }

    const orderNumber = input.orderNumber || (await this.repository.getNextOrderNumber('2026'));

    const created = await defaultPrisma.$transaction(async (tx: PrismaOrTx) => {
      const order = await tx.jobWorkOrder.create({
        data: {
          orderNumber,
          vendorId: input.vendorId,
          purchaseOrderId: input.purchaseOrderId ?? null,
          productId: input.productId ?? null,
          targetQuantity: input.targetQuantity,
          targetUomId: input.targetUomId ?? null,
          rawMaterialInputQty: input.rawMaterialInputQty,
          expectedScrapRate: input.expectedScrapRate,
          deliveryLocationId: input.deliveryLocationId ?? null,
          natureOfProcessing: input.natureOfProcessing ?? null,
          specifications: input.specifications ?? null,
          notes: input.notes ?? null,
          evidenceAttachments: input.evidenceAttachments ? (input.evidenceAttachments as Prisma.InputJsonValue) : undefined,
          status: JobWorkOrderStatus.DRAFT,
          createdById: actorId,
          lines: {
            create: input.lines.map((line) => ({
              materialId: line.materialId ?? null,
              productId: line.productId ?? null,
              uomId: line.uomId,
              requiredQuantity: line.requiredQuantity,
              allocatedQuantity: line.allocatedQuantity || 0,
              notes: line.notes ?? null
            }))
          }
        },
        include: {
          vendor: true,
          lines: true
        }
      });

      // If raw material deposit allocation requested upon order creation with PO
      if (input.rawMaterialInputQty > 0) {
        for (const line of input.lines) {
          const latest = await this.repository.getLatestVendorCustodyEntry({
            vendorId: input.vendorId,
            materialId: line.materialId,
            productId: line.productId
          }, tx);

          const currentBal = latest?.runningBalance || 0;
          const entryNumber = await this.repository.getNextLedgerEntryNumber('2026', tx);

          await tx.jobWorkCustodyLedger.create({
            data: {
              entryNumber,
              vendorId: input.vendorId,
              jobWorkOrderId: order.id,
              materialId: line.materialId ?? null,
              productId: line.productId ?? null,
              uomId: line.uomId,
              entryType: JobWorkCustodyEntryType.PO_DEPOSIT_DEDUCTION,
              direction: StockDirection.OUT,
              quantity: line.allocatedQuantity || input.rawMaterialInputQty,
              runningBalance: currentBal - (line.allocatedQuantity || input.rawMaterialInputQty),
              referenceType: 'JW_ALLOCATION',
              referenceId: order.id,
              note: `JW allocation for order ${orderNumber}`
            }
          });
        }
      }

      return order;
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.order_create',
      entityType: 'JobWorkOrder',
      entityId: created.id,
      after: created,
      metadata: { orderNumber: created.orderNumber },
      requestId: options?.requestId
    });

    // Trigger background email dispatch to vendor (using Resend / configured SMTP transport)
    void jobWorkOrderEmailService.send(created.id).catch((err) => {
      console.warn(`[JobWorkService] Email transmission background failure for order ${created.id}:`, err);
    });

    return created;
  }

  // 2. Approve Job Work Order
  async approveOrder(
    id: string,
    actorId: string,
    remarks?: string,
    options?: { requestId?: string }
  ) {
    const canApprove = await this.permissionChecker.can(actorId, 'approve', 'JobWorkOrder');
    if (!canApprove) throw new ForbiddenError('Lacks permission to approve Job Work Orders.');

    const order = await this.repository.findOrderById(id);
    if (!order) throw new NotFoundError(`Job Work Order [${id}] not found.`);
    if (order.status !== JobWorkOrderStatus.DRAFT) {
      throw new InvalidStateTransitionError(`Cannot approve order in ${order.status} state.`);
    }

    const updated = await this.repository.updateOrder(id, {
      status: JobWorkOrderStatus.APPROVED,
      approvedBy: { connect: { id: actorId } },
      approvedAt: new Date(),
      notes: remarks ? (order.notes ? `${order.notes}\nApproval Note: ${remarks}` : `Approval Note: ${remarks}`) : order.notes
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.order_approve',
      entityType: 'JobWorkOrder',
      entityId: id,
      before: order,
      after: updated,
      metadata: { remarks },
      requestId: options?.requestId
    });

    return updated;
  }

  // 3. Issue Raw Material / Delivery Challan to Vendor (Custody Ledger update)
  async issueMaterial(
    input: IssueJobWorkMaterialInput,
    actorId: string,
    options?: { requestId?: string }
  ) {
    const canIssue = await this.permissionChecker.can(actorId, 'issue', 'JobWorkOrder');
    if (!canIssue) throw new ForbiddenError('Lacks permission to issue job work materials.');

    const vendor = await defaultPrisma.vendor.findUnique({
      where: { id: input.vendorId }
    });
    if (!vendor) throw new NotFoundError(`Vendor [${input.vendorId}] not found.`);

    const location = await defaultPrisma.warehouseLocation.findUnique({
      where: { id: input.dispatchLocationId }
    });
    if (!location) throw new NotFoundError(`Dispatch Location [${input.dispatchLocationId}] not found.`);

    const challanNumber = input.challanNumber || (await this.repository.getNextChallanNumber('2026'));

    const issued = await defaultPrisma.$transaction(async (tx: PrismaOrTx) => {
      // Determine item and order descriptions for transparent Stock Ledger note
      const targetOrder = input.jobWorkOrderId
        ? await tx.jobWorkOrder.findUnique({
            where: { id: input.jobWorkOrderId },
            select: { id: true, orderNumber: true }
          })
        : null;
      const orderRef = targetOrder?.orderNumber ? ` for Job Work Order ${targetOrder.orderNumber}` : ' for Job Work';
      const ledgerNote = `Material issued to vendor ${vendor.name} (${vendor.code})${orderRef} under Delivery Challan ${challanNumber}`;

      // 1. Post OUT entry to internal stock ledger and deduct from company-owned inventory
      await this.stockLedgerRepo.postEntry({
        productId: input.productId ?? null,
        materialId: input.materialId ?? null,
        uomId: input.uomId,
        locationId: input.dispatchLocationId,
        quantity: input.quantity,
        direction: 'OUT',
        entryType: 'ISSUE',
        ownership: StockOwnership.OWNED,
        postedByActorId: actorId,
        note: ledgerNote
      }, tx);

      // 2. Create Job Work Material Issue / Challan
      const challan = await tx.jobWorkMaterialIssue.create({
        data: {
          challanNumber,
          jobWorkOrderId: input.jobWorkOrderId ?? null,
          vendorId: input.vendorId,
          dispatchLocationId: input.dispatchLocationId,
          materialId: input.materialId ?? null,
          productId: input.productId ?? null,
          uomId: input.uomId,
          quantity: input.quantity,
          vehicleNumber: input.vehicleNumber ?? null,
          transporterName: input.transporterName ?? null,
          driverContact: input.driverContact ?? null,
          notes: input.notes ?? null,
          issuedById: actorId,
          issuedAt: new Date()
        },
        include: {
          vendor: true,
          dispatchLocation: true,
          material: true,
          product: true,
          uom: true,
          issuedBy: true
        }
      });

      // Also post to authoritative modern inventory balance & ledger if modern tables exist
      try {
        const modernTables = typeof tx.$queryRaw === 'function'
          ? await tx.$queryRaw<Array<{ balances: string | null; ledger: string | null }>>`
              SELECT to_regclass('inventory_balances')::text AS balances,
                     to_regclass('inventory_ledger_entries')::text AS ledger
            `
          : [];
        if (modernTables[0]?.balances && modernTables[0]?.ledger) {
          const itemType = input.productId ? 'PRODUCT' : 'MATERIAL';
          const itemId = input.productId || input.materialId;
          if (itemId) {
            await inventoryPostingService.post(tx, {
              itemType,
              itemId,
              uomId: input.uomId,
              locationId: input.dispatchLocationId,
              movementType: 'ISSUE',
              quantity: input.quantity,
              ownership: 'COMPANY',
              condition: 'AVAILABLE',
              sourceType: 'JOB_WORK_CHALLAN',
              sourceId: challan.id,
              idempotencyKey: `JOB_WORK_CHALLAN:${challan.id}`,
              actorId,
              correlationId: options?.requestId || challan.id,
              note: ledgerNote
            });
          }
        }
      } catch (modernErr) {
        console.warn('[JobWorkService.issueMaterial] Modern ledger post fallback notice:', modernErr);
      }

      // 3. Compute running balance in Vendor-held custody ledger
      const latest = await this.repository.getLatestVendorCustodyEntry({
        vendorId: input.vendorId,
        materialId: input.materialId,
        productId: input.productId
      }, tx);

      const previousBalance = latest?.runningBalance || 0;
      const newBalance = previousBalance + input.quantity;

      const entryNumber = await this.repository.getNextLedgerEntryNumber('2026', tx);

      await tx.jobWorkCustodyLedger.create({
        data: {
          entryNumber,
          vendorId: input.vendorId,
          jobWorkOrderId: input.jobWorkOrderId ?? null,
          materialIssueId: challan.id,
          materialId: input.materialId ?? null,
          productId: input.productId ?? null,
          uomId: input.uomId,
          entryType: JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE,
          direction: StockDirection.IN, // IN to vendor custody
          quantity: input.quantity,
          runningBalance: newBalance,
          referenceType: 'CHALLAN',
          referenceId: challan.id,
          note: `Raw material issued under challan ${challanNumber}`
        }
      });

      // 4. Update Job Work Order state if linked
      if (input.jobWorkOrderId) {
        const order = await tx.jobWorkOrder.findUnique({
          where: { id: input.jobWorkOrderId },
          include: { lines: true }
        });

        if (order) {
          await tx.jobWorkOrder.update({
            where: { id: order.id },
            data: {
              status: order.status === JobWorkOrderStatus.DRAFT || order.status === JobWorkOrderStatus.APPROVED
                ? JobWorkOrderStatus.ISSUED
                : order.status
            }
          });

          // Update issued quantities on lines
          const matchingLine = order.lines.find(
            (l) =>
              (input.materialId && l.materialId === input.materialId) ||
              (input.productId && l.productId === input.productId)
          );
          if (matchingLine) {
            await tx.jobWorkOrderLine.update({
              where: { id: matchingLine.id },
              data: {
                issuedQuantity: { increment: input.quantity }
              }
            });
          }
        }
      }

      return challan;
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.material_issue_challan',
      entityType: 'JobWorkMaterialIssue',
      entityId: issued.id,
      after: issued,
      metadata: { challanNumber: issued.challanNumber, quantity: input.quantity },
      requestId: options?.requestId
    });

    return issued;
  }

  // 4. Receive Return / Finished Goods from Vendor (GRN + Custody deduction + Debit note for shortage)
  async receiveReturn(
    input: ReceiveJobWorkReturnInput,
    actorId: string,
    options?: { requestId?: string }
  ) {
    const canReceive = await this.permissionChecker.can(actorId, 'receive', 'JobWorkOrder');
    if (!canReceive) throw new ForbiddenError('Lacks permission to receive job work returns.');

    const vendor = await defaultPrisma.vendor.findUnique({
      where: { id: input.vendorId }
    });
    if (!vendor) throw new NotFoundError(`Vendor [${input.vendorId}] not found.`);

    const location = await defaultPrisma.warehouseLocation.findUnique({
      where: { id: input.locationId }
    });
    if (!location) throw new NotFoundError(`Receiving Location [${input.locationId}] not found.`);

    const shortQuantity = Math.max(0, input.expectedQuantity - input.receivedQuantity);
    const excessQuantity = Math.max(0, input.receivedQuantity - input.expectedQuantity);

    const returnNumber = input.returnNumber || (await this.repository.getNextReturnNumber('2026'));

    const result = await defaultPrisma.$transaction(async (tx: PrismaOrTx) => {
      // 1. Create standard GRN for receipt of manufactured/processed goods
      const grnCount = (await tx.goodsReceiptNote.count()) + 1;
      const grnNumber = `GRN-JW-2026-${String(grnCount).padStart(4, '0')}`;

      const grn = await tx.goodsReceiptNote.create({
        data: {
          grnNumber,
          vendorId: input.vendorId,
          locationId: input.locationId,
          status: 'ARRIVED',
          receivedByActorId: actorId,
          receivedAt: new Date(),
          lines: {
            create: [
              {
                productId: input.productId ?? null,
                materialId: input.materialId ?? null,
                uomId: input.uomId,
                expectedQuantity: input.expectedQuantity,
                receivedQuantity: input.receivedQuantity,
                acceptedQuantity: input.acceptedQuantity,
                shortQuantity,
                excessQuantity,
                status: shortQuantity > 0 ? 'DISCREPANT' : 'VERIFIED'
              }
            ]
          }
        },
        include: { lines: true }
      });

      // 2. Post accepted quantity into company inventory stock balance
      if (input.acceptedQuantity > 0) {
        await this.stockLedgerRepo.postEntry({
          productId: input.productId ?? null,
          materialId: input.materialId ?? null,
          uomId: input.uomId,
          locationId: input.locationId,
          quantity: input.acceptedQuantity,
          direction: 'IN',
          entryType: 'GRN_RECEIPT',
          ownership: StockOwnership.OWNED,
          postedByActorId: actorId,
          grnId: grn.id,
          grnLineId: grn.lines[0].id,
          note: `Job Work return ${returnNumber} accepted into inventory`
        }, tx);
      }

      // Also post received quantity to authoritative modern inventory balance & ledger
      try {
        const modernTables = typeof tx.$queryRaw === 'function'
          ? await tx.$queryRaw<Array<{ balances: string | null; ledger: string | null }>>`
              SELECT to_regclass('inventory_balances')::text AS balances,
                     to_regclass('inventory_ledger_entries')::text AS ledger
            `
          : [];
        if (modernTables[0]?.balances && modernTables[0]?.ledger) {
          const itemType = input.productId ? 'PRODUCT' : 'MATERIAL';
          const itemId = input.productId || input.materialId;
          if (itemId) {
            await inventoryPostingService.post(tx, {
              itemType,
              itemId,
              uomId: input.uomId,
              locationId: input.locationId,
              movementType: 'RECEIPT',
              quantity: input.acceptedQuantity,
              ownership: 'COMPANY',
              condition: 'AVAILABLE',
              sourceType: 'JOB_WORK_RETURN',
              sourceId: grn.id,
              idempotencyKey: `JOB_WORK_RETURN:${grn.id}`,
              actorId,
              correlationId: options?.requestId || grn.id
            });
          }
        }
      } catch (modernErr) {
        console.warn('[JobWorkService.receiveReturn] Modern ledger post fallback notice:', modernErr);
      }

      // 3. Create JobWorkReceiptReturn record
      const receiptReturn = await tx.jobWorkReceiptReturn.create({
        data: {
          returnNumber,
          jobWorkOrderId: input.jobWorkOrderId ?? null,
          vendorId: input.vendorId,
          goodsReceiptId: grn.id,
          locationId: input.locationId,
          disposition: input.disposition,
          productId: input.productId ?? null,
          materialId: input.materialId ?? null,
          uomId: input.uomId,
          expectedQuantity: input.expectedQuantity,
          receivedQuantity: input.receivedQuantity,
          acceptedQuantity: input.acceptedQuantity,
          shortQuantity,
          excessQuantity,
          scrapQuantity: input.scrapQuantity || 0,
          consumedRawMaterial: input.consumedRawMaterial || input.acceptedQuantity,
          receivedById: actorId,
          receivedAt: new Date(),
          notes: input.notes ?? null
        },
        include: {
          vendor: true,
          goodsReceipt: true,
          location: true,
          product: true,
          material: true,
          uom: true,
          receivedBy: true
        }
      });

      // 4. Update vendor-held custody ledger: record processing consumption and scrap against the input raw material
      const consumedRawMaterial = input.consumedRawMaterial || input.acceptedQuantity;
      if (consumedRawMaterial > 0) {
        // Find the input raw material from the linked order if available, so custody balance decrements the actual material issued
        let custodyMaterialId = input.materialId ?? null;
        let custodyProductId = input.productId ?? null;
        let custodyUomId = input.uomId;

        if (input.jobWorkOrderId) {
          const linkedOrder = await tx.jobWorkOrder.findUnique({
            where: { id: input.jobWorkOrderId },
            include: { lines: true }
          });
          const rawLine = linkedOrder?.lines.find(l => l.materialId);
          if (rawLine) {
            custodyMaterialId = rawLine.materialId;
            custodyProductId = null;
            custodyUomId = rawLine.uomId;
          }
        }

        const latest = await this.repository.getLatestVendorCustodyEntry({
          vendorId: input.vendorId,
          materialId: custodyMaterialId ?? undefined,
          productId: custodyProductId ?? undefined
        }, tx);

        const prevBal = latest?.runningBalance || 0;
        const entryNumber = await this.repository.getNextLedgerEntryNumber('2026', tx);

        await tx.jobWorkCustodyLedger.create({
          data: {
            entryNumber,
            vendorId: input.vendorId,
            jobWorkOrderId: input.jobWorkOrderId ?? null,
            materialId: custodyMaterialId,
            productId: custodyProductId,
            uomId: custodyUomId,
            entryType: JobWorkCustodyEntryType.RETURN_PROCESSING,
            direction: StockDirection.OUT, // Out of vendor custody
            quantity: consumedRawMaterial,
            runningBalance: prevBal - consumedRawMaterial,
            referenceType: 'GRN_RECEIPT',
            referenceId: grn.id,
            note: `Vendor custody consumed upon return ${returnNumber}`
          }
        });
      }

      // 5. If shortage detected and debit note requested, automatically create Debit Note
      let debitNote = null;
      if (shortQuantity > 0 && input.generateDebitNoteForShortage) {
        const dnCount = (await tx.debitNote.count()) + 1;
        const debitNoteNumber = `DN-JW-2026-${String(dnCount).padStart(4, '0')}`;

        debitNote = await tx.debitNote.create({
          data: {
            debitNoteNumber,
            vendorId: input.vendorId,
            grnId: grn.id,
            reason: input.debitNoteReason || `Job Work Return Shortage: Received ${input.receivedQuantity} vs Expected ${input.expectedQuantity} for ${returnNumber}`,
            status: 'DRAFT',
            createdBy: actorId,
            lines: {
              create: [
                {
                  grnLineId: grn.lines[0].id,
                  productId: input.productId ?? null,
                  materialId: input.materialId ?? null,
                  description: `Shortage deduction for Job Work Return ${returnNumber}`,
                  expectedQuantity: new Prisma.Decimal(input.expectedQuantity),
                  receivedQuantity: new Prisma.Decimal(input.receivedQuantity),
                  acceptedQuantity: new Prisma.Decimal(input.acceptedQuantity),
                  rejectedQuantity: new Prisma.Decimal(0),
                  damagedQuantity: new Prisma.Decimal(0),
                  shortQuantity: new Prisma.Decimal(shortQuantity),
                  unitPrice: new Prisma.Decimal(0),
                  taxRate: new Prisma.Decimal(0),
                  taxableAmount: new Prisma.Decimal(0),
                  taxAmount: new Prisma.Decimal(0),
                  totalAmount: new Prisma.Decimal(0),
                  reason: `Shortage of ${shortQuantity} units`
                }
              ]
            }
          }
        });
      }

      // 6. Update order status if order linked
      if (input.jobWorkOrderId) {
        const order = await tx.jobWorkOrder.findUnique({
          where: { id: input.jobWorkOrderId },
          include: { lines: true, returns: true }
        });

        if (order) {
          const totalAccepted = order.returns.reduce((sum, r) => sum + r.acceptedQuantity, 0) + input.acceptedQuantity;
          const isFullyReturned = totalAccepted >= order.targetQuantity;

          await tx.jobWorkOrder.update({
            where: { id: order.id },
            data: {
              status: isFullyReturned ? JobWorkOrderStatus.FULLY_RETURNED : JobWorkOrderStatus.PARTIALLY_RETURNED
            }
          });

          // Update lines returned/consumed
          const matchingLine = order.lines.find(
            (l) =>
              (input.materialId && l.materialId === input.materialId) ||
              (input.productId && l.productId === input.productId)
          );
          if (matchingLine) {
            await tx.jobWorkOrderLine.update({
              where: { id: matchingLine.id },
              data: {
                returnedQuantity: { increment: input.receivedQuantity },
                consumedQuantity: { increment: consumedRawMaterial },
                scrapQuantity: { increment: input.scrapQuantity || 0 }
              }
            });
          }
        }
      }

      return { receiptReturn, grn, debitNote };
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.return_receive',
      entityType: 'JobWorkReceiptReturn',
      entityId: result.receiptReturn.id,
      after: result.receiptReturn,
      metadata: {
        returnNumber: result.receiptReturn.returnNumber,
        grnId: result.grn.id,
        debitNoteId: result.debitNote?.id
      },
      requestId: options?.requestId
    });

    return result;
  }

  // 5. Reconcile Job Work Order (Issue vs Return vs Custody vs Shortage/Scrap)
  async reconcileOrder(
    input: CreateJobWorkReconciliationInput,
    actorId: string,
    options?: { requestId?: string }
  ) {
    const canReconcile = await this.permissionChecker.can(actorId, 'reconcile', 'JobWorkOrder');
    if (!canReconcile) throw new ForbiddenError('Lacks permission to reconcile Job Work Orders.');

    const order = await this.repository.findOrderById(input.jobWorkOrderId);
    if (!order) throw new NotFoundError(`Job Work Order [${input.jobWorkOrderId}] not found.`);

    const totalIssuedQty = order.challans.reduce((sum, c) => sum + c.quantity, 0);
    const totalReturnedQty = order.returns.reduce((sum, r) => sum + r.acceptedQuantity, 0);
    const totalConsumedQty = order.returns.reduce((sum, r) => sum + r.consumedRawMaterial, 0);
    const totalScrapQty = order.returns.reduce((sum, r) => sum + r.scrapQuantity, 0);
    const shortageQty = order.returns.reduce((sum, r) => sum + r.shortQuantity, 0);
    const excessQty = order.returns.reduce((sum, r) => sum + r.excessQuantity, 0);

    const outstandingCustodyQty = Math.max(0, totalIssuedQty - totalConsumedQty - totalScrapQty);

    const nextReconCount = (await this.repository.countReconciliations()) + 1;
    const reconciliationNumber = `JREC-2026-${String(nextReconCount).padStart(4, '0')}`;

    const reconciliation = await defaultPrisma.$transaction(async (tx: PrismaOrTx) => {
      let debitNoteId = null;

      if (shortageQty > 0 && input.autoGenerateDebitNote) {
        const existingDn = await tx.debitNote.findFirst({
          where: {
            vendorId: order.vendorId,
            reason: { contains: order.orderNumber }
          }
        });

        if (existingDn) {
          debitNoteId = existingDn.id;
        } else {
          const dnCount = (await tx.debitNote.count()) + 1;
          const debitNoteNumber = `DN-JW-2026-${String(dnCount).padStart(4, '0')}`;
          const newDn = await tx.debitNote.create({
            data: {
              debitNoteNumber,
              vendorId: order.vendorId,
              reason: `Reconciliation shortage claim for ${order.orderNumber}. Shortage: ${shortageQty} units.`,
              status: 'DRAFT',
              createdBy: actorId,
              lines: {
                create: [
                  {
                    productId: order.productId ?? null,
                    description: `Reconciliation Shortage claim for Job Work Order ${order.orderNumber}`,
                    expectedQuantity: new Prisma.Decimal(totalIssuedQty),
                    receivedQuantity: new Prisma.Decimal(totalReturnedQty),
                    acceptedQuantity: new Prisma.Decimal(totalReturnedQty),
                    rejectedQuantity: new Prisma.Decimal(0),
                    damagedQuantity: new Prisma.Decimal(0),
                    shortQuantity: new Prisma.Decimal(shortageQty),
                    unitPrice: new Prisma.Decimal(0),
                    taxRate: new Prisma.Decimal(0),
                    taxableAmount: new Prisma.Decimal(0),
                    taxAmount: new Prisma.Decimal(0),
                    totalAmount: new Prisma.Decimal(0),
                    reason: `Unreturned / Shortage balance of ${shortageQty}`
                  }
                ]
              }
            }
          });
          debitNoteId = newDn.id;
        }
      }

      const reconStatus = shortageQty > 0
        ? JobWorkReconciliationStatus.DISCREPANCY_FLAGGED
        : JobWorkReconciliationStatus.RECONCILED;

      const created = await tx.jobWorkReconciliation.create({
        data: {
          reconciliationNumber,
          jobWorkOrderId: order.id,
          returnId: input.returnId ?? null,
          debitNoteId,
          status: reconStatus,
          totalIssuedQty,
          totalReturnedQty,
          totalConsumedQty,
          totalScrapQty,
          shortageQty,
          excessQty,
          outstandingCustodyQty,
          financialImpactNotes: input.financialImpactNotes || 'V-014: Operational custody reconciled. Accounting journal entries deferred until financial policy validation.',
          reconciledById: actorId,
          reconciledAt: new Date(),
          reason: input.reason ?? null,
          evidenceAttachments: input.evidenceAttachments ? (input.evidenceAttachments as Prisma.InputJsonValue) : undefined
        },
        include: {
          jobWorkOrder: true,
          debitNote: true,
          reconciledBy: true
        }
      });

      // Update Job Work Order status to RECONCILED
      await tx.jobWorkOrder.update({
        where: { id: order.id },
        data: { status: JobWorkOrderStatus.RECONCILED }
      });

      return created;
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.order_reconcile',
      entityType: 'JobWorkReconciliation',
      entityId: reconciliation.id,
      after: reconciliation,
      metadata: { reconciliationNumber: reconciliation.reconciliationNumber, orderNumber: order.orderNumber },
      requestId: options?.requestId
    });

    return reconciliation;
  }

  // 6. Close Job Work Order
  async closeOrder(
    id: string,
    actorId: string,
    remarks?: string,
    options?: { requestId?: string }
  ) {
    const canClose = await this.permissionChecker.can(actorId, 'close', 'JobWorkOrder');
    if (!canClose) throw new ForbiddenError('Lacks permission to close Job Work Orders.');

    const order = await this.repository.findOrderById(id);
    if (!order) throw new NotFoundError(`Job Work Order [${id}] not found.`);

    const updated = await this.repository.updateOrder(id, {
      status: JobWorkOrderStatus.CLOSED,
      closedBy: { connect: { id: actorId } },
      closedAt: new Date(),
      notes: remarks ? (order.notes ? `${order.notes}\nClosure remarks: ${remarks}` : `Closure remarks: ${remarks}`) : order.notes
    });

    await this.auditWriter.record({
      actorId,
      action: 'job_work.order_close',
      entityType: 'JobWorkOrder',
      entityId: id,
      before: order,
      after: updated,
      metadata: { remarks },
      requestId: options?.requestId
    });

    return updated;
  }

  // 7. Get Vendor Held Custody Balances Live Summary (Consolidated 1 row per vendor)
  async getVendorCustodyBalances(vendorId?: string): Promise<VendorCustodyBalanceDto[]> {
    const where: Prisma.JobWorkCustodyLedgerWhereInput = {};
    if (vendorId) where.vendorId = vendorId;

    const ledgers = await defaultPrisma.jobWorkCustodyLedger.findMany({
      where,
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, sku: true, name: true } },
        uom: { select: { id: true, code: true, name: true, symbol: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Map by vendorId so each vendor has exactly ONE consolidated custody record
    const vendorMap = new Map<string, {
      summary: VendorCustodyBalanceDto;
      materialsMap: Map<string, NonNullable<VendorCustodyBalanceDto['materials']>[number]>;
    }>();

    for (const entry of ledgers) {
      if (!vendorMap.has(entry.vendorId)) {
        vendorMap.set(entry.vendorId, {
          summary: {
            vendorId: entry.vendorId,
            vendorCode: entry.vendor.code,
            vendorName: entry.vendor.name,
            materialId: entry.materialId,
            materialCode: entry.material?.code || null,
            materialName: entry.material?.name || null,
            productId: entry.productId,
            productSku: entry.product?.sku || null,
            productName: entry.product?.name || null,
            uomId: entry.uomId,
            uomCode: entry.uom.code,
            uomSymbol: entry.uom.symbol || null,
            totalIssued: 0,
            totalAllocated: 0,
            totalConsumed: 0,
            totalScrap: 0,
            currentBalance: 0,
            activeJobOrdersCount: 0,
            materials: []
          },
          materialsMap: new Map()
        });
      }

      const { summary, materialsMap } = vendorMap.get(entry.vendorId)!;

      // Update primary vendor summary
      if (entry.entryType === JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE) {
        summary.totalIssued += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.PO_DEPOSIT_DEDUCTION) {
        summary.totalAllocated += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.RETURN_PROCESSING) {
        summary.totalConsumed += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.SCRAP_GENERATION) {
        summary.totalScrap += entry.quantity;
      }

      // Track item-level breakdown inside this vendor
      const itemKey = `${entry.materialId || 'none'}:${entry.productId || 'none'}:${entry.uomId}`;
      if (!materialsMap.has(itemKey)) {
        materialsMap.set(itemKey, {
          materialId: entry.materialId,
          materialCode: entry.material?.code || null,
          materialName: entry.material?.name || null,
          productId: entry.productId,
          productSku: entry.product?.sku || null,
          productName: entry.product?.name || null,
          uomCode: entry.uom.code,
          uomSymbol: entry.uom.symbol || null,
          totalIssued: 0,
          totalAllocated: 0,
          totalConsumed: 0,
          totalScrap: 0,
          currentBalance: 0
        });
      }

      const itemDetail = materialsMap.get(itemKey)!;
      if (entry.entryType === JobWorkCustodyEntryType.RAW_MATERIAL_ISSUE) {
        itemDetail.totalIssued += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.PO_DEPOSIT_DEDUCTION) {
        itemDetail.totalAllocated += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.RETURN_PROCESSING) {
        itemDetail.totalConsumed += entry.quantity;
      } else if (entry.entryType === JobWorkCustodyEntryType.SCRAP_GENERATION) {
        itemDetail.totalScrap += entry.quantity;
      }
      itemDetail.currentBalance = entry.runningBalance;
    }

    // Finalize vendor summary balances and attach materials breakdown
    const result: VendorCustodyBalanceDto[] = [];
    for (const { summary, materialsMap } of vendorMap.values()) {
      summary.materials = Array.from(materialsMap.values());
      // Total vendor balance = Total Issued - Total Consumed - Total Scrap
      summary.currentBalance = summary.totalIssued - summary.totalConsumed - summary.totalScrap;
      // If multiple materials exist, set display name to composite description
      // Determine primary material metadata based on actual active balance or issues
      if (summary.materials.length > 0) {
        const activeMat =
          summary.materials.find((m) => m.currentBalance > 0 || m.totalIssued > 0) ||
          summary.materials[summary.materials.length - 1];
        if (activeMat) {
          summary.materialId = activeMat.materialId;
          summary.materialCode = activeMat.materialCode;
          summary.materialName = activeMat.materialName;
          summary.productId = activeMat.productId;
          summary.productSku = activeMat.productSku;
          summary.productName = activeMat.productName;
          summary.uomCode = activeMat.uomCode;
          summary.uomSymbol = activeMat.uomSymbol;
        }
      }
      if (summary.materials.length > 1) {
        const primaryName = summary.materialName || 'Material';
        summary.materialName = `${primaryName} (+${summary.materials.length - 1} more items)`;
      }
      result.push(summary);
    }

    return result;
  }

  // 8. Analytics & Summary Dashboard
  async getAnalyticsSummary(): Promise<JobWorkAnalyticsDto> {
    const [orders, issues, returns, debitNotes] = await Promise.all([
      defaultPrisma.jobWorkOrder.findMany({
        include: { vendor: true, returns: true, challans: true }
      }),
      defaultPrisma.jobWorkMaterialIssue.findMany(),
      defaultPrisma.jobWorkReceiptReturn.findMany(),
      defaultPrisma.debitNote.findMany({
        where: { debitNoteNumber: { startsWith: 'DN-JW-' } }
      })
    ]);

    const totalOrders = orders.length;
    const activeOrders = orders.filter((o) =>
      ['DRAFT', 'APPROVED', 'ISSUED', 'PARTIALLY_RETURNED'].includes(o.status)
    ).length;

    const totalCustodyStockTons = issues.reduce((sum, i) => sum + i.quantity, 0) - returns.reduce((sum, r) => sum + r.consumedRawMaterial, 0);
    const totalAllocatedTons = orders.reduce((sum, o) => sum + o.rawMaterialInputQty, 0);
    const totalShortageClaims = returns.reduce((sum, r) => sum + r.shortQuantity, 0);
    const openDebitNotesCount = debitNotes.filter((d) => d.status === 'DRAFT' || d.status === 'SUBMITTED').length;

    // Vendor performance breakdown
    const vendorMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      ordersCount: number;
      totalIssued: number;
      totalReturned: number;
      totalShortage: number;
      totalScrap: number;
    }>();

    for (const o of orders) {
      if (!vendorMap.has(o.vendorId)) {
        vendorMap.set(o.vendorId, {
          vendorId: o.vendorId,
          vendorName: o.vendor.name,
          ordersCount: 0,
          totalIssued: 0,
          totalReturned: 0,
          totalShortage: 0,
          totalScrap: 0
        });
      }
      const v = vendorMap.get(o.vendorId)!;
      v.ordersCount += 1;
      v.totalIssued += o.challans.reduce((sum, c) => sum + c.quantity, 0);
      v.totalReturned += o.returns.reduce((sum, r) => sum + r.acceptedQuantity, 0);
      v.totalShortage += o.returns.reduce((sum, r) => sum + r.shortQuantity, 0);
      v.totalScrap += o.returns.reduce((sum, r) => sum + r.scrapQuantity, 0);
    }

    const vendorPerformance = Array.from(vendorMap.values()).map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      ordersCount: v.ordersCount,
      totalIssued: v.totalIssued,
      totalReturned: v.totalReturned,
      scrapYieldPercent: v.totalIssued > 0 ? Math.round((v.totalScrap / v.totalIssued) * 1000) / 10 : 0,
      shortageRatePercent: (v.totalReturned + v.totalShortage) > 0 ? Math.round((v.totalShortage / (v.totalReturned + v.totalShortage)) * 1000) / 10 : 0
    }));

    return {
      totalOrders,
      activeOrders,
      totalCustodyStockTons: Math.max(0, Math.round(totalCustodyStockTons * 100) / 100),
      totalAllocatedTons: Math.round(totalAllocatedTons * 100) / 100,
      totalShortageClaims: Math.round(totalShortageClaims * 100) / 100,
      openDebitNotesCount,
      vendorPerformance
    };
  }
}
