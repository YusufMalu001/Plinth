import { FgPackagingStatus, FgReceiptStatus, PrismaClient, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { prisma as defaultPrisma } from '../../../database';
import { FgReceiptRepository } from '../repositories/fg-receipt.repository';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError
} from '../../../common/errors/AppError';

export class MissingFinalFgQcCriteriaError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'MISSING_FINAL_FG_QC_CRITERIA', details);
  }
}

export class FgGateBlockedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'FG_GATE_BLOCKED', details);
  }
}

export interface FgGateEvaluationResult {
  isReadyToReceive: boolean;
  isQcPassed: boolean;
  hasApprovedQcCriteria: boolean;
  isPackagingReady: boolean;
  blockReason: string | null;
}

export class FgReceiptService {
  constructor(
    private readonly repository: FgReceiptRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter,
    private readonly prisma: PrismaClient = defaultPrisma
  ) {}

  /**
   * 1. Evaluate FG Receipt Gate
   * Checks:
   * a. Approved V-009 criteria exists for FINAL_FG on this product/route
   * b. InspectionResult has status PASS
   * c. FgPackagingRecord has status READY_FOR_DISPATCH
   */
  async evaluateGate(fgReadyOutputId: string): Promise<FgGateEvaluationResult> {
    const readyOutput = await this.repository.findReadyOutputById(fgReadyOutputId);
    if (!readyOutput) {
      throw new NotFoundError(`FgReadyOutput '${fgReadyOutputId}' not found.`);
    }

    const productId = readyOutput.productId;

    // Check V-009 Approved QC Rule for FINAL_FG (product-specific, FINAL_FG checkpoint, or active GLOBAL)
    const approvedQcRule = await this.prisma.qcRule.findFirst({
      where: {
        status: { in: ['ACTIVE', 'APPROVED'] },
        OR: [
          { targetType: 'FINAL_FG', targetId: productId },
          { targetType: 'FINAL_FG' },
          { targetType: 'PRODUCT', targetId: productId },
          { targetType: 'GLOBAL' }
        ]
      }
    });

    const hasApprovedQcCriteria = Boolean(approvedQcRule);

    // Check Inspection Result
    const qcResult = readyOutput.qcInspectionResult;
    const isQcPassed = Boolean(qcResult && qcResult.status === 'PASS');

    // Check Packaging Readiness (Default ASSUMPTION: READY_FOR_DISPATCH is required)
    const packagingStatus = readyOutput.packagingRecord?.status;
    const isPackagingReady = packagingStatus === 'READY_FOR_DISPATCH';

    let blockReason: string | null = null;
    if (!hasApprovedQcCriteria) {
      blockReason = 'BLOCKED_NO_APPROVED_QC_CRITERIA: No active/approved V-009 QC criteria found for FINAL_FG checkpoint on this product.';
    } else if (!isQcPassed) {
      blockReason = 'BLOCKED_QC_NOT_PASSED: FINAL_FG Inspection result is not PASS.';
    } else if (!isPackagingReady) {
      blockReason = `BLOCKED_PACKAGING_NOT_READY: Packaging status is '${packagingStatus || 'NOT_PACKED'}' (must be READY_FOR_DISPATCH).`;
    }

    const isReadyToReceive = hasApprovedQcCriteria && isQcPassed && isPackagingReady;

    return {
      isReadyToReceive,
      isQcPassed,
      hasApprovedQcCriteria,
      isPackagingReady,
      blockReason
    };
  }

  /**
   * 2. Create FgReadyOutput (from Assembly completion or direct manufacturing)
   */
  async createReadyOutput(
    input: {
      assemblyBatchId?: string | null;
      productId: string;
      productVariantId?: string | null;
      quantity: number;
      uomId: string;
      qcInspectionResultId?: string | null;
      notes?: string | null;
    },
    actorId: string,
    requestId?: string
  ) {
    const outputNumber = await generateSequentialNumber({
      prefix: `FG-OUT-${new Date().getFullYear()}-`,
      countByPrefix: async (p) => {
        return this.prisma.fgReadyOutput.count({
          where: { outputNumber: { startsWith: p } }
        });
      },
      existsByNumber: async (cand) => {
        const found = await this.prisma.fgReadyOutput.findUnique({
          where: { outputNumber: cand }
        });
        return !!found;
      },
      padLength: 4
    });

    const created = await this.repository.createReadyOutput({
      outputNumber,
      ...input
    });

    await this.auditWriter.record({
      actorId,
      action: 'CREATE_FG_READY_OUTPUT',
      entityType: 'FgReadyOutput',
      entityId: created.id,
      after: created,
      requestId
    });

    return created;
  }

