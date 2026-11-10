import { LifecycleStatus, QcCheckpointType } from '@prisma/client';
import { InspectionResultStatus } from '@synergy/types';
import { CheckpointResolutionItem, QcCriteriaUnresolvedError } from '../qc.types';

interface ResolvedInspectionShape {
  id: string;
  inspectionNumber: string;
  checkpointType: QcCheckpointType;
  status: InspectionResultStatus;
  sampledQuantity: number | { toNumber?: () => number; toString?: () => string };
  defectiveQuantity: number | { toNumber?: () => number; toString?: () => string };
  reason?: string | null;
  createdAt: Date;
}

interface ResolvedQcRuleShape {
  id: string;
  code?: string;
  name?: string;
  status: LifecycleStatus;
  parameters?: unknown;
}

interface ResolvedBatchShape {
  id: string;
  departmentId: string;
  department?: { name: string } | null;
  routeStep?: {
    id: string;
    stepName: string;
    sequenceNumber: number;
    workCenterId?: string | null;
    departmentId: string;
    qcRule?: ResolvedQcRuleShape | null;
  } | null;
  productionPlan?: {
    product?: {
      name?: string;
      routes?: Array<{
        steps?: Array<{
          id: string;
          stepName: string;
          sequenceNumber: number;
          workCenterId?: string | null;
          workCenter?: { name: string } | null;
          departmentId: string;
          department?: { name: string } | null;
          isQcRequired?: boolean;
          qcRule?: ResolvedQcRuleShape | null;
        }>;
      }>;
    } | null;
  } | null;
  inspectionResults?: ResolvedInspectionShape[];
}

interface ResolvedGrnLineShape {
  id: string;
  product?: {
    name?: string;
    routes?: Array<{
      steps?: Array<{
        qcRule?: ResolvedQcRuleShape | null;
      }>;
    }>;
  } | null;
  material?: { name?: string } | null;
  inspectionResults?: ResolvedInspectionShape[];
}

export class QcCheckpointResolver {
  /**
   * Determine checkpoint type based on route step or department sequence
   */
  mapStepToCheckpointType(stepName: string, sequenceNumber: number, totalSteps: number): QcCheckpointType {
    const lower = stepName.toLowerCase();
    if (lower.includes('incoming') || lower.includes('raw')) {
      return 'INCOMING_MATERIAL';
    }
    if (lower.includes('assembly')) {
      return 'ASSEMBLY';
    }
    if (lower.includes('pre-fg') || lower.includes('testing') || lower.includes('qc') || sequenceNumber === totalSteps - 1) {
      return 'PRE_FG';
    }
    if (lower.includes('final') || lower.includes('packing') || sequenceNumber === totalSteps) {
      return 'FINAL_FG';
    }
    if (sequenceNumber === 1) {
      return 'IN_PROCESS';
    }
    return 'INTERMEDIATE';
  }

