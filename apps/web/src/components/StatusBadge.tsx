import React from 'react';
import { Badge } from '@plinth/ui';
import {
  LifecycleStatus,
  PrStatus,
  PoStatus,
  ExpectedReceiptStatus,
  GrnStatus,
  GrnLineStatus,
  DiscrepancyStatus,
  StockIssueStatus,
  StockTransferStatus,
  StockAdjustmentStatus,
  StockReservationStatus,
  ProductionPlanStatus,
  DepartmentBatchStatus,
  HandoverStatus,
  IntegrationJobStatus,
  IntegrationJobItemStatus,
  InternalReconciliationStatus,
  WipExceptionStatus,
  WipExceptionSeverity,
  WipExceptionType,
  InspectionResultStatus,
  CorrectiveActionStatus,
  QcCheckpointType,
  LossSourceType,
  LossClassification,
  LossEventStatus,
  AssemblyBatchStatus,
  AssemblyComponentType,
  FgPackagingStatus,
  FgReceiptStatus,
  JobWorkOrderStatus,
  JobWorkReconciliationStatus,
  BomStatus,
} from '@plinth/types';
import { twMerge } from 'tailwind-merge';

export type SalesOrderStatus =
  | 'DRAFT'
  | 'IMPORTED'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'ON_HOLD'
  | 'PARTIALLY_ALLOCATED'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PARTIALLY_PICKED'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'READY_TO_DISPATCH'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'CLOSED';

export type SalesPaymentStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type SalesAllocationStatus =
  | 'NOT_STARTED'
  | 'PARTIALLY_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'BACKORDERED'
  | 'RELEASED'
  | 'CANCELLED';

// Union of all status types across Module 1 (master data), Module 2 (procurement),
// Module 3 (goods receipt), Module 4 (inventory), Module 8 (department execution),
// Module 9 (WIP & batch tracking), Module 10 (quality & inspection), Module 11 (loss & wastage),
// Module 12 (assembly convergence), Module 13 (finished goods), Module 15 (sales), and Module 18 (finance / Tally integration).
// Verified against database/prisma/schema.prisma enums directly — do not extend from memory/prose.
export type AnyStatus =
  | LifecycleStatus
  | PrStatus
  | PoStatus
  | ExpectedReceiptStatus
  | GrnStatus
  | GrnLineStatus
  | DiscrepancyStatus
  | StockIssueStatus
  | StockTransferStatus
  | StockAdjustmentStatus
  | StockReservationStatus
  | ProductionPlanStatus
  | DepartmentBatchStatus
  | HandoverStatus
  | IntegrationJobStatus
  | IntegrationJobItemStatus
  | InternalReconciliationStatus
  | WipExceptionStatus
  | WipExceptionSeverity
  | WipExceptionType
  | FgPackagingStatus
  | FgReceiptStatus
  | InspectionResultStatus
  | CorrectiveActionStatus
  | QcCheckpointType
  | LossSourceType
  | LossClassification
  | LossEventStatus
  | AssemblyBatchStatus
  | AssemblyComponentType
  | SalesOrderStatus
  | SalesPaymentStatus
  | SalesAllocationStatus
  | JobWorkOrderStatus
  | JobWorkReconciliationStatus
  | BomStatus;

interface StatusBadgeProps {
  status?: AnyStatus | null;
  className?: string;
  fallback?: string;
}

