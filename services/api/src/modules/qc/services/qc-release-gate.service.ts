import { ReleaseGateCheckResult, QcCheckpointType, InspectionResultStatus } from '@plinth/types';
import { QcRepository } from '../repositories/qc.repository';
import { QcCheckpointResolver } from './qc-checkpoint-resolver';
import { QcGateBlockedError, NotFoundError } from '../qc.types';

export class QcReleaseGateService {
  constructor(
    private readonly repository: QcRepository = new QcRepository(),
    private readonly resolver: QcCheckpointResolver = new QcCheckpointResolver()
  ) {}

  /**
   * Evaluate whether a batch or GRN line satisfies all required QC gates for downstream release.
   */
  async checkReleaseGate(targetType: 'BATCH' | 'GRN_LINE', targetId: string): Promise<ReleaseGateCheckResult> {
    if (targetType === 'BATCH') {
      const batch = await this.repository.findBatchById(targetId);
      if (!batch) {
        throw new NotFoundError(`Department execution batch with id '${targetId}' not found`);
      }

      const checkpoints = this.resolver.resolveBatchCheckpoints(batch);
      const pendingCheckpoints: Array<{ checkpointType: QcCheckpointType; qcRuleId?: string | null; reason: string }> = [];
      const blockingFailures: Array<{ checkpointType: QcCheckpointType; inspectionNumber: string; status: InspectionResultStatus; reason?: string | null }> = [];

      let passedCount = 0;
      let overriddenCount = 0;

      for (const cp of checkpoints) {
        const latestInsp = batch.inspectionResults?.find((i) => i.checkpointType === cp.checkpointType);

        if (!latestInsp) {
          pendingCheckpoints.push({
            checkpointType: cp.checkpointType,
            qcRuleId: cp.qcRuleId,
            reason: `Mandatory checkpoint '${cp.checkpointType}' has not been inspected.`
          });
        } else if (latestInsp.isOverride) {
          overriddenCount++;
        } else if (latestInsp.status === 'PASS') {
          passedCount++;
        } else {
          blockingFailures.push({
            checkpointType: cp.checkpointType,
            inspectionNumber: latestInsp.inspectionNumber,
            status: latestInsp.status as InspectionResultStatus,
            reason: latestInsp.reason
          });
        }
      }

      const allowed = pendingCheckpoints.length === 0 && blockingFailures.length === 0;

      return {
        allowed,
        targetType: 'BATCH',
        targetId: batch.id,
        referenceNumber: batch.batchNumber,
        requiredCheckpointsCount: checkpoints.length,
        passedCheckpointsCount: passedCount,
        overriddenCheckpointsCount: overriddenCount,
        pendingCheckpoints,
        blockingFailures
      };
    } else {
      const grnLine = await this.repository.findGrnLineById(targetId);
      if (!grnLine) {
        throw new NotFoundError(`Goods receipt line with id '${targetId}' not found`);
      }

      const checkpoints = this.resolver.resolveGrnLineCheckpoints(grnLine);
      const pendingCheckpoints: Array<{ checkpointType: QcCheckpointType; qcRuleId?: string | null; reason: string }> = [];
      const blockingFailures: Array<{ checkpointType: QcCheckpointType; inspectionNumber: string; status: InspectionResultStatus; reason?: string | null }> = [];

      let passedCount = 0;
      let overriddenCount = 0;

      for (const cp of checkpoints) {
        const latestInsp = grnLine.inspectionResults?.find((i) => i.checkpointType === cp.checkpointType);

        if (!latestInsp) {
          pendingCheckpoints.push({
            checkpointType: cp.checkpointType,
            qcRuleId: cp.qcRuleId,
            reason: `Mandatory incoming checkpoint '${cp.checkpointType}' has not been inspected.`
          });
        } else if (latestInsp.isOverride) {
          overriddenCount++;
        } else if (latestInsp.status === 'PASS') {
          passedCount++;
        } else {
          blockingFailures.push({
            checkpointType: cp.checkpointType,
            inspectionNumber: latestInsp.inspectionNumber,
            status: latestInsp.status as InspectionResultStatus,
            reason: latestInsp.reason
          });
        }
      }

      const allowed = pendingCheckpoints.length === 0 && blockingFailures.length === 0;

      return {
        allowed,
        targetType: 'GRN_LINE',
        targetId: grnLine.id,
        referenceNumber: grnLine.grn?.grnNumber || grnLine.id,
        requiredCheckpointsCount: checkpoints.length,
        passedCheckpointsCount: passedCount,
        overriddenCheckpointsCount: overriddenCount,
        pendingCheckpoints,
        blockingFailures
      };
    }
  }

  /**
   * Strict release assertion - throws QcGateBlockedError if gate check fails
   */
  async assertCanRelease(targetType: 'BATCH' | 'GRN_LINE', targetId: string): Promise<void> {
    const result = await this.checkReleaseGate(targetType, targetId);
    if (!result.allowed) {
      const reasons = [
        ...result.pendingCheckpoints.map(p => p.reason),
        ...result.blockingFailures.map(f => `Inspection ${f.inspectionNumber} failed with status ${f.status} (${f.reason || 'No reason'})`)
      ].join('; ');

      throw new QcGateBlockedError(
        `QC_GATE_BLOCKED: ${targetType} '${result.referenceNumber}' cannot proceed past release gate. Blocking reasons: ${reasons}`,
        result
      );
    }
  }
}