  /**
   * Resolve required checkpoints for a DepartmentExecutionBatch
   */
  resolveBatchCheckpoints(batch: ResolvedBatchShape): CheckpointResolutionItem[] {
    const items: CheckpointResolutionItem[] = [];

    // If batch is linked to a specific routeStep
    if (batch.routeStep) {
      const step = batch.routeStep;
      const checkpointType = this.mapStepToCheckpointType(step.stepName, step.sequenceNumber, 4);
      const qcRule = step.qcRule || (batch as any).fallbackQcRule || null;
      const isApproved = qcRule && qcRule.status === LifecycleStatus.APPROVED && qcRule.parameters && Object.keys(qcRule.parameters).length > 0;

      const latestInsp = batch.inspectionResults?.find((i) => i.checkpointType === checkpointType);

      items.push({
        checkpointType,
        stageSequenceNumber: step.sequenceNumber,
        stageName: step.stepName,
        workCenterId: step.workCenterId,
        departmentId: step.departmentId,
        qcRuleId: qcRule?.id ?? null,
        qcRuleCode: qcRule?.code ?? null,
        qcRuleName: qcRule?.name ?? null,
        qcRuleStatus: qcRule?.status ?? null,
        qcRuleParameters: qcRule?.parameters ?? null,
        hasApprovedCriteria: !!isApproved,
        missingCriteriaReason: isApproved
          ? null
          : `QC_CRITERIA_UNRESOLVED: Checkpoint '${checkpointType}' on step '${step.stepName}' has no approved QC criteria (V-009). Inspection is blocked.`,
        latestInspection: latestInsp
          ? {
              id: latestInsp.id,
              inspectionNumber: latestInsp.inspectionNumber,
              status: latestInsp.status,
              sampledQuantity: Number(latestInsp.sampledQuantity),
              defectiveQuantity: Number(latestInsp.defectiveQuantity),
              reason: latestInsp.reason,
              createdAt: latestInsp.createdAt
            }
          : null
      });
      return items;
    }

    // If product has route steps in its approved route
    const approvedRoute = batch.productionPlan?.product?.routes?.[0];
    if (approvedRoute && approvedRoute.steps && approvedRoute.steps.length > 0) {
      const totalSteps = approvedRoute.steps.length;
      for (const step of approvedRoute.steps) {
        if (!step.isQcRequired && approvedRoute.steps.length > 2 && step.sequenceNumber !== totalSteps) {
          continue;
        }
        const checkpointType = this.mapStepToCheckpointType(step.stepName, step.sequenceNumber, totalSteps);
        const qcRule = step.qcRule || (batch as any).fallbackQcRule || null;
        const isApproved = qcRule && qcRule.status === LifecycleStatus.APPROVED && qcRule.parameters && Object.keys(qcRule.parameters).length > 0;
        const latestInsp = batch.inspectionResults?.find((i) => i.checkpointType === checkpointType);

        items.push({
          checkpointType,
          stageSequenceNumber: step.sequenceNumber,
          stageName: step.stepName,
          workCenterId: step.workCenterId,
          workCenterName: step.workCenter?.name,
          departmentId: step.departmentId,
          departmentName: step.department?.name,
          qcRuleId: qcRule?.id ?? null,
          qcRuleCode: qcRule?.code ?? null,
          qcRuleName: qcRule?.name ?? null,
          qcRuleStatus: qcRule?.status ?? null,
          qcRuleParameters: qcRule?.parameters ?? null,
          hasApprovedCriteria: !!isApproved,
          missingCriteriaReason: isApproved
            ? null
            : `QC_CRITERIA_UNRESOLVED: Checkpoint '${checkpointType}' on stage '${step.stepName}' has no approved QC criteria (V-009).`,
          latestInspection: latestInsp
            ? {
                id: latestInsp.id,
                inspectionNumber: latestInsp.inspectionNumber,
                status: latestInsp.status,
                sampledQuantity: Number(latestInsp.sampledQuantity),
                defectiveQuantity: Number(latestInsp.defectiveQuantity),
                reason: latestInsp.reason,
                createdAt: latestInsp.createdAt
              }
            : null
        });
      }
      return items;
    }

    // Default stage checkpoints when route steps are not explicitly defined
    const defaultCheckpoints: QcCheckpointType[] = ['IN_PROCESS', 'FINAL_FG'];
    for (const cp of defaultCheckpoints) {
      const latestInsp = batch.inspectionResults?.find((i) => i.checkpointType === cp);
      const qcRule = (batch as any).fallbackQcRule || null;
      const isApproved = qcRule && qcRule.status === LifecycleStatus.APPROVED && qcRule.parameters && Object.keys(qcRule.parameters).length > 0;
      items.push({
        checkpointType: cp,
        stageSequenceNumber: cp === 'IN_PROCESS' ? 1 : 2,
        stageName: cp === 'IN_PROCESS' ? 'In-Process Inspection' : 'Final FG Inspection',
        departmentId: batch.departmentId,
        departmentName: batch.department?.name,
        qcRuleId: qcRule?.id ?? null,
        qcRuleCode: qcRule?.code ?? null,
        qcRuleName: qcRule?.name ?? null,
        qcRuleStatus: qcRule?.status ?? null,
        qcRuleParameters: qcRule?.parameters ?? null,
        hasApprovedCriteria: !!isApproved,
        missingCriteriaReason: isApproved
          ? null
          : `QC_CRITERIA_UNRESOLVED: Checkpoint '${cp}' has no approved QC criteria configured (V-009). Inspection is blocked.`,
        latestInspection: latestInsp
          ? {
              id: latestInsp.id,
              inspectionNumber: latestInsp.inspectionNumber,
              status: latestInsp.status,
              sampledQuantity: Number(latestInsp.sampledQuantity),
              defectiveQuantity: Number(latestInsp.defectiveQuantity),
              reason: latestInsp.reason,
              createdAt: latestInsp.createdAt
            }
          : null
      });
    }

    return items;
  }

