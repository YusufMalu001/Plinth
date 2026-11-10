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
} from '@synergy/types';

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

export interface WipBatchFilterOptions {
  departmentId?: string;
  productionPlanId?: string;
  status?: string;
  search?: string;
  workCenterId?: string;
  stageSequenceNumber?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface WipExceptionFilterOptions {
  batchId?: string;
  departmentId?: string;
  productionPlanId?: string;
  exceptionType?: WipExceptionType;
  severity?: WipExceptionSeverity;
  status?: WipExceptionStatus;
  page?: number;
  limit?: number;
}

export interface RunReconciliationParams {
  productionPlanId?: string;
  departmentId?: string;
  batchId?: string;
}

export interface ReconciliationReport {
  checkedBatchesCount: number;
  anomaliesDetectedCount: number;
  exceptionsCreatedCount: number;
  exceptions: WipReconciliationExceptionDto[];
  timestamp: string;
}
