import * as crypto from 'crypto';
import {
  PrismaClient,
  TransactionSourceType,
  IntegrationJob,
  IntegrationJobItemStatus,
  InternalReconciliationStatus,
  LifecycleStatus
} from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import {
  ForbiddenError,
  NotFoundError,
  InvalidStateTransitionError
} from '../../../common/errors/AppError';
import { MappingConfigRepository } from '../repositories/mapping-config.repository';
import { IntegrationJobRepository } from '../repositories/integration-job.repository';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import { TallyExportAdapter, FileBatchTallyExportAdapter } from '../adapters/tally-export.adapter';

export interface ReadinessStatusDto {
  sourceType: TransactionSourceType;
  supported: boolean;
  active: boolean;
  status: 'ACTIVE' | 'NOT_YET_SUPPORTED';
  reason: string;
  hasApprovedMapping: boolean;
  approvedMappingVersion?: number | null;
}

export interface EligibilityResultDto {
  sourceType: TransactionSourceType;
  supported: boolean;
  status: 'SUPPORTED' | 'NOT_YET_SUPPORTED';
  message?: string;
  eligibleCount: number;
  items: {
    sourceId: string;
    referenceNumber: string;
    amount: string;
    currency: string;
    date: string;
    status: string;
  }[];
}

export class TallyIntegrationService {
  constructor(
    private readonly mappingRepo: MappingConfigRepository = new MappingConfigRepository(),
    private readonly jobRepo: IntegrationJobRepository = new IntegrationJobRepository(),
    private readonly reconciliationRepo: ReconciliationRepository = new ReconciliationRepository(),
    _exportAdapter: TallyExportAdapter = new FileBatchTallyExportAdapter(),
    private readonly permissions?: PermissionChecker,
    private readonly auditWriter?: AuditWriter,
    _db: PrismaClient = prisma
  ) {}

  /**
   * 1. Integration Readiness Status for all 6 TransactionSourceTypes
   */
  async getReadinessStatus(): Promise<ReadinessStatusDto[]> {
    const allSourceTypes: TransactionSourceType[] = [
      'PURCHASE_ORDER',
      'SALES_INVOICE',
      'DEBIT_NOTE',
      'JOB_WORK',
      'RETURN',
      'INVENTORY_COGS'
    ];

    const result: ReadinessStatusDto[] = [];

    for (const st of allSourceTypes) {
      const approvedMapping = await this.mappingRepo.findApprovedBySourceType(st);
      if (st === 'PURCHASE_ORDER') {
        result.push({
          sourceType: st,
          supported: false,
          active: false,
          status: 'NOT_YET_SUPPORTED',
          reason: 'Purchase orders are commitments, not purchase vouchers. Legacy PO-to-Tally export is disabled; use a verified purchase bill workflow.',
          hasApprovedMapping: Boolean(approvedMapping),
          approvedMappingVersion: approvedMapping?.version ?? null
        });
      } else if (st === 'INVENTORY_COGS') {
        result.push({
          sourceType: st,
          supported: false,
          active: false,
          status: 'NOT_YET_SUPPORTED',
          reason: 'Blocked: StockLedgerEntry lacks populated unitCost/totalValue valuation data; pending Module 4 valuation engine.',
          hasApprovedMapping: Boolean(approvedMapping),
          approvedMappingVersion: approvedMapping?.version ?? null
        });
      } else {
        const blockingReasonMap: Record<string, string> = {
          SALES_INVOICE: 'Blocked: Sales Orders/Invoices module pending (Module 15 / V-011).',
          DEBIT_NOTE: 'Blocked: Debit note accounting treatment unresolved (V-008).',
          JOB_WORK: 'Blocked: Job Work module pending (Module 14 / V-014).',
          RETURN: 'Blocked: Return logistics and accounting treatment pending.'
        };

        result.push({
          sourceType: st,
          supported: false,
          active: false,
          status: 'NOT_YET_SUPPORTED',
          reason: blockingReasonMap[st] || 'Source type not yet supported in this release pass.',
          hasApprovedMapping: Boolean(approvedMapping),
          approvedMappingVersion: approvedMapping?.version ?? null
        });
      }
    }

    return result;
  }

  /** Legacy eligibility is disabled until a reviewed posted-voucher exchange exists. */
  async checkEligibility(sourceType: TransactionSourceType): Promise<EligibilityResultDto> {
    return {
      sourceType,
      supported: false,
      status: 'NOT_YET_SUPPORTED',
      message: sourceType === 'PURCHASE_ORDER'
        ? 'Purchase orders are commitments and cannot be exported as accounting vouchers.'
        : 'This source has no verified posted voucher exchange yet.',
      eligibleCount: 0,
      items: []
    };
  }