  /**
   * Resolve required checkpoints for a GoodsReceiptLine
   */
  resolveGrnLineCheckpoints(grnLine: ResolvedGrnLineShape): CheckpointResolutionItem[] {
    const items: CheckpointResolutionItem[] = [];
    const checkpointType: QcCheckpointType = 'INCOMING_MATERIAL';

    // Find any attached rule or route rule
    const qcRule = grnLine.product?.routes?.[0]?.steps?.[0]?.qcRule || (grnLine as any).fallbackQcRule || null;
    const isApproved = qcRule && qcRule.status === LifecycleStatus.APPROVED && qcRule.parameters && Object.keys(qcRule.parameters).length > 0;
    const latestInsp = grnLine.inspectionResults?.find((i) => i.checkpointType === checkpointType);

    items.push({
      checkpointType,
      stageSequenceNumber: 1,
      stageName: 'Incoming Raw Material & Goods Receipt QC',
      qcRuleId: qcRule?.id ?? null,
      qcRuleCode: qcRule?.code ?? null,
      qcRuleName: qcRule?.name ?? null,
      qcRuleStatus: qcRule?.status ?? null,
      qcRuleParameters: qcRule?.parameters ?? null,
      hasApprovedCriteria: !!isApproved,
      missingCriteriaReason: isApproved
        ? null
        : `QC_CRITERIA_UNRESOLVED: Checkpoint 'INCOMING_MATERIAL' for item '${grnLine.product?.name || grnLine.material?.name || 'Item'}' has no approved QC criteria (V-009). Inspection is blocked.`,
      latestInspection: latestInsp
        ? {
            id: latestInsp.id,
            inspectionNumber: latestInsp.inspectionNumber,
            status: latestInsp.status,
            sampledQuantity: Number(latestInsp.sampledQuantity),
            defectiveQuantity: Number(latestInsp.defectiveQuantity),
            reason: latestInsp.reason,
            createdAt: latestInsp.createdAt
          }
        : null
    });

    return items;
  }

  /**
   * Hard assertion enforcing V-009 gate.
   * Throws QcCriteriaUnresolvedError if criteria are missing or not approved.
   */
  assertCriteriaApproved(
    checkpointType: QcCheckpointType,
    qcRule: ResolvedQcRuleShape | null | undefined
  ): void {
    if (!qcRule) {
      throw new QcCriteriaUnresolvedError(
        `QC_CRITERIA_UNRESOLVED: Checkpoint '${checkpointType}' has no linked QC criteria rule (V-009). Inspection is blocked until approved criteria are configured.`
      );
    }
    if (qcRule.status !== LifecycleStatus.APPROVED) {
      throw new QcCriteriaUnresolvedError(
        `QC_CRITERIA_UNRESOLVED: QC rule '${qcRule.name || qcRule.id}' for checkpoint '${checkpointType}' is in '${qcRule.status}' status. Only APPROVED criteria can be inspected against (V-009).`
      );
    }
    if (!qcRule.parameters || typeof qcRule.parameters !== 'object' || Object.keys(qcRule.parameters).length === 0) {
      throw new QcCriteriaUnresolvedError(
        `QC_CRITERIA_UNRESOLVED: QC rule '${qcRule.name || qcRule.id}' has empty criteria parameters (V-009). Tolerances and inspection specifications must be defined.`
      );
    }
  }
}
