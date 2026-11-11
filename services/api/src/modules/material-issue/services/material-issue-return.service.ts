import { MaterialIssueReturn, MaterialIssueReturnType } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { MaterialIssueRepository, MaterialIssueReturnRepository } from '../repositories';
import { StockLedgerRepository } from '../../inventory/repositories/stock-ledger.repository';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

const QUANTITY_EPSILON = 1e-6;

function permissionForReturnType(returnType: MaterialIssueReturnType): string {
  return returnType === 'DAMAGED_REPLACEMENT' ? 'replace' : 'return';
}

export class MaterialIssueReturnService {
  constructor(
    private readonly repository: MaterialIssueReturnRepository,
    private readonly materialIssueRepository: MaterialIssueRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  /** "return not exceeding outstanding issue" - outstanding = issued minus already-settled returns. */
  async request(
    materialIssueId: string,
    materialIssueLineId: string,
    data: { returnType: MaterialIssueReturnType; quantity: number; reason?: string },
    actorId: string,
    requestId?: string
  ): Promise<MaterialIssueReturn> {
    const canReturn = await this.permissionChecker.can(actorId, permissionForReturnType(data.returnType), 'MaterialIssue');
    if (!canReturn) throw new ForbiddenError(`Lacks permission to ${permissionForReturnType(data.returnType)} material against a material issue.`);

    if (data.quantity <= 0) throw new ValidationError('Return quantity must be positive.');

    const issue = await this.materialIssueRepository.findById(materialIssueId);
    if (!issue) throw new NotFoundError(`MaterialIssue [${materialIssueId}] not found.`);
    if (issue.status !== 'POSTED') {
      throw new InvalidStateTransitionError(`Cannot return/replace against MaterialIssue [${materialIssueId}] in state [${issue.status}]. Must be POSTED.`);
    }

    const line = issue.lines.find((l) => l.id === materialIssueLineId);
    if (!line) throw new NotFoundError(`MaterialIssueLine [${materialIssueLineId}] does not belong to MaterialIssue [${materialIssueId}].`);

    const settled = await this.repository.sumSettledByLineId(materialIssueLineId);
    const outstanding = line.issuedQuantity - settled;
    if (data.quantity > outstanding + QUANTITY_EPSILON) {
      throw new ValidationError(
        `Return quantity ${data.quantity} exceeds the outstanding issued quantity ${outstanding} for MaterialIssueLine [${materialIssueLineId}].`
      );
    }

    const created = await this.repository.create({
      materialIssueId,
      materialIssueLineId,
      returnType: data.returnType,
      quantity: data.quantity,
      reason: data.reason,
      requestedByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.return_request',
      entityType: 'MaterialIssue',
      entityId: materialIssueId,
      after: created,
      requestId
    });

    return created;
  }

  /**
   * Acknowledging a return posts its compensating IN ledger entry in the same transaction,
   * guarded by the same conditional-status-flip pattern as the parent issue's acknowledge() -
   * duplicate acknowledgement can never double-post.
   */
  async acknowledge(returnId: string, actorId: string, requestId?: string): Promise<MaterialIssueReturn> {
    const materialReturn = await this.repository.findById(returnId);
    if (!materialReturn) throw new NotFoundError(`MaterialIssueReturn [${returnId}] not found.`);

    const canAcknowledge = await this.permissionChecker.can(actorId, permissionForReturnType(materialReturn.returnType), 'MaterialIssue');
    if (!canAcknowledge) throw new ForbiddenError(`Lacks permission to acknowledge a ${materialReturn.returnType} return.`);

    if (materialReturn.status !== 'REQUESTED') {
      throw new InvalidStateTransitionError(`Cannot acknowledge MaterialIssueReturn [${returnId}] in state [${materialReturn.status}]. Must be REQUESTED.`);
    }

    const issue = await this.materialIssueRepository.findById(materialReturn.materialIssueId);
    if (!issue) throw new NotFoundError(`MaterialIssue [${materialReturn.materialIssueId}] not found.`);
    const line = issue.lines.find((l) => l.id === materialReturn.materialIssueLineId);
    if (!line) throw new NotFoundError(`MaterialIssueLine [${materialReturn.materialIssueLineId}] not found.`);

    const now = new Date();
    await prisma.$transaction(
      async (tx) => {
        const txReturnRepo = new MaterialIssueReturnRepository(tx);
        const txLedger = new StockLedgerRepository(tx);

        const count = await txReturnRepo.updateStatusConditional(
          returnId,
          ['REQUESTED'],
          'ACKNOWLEDGED',
          { acknowledgedByActorId: actorId, acknowledgedAt: now },
          tx
        );
        if (count === 0) {
          throw new InvalidStateTransitionError(`MaterialIssueReturn [${returnId}] was modified concurrently; refetch and retry.`);
        }

        await txLedger.postEntry(
          {
            productId: line.componentProductId,
            materialId: line.materialId,
            uomId: line.uomId,
            locationId: issue.locationId,
            ownership: 'OWNED',
            direction: 'IN',
            entryType: 'PRODUCTION_RETURN',
            quantity: materialReturn.quantity,
            postedByActorId: actorId,
            note: `${materialReturn.returnType} for MaterialIssueLine ${line.id} (MaterialIssueReturn ${returnId}, issue ${issue.issueNumber})`
          },
          tx
        );

        const postCount = await txReturnRepo.updateStatusConditional(returnId, ['ACKNOWLEDGED'], 'POSTED', { postedAt: now }, tx);
        if (postCount === 0) {
          throw new InvalidStateTransitionError(`MaterialIssueReturn [${returnId}] was modified concurrently between acknowledge and post.`);
        }
      },
      { maxWait: 20000, timeout: 30000 }
    );

    const updated = await this.repository.findById(returnId);
    if (!updated) throw new NotFoundError(`MaterialIssueReturn [${returnId}] not found after acknowledge.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.return_acknowledge',
      entityType: 'MaterialIssue',
      entityId: issue.id,
      after: updated,
      requestId
    });

    return updated;
  }

  async listByMaterialIssueId(materialIssueId: string) {
    return this.repository.listByMaterialIssueId(materialIssueId);
  }
}
