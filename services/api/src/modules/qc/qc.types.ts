import { AppError, NotFoundError, ValidationError } from '../../common/errors/AppError';
import {
  QcCheckpointType,
  InspectionResultStatus,
  CorrectiveActionStatus,
  LifecycleStatus
} from '@synergy/types';
export { NotFoundError, ValidationError };

export class QcValidationError extends ValidationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class QcCriteriaUnresolvedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'QC_CRITERIA_UNRESOLVED', details);
  }
}

export class QcGateBlockedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'QC_GATE_BLOCKED', details);
  }
}

export class QcReasonRequiredError extends AppError {
  constructor(message: string = 'Reason is strictly required for non-PASS inspection results', details?: unknown) {
    super(message, 400, 'QC_REASON_REQUIRED', details);
  }
}

export interface RecordInspectionInput {
  checkpointType: QcCheckpointType;
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  inspectorEmployeeId: string;
  qcRuleId?: string | null;
  sampledQuantity: number;
  defectiveQuantity: number;
  status: InspectionResultStatus;
  reason?: string | null;
  findings?: Record<string, unknown> | null;
  evidenceAttachmentUrls?: string[];
  targetReworkStageId?: string | null;
  correctiveActionDescription?: string | null;
  assignedEmployeeId?: string | null;
  exceptionType?: 'REJECTION' | 'SCRAP';
}

export interface ReinspectInput {
  inspectionResultId: string;
  inspectorEmployeeId: string;
  sampledQuantity: number;
  defectiveQuantity: number;
  status: InspectionResultStatus;
  reason?: string | null;
  findings?: Record<string, unknown> | null;
  evidenceAttachmentUrls?: string[];
}

export interface CreateCorrectiveActionInput {
  inspectionResultId: string;
  actionDescription: string;
  assignedEmployeeId?: string | null;
  targetReworkStageId?: string | null;
  status?: CorrectiveActionStatus;
}

export interface UpdateCorrectiveActionInput {
  actionId: string;
  status?: CorrectiveActionStatus;
  resolutionNotes?: string | null;
  assignedEmployeeId?: string | null;
}

export interface CreateQcRuleInput {
  code: string;
  name: string;
  description?: string | null;
  targetType: string;
  targetId?: string | null;
  parameters: Record<string, unknown>;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

export interface QcOverrideInput {
  checkpointType: QcCheckpointType;
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  overrideReason: string;
  sampledQuantity?: number;
  actorId: string;
}

export interface CheckpointResolutionItem {
  checkpointType: QcCheckpointType;
  stageSequenceNumber?: number;
  stageName?: string;
  workCenterId?: string | null;
  workCenterName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  qcRuleId?: string | null;
  qcRuleCode?: string | null;
  qcRuleName?: string | null;
  qcRuleStatus?: LifecycleStatus | null;
  qcRuleParameters?: unknown;
  hasApprovedCriteria: boolean;
  missingCriteriaReason?: string | null;
  latestInspection?: {
    id: string;
    inspectionNumber: string;
    status: InspectionResultStatus;
    sampledQuantity: number;
    defectiveQuantity: number;
    reason?: string | null;
    createdAt: Date;
  } | null;
}
