import type {
  WipBatchSummary,
  WipBatchDetail,
  WipGenealogyTrace,
  WipGenealogyNode,
  WipDepartmentQueueItem,
  WipOverviewMetrics,
  WipTimingMetrics,
  WipReconciliationExceptionDto,
  WipExceptionType,
  WipExceptionStatus,
  WipExceptionSeverity
} from '@plinth/types';

export type {
  WipBatchSummary,
  WipBatchDetail,
  WipGenealogyTrace,
  WipGenealogyNode,
  WipDepartmentQueueItem,
  WipOverviewMetrics,
  WipTimingMetrics,
  WipReconciliationExceptionDto,
  WipExceptionType,
  WipExceptionStatus,
  WipExceptionSeverity
};

export interface WipBatchFilterParams {
  departmentId?: string;
  productionPlanId?: string;
  status?: string;
  search?: string;
  workCenterId?: string;
  stageSequenceNumber?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface WipExceptionFilterParams {
  batchId?: string;
  departmentId?: string;
  productionPlanId?: string;
  exceptionType?: WipExceptionType;
  severity?: WipExceptionSeverity;
  status?: WipExceptionStatus;
  page?: number;
  limit?: number;
}

export interface WipTimingFilterParams {
  departmentId?: string;
  productionPlanId?: string;
  batchId?: string;
  page?: number;
  limit?: number;
}

export interface RunReconciliationParams {
  productionPlanId?: string;
  departmentId?: string;
  batchId?: string;
}

export interface ReconciliationRunResponse {
  checkedBatchesCount: number;
  anomaliesDetectedCount: number;
  exceptionsCreatedCount: number;
  exceptions: WipReconciliationExceptionDto[];
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