  /**
   * 3. Mapping Configuration Management
   */
  async createMappingConfiguration(
    actorId: string,
    input: {
      sourceType: TransactionSourceType;
      version?: number;
      fieldMapping: any;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    }
  ) {
    if (this.permissions) {
      const allowed = await this.permissions.can(actorId, 'create', 'FinanceMapping');
      if (!allowed) {
        throw new ForbiddenError('Forbidden: Insufficient permissions to create integration mapping configuration');
      }
    }

    const latestVersion = await this.mappingRepo.getLatestVersionNumber(input.sourceType);
    const nextVersion = input.version || latestVersion + 1;

    const mapping = await this.mappingRepo.create({
      sourceType: input.sourceType,
      version: nextVersion,
      fieldMapping: input.fieldMapping,
      effectiveFrom: input.effectiveFrom || new Date(),
      createdById: actorId
    });

    if (this.auditWriter) {
      await this.auditWriter.record({
        actorId,
        action: 'CREATE_MAPPING_CONFIGURATION',
        entityType: 'MappingConfiguration',
        entityId: mapping.id,
        after: mapping
      });
    }

    return mapping;
  }

  async approveMappingConfiguration(actorId: string, mappingId: string) {
    if (this.permissions) {
      const allowed = await this.permissions.can(actorId, 'approve', 'FinanceMapping');
      if (!allowed) {
        throw new ForbiddenError('Forbidden: Insufficient permissions to approve integration mapping configuration');
      }
    }

    const mapping = await this.mappingRepo.findById(mappingId);
    if (!mapping) {
      throw new NotFoundError(`Mapping configuration with ID ${mappingId} not found`);
    }

    // Segregation of Duties: Creator cannot approve their own mapping configuration
    if (mapping.createdById === actorId) {
      throw new InvalidStateTransitionError('Segregation of duties violation: Creator cannot approve their own mapping configuration');
    }

    if (mapping.status === LifecycleStatus.APPROVED) {
      throw new InvalidStateTransitionError('Mapping configuration is already approved');
    }

    const updated = await this.mappingRepo.approve(mappingId, actorId);

    if (this.auditWriter) {
      await this.auditWriter.record({
        actorId,
        action: 'APPROVE_MAPPING_CONFIGURATION',
        entityType: 'MappingConfiguration',
        entityId: mappingId,
        before: mapping,
        after: updated
      });
    }

    return updated;
  }

  /**
   * 4. Queue Transactions into an IntegrationJob
   */
  async queueTransactions(_actorId: string, _sourceType: TransactionSourceType, _sourceIds: string[]): Promise<IntegrationJob> {
    throw new InvalidStateTransitionError('Legacy Tally queue is retired. Only verified posted accounting vouchers may enter a new Tally exchange.');
  }

  /**
   * 5. Trigger Export Run
   * Calls stub TallyExportAdapter, writes batch file, transitions items to SENT.
   * Does NOT auto-transition to ACKNOWLEDGED or RECONCILED.
   */
  async exportBatch(_actorId: string, _jobId: string): Promise<IntegrationJob> {
    throw new InvalidStateTransitionError('Legacy Tally export is retired. A generated batch file is not an acknowledged Tally import.');
  }

  /**
   * 6. Manual Finance Confirmation / Acknowledgement
   */
  async manualAcknowledge(
    actorId: string,
    itemId: string,
    input?: { externalReference?: string; notes?: string }
  ) {
    if (this.permissions) {
      const allowed = await this.permissions.can(actorId, 'acknowledge', 'FinanceIntegration');
      if (!allowed) {
        throw new ForbiddenError('Forbidden: Insufficient permissions to acknowledge integration item');
      }
    }

    const item = await this.jobRepo.findJobItemById(itemId);
    if (!item) {
      throw new NotFoundError(`Integration job item with ID ${itemId} not found`);
    }

    // State machine check: Must be in SENT or EXPORTED state
    if (item.status !== IntegrationJobItemStatus.SENT && item.status !== IntegrationJobItemStatus.EXPORTED) {
      throw new InvalidStateTransitionError(`Invalid state transition: Cannot acknowledge item from status ${item.status}. Expected SENT or EXPORTED.`);
    }

    const updated = await this.jobRepo.updateItemStatus(itemId, IntegrationJobItemStatus.ACKNOWLEDGED, {
      acknowledgedById: actorId,
      externalReference: input?.externalReference
    });

    if (this.auditWriter) {
      await this.auditWriter.record({
        actorId,
        action: 'ACKNOWLEDGE_INTEGRATION_ITEM',
        entityType: 'IntegrationJobItem',
        entityId: itemId,
        before: item,
        after: updated,
        metadata: { notes: input?.notes }
      });
    }

    return updated;
  }