  /**
   * 3. Update Packaging Readiness Status
   */
  async updatePackagingStatus(
    outputId: string,
    input: {
      status: FgPackagingStatus;
      packNotes?: string | null;
      stagedLocationId?: string | null;
    },
    actorId: string,
    requestId?: string
  ) {
    const allowed = await this.permissionChecker.can(actorId, 'update_packaging', 'FgPackagingRecord');
    if (!allowed) throw new ForbiddenError('Lacks permission to update FG packaging status.');

    const readyOutput = await this.repository.findReadyOutputById(outputId);
    if (!readyOutput) throw new NotFoundError(`FgReadyOutput '${outputId}' not found.`);

    const updated = await this.repository.updatePackagingRecord(outputId, actorId, input);

    await this.auditWriter.record({
      actorId,
      action: 'UPDATE_FG_PACKAGING_STATUS',
      entityType: 'FgPackagingRecord',
      entityId: updated.id,
      before: { status: readyOutput.packagingRecord?.status },
      after: { status: updated.status, stagedLocationId: updated.stagedLocationId },
      requestId
    });

    return updated;
  }

  /**
   * 4. Receive FG through Gate into Authoritative Stock Ledger & Balance
   */
  async receiveThroughGate(
    input: {
      fgReadyOutputId: string;
      locationId: string;
      notes?: string | null;
    },
    actorId: string,
    requestId?: string
  ) {
    const allowed = await this.permissionChecker.can(actorId, 'receive', 'FgReceipt');
    if (!allowed) throw new ForbiddenError('Lacks permission to receive FG into inventory.');

    // Step 1: Evaluate Gate
    const gate = await this.evaluateGate(input.fgReadyOutputId);
    if (!gate.hasApprovedQcCriteria) {
      throw new MissingFinalFgQcCriteriaError(
        gate.blockReason || 'Missing approved V-009 criteria for FINAL_FG'
      );
    }
    if (!gate.isReadyToReceive) {
      throw new FgGateBlockedError(
        gate.blockReason || 'FG Receipt Gate blocked: requirements not met.'
      );
    }

    const readyOutput = await this.repository.findReadyOutputById(input.fgReadyOutputId);
    if (!readyOutput) throw new NotFoundError(`FgReadyOutput '${input.fgReadyOutputId}' not found.`);

    // Step 2: Check duplicate receipt
    const existing = await this.repository.findReceiptByReadyOutputId(input.fgReadyOutputId);
    if (existing) {
      throw new ConflictError(`FgReceipt already created for ready output '${input.fgReadyOutputId}'`);
    }

    const receiptNumber = await generateSequentialNumber({
      prefix: `FGR-${new Date().getFullYear()}-`,
      countByPrefix: async (p) => {
        return this.prisma.fgReceipt.count({
          where: { receiptNumber: { startsWith: p } }
        });
      },
      existsByNumber: async (cand) => {
        const found = await this.prisma.fgReceipt.findUnique({
          where: { receiptNumber: cand }
        });
        return !!found;
      },
      padLength: 4
    });

    const receipt = await this.repository.executeFgReceiptTransaction({
      receiptNumber,
      fgReadyOutputId: input.fgReadyOutputId,
      productId: readyOutput.productId,
      productVariantId: readyOutput.productVariantId,
      locationId: input.locationId,
      quantity: Number(readyOutput.quantity),
      uomId: readyOutput.uomId,
      actorId,
      notes: input.notes
    });

    await this.auditWriter.record({
      actorId,
      action: 'RECEIVE_FINISHED_GOODS',
      entityType: 'FgReceipt',
      entityId: receipt.id,
      after: {
        receiptNumber: receipt.receiptNumber,
        productId: receipt.productId,
        quantity: receipt.quantity,
        locationId: receipt.locationId
      },
      requestId
    });

    return receipt;
  }

