import { PermissionChecker, AuditWriter } from '@synergy/types';
import { prisma } from '../../../database';
import { MaterialIssueRepository, MaterialIssueWithLines, MaterialIssueLineInput } from '../repositories';
import { BomVersionRepository } from '../../bom/repositories';
import { BomCalculatorService } from '../../bom/services';
import { UomService } from '../../master-data/services/uom.service';
import { StockLedgerRepository } from '../../inventory/repositories/stock-ledger.repository';
import { assertLocationScope, resolveRequiredLocation } from '../../../common/rbac/location-scope';
import { generateSequentialNumber } from '../../../common/utils/sequence';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

const QUANTITY_EPSILON = 1e-6;

export class MaterialIssueService {
  constructor(
    private readonly repository: MaterialIssueRepository,
    private readonly bomVersionRepository: BomVersionRepository,
    private readonly calculator: BomCalculatorService,
    private readonly uomService: UomService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  /**
   * Derives the exact required lines from the production plan's own APPROVED BOM version -
   * never an independently entered quantity, per OUT OF SCOPE ("issue without approved
   * schedule/BOM or client-calculated availability"). This bypasses BomVersionService's own
   * `export`-permission-gated calculateRequirements() deliberately: this is an internal
   * cross-module read (identical in spirit to GoodsReceiptService querying
   * prisma.purchaseOrder directly), not a capability the requesting actor needs their own BOM
   * permission for.
   */
  private async deriveLinesFromBom(
    productId: string,
    requestedQuantity: number,
    requestedUomId: string,
    date: Date
  ): Promise<{ bomVersionId: string; lines: MaterialIssueLineInput[] }> {
    const version = await this.bomVersionRepository.findLiveApprovedVersion(productId, null, date);
    if (!version) {
      throw new ValidationError(`No approved BOM is effective for product [${productId}] as of ${date.toISOString()}; cannot issue without an approved schedule/BOM.`);
    }

    const resolveFactor = async (fromUomId: string, toUomId: string, asOf: Date) =>
      (await this.uomService.resolveConversionFactor(fromUomId, toUomId, asOf)).toNumber();

    const requirements = await this.calculator.computeRequirements(version, requestedQuantity, requestedUomId, date, resolveFactor);

    return {
      bomVersionId: version.id,
      lines: requirements.map((req) => {
        const bomLine = version.lines.find((line) => line.id === req.bomLineId);
        return {
          bomLineId: req.bomLineId,
          materialId: bomLine?.materialId ?? null,
          componentProductId: bomLine?.componentProductId ?? null,
          uomId: req.uomId,
          requiredQuantity: req.requiredQuantity
        };
      })
    };
  }

  /**
   * Requests material issue for a RELEASED/IN_PROGRESS production batch. Idempotency-key
   * replay short-circuits; at most one non-terminal (not POSTED/CANCELLED) MaterialIssue may
   * exist per production plan at a time, preventing the duplicate-request edge case.
   */
  async request(
    data: { productionPlanId: string; locationId?: string; note?: string },
    actorId: string,
    idempotencyKey?: string,
    requestId?: string
  ): Promise<MaterialIssueWithLines> {
    const canRequest = await this.permissionChecker.can(actorId, 'request', 'MaterialIssue');
    if (!canRequest) throw new ForbiddenError('Lacks permission to request a material issue.');

    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const plan = await prisma.productionPlan.findUnique({ where: { id: data.productionPlanId }, include: { product: true } });
    if (!plan) throw new NotFoundError(`ProductionPlan [${data.productionPlanId}] not found.`);
    if (!['APPROVED', 'RELEASED', 'IN_PROGRESS'].includes(plan.status)) {
      throw new InvalidStateTransitionError(
        `Cannot request a material issue against ProductionPlan [${plan.id}] in state [${plan.status}]. Must be APPROVED, RELEASED, or IN_PROGRESS.`
      );
    }

    const active = await this.repository.findActiveByProductionPlanId(data.productionPlanId);
    if (active) {
      throw new ValidationError(`ProductionPlan [${data.productionPlanId}] already has an outstanding material issue [${active.issueNumber}].`);
    }

    const locationId = await resolveRequiredLocation(actorId, data.locationId);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId });

    const { bomVersionId, lines } = await this.deriveLinesFromBom(plan.productId, Number(plan.quantity), plan.product.uomId, new Date());
    if (lines.length === 0) {
      throw new ValidationError('The approved BOM for this product has no component lines; nothing to issue.');
    }

    const issueNumber = await generateSequentialNumber({
      prefix: 'MI-',
      countByPrefix: (prefix) => this.repository.countByNumberPrefix(prefix),
      existsByNumber: (candidate) => this.repository.existsByIssueNumber(candidate),
      padLength: 6
    });