export function StatusBadge({ status, className, fallback }: StatusBadgeProps) {
  let colorVariant: 'default' | 'destructive' | 'outline' | 'secondary' | 'muted' | undefined = 'default';
  const normalizedStatus = typeof status === 'string' ? status : '';

  switch (normalizedStatus) {
    // ----------------------------------------------------------------
    // Module 1 — master data lifecycle states
    // ----------------------------------------------------------------
    case 'DRAFT':
      colorVariant = 'secondary';
      break;
    case 'VALIDATION_PENDING':
    case 'PENDING_VALIDATION':
      colorVariant = 'outline';
      break;
    case 'SUPERSEDED':
    case 'RETIRED':
      colorVariant = 'muted';
      break;
    case 'APPROVED':
      colorVariant = 'default';
      break;
    case 'ACTIVE':
      colorVariant = 'default';
      break;
    case 'INACTIVE':
      colorVariant = 'destructive';
      break;
    case 'PARTIALLY_RETURNED':
      colorVariant = 'outline';
      break;
    case 'FULLY_RETURNED':
      colorVariant = 'default';
      break;
      // RECONCILED handled below in finance section
    case 'DISCREPANCY_FLAGGED':
      colorVariant = 'destructive';
      break;
    case 'DEBIT_NOTE_INITIATED':
      colorVariant = 'secondary';
      break;

    // ----------------------------------------------------------------
    // Module 2 — PrStatus additions
    // ----------------------------------------------------------------
    case 'SUBMITTED':
      colorVariant = 'outline';
      break;
    case 'REJECTED':
      colorVariant = 'destructive';
      break;
    case 'CHANGES_REQUESTED':
      colorVariant = 'secondary';
      break;
    case 'PO_CREATED':
      colorVariant = 'default';
      break;
    case 'CANCELLED':
      colorVariant = 'destructive';
      break;

    // ----------------------------------------------------------------
    // Module 2 — PoStatus additions (not already covered above)
    // ----------------------------------------------------------------
    case 'SENT':
      colorVariant = 'outline';
      break;
    case 'PARTIALLY_RECEIVED':
      colorVariant = 'secondary';
      break;
    case 'FULLY_RECEIVED':
      colorVariant = 'default';
      break;
    case 'CLOSED':
      colorVariant = 'muted';
      break;


    // ----------------------------------------------------------------
    // Module 2 — ExpectedReceiptStatus additions
    // (also reused verbatim below for GrnLineStatus.PENDING / DiscrepancyStatus.PENDING)
    // ----------------------------------------------------------------
    case 'PENDING':
      colorVariant = 'outline';
      break;

    // ----------------------------------------------------------------
    // Module 3 — GrnStatus additions
    // ----------------------------------------------------------------
    case 'ARRIVED':
      colorVariant = 'outline';
      break;
    case 'UNDER_VERIFICATION':
      colorVariant = 'secondary';
      break;
    case 'DISCREPANCY_PENDING':
      colorVariant = 'destructive';
      break;
    case 'VERIFIED':
      colorVariant = 'default';
      break;
    case 'SIGNED_OFF':
      colorVariant = 'secondary';
      break;
    case 'FINALIZED':
      colorVariant = 'default';
      break;

    // ----------------------------------------------------------------
    // Module 3 — GrnLineStatus additions (PENDING/VERIFIED already covered above)
    // ----------------------------------------------------------------
    case 'DISCREPANT':
      colorVariant = 'destructive';
      break;

    // ----------------------------------------------------------------
    // Module 3 — DiscrepancyStatus additions (PENDING already covered above)
    // ----------------------------------------------------------------
    case 'UNDER_REVIEW':
      colorVariant = 'secondary';
      break;
    case 'RESOLVED':
      colorVariant = 'default';
      break;

    // ----------------------------------------------------------------
    // Module 4 — StockIssueStatus / StockTransferStatus / StockAdjustmentStatus /
    // StockReservationStatus additions (PENDING/CANCELLED/REJECTED/UNDER_REVIEW/
    // APPROVED/ACTIVE are already covered by earlier cases above and apply here too)
    // ----------------------------------------------------------------
    case 'ISSUED':
      colorVariant = 'secondary';
      break;
    case 'REVERSED':
      colorVariant = 'muted';
      break;
    case 'REQUESTED':
      colorVariant = 'outline';
      break;
    case 'RECEIVED':
      colorVariant = 'default';
      break;
    case 'PROPOSED':
      colorVariant = 'outline';
      break;
    case 'POSTED':
      colorVariant = 'default';
      break;
    case 'RELEASED':
      colorVariant = 'default';
      break;
    case 'CONSUMED':
      colorVariant = 'default';
      break;

    // ----------------------------------------------------------------
    // Module 8 — DepartmentBatchStatus / HandoverStatus
    // Verified exactly against database/prisma/schema.prisma enums:
    // BatchExecutionStatus: AWAITING_RECEIPT, RECEIVED, ASSIGNED, IN_PROGRESS,
    // PAUSED, PARTIAL, COMPLETE, REWORK, REJECTED, HANDOVER_PENDING, NEXT_STAGE_ACCEPTED
    // HandoverStatus: PROPOSED, ACCEPTED, REFUSED
    // ----------------------------------------------------------------
    case 'AWAITING_RECEIPT':
      colorVariant = 'outline';
      break;
    case 'ASSIGNED':
      colorVariant = 'secondary';
      break;
    case 'IN_PROGRESS':
      colorVariant = 'default';
      break;
    case 'PAUSED':
      colorVariant = 'secondary';
      break;
    case 'PARTIAL':
      colorVariant = 'secondary';
      break;
    case 'COMPLETE':
      colorVariant = 'default';
      break;
    case 'REWORK':
      colorVariant = 'destructive';
      break;
    case 'HANDOVER_PENDING':
      colorVariant = 'outline';
      break;
    case 'NEXT_STAGE_ACCEPTED':
      colorVariant = 'default';
      break;
    case 'ACCEPTED':
      colorVariant = 'default';
      break;
    case 'REFUSED':
      colorVariant = 'destructive';
      break;

    // ----------------------------------------------------------------
    // Module 18 — Finance / Tally Integration States
    // IntegrationJobStatus: QUEUED, PROCESSING, EXPORTED, FAILED, COMPLETED, CANCELLED
    // IntegrationJobItemStatus: ELIGIBLE, QUEUED, EXPORTED, SENT, ACKNOWLEDGED,
    // RECONCILED, FAILED, INVESTIGATED, CORRECTED, RETRIED, REJECTED, HELD
    // InternalReconciliationStatus: INTERNALLY_CONSISTENT, VARIANCE_FLAGGED, DUPLICATE_FLAGGED, MANUALLY_RESOLVED
    // ----------------------------------------------------------------
    case 'ELIGIBLE':
      colorVariant = 'secondary';
      break;
    case 'QUEUED':
      colorVariant = 'outline';
      break;
    case 'PARTIALLY_FAILED':
      colorVariant = 'destructive';
      break;
    case 'EXPORTED':
      colorVariant = 'default';
      break;
    case 'ACKNOWLEDGED':
      colorVariant = 'default';
      break;
    case 'RECONCILED':
      colorVariant = 'default';
      break;
    case 'FAILED':
      colorVariant = 'destructive';
      break;
    case 'INVESTIGATED':
      colorVariant = 'secondary';
      break;
    case 'CORRECTED':
      colorVariant = 'secondary';
      break;
    case 'RETRIED':
      colorVariant = 'outline';
      break;
    case 'HELD':
      colorVariant = 'destructive';
      break;
    case 'COMPLETED':
      colorVariant = 'default';
      break;
    case 'INTERNALLY_CONSISTENT':
      colorVariant = 'default';
      break;
    case 'VARIANCE_FLAGGED':
      colorVariant = 'destructive';
      break;
    case 'DUPLICATE_FLAGGED':
      colorVariant = 'destructive';
      break;
    case 'MANUALLY_RESOLVED':
      colorVariant = 'secondary';
      break;

    // ----------------------------------------------------------------
    // Module 9 — WIP & Batch Tracking Exception States & Severities
    // ----------------------------------------------------------------
    case 'OPEN':
      colorVariant = 'destructive';
      break;
    case 'INVESTIGATING':
      colorVariant = 'secondary';
      break;
    // RESOLVED already covered above
    case 'DISMISSED':
      colorVariant = 'outline';
      break;
    case 'LOW':
      colorVariant = 'outline';
      break;
    case 'MEDIUM':
      colorVariant = 'secondary';
      break;
    case 'HIGH':
    case 'CRITICAL':
      colorVariant = 'destructive';
      break;
    case 'DOUBLE_PRESENCE':
    case 'NEGATIVE_QUANTITY':
    case 'BROKEN_GENEALOGY_CHAIN':
    case 'CONSERVATION_MISMATCH':
    case 'INVALID_STAGE_TRANSITION':
      colorVariant = 'destructive';
      break;

    // ----------------------------------------------------------------
    // Module 10 — Quality & Inspection Engine States
    // ----------------------------------------------------------------
    case 'PASS':
      colorVariant = 'default';
      break;
    case 'FAIL':
      colorVariant = 'destructive';
      break;
    case 'REJECT_SCRAP':
      colorVariant = 'destructive';
      break;
    case 'RE_INSPECTION':
      colorVariant = 'outline';
      break;
    case 'INCOMING_MATERIAL':
    case 'IN_PROCESS':
    case 'INTERMEDIATE':
    case 'ASSEMBLY':
    case 'PRE_FG':
    case 'FINAL_FG':
      colorVariant = 'outline';
      break;

    // ----------------------------------------------------------------
    // Module 11 — Loss, Damage & Waste Management States & Classifications
    // ----------------------------------------------------------------
    case 'REPORTED':
      colorVariant = 'outline';
      break;
    case 'REVIEWED':
      colorVariant = 'secondary';
      break;
    case 'REPLACED':
      colorVariant = 'default';
      break;
    case 'WITHIN_TOLERANCE':
      colorVariant = 'default';
      break;
    // ----------------------------------------------------------------
    // Module 12 — Assembly Execution & Convergence States
    // AssemblyBatchStatus: PLANNED, ALLOCATED, IN_ASSEMBLY, PARTIAL, COMPLETE, QC_PENDING, PASSED_TO_FG, REWORK, REJECTED
    // AssemblyComponentType: BATCH_SOURCED, ISSUE_LINE_SOURCED
    // ----------------------------------------------------------------
    case 'PLANNED':
      colorVariant = 'outline';
      break;
    case 'ALLOCATED':
      colorVariant = 'secondary';
      break;
    case 'IN_ASSEMBLY':
      colorVariant = 'default';
      break;
    case 'QC_PENDING':
      colorVariant = 'secondary';
      break;
    case 'PASSED_TO_FG':
      colorVariant = 'default';
      break;
    case 'BATCH_SOURCED':
      colorVariant = 'default';
      break;
    case 'ISSUE_LINE_SOURCED':
      colorVariant = 'secondary';
      break;
    // ----------------------------------------------------------------
    // Module 13 — Finished Goods Receiving & Gate States
    // FgPackagingStatus: NOT_PACKED, PACKED, READY_FOR_DISPATCH
    // FgReceiptStatus: RECEIVED, HELD, RELEASED, CANCELLED (handled above)
    // ----------------------------------------------------------------
    case 'NOT_PACKED':
      colorVariant = 'outline';
      break;
    case 'PACKED':
      colorVariant = 'secondary';
      break;
    case 'READY_FOR_DISPATCH':
    case 'READY_TO_DISPATCH':
      colorVariant = 'default';
      break;

    // ----------------------------------------------------------------
    // Module 15 — Sales & Order Management States
    // ----------------------------------------------------------------
    case 'CONFIRMED':
    case 'DISPATCHED':
    case 'DELIVERED':
    case 'PAID':
    case 'FULLY_ALLOCATED':
      colorVariant = 'default';
      break;
    case 'VALIDATING':
    case 'PENDING_APPROVAL':
    case 'ON_HOLD':
    case 'PARTIALLY_ALLOCATED':
    case 'PICKING':
    case 'PARTIALLY_PICKED':
    case 'PICKED':
    case 'PACKING':
    case 'AUTHORIZED':
    case 'PARTIALLY_PAID':
    case 'BACKORDERED':
      colorVariant = 'secondary';
      break;
    case 'VALIDATION_FAILED':
    case 'RETURNED':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      colorVariant = 'destructive';
      break;
    case 'IMPORTED':
    case 'NOT_STARTED':
    case 'NOT_REQUIRED':
      colorVariant = 'outline';
      break;
  }

  // Convert ENUM_VALUE to "Enum Value"
  const defaultLabel = normalizedStatus === 'RELEASED'
    ? 'Released to Floor'
    : normalizedStatus
      ? normalizedStatus.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
      : 'Status unavailable';
  const displayLabel = fallback ?? defaultLabel;

  return (
    <Badge variant={colorVariant} className={twMerge('whitespace-nowrap', className)}>
      {displayLabel}
    </Badge>
  );
}