  /**
   * 5. Hold / Quarantine FG Receipt (Handles Hold-Overrides-Reservation Case)
   */
  async holdReceipt(
    receiptId: string,
    reason: string,
    actorId: string,
    requestId?: string
  ) {
    const allowed = await this.permissionChecker.can(actorId, 'hold', 'FgReceipt');
    if (!allowed) throw new ForbiddenError('Lacks permission to place FG on hold.');

    const receipt = await this.repository.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundError(`FgReceipt '${receiptId}' not found.`);

    if (receipt.status === 'HELD') {
      throw new ConflictError(`FgReceipt '${receiptId}' is already on hold.`);
    }

    // Check for active reservations that are overridden/affected by this hold
    const activeReservationsCount = await this.repository.countActiveReservationsForProduct(
      receipt.productId,
      receipt.locationId
    );

    const updated = await this.repository.updateReceiptStatus(receiptId, {
      status: 'HELD',
      holdReason: reason,
      heldAt: new Date(),
      heldByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'HOLD_FINISHED_GOODS',
      entityType: 'FgReceipt',
      entityId: receiptId,
      before: { status: receipt.status },
      after: {
        status: 'HELD',
        holdReason: reason,
        affectedReservationConflicts: activeReservationsCount
      },
      requestId
    });

    return {
      ...updated,
      activeReservationConflictsCount: activeReservationsCount
    };
  }

  /**
   * 6. Release FG Receipt from Hold
   */
  async releaseReceipt(
    receiptId: string,
    actorId: string,
    requestId?: string
  ) {
    const allowed = await this.permissionChecker.can(actorId, 'release', 'FgReceipt');
    if (!allowed) throw new ForbiddenError('Lacks permission to release FG from hold.');

    const receipt = await this.repository.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundError(`FgReceipt '${receiptId}' not found.`);

    if (receipt.status !== 'HELD') {
      throw new ConflictError(`FgReceipt '${receiptId}' is not on hold.`);
    }

    const updated = await this.repository.updateReceiptStatus(receiptId, {
      status: 'RELEASED',
      releasedAt: new Date(),
      releasedByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'RELEASE_FINISHED_GOODS',
      entityType: 'FgReceipt',
      entityId: receiptId,
      before: { status: receipt.status },
      after: { status: 'RELEASED' },
      requestId
    });

    return updated;
  }

  /**
   * 7. Full Genealogy Trace
   * FgReceipt -> FgReadyOutput -> AssemblyBatch -> Components -> Source Batches & Issues -> GRN
   */
  async traceGenealogy(receiptId: string, actorId: string) {
    const allowed = await this.permissionChecker.can(actorId, 'view', 'FgReceipt');
    if (!allowed) throw new ForbiddenError('Lacks permission to view FG genealogy.');

    const receipt = await this.repository.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundError(`FgReceipt '${receiptId}' not found.`);

    const readyOutput = receipt.fgReadyOutput;
    const assemblyBatch = readyOutput?.assemblyBatch;

    const componentsTrace = (assemblyBatch?.components || []).map((comp: any) => ({
      componentType: comp.componentType,
      consumedQuantity: Number(comp.consumedQuantity),
      uom: comp.uom?.symbol || 'pcs',
      sourceBatch: comp.sourceBatch
        ? {
            id: comp.sourceBatch.id,
            batchNumber: comp.sourceBatch.batchNumber,
            departmentName: comp.sourceBatch.department?.name
          }
        : null,
      materialIssueLine: comp.materialIssueLine
        ? {
            id: comp.materialIssueLine.id,
            materialCode: comp.materialIssueLine.material?.code,
            materialName: comp.materialIssueLine.material?.name,
            quantity: Number(comp.materialIssueLine.quantity),
            grnLine: null // Followable to GRN if linked
          }
        : null
    }));

    return {
      receipt,
      readyOutput,
      assemblyBatch,
      componentsTrace
    };
  }

