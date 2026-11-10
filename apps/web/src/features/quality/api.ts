import { fetchApi } from '../api/client';
import {
  ApiResponse,
  QcCheckpointType,
  InspectionResultStatus,
  CorrectiveActionStatus,
  InspectionResultDto,
  CorrectiveActionDto,
  QcQueueItemDto,
  ReleaseGateCheckResult,
  LifecycleStatus
} from '@synergy/types';

export interface QcQueueQueryFilters {
  checkpointType?: QcCheckpointType;
  targetType?: 'BATCH' | 'GRN_LINE' | 'ALL';
  departmentId?: string;
  requiresInspectionOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface CheckpointResolutionData {
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  referenceNumber: string;
  checkpoints: Array<{
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
    qcRuleParameters?: {
      minPassingScore?: number;
      passingScoreThreshold?: number;
      samplingPercentage?: number;
      samplingRatePercentage?: number;
      defaultFailureAction?: string;
      criteriaChecklist?: Array<{
        name: string;
        type: 'BOOLEAN' | 'NUMERIC' | 'VISUAL';
        required: boolean;
        severity?: string;
        nominalValue?: number | string;
        minTolerance?: number | string;
        maxTolerance?: number | string;
        unit?: string;
        inspectionMethod?: string;
      }>;
      criteria?: Array<{
        name: string;
        type: 'BOOLEAN' | 'NUMERIC' | 'VISUAL';
        required: boolean;
        severity?: string;
        nominalValue?: number | string;
        minTolerance?: number | string;
        maxTolerance?: number | string;
        unit?: string;
        inspectionMethod?: string;
      }>;
    } | null;
    hasApprovedCriteria: boolean;
    missingCriteriaReason?: string | null;
    latestInspection?: {
      id: string;
      inspectionNumber: string;
      status: InspectionResultStatus;
      sampledQuantity: number;
      defectiveQuantity: number;
      reason?: string | null;
      createdAt: string;
    } | null;
  }>;
}

export interface RecordInspectionPayload {
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

export interface ReinspectPayload {
  inspectorEmployeeId: string;
  sampledQuantity: number;
  defectiveQuantity: number;
  status: InspectionResultStatus;
  reason?: string | null;
  findings?: Record<string, unknown> | null;
  evidenceAttachmentUrls?: string[];
}

export interface CreateCorrectiveActionPayload {
  actionDescription: string;
  assignedEmployeeId?: string | null;
  targetReworkStageId?: string | null;
  status?: CorrectiveActionStatus;
}

export interface UpdateCorrectiveActionPayload {
  status?: CorrectiveActionStatus;
  resolutionNotes?: string | null;
  assignedEmployeeId?: string | null;
}

export interface CreateQcRulePayload {
  code: string;
  name: string;
  description?: string | null;
  targetType: string;
  targetId?: string | null;
  parameters: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface OverridePayload {
  checkpointType: QcCheckpointType;
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  overrideReason: string;
  sampledQuantity?: number;
}

export interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  role: string;
  departmentId?: string | null;
  department?: { name: string } | null;
}

export interface QcRuleItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  targetType: string;
  targetId?: string | null;
  parameters: Record<string, unknown>;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

function unwrapData<T>(res: unknown, fallback: T): T {
  if (res === null || res === undefined) return fallback;
  if (typeof res === 'object' && res !== null && 'data' in res && (res as { data: unknown }).data !== undefined) {
    const inner = (res as { data: unknown }).data;
    return (inner === null || inner === undefined ? fallback : inner) as T;
  }
  return res as T;
}

export const qualityApi = {
  // 1. Inspection Queue
  getQueue: async (filters: QcQueueQueryFilters = {}): Promise<{ items: QcQueueItemDto[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters.checkpointType) params.set('checkpointType', filters.checkpointType);
    if (filters.targetType && filters.targetType !== 'ALL') params.set('targetType', filters.targetType);
    if (filters.departmentId) params.set('departmentId', filters.departmentId);
    if (filters.requiresInspectionOnly !== undefined) params.set('requiresInspectionOnly', String(filters.requiresInspectionOnly));
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchApi<{ items: QcQueueItemDto[]; total: number } | ApiResponse<{ items: QcQueueItemDto[]; total: number }>>(`/qc/queue${query}`);
    return unwrapData(res, { items: [], total: 0 });
  },

  // 2. Checkpoints Resolution
  resolveCheckpoints: async (targetType: 'BATCH' | 'GRN_LINE', targetId: string): Promise<CheckpointResolutionData> => {
    const res = await fetchApi<CheckpointResolutionData | ApiResponse<CheckpointResolutionData>>(
      `/qc/checkpoints/resolve?targetType=${targetType}&targetId=${targetId}`
    );
    return unwrapData(res, { targetType, targetId, referenceNumber: '', checkpoints: [] });
  },

  // 3. Record Inspection
  recordInspection: async (data: RecordInspectionPayload): Promise<InspectionResultDto> => {
    const res = await fetchApi<InspectionResultDto | ApiResponse<InspectionResultDto>>('/qc/inspections', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as InspectionResultDto);
  },

  // 4. Record Reinspection
  recordReinspection: async (inspectionResultId: string, data: ReinspectPayload): Promise<InspectionResultDto> => {
    const res = await fetchApi<InspectionResultDto | ApiResponse<InspectionResultDto>>(`/qc/inspections/${inspectionResultId}/reinspect`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as InspectionResultDto);
  },

  // 5. Corrective Actions
  createCorrectiveAction: async (inspectionResultId: string, data: CreateCorrectiveActionPayload): Promise<CorrectiveActionDto> => {
    const res = await fetchApi<CorrectiveActionDto | ApiResponse<CorrectiveActionDto>>(`/qc/inspections/${inspectionResultId}/corrective-actions`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as CorrectiveActionDto);
  },

  updateCorrectiveAction: async (actionId: string, data: UpdateCorrectiveActionPayload): Promise<CorrectiveActionDto> => {
    const res = await fetchApi<CorrectiveActionDto | ApiResponse<CorrectiveActionDto>>(`/qc/corrective-actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as CorrectiveActionDto);
  },

  // 6. Quality Histories
  getBatchHistory: async (batchId: string): Promise<InspectionResultDto[]> => {
    const res = await fetchApi<InspectionResultDto[] | ApiResponse<InspectionResultDto[]>>(`/qc/history/batch/${batchId}`);
    return unwrapData(res, []);
  },

  getGrnLineHistory: async (grnLineId: string): Promise<InspectionResultDto[]> => {
    const res = await fetchApi<InspectionResultDto[] | ApiResponse<InspectionResultDto[]>>(`/qc/history/grn-line/${grnLineId}`);
    return unwrapData(res, []);
  },

  // 7. QC Rules & Criteria Management
  listRules: async (filters: { targetType?: string; status?: LifecycleStatus } = {}): Promise<QcRuleItem[]> => {
    const params = new URLSearchParams();
    if (filters.targetType) params.set('targetType', filters.targetType);
    if (filters.status) params.set('status', filters.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchApi<QcRuleItem[] | ApiResponse<QcRuleItem[]>>(`/qc/rules${query}`);
    return unwrapData(res, []);
  },

  getRuleById: async (id: string): Promise<QcRuleItem> => {
    const res = await fetchApi<QcRuleItem | ApiResponse<QcRuleItem>>(`/qc/rules/${id}`);
    return unwrapData(res, null as unknown as QcRuleItem);
  },

  createRule: async (data: CreateQcRulePayload): Promise<QcRuleItem> => {
    const res = await fetchApi<QcRuleItem | ApiResponse<QcRuleItem>>('/qc/rules', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as QcRuleItem);
  },

  approveRule: async (id: string): Promise<QcRuleItem> => {
    const res = await fetchApi<QcRuleItem | ApiResponse<QcRuleItem>>(`/qc/rules/${id}/approve`, {
      method: 'POST'
    });
    return unwrapData(res, null as unknown as QcRuleItem);
  },

  linkRuleToBatch: async (batchId: string, qcRuleId: string): Promise<any> => {
    const res = await fetchApi<any>(`/qc/batches/${batchId}/link-rule`, {
      method: 'POST',
      body: JSON.stringify({ qcRuleId })
    });
    return unwrapData(res, { success: true });
  },

  // 8. Mandatory Gate Override
  recordOverride: async (data: OverridePayload): Promise<InspectionResultDto> => {
    const res = await fetchApi<InspectionResultDto | ApiResponse<InspectionResultDto>>('/qc/override', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return unwrapData(res, null as unknown as InspectionResultDto);
  },

  // 9. Release Gate Check
  checkReleaseGate: async (targetType: 'BATCH' | 'GRN_LINE', targetId: string): Promise<ReleaseGateCheckResult> => {
    const res = await fetchApi<ReleaseGateCheckResult | ApiResponse<ReleaseGateCheckResult>>(
      `/qc/release-gate/check?targetType=${targetType}&targetId=${targetId}`
    );
    return unwrapData(res, null as unknown as ReleaseGateCheckResult);
  },

  // 10. Employees lookup
  getEmployees: async (): Promise<EmployeeItem[]> => {
    try {
      const res = await fetchApi<EmployeeItem[] | { items: EmployeeItem[] } | ApiResponse<EmployeeItem[]>>('/employees');
      const unwrapped = unwrapData(res, []);
      if (Array.isArray(unwrapped)) return unwrapped;
      if (unwrapped && typeof unwrapped === 'object' && 'items' in (unwrapped as Record<string, unknown>)) {
        return (unwrapped as { items: EmployeeItem[] }).items || [];
      }
      return [];
    } catch {
      return [];
    }
  }
};