  /**
   * 7. Internal Consistency Reconciliation
   * Verifies item reached terminal state without duplicates or silent drops.
   * External amount is null in this pass because no real Tally connector exists.
   */
  async reconcileInternal(
    actorId: string,
    itemId: string,
    input?: { resolutionNotes?: string }
  ) {
    if (this.permissions) {
      const allowed = await this.permissions.can(actorId, 'reconcile', 'FinanceIntegration');
      if (!allowed) {
        throw new ForbiddenError('Forbidden: Insufficient permissions to perform internal reconciliation');
      }
    }

    const item = await this.jobRepo.findJobItemById(itemId);
    if (!item) {
      throw new NotFoundError(`Integration job item with ID ${itemId} not found`);
    }

    // State Machine Check: Must be in ACKNOWLEDGED state
    if (item.status !== IntegrationJobItemStatus.ACKNOWLEDGED) {
      throw new InvalidStateTransitionError(`Invalid state transition: Cannot reconcile item from status ${item.status}. Expected ACKNOWLEDGED.`);
    }

    // Internal consistency check: Verify uniqueness of fingerprint across database
    const duplicateCount = await this.jobRepo.countTotalActiveByFingerprint(item.payloadFingerprint);
    let reconStatus: InternalReconciliationStatus = InternalReconciliationStatus.INTERNALLY_CONSISTENT;

    if (duplicateCount > 1) {
      reconStatus = InternalReconciliationStatus.VARIANCE_FLAGGED;
    }

    const reconRecord = await this.reconciliationRepo.create({
      jobItemId: itemId,
      internalAmount: item.amount,
      externalAmount: null, // Null in this pass - no real Tally response exists
      status: reconStatus,
      investigatedById: actorId,
      resolutionNotes: input?.resolutionNotes || (reconStatus === InternalReconciliationStatus.VARIANCE_FLAGGED
        ? 'Internal consistency check flagged duplicate active export records with identical fingerprint'
        : 'Internal consistency verification passed.')
    });

    const targetItemStatus =
      reconStatus === InternalReconciliationStatus.INTERNALLY_CONSISTENT
        ? IntegrationJobItemStatus.RECONCILED
        : IntegrationJobItemStatus.HELD;

    const updatedItem = await this.jobRepo.updateItemStatus(itemId, targetItemStatus);

    if (this.auditWriter) {
      await this.auditWriter.record({
        actorId,
        action: 'RECONCILE_INTERNAL_ITEM',
        entityType: 'ReconciliationRecord',
        entityId: reconRecord.id,
        after: {
          reconciliationRecord: reconRecord,
          itemStatus: updatedItem.status
        }
      });
    }

    return {
      item: updatedItem,
      reconciliationRecord: reconRecord
    };
  }

  /**
   * 8. Controlled Error & Retry
   */
  async investigateAndRetry(
    actorId: string,
    itemId: string,
    action: 'RETRY' | 'REJECT' | 'HOLD',
    reason: string
  ) {
    if (this.permissions) {
      const allowed = await this.permissions.can(actorId, 'retry', 'FinanceIntegration');
      if (!allowed) {
        throw new ForbiddenError('Forbidden: Insufficient permissions to retry/modify failed integration items');
      }
    }

    const item = await this.jobRepo.findJobItemById(itemId);
    if (!item) {
      throw new NotFoundError(`Integration job item with ID ${itemId} not found`);
    }

    // State Machine Check: Can only investigate/retry if in FAILED or INVESTIGATED or HELD state
    const allowedSourceStatuses: IntegrationJobItemStatus[] = [
      IntegrationJobItemStatus.FAILED,
      IntegrationJobItemStatus.INVESTIGATED,
      IntegrationJobItemStatus.HELD
    ];

    if (!allowedSourceStatuses.includes(item.status)) {
      throw new InvalidStateTransitionError(`Invalid state transition: Cannot perform ${action} from status ${item.status}`);
    }

    let nextStatus: IntegrationJobItemStatus;
    if (action === 'RETRY') {
      nextStatus = IntegrationJobItemStatus.QUEUED;
    } else if (action === 'REJECT') {
      nextStatus = IntegrationJobItemStatus.REJECTED;
    } else {
      nextStatus = IntegrationJobItemStatus.HELD;
    }

    const updated = await this.jobRepo.updateItemStatus(itemId, nextStatus, {
      errorMessage: `Investigation [${action}]: ${reason} (by ${actorId})`,
      retryCountIncrement: action === 'RETRY'
    });

    if (this.auditWriter) {
      await this.auditWriter.record({
        actorId,
        action: `INVESTIGATE_${action}`,
        entityType: 'IntegrationJobItem',
        entityId: itemId,
        before: item,
        after: updated,
        metadata: { reason, previousStatus: item.status }
      });
    }

    return updated;
  }
  // Historical fingerprints remain readable for legacy batch audit records.
  computePurchaseOrderFingerprint(po: { id: string; poNumber: string; totalAmount: { toString(): string }; currency: string; updatedAt: Date }, mappingVersion: number): string {
    const raw = `${po.id}:${po.poNumber}:${po.totalAmount.toString()}:${po.currency}:${po.updatedAt.toISOString()}:v${mappingVersion}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