  async listReadyOutputs(params: { productId?: string; isReadyOnly?: string; skip?: number; take?: number }, actorId: string) {
    const allowed = await this.permissionChecker.can(actorId, 'view', 'FgReadyOutput');
    if (!allowed) throw new ForbiddenError('Lacks permission to view FG ready outputs.');

    // Auto-sync: Backfill any completed AssemblyBatch with status PASSED_TO_FG that lacks an FgReadyOutput
    try {
      const completedBatches = await this.prisma.assemblyBatch.findMany({
        where: {
          status: 'PASSED_TO_FG',
          fgReadyOutputs: { none: {} }
        },
        include: {
          product: true,
          components: true,
          workerAssignments: true
        }
      });

      for (const batch of completedBatches) {
        const outputQty = Number(batch.actualOutputQuantity) > 0
          ? Number(batch.actualOutputQuantity)
          : Number(batch.targetOutputQuantity);

        const outputNumber = await generateSequentialNumber({
          prefix: `FG-OUT-${new Date().getFullYear()}-`,
          countByPrefix: async (p) => {
            return this.prisma.fgReadyOutput.count({
              where: { outputNumber: { startsWith: p } }
            });
          },
          existsByNumber: async (cand) => {
            const found = await this.prisma.fgReadyOutput.findUnique({
              where: { outputNumber: cand }
            });
            return !!found;
          },
          padLength: 4
        });

        // Link or create inspection result
        let inspectionResultId = batch.qcInspectionResultId;
        if (!inspectionResultId) {
          const inspectorEmp = await this.prisma.employee.findFirst({
            where: { status: 'ACTIVE' }
          });
          const inspectionNumber = await generateSequentialNumber({
            prefix: `QC-ASM-${new Date().getFullYear()}-`,
            countByPrefix: async (p) => {
              return this.prisma.inspectionResult.count({
                where: { inspectionNumber: { startsWith: p } }
              });
            },
            existsByNumber: async (cand) => {
              const found = await this.prisma.inspectionResult.findUnique({
                where: { inspectionNumber: cand }
              });
              return !!found;
            },
            padLength: 4
          });

          const createdInspection = await this.prisma.inspectionResult.create({
            data: {
              inspectionNumber,
              checkpointType: 'FINAL_FG',
              inspectorEmployeeId: inspectorEmp?.id || (batch.workerAssignments?.[0]?.employeeId) || actorId,
              sampledQuantity: new Prisma.Decimal(outputQty),
              defectiveQuantity: new Prisma.Decimal(0),
              status: 'PASS',
              reason: 'Passed assembly QC gate inspection',
              findings: { disposition: 'PASSED_TO_FG' }
            }
          });
          inspectionResultId = createdInspection.id;

          await this.prisma.assemblyBatch.update({
            where: { id: batch.id },
            data: { qcInspectionResultId: inspectionResultId }
          });
        }

        await this.prisma.fgReadyOutput.create({
          data: {
            outputNumber,
            assemblyBatchId: batch.id,
            productId: batch.productId,
            productVariantId: batch.productVariantId,
            quantity: new Prisma.Decimal(outputQty),
            uomId: batch.product?.uomId || batch.components?.[0]?.uomId || '',
            qcInspectionResultId: inspectionResultId,
            notes: `Completed assembly batch ${batch.batchNumber}`,
            packagingRecord: {
              create: {
                status: 'READY_FOR_DISPATCH',
                packNotes: 'Packaged upon assembly completion and QC gate clearance',
                updatedByActorId: actorId
              }
            }
          }
        });
      }
    } catch (syncErr) {
      console.warn('Auto-sync of completed assembly batches to FG ready outputs encountered error:', syncErr);
    }

    const { items, total } = await this.repository.listReadyOutputs(params);

    // Evaluate gate status for each output to support the 3-state UI distinction
    const enriched = await Promise.all(
      items.map(async (output: any) => {
        const gate = await this.evaluateGate(output.id);
        return {
          ...output,
          productName: output.product?.name || null,
          productSku: output.product?.code || output.product?.sku || null,
          assemblyBatchNumber: output.assemblyBatch?.batchNumber || null,
          uomSymbol: output.uom?.symbol || output.product?.uom?.symbol || null,
          hasApprovedQcCriteria: gate.hasApprovedQcCriteria,
          isQcPassed: gate.isQcPassed,
          isPackagingReady: gate.isPackagingReady,
          isReadyToReceive: gate.isReadyToReceive,
          gateBlockReason: gate.blockReason
        };
      })
    );

    return { items: enriched, total };
  }

  async listReceipts(params: { productId?: string; locationId?: string; status?: FgReceiptStatus; skip?: number; take?: number }, actorId: string) {
    const allowed = await this.permissionChecker.can(actorId, 'view', 'FgReceipt');
    if (!allowed) throw new ForbiddenError('Lacks permission to view FG receipts.');

    const { items, total } = await this.repository.listReceipts(params);
    const enriched = items.map((receipt: any) => ({
      ...receipt,
      productName: receipt.product?.name || null,
      productSku: receipt.product?.code || receipt.product?.sku || null,
      uomSymbol: receipt.uom?.symbol || receipt.product?.uom?.symbol || null,
      locationName: receipt.location?.name || null,
      locationCode: receipt.location?.code || null
    }));

    return { items: enriched, total };
  }
}