    const created = await this.repository.create({
      issueNumber,
      productionPlanId: data.productionPlanId,
      bomVersionId,
      locationId,
      idempotencyKey,
      note: data.note,
      requestedByActorId: actorId,
      lines
    });

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.request',
      entityType: 'MaterialIssue',
      entityId: created.id,
      after: created,
      requestId
    });

    return created;
  }

  /**
   * Checks current availability per line against the issue's own location. Any shortfall moves
   * the whole issue to SHORTAGE (a blocking exception, not a silent partial issue - "whether/when
   * partial issue is allowed" is explicitly unresolved (V-013-adjacent), so this never invents
   * partial-issue behavior; the only ways out of SHORTAGE are re-verify after restock, or cancel).
   */
  async verify(id: string, actorId: string, requestId?: string): Promise<MaterialIssueWithLines> {
    const canVerify = await this.permissionChecker.can(actorId, 'verify', 'MaterialIssue');
    if (!canVerify) throw new ForbiddenError('Lacks permission to verify a material issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: issue.locationId });
    if (issue.status !== 'REQUESTED' && issue.status !== 'SHORTAGE') {
      throw new InvalidStateTransitionError(`Cannot verify MaterialIssue [${id}] in state [${issue.status}]. Must be REQUESTED or SHORTAGE.`);
    }

    let anyShortage = false;
    for (const line of issue.lines) {
      const itemKey = line.materialId ? `MATERIAL:${line.materialId}` : `PRODUCT:${line.componentProductId}`;
      const balance = await prisma.stockBalance.findUnique({
        where: { itemKey_uomId_locationId_ownership: { itemKey, uomId: line.uomId, locationId: issue.locationId, ownership: 'OWNED' } }
      });
      const available = balance ? balance.onHandQuantity - balance.reservedQuantity : 0;
      const shortage = Math.max(line.requiredQuantity - available, 0);
      await this.repository.updateLineQuantities(line.id, { shortageQuantity: shortage });
      if (shortage > QUANTITY_EPSILON) anyShortage = true;
    }

    const toStatus = anyShortage ? 'SHORTAGE' : 'VERIFIED';
    const count = await this.repository.updateStatusConditional(id, ['REQUESTED', 'SHORTAGE'], toStatus, {
      verifiedByActorId: actorId,
      verifiedAt: new Date()
    });
    if (count === 0) throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently; refetch and retry verify.`);

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`MaterialIssue [${id}] not found after verify.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.verify',
      entityType: 'MaterialIssue',
      entityId: id,
      before: issue,
      after: updated,
      requestId
    });

    return updated;
  }

  /** Only reachable from fully-VERIFIED (no shortage) - see verify()'s comment on partial issue. */
  async prepare(id: string, actorId: string, requestId?: string): Promise<MaterialIssueWithLines> {
    const canPrepare = await this.permissionChecker.can(actorId, 'prepare', 'MaterialIssue');
    if (!canPrepare) throw new ForbiddenError('Lacks permission to prepare a material issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: issue.locationId });
    if (issue.status !== 'VERIFIED') {
      throw new InvalidStateTransitionError(`Cannot prepare MaterialIssue [${id}] in state [${issue.status}]. Must be VERIFIED.`);
    }

    await prisma.$transaction(async (tx) => {
      const txRepo = new MaterialIssueRepository(tx);
      for (const line of issue.lines) {
        await txRepo.updateLineQuantities(line.id, { issuedQuantity: line.requiredQuantity }, tx);
      }
      const count = await txRepo.updateStatusConditional(id, ['VERIFIED'], 'PREPARED', { preparedByActorId: actorId, preparedAt: new Date() }, tx);
      if (count === 0) throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently; refetch and retry prepare.`);
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`MaterialIssue [${id}] not found after prepare.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.prepare',
      entityType: 'MaterialIssue',
      entityId: id,
      before: issue,
      after: updated,
      requestId
    });

    return updated;
  }

  /**
   * The challan is a system-generated, controlled document number - never client-supplied text -
   * per the ASSUMPTION that it's "generated from an approved transaction."
   */
  async handOver(id: string, actorId: string, requestId?: string): Promise<MaterialIssueWithLines> {
    const canIssue = await this.permissionChecker.can(actorId, 'issue', 'MaterialIssue');
    if (!canIssue) throw new ForbiddenError('Lacks permission to hand over a material issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: issue.locationId });
    if (issue.status !== 'PREPARED') {
      throw new InvalidStateTransitionError(`Cannot hand over MaterialIssue [${id}] in state [${issue.status}]. Must be PREPARED.`);
    }

    const challanNumber = `CHL-${issue.issueNumber}`;
    const count = await this.repository.updateStatusConditional(id, ['PREPARED'], 'HANDED_OVER', {
      handedOverByActorId: actorId,
      handedOverAt: new Date(),
      challanNumber
    });
    if (count === 0) throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently; refetch and retry hand-over.`);

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`MaterialIssue [${id}] not found after hand-over.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.hand_over',
      entityType: 'MaterialIssue',
      entityId: id,
      before: issue,
      after: updated,
      metadata: { challanNumber },
      requestId
    });

    return updated;
  }

  /**
   * Acknowledgement IS the posting trigger - the workflow's own "acknowledged/posted" pairing
   * (mirrors Module 5's "approved/effective"). Guarded by the same optimistic-concurrency
   * updateStatusConditional pattern so a duplicate acknowledgement can never double-post: only
   * one caller can flip HANDED_OVER -> ACKNOWLEDGED, the loser gets count = 0 and must not
   * proceed. Every line's posting goes through StockLedgerRepository.postEntry, so "no negative
   * stock" is enforced by the same InsufficientStockError guard every other module relies on.
   */
  async acknowledge(id: string, actorId: string, requestId?: string): Promise<MaterialIssueWithLines> {
    const canAcknowledge = await this.permissionChecker.can(actorId, 'acknowledge', 'MaterialIssue');
    if (!canAcknowledge) throw new ForbiddenError('Lacks permission to acknowledge a material issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    if (issue.status !== 'HANDED_OVER') {
      throw new InvalidStateTransitionError(`Cannot acknowledge MaterialIssue [${id}] in state [${issue.status}]. Must be HANDED_OVER.`);
    }

    const now = new Date();
    await prisma.$transaction(
      async (tx) => {
        const txRepo = new MaterialIssueRepository(tx);
        const txLedger = new StockLedgerRepository(tx);

        const count = await txRepo.updateStatusConditional(
          id,
          ['HANDED_OVER'],
          'ACKNOWLEDGED',
          { acknowledgedByActorId: actorId, acknowledgedAt: now },
          tx
        );
        if (count === 0) {
          throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently; refetch and retry acknowledge.`);
        }

        for (const line of issue.lines) {
          if (line.issuedQuantity <= 0) continue;
          await txLedger.postEntry(
            {
              productId: line.componentProductId,
              materialId: line.materialId,
              uomId: line.uomId,
              locationId: issue.locationId,
              ownership: 'OWNED',
              direction: 'OUT',
              entryType: 'PRODUCTION_ISSUE',
              quantity: line.issuedQuantity,
              postedByActorId: actorId,
              materialIssueLineId: line.id,
              note: `Material issue ${issue.issueNumber} (challan ${issue.challanNumber ?? 'n/a'}) for production plan ${issue.productionPlanId}`
            },
            tx
          );
        }

        const postCount = await txRepo.updateStatusConditional(id, ['ACKNOWLEDGED'], 'POSTED', { postedAt: now }, tx);
        if (postCount === 0) {
          throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently between acknowledge and post.`);
        }
      },
      { maxWait: 20000, timeout: 30000 }
    );

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`MaterialIssue [${id}] not found after acknowledge.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.acknowledge',
      entityType: 'MaterialIssue',
      entityId: id,
      before: issue,
      after: updated,
      requestId
    });

    return updated;
  }

  /** Only reachable before goods have physically moved (REQUESTED/VERIFIED/SHORTAGE). */
  async cancel(id: string, reason: string | undefined, actorId: string, requestId?: string): Promise<MaterialIssueWithLines> {
    const canRequest = await this.permissionChecker.can(actorId, 'request', 'MaterialIssue');
    if (!canRequest) throw new ForbiddenError('Lacks permission to cancel a material issue.');

    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    if (!['REQUESTED', 'VERIFIED', 'SHORTAGE'].includes(issue.status)) {
      throw new InvalidStateTransitionError(`Cannot cancel MaterialIssue [${id}] in state [${issue.status}].`);
    }

    const count = await this.repository.updateStatusConditional(id, ['REQUESTED', 'VERIFIED', 'SHORTAGE'], 'CANCELLED', {
      cancelledByActorId: actorId,
      cancelledAt: new Date(),
      note: reason ?? issue.note
    });
    if (count === 0) throw new InvalidStateTransitionError(`MaterialIssue [${id}] was modified concurrently; refetch and retry cancel.`);

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`MaterialIssue [${id}] not found after cancel.`);

    await this.auditWriter.record({
      actorId,
      action: 'material_issue.cancel',
      entityType: 'MaterialIssue',
      entityId: id,
      before: issue,
      after: updated,
      metadata: { reason },
      requestId
    });

    return updated;
  }

  async getById(id: string): Promise<MaterialIssueWithLines> {
    const issue = await this.repository.findById(id);
    if (!issue) throw new NotFoundError(`MaterialIssue [${id}] not found.`);
    return issue;
  }

  async list(params: { productionPlanId?: string; status?: string; locationId?: string; skip?: number; take?: number }) {
    return this.repository.list(params as never);
  }
}
