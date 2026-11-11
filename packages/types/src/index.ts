// ==============================================================================
// PLINTH ERP - SHARED TYPES & CORE INTERFACE CONTRACTS
// ==============================================================================

export type UserRole = 'admin' | 'manager' | 'employee' | (string & {});

export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  roleDefinition?: { id: string; key: string; name: string } | null;
  roles?: Array<{ id: string; key: string; name: string }>;
  /** Effective server-issued RBAC capability keys, e.g. `read:salesorder`. */
  permissions?: string[];
  isActive: boolean;
  
  // Profile Extended Fields
  employeeId?: string | null;
  phone?: string | null;
  department?: string | null;
  title?: string | null;
  dateOfHire?: string | null; // Date as ISO string
  employeeStatus?: string | null;
  mustChangePassword?: boolean;
  onboardingCompleted?: boolean;
  onboardingToken?: string | null;
  employeeRefId?: string | null;
  // RBAC scope assignment
  assignedDepartmentId?: string | null;
  assignedOrganizationId?: string | null;
  assignedLocationId?: string | null;
  assignedDepartment?: {
    id: string;
    name: string;
    code: string;
    isAssembly: boolean;
  } | null;
  isAssemblyDepartment?: boolean;

  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// HR MODULE TYPES
// ==============================================================================

export type EmployeeLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type TaskStatusType = 'PENDING' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'COMPLETED' | 'CANCELLED' | 'ON_HOLD' | 'REJECTED';
export type TaskPriorityType = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type AttendanceStatusType = 'PRESENT' | 'ABSENT' | 'LEAVE_SICK' | 'LEAVE_CASUAL' | 'LEAVE_PAID' | 'LEAVE_UNPAID' | 'HALF_DAY' | 'HOLIDAY';
export type PaySlipStatusType = 'DRAFT' | 'GENERATED' | 'PAID' | 'CANCELLED';

export interface EmployeeDto {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: string;
  departmentId?: string | null;
  department?: { id: string; name: string; code: string } | null;
  status: EmployeeLifecycleStatus;
  gender?: string | null;
  dateOfBirth?: string | null;
  hireDate?: string | null;
  ranking?: number | null;
  designation?: string | null;
  hierarchyLevel?: number | null;
  baseSalary?: number | null;
  hourlyRate?: number | null;
  managerId?: string | null;
  manager?: { id: string; firstName: string; lastName: string; employeeCode: string; designation?: string | null } | null;
  directReports?: Array<{ id: string; firstName: string; lastName: string; employeeCode: string; designation?: string | null }>;
  
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  bloodGroup?: string | null;
  maritalStatus?: string | null;
  
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankIfscCode?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  pfNumber?: string | null;
  esiNumber?: string | null;
  
  onboardingCompleted: boolean;
  onboardingCompletedAt?: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeTaskDto {
  id: string;
  title: string;
  description?: string | null;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string; department?: { name: string } | null } | null;
  assignedBy?: string | null;
  department?: string | null;
  priority: TaskPriorityType;
  status: TaskStatusType;
  dueDate?: string | null;
  completedAt?: string | null;
  proofUrl?: string | null;
  proofFileName?: string | null;
  proofNotes?: string | null;
  submittedAt?: string | null;
  validatedBy?: string | null;
  validationNotes?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceDto {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  date: string;
  status: AttendanceStatusType;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  notes?: string | null;
  markedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaySlipDto {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string; designation?: string | null } | null;
  month: number;
  year: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  basicSalary: number;
  hra: number;
  allowances: number;
  bonus: number;
  grossPay: number;
  pfDeduction: number;
  taxDeduction: number;
  otherDeduction: number;
  netPay: number;
  status: PaySlipStatusType;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDocumentDto {
  id: string;
  employeeId: string;
  title: string;
  category: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  verified: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkExperienceDto {
  id: string;
  employeeId: string;
  companyName: string;
  jobTitle: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  responsibilities?: string | null;
  location?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDetailsDto {
  id: string;
  employeeId: string;
  personalDetailsComplete: boolean;
  documentsUploadComplete: boolean;
  experienceComplete: boolean;
  agreementsComplete: boolean;
  agreedToTerms: boolean;
  agreedToConductCode: boolean;
  agreedToNda: boolean;
  signatureText?: string | null;
  agreedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}


export type SafeUser = Omit<User, 'updatedAt'>;

export interface AuthResponse {
  user: SafeUser;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export interface HealthCheckResponse {
  success: boolean;
  service: string;
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database?: {
    connected: boolean;
    latencyMs?: number;
  };
}

// ==============================================================================
// MODULE 1 - MASTER DATA MANAGEMENT CONTRACTS & ENUMS
// ==============================================================================

/**
 * 6-state explicit lifecycle status applied to all master entities.
 */
export type LifecycleStatus =
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'APPROVED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUPERSEDED';

// ==============================================================================
// MODULE 2 - PROCUREMENT STATUS ENUMS (sourced from schema.prisma enums)
// ==============================================================================

/**
 * Purchase Requisition lifecycle states.
 * Maps exactly to the PrStatus enum in schema.prisma.
 */
export type PrStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'PO_CREATED'
  | 'CANCELLED';

/**
 * Purchase Order lifecycle states.
 * Maps exactly to the PoStatus enum in schema.prisma.
 * Note: PARTIALLY_RECEIVED and FULLY_RECEIVED appear on both PoStatus and
 * ExpectedReceiptStatus — a PO transitions to these states as GRNs arrive.
 */
export type PoStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'SUPERSEDED';

/**
 * Expected Receipt (GRN) status states.
 * Maps exactly to the ExpectedReceiptStatus enum in schema.prisma.
 */
export type ExpectedReceiptStatus =
  | 'PENDING'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED';

// ==============================================================================
// MODULE 3 - GOODS RECEIPT / GRN STATUS ENUMS (sourced from schema.prisma enums)
// ==============================================================================

/**
 * Goods Receipt Note lifecycle states.
 * Maps exactly to the GrnStatus enum in schema.prisma.
 */
export type GrnStatus =
  | 'ARRIVED'
  | 'UNDER_VERIFICATION'
  | 'DISCREPANCY_PENDING'
  | 'CLAIM_RAISED'
  | 'VERIFIED'
  | 'SIGNED_OFF'
  | 'FINALIZED';

export type GrnLineStatus = 'PENDING' | 'VERIFIED' | 'DISCREPANT';

export type MeasurementType = 'WEIGHT' | 'PIECE' | 'BUNDLE' | 'PACKET';

export type DiscrepancyType = 'SHORTAGE' | 'EXCESS' | 'DAMAGE';

export type DiscrepancyStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED';

export type DiscrepancyResolutionType = 'ACCEPT_EXCESS' | 'RETURN_TO_VENDOR';

/**
 * Debit-note status only - V-008 (TO BE VALIDATED) leaves accounting treatment and any
 * monetary amount unresolved, so no amount field exists anywhere in this contract.
 */
export type DebitNoteStatus = 'PROPOSED' | 'PENDING_VALIDATION';

export type MaterialType =
  | 'RAW_MATERIAL'
  | 'HARDWARE'
  | 'PACKAGING'
  | 'COMPONENT';

export type ImportBatchStatus =
  | 'PENDING_VALIDATION'
  | 'VALIDATED'
  | 'PARTIALLY_COMMITTED'
  | 'COMMITTED'
  | 'FAILED'
  | 'CANCELLED';

export type ImportRowStatus =
  | 'PENDING'
  | 'VALID'
  | 'INVALID'
  | 'COMMITTED'
  | 'SKIPPED'
  | 'DUPLICATE_FLAGGED';

// ==============================================================================
// MODULE 4 - INVENTORY & STORE MANAGEMENT STATUS ENUMS (sourced from schema.prisma enums)
// ==============================================================================

export type StockOwnership = 'OWNED' | 'VENDOR_HELD';

export type StockDirection = 'IN' | 'OUT';

export type StockLedgerEntryType =
  | 'GRN_RECEIPT'
  | 'ISSUE'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'ADJUSTMENT_INCREASE'
  | 'ADJUSTMENT_DECREASE'
  | 'RETURN_TO_VENDOR'
  | 'STOCK_REVERTED'
  | 'REVERSAL';

export type StockIssueStatus = 'ISSUED' | 'REVERSED';

export type StockTransferStatus = 'REQUESTED' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';

export type StockAdjustmentDirection = 'INCREASE' | 'DECREASE';

export type StockAdjustmentStatus = 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'POSTED';

export type StockReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'CANCELLED';

// ==============================================================================
// MODULE 5 - BOM / FORMULA ENGINE STATUS ENUMS (sourced from schema.prisma enums)
// ==============================================================================

export type BomStatus = 'DRAFT' | 'VALIDATION_PENDING' | 'APPROVED' | 'SUPERSEDED' | 'RETIRED';

export type BomLineType = 'COMPONENT' | 'PACKAGING';

export type BomQuantityMode = 'FIXED' | 'SCALED';

export type BomRoundingRule = 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';

export type ProductionPlanStatus =
  | 'DRAFT'
  | 'CHECKED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RELEASED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'INTERRUPTED'
  | 'CANCELLED';

// ==============================================================================
// MODULE 7 - MATERIAL ISSUE STATUS ENUMS (sourced from schema.prisma enums)
// ==============================================================================

export type MaterialIssueStatus =
  | 'REQUESTED'
  | 'VERIFIED'
  | 'SHORTAGE'
  | 'PREPARED'
  | 'HANDED_OVER'
  | 'ACKNOWLEDGED'
  | 'POSTED'
  | 'CANCELLED';

export type MaterialIssueReturnType = 'UNUSED_RETURN' | 'DAMAGED_REPLACEMENT';

export type MaterialIssueReturnStatus = 'REQUESTED' | 'ACKNOWLEDGED' | 'POSTED';

// ==============================================================================
// MODULE 8 - DEPARTMENT-WISE EXECUTION & SHOP-FLOOR TRACKING
// ==============================================================================

export type DepartmentBatchStatus =
  | 'AWAITING_RECEIPT'
  | 'RECEIVED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'PARTIAL'
  | 'COMPLETE'
  | 'REWORK'
  | 'REJECTED'
  | 'HANDOVER_PENDING'
  | 'NEXT_STAGE_ACCEPTED';

export type ProgressEventType =
  | 'STARTED'
  | 'PAUSED'
  | 'RESUMED'
  | 'PARTIAL_RECORDED'
  | 'COMPLETED';

export type ExceptionRecordType =
  | 'REJECTION'
  | 'SCRAP'
  | 'WASTAGE'
  | 'PENDING'
  | 'INTERRUPTION';

export type HandoverStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REFUSED';


// ==============================================================================
// AUTHORIZATION INTERFACE (DECOUPLED FROM MODULE 0 RBAC)
// ==============================================================================

export interface ScopeContext {
  organizationId?: string;
  locationId?: string;
  departmentId?: string;
  [key: string]: unknown;
}

/**
 * PermissionChecker interface for policy evaluation.
 * Module 1 services must depend exclusively on this interface, never on concrete RBAC tables.
 */
export interface PermissionChecker {
  can(
    actorId: string,
    action: string,
    resource: string,
    scope?: ScopeContext
  ): Promise<boolean>;
}

/**
 * TEMPORARY — REPLACE WHEN MODULE 0 RBAC/AUDIT IS READY
 * In-memory stub for local development and unit tests that allows all operations.
 */
export class AllowAllPermissionChecker implements PermissionChecker {
  async can(
    _actorId: string,
    _action: string,
    _resource: string,
    _scope?: ScopeContext
  ): Promise<boolean> {
    return true;
  }
}

// ==============================================================================
// AUDIT WRITER INTERFACE (DECOUPLED FROM MODULE 0 AUDIT)
// ==============================================================================

export interface AuditEvent {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  timestamp?: Date;
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AuditWriter interface for capturing domain state transitions and administrative actions.
 * Module 1 services must inject and invoke this contract for every state change.
 */
export interface AuditWriter {
  record(event: AuditEvent): Promise<void>;
}

/**
 * TEMPORARY — REPLACE WHEN MODULE 0 RBAC/AUDIT IS READY
 * In-memory / console stub for local development that logs structured audit events to stdout.
 */
export class ConsoleAuditWriter implements AuditWriter {
  async record(event: AuditEvent): Promise<void> {
    const timestamp = event.timestamp ? event.timestamp.toISOString() : new Date().toISOString();
    console.info(
      `[AUDIT_EVENT] ${timestamp} | Actor: ${event.actorId} | Action: ${event.action} | Target: ${event.entityType}:${event.entityId}`,
      {
        before: event.before,
        metadata: event.metadata
      }
    );
  }
}

// ==============================================================================
// MODULE 18 - ACCOUNTS / TALLY INTEGRATION TYPES & ENUMS
// ==============================================================================

export type TransactionSourceType =
  | 'PURCHASE_ORDER'
  | 'SALES_INVOICE'
  | 'DEBIT_NOTE'
  | 'JOB_WORK'
  | 'RETURN'
  | 'INVENTORY_COGS';

export type IntegrationJobStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type IntegrationJobItemStatus =
  | 'ELIGIBLE'
  | 'QUEUED'
  | 'EXPORTED'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'RECONCILED'
  | 'FAILED'
  | 'INVESTIGATED'
  | 'CORRECTED'
  | 'RETRIED'
  | 'REJECTED'
  | 'HELD';

export type InternalReconciliationStatus =
  | 'INTERNALLY_CONSISTENT'
  | 'VARIANCE_FLAGGED'
  | 'DUPLICATE_FLAGGED'
  | 'MANUALLY_RESOLVED';

export interface MappingConfigurationDto {
  id: string;
  sourceType: TransactionSourceType;
  version: number;
  status: LifecycleStatus;
  fieldMapping: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationJobItemDto {
  id: string;
  jobId: string;
  sourceType: TransactionSourceType;
  sourceId: string;
  mappingVersionId: string;
  status: IntegrationJobItemStatus;
  amount: string; // Decimal serialized as string to avoid float precision loss
  currency: string;
  externalReference?: string | null;
  payloadFingerprint: string;
  payload?: Record<string, unknown> | null;
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  retryCount: number;
  errorDetail?: Record<string, unknown> | null;
  reconciliationStatus?: InternalReconciliationStatus | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationJobDto {
  id: string;
  batchNumber: string;
  sourceType: TransactionSourceType;
  status: IntegrationJobStatus;
  totalItems: number;
  exportedItems: number;
  failedItems: number;
  batchFileRef?: string | null;
  exportMetadata?: Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items?: IntegrationJobItemDto[];
}

export interface ReconciliationRecordDto {
  id: string;
  jobItemId: string;
  internalAmount: string;
  externalAmount?: string | null;
  status: InternalReconciliationStatus;
  discrepancyDetails?: Record<string, unknown> | null;
  investigatedById?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// MODULE 9 - WIP & BATCH TRACKING CONTRACTS & ENUMS
// ==============================================================================

export type WipExceptionType =
  | 'DOUBLE_PRESENCE'
  | 'NEGATIVE_QUANTITY'
  | 'BROKEN_GENEALOGY_CHAIN'
  | 'CONSERVATION_MISMATCH'
  | 'INVALID_STAGE_TRANSITION';

export type WipExceptionStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'DISMISSED';

export type WipExceptionSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface WipBatchSummary {
  id: string;
  batchNumber: string;
  productionPlanId: string;
  productionPlanNumber?: string;
  productId?: string;
  productCode?: string;
  productName?: string;
  departmentId: string;
  departmentCode?: string;
  departmentName?: string;
  workCenterId?: string | null;
  workCenterCode?: string | null;
  routeStepId?: string | null;
  stageSequenceNumber: number;
  status: string;
  receivedQty: number;
  completedQty: number;
  rejectedQty: number;
  scrapQty: number;
  wastageQty: number;
  pendingQty: number;
  wipQuantity: number;
  currentStageDurationSeconds: number;
  sourceHandoverId?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WipTimingMetrics {
  batchId: string;
  batchNumber: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  queueDurationSeconds: number;
  activeExecutionDurationSeconds: number;
  pausedDurationSeconds: number;
  totalStageDurationSeconds: number;
}

export interface WipBatchDetail {
  batch: WipBatchSummary;
  timings: WipTimingMetrics;
  assignedWorkers: Array<{
    id: string;
    employeeId: string;
    employeeName?: string;
    subtaskDescription?: string | null;
    assignedByActorId: string;
    assignedAt: string;
  }>;
  progressEvents: Array<{
    id: string;
    eventType: string;
    quantityDelta: number;
    notes?: string | null;
    employeeId: string;
    employeeName?: string;
    timestamp: string;
  }>;
  exceptionRecords: Array<{
    id: string;
    type: string;
    quantity: number;
    reason: string;
    employeeId: string;
    employeeName?: string;
    timestamp: string;
  }>;
  sourceHandover?: {
    id: string;
    outgoingBatchId: string;
    outgoingBatchNumber?: string;
    outgoingDepartmentId: string;
    outgoingDepartmentName?: string;
    quantity: number;
    status: string;
    proposedAt: string;
    decidedAt?: string | null;
  } | null;
  outgoingHandovers: Array<{
    id: string;
    incomingDepartmentId: string;
    incomingDepartmentName?: string;
    createdBatchId?: string | null;
    createdBatchNumber?: string | null;
    quantity: number;
    status: string;
    proposedAt: string;
    decidedAt?: string | null;
  }>;
  reworkCount: number;
}

export interface WipGenealogyNode {
  batchId: string;
  batchNumber: string;
  productionPlanId: string;
  departmentId: string;
  departmentCode?: string;
  departmentName?: string;
  stageSequenceNumber: number;
  status: string;
  receivedQty: number;
  completedQty: number;
  rejectedQty: number;
  scrapQty: number;
  wastageQty: number;
  pendingQty: number;
  createdAt: string;
  completedAt?: string | null;
  durationSeconds: number;
  incomingHandover?: {
    handoverId: string;
    fromBatchId: string;
    fromBatchNumber?: string;
    fromDepartmentId: string;
    fromDepartmentName?: string;
    quantity: number;
    status: string;
    decidedAt?: string | null;
  } | null;
  outgoingHandovers: Array<{
    handoverId: string;
    toBatchId?: string | null;
    toBatchNumber?: string | null;
    toDepartmentId: string;
    toDepartmentName?: string;
    quantity: number;
    status: string;
    decidedAt?: string | null;
  }>;
}

export interface WipGenealogyTrace {
  rootBatchId: string;
  currentBatchId: string;
  productionPlanId: string;
  productName?: string;
  stages: WipGenealogyNode[];
  totalStages: number;
  totalLeadTimeSeconds: number;
  isComplete: boolean;
}

export interface WipDepartmentQueueItem {
  batchId: string;
  batchNumber: string;
  productionPlanId: string;
  productionPlanNumber?: string;
  productId?: string;
  productName?: string;
  stageSequenceNumber: number;
  status: string;
  receivedQty: number;
  completedQty: number;
  pendingQty: number;
  assignedWorkersCount: number;
  queueDurationSeconds: number;
  activeDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface WipOverviewMetrics {
  totalActiveBatches: number;
  totalWipQuantity: number;
  departmentBreakdown: Array<{
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    batchCount: number;
    totalWipQty: number;
    activeBatches: number;
    pendingHandovers: number;
  }>;
  statusBreakdown: Record<string, number>;
  openExceptionsCount: number;
}

export interface WipReconciliationExceptionDto {
  id: string;
  batchId: string;
  batchNumber?: string;
  productionPlanId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  exceptionType: WipExceptionType;
  severity: WipExceptionSeverity;
  description: string;
  details?: Record<string, unknown> | null;
  status: WipExceptionStatus;
  detectedAt: string;
  investigatedByActorId?: string | null;
  investigatedAt?: string | null;
  investigationNotes?: string | null;
  resolvedByActorId?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// MODULE 10 - QUALITY MANAGEMENT & INSPECTION CONTRACTS & DTOs
// ==============================================================================

export type QcCheckpointType =
  | 'INCOMING_MATERIAL'
  | 'IN_PROCESS'
  | 'INTERMEDIATE'
  | 'ASSEMBLY'
  | 'PRE_FG'
  | 'FINAL_FG';

export type InspectionResultStatus =
  | 'PASS'
  | 'FAIL'
  | 'REWORK'
  | 'REJECT_SCRAP'
  | 'RE_INSPECTION';

export type CorrectiveActionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'CANCELLED';

export interface InspectionResultDto {
  id: string;
  inspectionNumber: string;
  checkpointType: QcCheckpointType;
  qcRuleId?: string | null;
  qcRule?: {
    id: string;
    code: string;
    name: string;
    version: number;
    status: LifecycleStatus;
    parameters: Record<string, unknown>;
  } | null;
  batchId?: string | null;
  batchNumber?: string | null;
  grnLineId?: string | null;
  grnNumber?: string | null;
  inspectorEmployeeId: string;
  inspectorEmployeeName?: string | null;
  inspectorEmployeeCode?: string | null;
  sampledQuantity: number;
  defectiveQuantity: number;
  status: InspectionResultStatus;
  reason?: string | null;
  findings?: Record<string, unknown> | null;
  evidenceAttachmentUrls: string[];
  isOverride: boolean;
  overrideReason?: string | null;
  overrideByActorId?: string | null;
  reinspectionOfId?: string | null;
  correctiveActions?: CorrectiveActionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveActionDto {
  id: string;
  inspectionResultId: string;
  actionDescription: string;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  targetReworkStageId?: string | null;
  status: CorrectiveActionStatus;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QcQueueItemDto {
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  referenceNumber: string;
  checkpointType: QcCheckpointType;
  itemDescription: string;
  quantity: number;
  unitOfMeasure?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  qcRuleId?: string | null;
  qcRuleCode?: string | null;
  qcRuleName?: string | null;
  hasApprovedCriteria: boolean;
  missingCriteriaReason?: string | null;
  latestInspectionStatus?: InspectionResultStatus | null;
  latestInspectionId?: string | null;
  requiresInspection: boolean;
  canInspect: boolean;
  createdAt: string;
}

export interface ReleaseGateCheckResult {
  allowed: boolean;
  targetType: 'BATCH' | 'GRN_LINE';
  targetId: string;
  referenceNumber: string;
  requiredCheckpointsCount: number;
  passedCheckpointsCount: number;
  overriddenCheckpointsCount: number;
  pendingCheckpoints: Array<{
    checkpointType: QcCheckpointType;
    qcRuleId?: string | null;
    reason: string;
  }>;
  blockingFailures: Array<{
    checkpointType: QcCheckpointType;
    inspectionNumber: string;
    status: InspectionResultStatus;
    reason?: string | null;
  }>;
}

// ==============================================================================
// MODULE 11 - LOSS, DAMAGE & WASTE MANAGEMENT CONTRACTS & ENUMS
// ==============================================================================

export type LossSourceType =
  | 'DEPARTMENT_EXECUTION_EXCEPTION'
  | 'GRN_DISCREPANCY'
  | 'QC_REJECTION_NO_BATCH'
  | 'MANUAL_REPORT';

export type LossClassification =
  | 'WITHIN_TOLERANCE'
  | 'ABNORMAL';

export type LossEventStatus =
  | 'REPORTED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'REJECTED'
  | 'INVESTIGATED'
  | 'POSTED'
  | 'REPLACED';

export interface LossEventDto {
  id: string;
  lossNumber: string;
  sourceType: LossSourceType;
  sourceExceptionRecordId?: string | null;
  sourceDiscrepancyId?: string | null;
  sourceInspectionResultId?: string | null;
  materialId?: string | null;
  productId?: string | null;
  materialName?: string | null;
  productName?: string | null;
  itemCode?: string | null;
  uomId: string;
  uomCode?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  quantity: number;
  reason: string;
  reportedByActorId: string;
  reportedByActorName?: string | null;
  reportedAt: string;
  appliedWastageRuleId?: string | null;
  appliedWastageRuleVersion?: number | null;
  appliedWastageRuleCode?: string | null;
  varianceFromExpected?: number | null;
  classification?: LossClassification | null;
  status: LossEventStatus;
  reviewedByActorId?: string | null;
  reviewedByActorName?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  approvedByActorId?: string | null;
  approvedByActorName?: string | null;
  approvedAt?: string | null;
  rejectedByActorId?: string | null;
  rejectedByActorName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  investigatedByActorId?: string | null;
  investigatedByActorName?: string | null;
  investigatedAt?: string | null;
  investigationNotes?: string | null;
  stockEffectRef?: string | null;
  replacementChallanRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementChallanDto {
  id: string;
  challanNumber: string;
  lossEventId: string;
  materialId?: string | null;
  productId?: string | null;
  materialName?: string | null;
  productName?: string | null;
  uomId: string;
  uomCode?: string | null;
  quantity: number;
  dispatchLocationId: string;
  dispatchLocationName?: string | null;
  targetDepartmentId?: string | null;
  targetDepartmentName?: string | null;
  targetVendorId?: string | null;
  targetVendorName?: string | null;
  notes?: string | null;
  issuedByActorId: string;
  issuedByActorName?: string | null;
  issuedAt: string;
  acknowledgedByActorId?: string | null;
  acknowledgedByActorName?: string | null;
  acknowledgedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LossAnalyticsSummaryDto {
  totalEvents: number;
  totalQuantity: number;
  withinToleranceCount: number;
  withinToleranceQuantity: number;
  abnormalCount: number;
  abnormalQuantity: number;
  byStatus: Record<LossEventStatus, number>;
  bySourceType: Record<LossSourceType, { count: number; quantity: number }>;
  byDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    count: number;
    quantity: number;
    abnormalCount: number;
  }>;
  byMaterial: Array<{
    materialId: string | null;
    productId: string | null;
    name: string;
    code: string;
    uomSymbol: string;
    count: number;
    quantity: number;
    abnormalQuantity: number;
  }>;
}

// ==============================================================================
// PRICING MASTERS, TIERS & PRODUCT PRICING SCHEMAS & DTOs
// ==============================================================================

export interface PricingTier {
  id: string;
  name: string;
  price: number | string;
  discountPercentage: number | string;
  /** Legacy pricing-master tier data; new masters do not set this. */
  defaultCost?: number | string;
  code?: string;
  description?: string;
  isActive?: boolean;
}

export interface PricingMasterField {
  name: string;
  valueType?: 'number' | 'text';
  defaultValue?: string;
}

export interface PricingMasterColumn {
  name: string;
  defaultValue?: string;
}

export interface PricingMasterDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  fields: PricingMasterField[];
  columns?: PricingMasterColumn[];
  tiers?: PricingTier[];
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTierPricing {
  tierId: string;
  tierName: string;
  tierCode?: string;
  defaultDiscountPercentage?: number;
  discountPercentage: number;
  isCustomPrice?: boolean;
  customPrice?: number | null;
  calculatedPrice: number;
  enabled?: boolean;
}

export interface ProductPricingMetadata {
  mrp?: number | null;
  sellingPrice?: number | null;
  wholesalePrice?: number | null;
  distributorPrice?: number | null;
  costPrice?: number | null;
  globalDiscountPercentage?: number;
  additionalDiscountPercentage?: number;
  tierPricing?: ProductTierPricing[];
  pricingMasterId?: string | null;
  pricingMasterName?: string | null;
  pricingFields?: Array<{ name: string; value: string }>;
}

// ==============================================================================
// MODULE 12 - ASSEMBLY EXECUTION & CONVERGENCE CONTRACTS & ENUMS
// ==============================================================================

export type AssemblyBatchStatus =
  | 'PLANNED'
  | 'ALLOCATED'
  | 'IN_ASSEMBLY'
  | 'PARTIAL'
  | 'COMPLETE'
  | 'QC_PENDING'
  | 'PASSED_TO_FG'
  | 'REWORK'
  | 'REJECTED';

export type AssemblyComponentType =
  | 'BATCH_SOURCED'
  | 'ISSUE_LINE_SOURCED';

export interface AssemblyBatchComponentDto {
  id: string;
  assemblyBatchId: string;
  bomLineId?: string | null;
  componentType: AssemblyComponentType;
  sourceBatchId?: string | null;
  sourceBatchNumber?: string | null;
  materialIssueLineId?: string | null;
  materialName?: string | null;
  productName?: string | null;
  itemCode?: string | null;
  noteName?: string | null;
  noteSub?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  unitRatio: number;
  requiredQuantity: number;
  consumedQuantity: number;
  scrapQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssemblyWorkerAssignmentDto {
  id: string;
  assemblyBatchId: string;
  employeeId: string;
  employeeName?: string | null;
  subtaskDescription?: string | null;
  assignedByActorId: string;
  assignedByActorName?: string | null;
  assignedAt: string;
}

export interface AssemblyProgressEventDto {
  id: string;
  assemblyBatchId: string;
  employeeId: string;
  employeeName?: string | null;
  eventType: ProgressEventType;
  quantityDelta: number;
  notes?: string | null;
  timestamp: string;
}

export interface AssemblyBatchDto {
  id: string;
  batchNumber: string;
  productId: string;
  product?: { id: string; name: string; sku?: string | null } | null;
  productName?: string | null;
  productSku?: string | null;
  productVariantId?: string | null;
  productionPlanId?: string | null;
  productionPlanNumber?: string | null;
  bomVersionId: string;
  bomNumber?: string | null;
  bomVersionNumber?: number | null;
  productRouteId?: string | null;
  routeCode?: string | null;
  routeName?: string | null;
  targetOutputQuantity: number;
  actualOutputQuantity: number;
  scrapQuantity: number;
  status: AssemblyBatchStatus;
  plannedStartDate?: string | null;
  actualStartDate?: string | null;
  completedAt?: string | null;
  idempotencyKey?: string | null;
  notes?: string | null;
  reworkCount: number;
  createdByActorId: string;
  createdByActorName?: string | null;
  allocatedByActorId?: string | null;
  allocatedByActorName?: string | null;
  completedByActorId?: string | null;
  completedByActorName?: string | null;
  qcInspectionResultId?: string | null;
  createdAt: string;
  updatedAt: string;
  components?: AssemblyBatchComponentDto[];
  workerAssignments?: AssemblyWorkerAssignmentDto[];
  progressEvents?: AssemblyProgressEventDto[];
  fgReadyOutputs?: FgReadyOutputDto[];
  bomVersion?: {
    id: string;
    bomNumber: string;
    version: number;
    lines?: Array<{
      id: string;
      lineType: string;
      materialId?: string | null;
      componentProductId?: string | null;
      uomId: string;
      quantity: string | number;
      sequence?: number;
      material?: any;
      componentProduct?: any;
      uom?: any;
    }>;
  } | null;
}

// ==============================================================================
// MODULE 13 - FINISHED GOODS (FG) RECEIVING & GATE CONTRACTS
// ==============================================================================

export type FgPackagingStatus = 'NOT_PACKED' | 'PACKED' | 'READY_FOR_DISPATCH';
export type FgReceiptStatus = 'RECEIVED' | 'HELD' | 'RELEASED' | 'CANCELLED';

export interface FgReadyOutputDto {
  id: string;
  outputNumber: string;
  assemblyBatchId?: string | null;
  assemblyBatchNumber?: string | null;
  productId: string;
  productName?: string | null;
  productSku?: string | null;
  productVariantId?: string | null;
  quantity: number;
  uomId: string;
  uomSymbol?: string | null;
  qcInspectionResultId?: string | null;
  qcStatus?: string | null;
  hasApprovedQcCriteria?: boolean;
  isQcPassed?: boolean;
  isPackagingReady?: boolean;
  isReadyToReceive?: boolean;
  gateBlockReason?: string | null;
  packagingRecord?: {
    id: string;
    status: FgPackagingStatus;
    packNotes?: string | null;
    stagedLocationId?: string | null;
    updatedAt: string;
  } | null;
  fgReceipt?: {
    id: string;
    receiptNumber: string;
    status: FgReceiptStatus;
    receivedAt: string;
  } | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FgPackagingUpdateInput {
  status: FgPackagingStatus;
  packNotes?: string | null;
  stagedLocationId?: string | null;
}

export interface FgReceiptCreateInput {
  fgReadyOutputId: string;
  locationId: string;
  notes?: string | null;
}

export interface FgReceiptDto {
  id: string;
  receiptNumber: string;
  fgReadyOutputId: string;
  productId: string;
  productName?: string | null;
  productSku?: string | null;
  productVariantId?: string | null;
  locationId: string;
  locationName?: string | null;
  locationCode?: string | null;
  quantity: number;
  uomId: string;
  uomSymbol?: string | null;
  status: FgReceiptStatus;
  holdReason?: string | null;
  heldAt?: string | null;
  heldByActorId?: string | null;
  heldByActorName?: string | null;
  releasedAt?: string | null;
  releasedByActorId?: string | null;
  releasedByActorName?: string | null;
  receivedByActorId: string;
  receivedByActorName?: string | null;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  activeReservationConflictsCount?: number;
}

export interface FgGenealogyTraceDto {
  receipt: FgReceiptDto;
  readyOutput: FgReadyOutputDto;
  assemblyBatch?: AssemblyBatchDto | null;
  componentsTrace: Array<{
    componentType: string;
    consumedQuantity: number;
    uom: string;
    sourceBatch?: {
      id: string;
      batchNumber: string;
      departmentName?: string | null;
    } | null;
    materialIssueLine?: {
      id: string;
      materialCode?: string | null;
      materialName?: string | null;
      quantity: number;
      grnLine?: {
        grnNumber: string;
        vendorName?: string | null;
        receivedAt?: string | null;
      } | null;
    } | null;
  }>;
}

// ==============================================================================
// MODULE 14 - JOB WORK / OUTSOURCED PROCESSING (Custody Ledger & Operations)
// ==============================================================================

export type JobWorkOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'ISSUED'
  | 'PARTIALLY_RETURNED'
  | 'FULLY_RETURNED'
  | 'RECONCILED'
  | 'CLOSED'
  | 'CANCELLED';

export type JobWorkCustodyEntryType =
  | 'RAW_MATERIAL_ISSUE'
  | 'PO_DEPOSIT_DEDUCTION'
  | 'RETURN_PROCESSING'
  | 'SCRAP_GENERATION'
  | 'WASTAGE_CONSUMPTION'
  | 'RETURN_DEFECT'
  | 'ADJUSTMENT';

export type JobWorkReturnDisposition =
  | 'FINISHED_GOODS'
  | 'RAW_MATERIAL_RETURN'
  | 'SCRAP'
  | 'DEFECTIVE_REWORK';

export type JobWorkReconciliationStatus =
  | 'PENDING'
  | 'RECONCILED'
  | 'DISCREPANCY_FLAGGED'
  | 'DEBIT_NOTE_INITIATED'
  | 'CLOSED';

export interface JobWorkOrderLineDto {
  id: string;
  jobWorkOrderId: string;
  materialId?: string | null;
  material?: { id: string; code: string; name: string } | null;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  uomId: string;
  uom?: { id: string; code: string; name: string; symbol?: string | null } | null;
  requiredQuantity: number;
  allocatedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  consumedQuantity: number;
  scrapQuantity: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobWorkOrderDto {
  id: string;
  orderNumber: string;
  vendorId: string;
  vendor?: { id: string; code: string; name: string; contactEmail?: string | null; contactPhone?: string | null } | null;
  purchaseOrderId?: string | null;
  purchaseOrder?: { id: string; poNumber: string; status: string; totalAmount?: number | string } | null;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  targetQuantity: number;
  targetUomId?: string | null;
  targetUom?: { id: string; code: string; name: string; symbol?: string | null } | null;
  rawMaterialInputQty: number;
  expectedScrapRate: number;
  status: JobWorkOrderStatus;
  deliveryLocationId?: string | null;
  deliveryLocation?: { id: string; code: string; name: string } | null;
  natureOfProcessing?: string | null;
  specifications?: string | null;
  createdById: string;
  createdBy?: { id: string; name: string | null; email: string } | null;
  approvedById?: string | null;
  approvedBy?: { id: string; name: string | null; email: string } | null;
  approvedAt?: string | null;
  closedById?: string | null;
  closedBy?: { id: string; name: string | null; email: string } | null;
  closedAt?: string | null;
  notes?: string | null;
  evidenceAttachments?: Array<{ name: string; url: string; size?: number; type?: string }> | null;
  lines?: JobWorkOrderLineDto[];
  challans?: JobWorkMaterialIssueDto[];
  returns?: JobWorkReceiptReturnDto[];
  reconciliations?: JobWorkReconciliationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface JobWorkMaterialIssueDto {
  id: string;
  challanNumber: string;
  jobWorkOrderId?: string | null;
  jobWorkOrder?: { id: string; orderNumber: string } | null;
  vendorId: string;
  vendor?: { id: string; code: string; name: string } | null;
  dispatchLocationId: string;
  dispatchLocation?: { id: string; code: string; name: string } | null;
  materialId?: string | null;
  material?: { id: string; code: string; name: string } | null;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  uomId: string;
  uom?: { id: string; code: string; name: string; symbol?: string | null } | null;
  quantity: number;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  driverContact?: string | null;
  issuedById: string;
  issuedBy?: { id: string; name: string | null; email: string } | null;
  issuedAt: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobWorkCustodyLedgerDto {
  id: string;
  entryNumber: string;
  vendorId: string;
  vendor?: { id: string; code: string; name: string } | null;
  jobWorkOrderId?: string | null;
  jobWorkOrder?: { id: string; orderNumber: string } | null;
  materialIssueId?: string | null;
  materialIssue?: { id: string; challanNumber: string } | null;
  materialId?: string | null;
  material?: { id: string; code: string; name: string } | null;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  uomId: string;
  uom?: { id: string; code: string; name: string; symbol?: string | null } | null;
  entryType: JobWorkCustodyEntryType;
  direction: StockDirection;
  quantity: number;
  runningBalance: number;
  referenceType: string;
  referenceId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface JobWorkReceiptReturnDto {
  id: string;
  returnNumber: string;
  jobWorkOrderId?: string | null;
  jobWorkOrder?: { id: string; orderNumber: string } | null;
  vendorId: string;
  vendor?: { id: string; code: string; name: string } | null;
  goodsReceiptId?: string | null;
  goodsReceipt?: { id: string; grnNumber: string; status: string } | null;
  locationId: string;
  location?: { id: string; code: string; name: string } | null;
  disposition: JobWorkReturnDisposition;
  productId?: string | null;
  product?: { id: string; sku: string; name: string } | null;
  materialId?: string | null;
  material?: { id: string; code: string; name: string } | null;
  uomId: string;
  uom?: { id: string; code: string; name: string; symbol?: string | null } | null;
  expectedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  shortQuantity: number;
  excessQuantity: number;
  scrapQuantity: number;
  consumedRawMaterial: number;
  receivedById: string;
  receivedBy?: { id: string; name: string | null; email: string } | null;
  receivedAt: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobWorkReconciliationDto {
  id: string;
  reconciliationNumber: string;
  jobWorkOrderId: string;
  jobWorkOrder?: { id: string; orderNumber: string; vendorId: string } | null;
  returnId?: string | null;
  returnReceipt?: { id: string; returnNumber: string; shortQuantity: number; excessQuantity: number } | null;
  debitNoteId?: string | null;
  debitNote?: { id: string; debitNoteNumber: string; status: string; totalAmount: number | string } | null;
  status: JobWorkReconciliationStatus;
  totalIssuedQty: number;
  totalReturnedQty: number;
  totalConsumedQty: number;
  totalScrapQty: number;
  shortageQty: number;
  excessQty: number;
  outstandingCustodyQty: number;
  financialImpactNotes?: string | null;
  reconciledById: string;
  reconciledBy?: { id: string; name: string | null; email: string } | null;
  reconciledAt: string;
  reason?: string | null;
  evidenceAttachments?: Array<{ name: string; url: string; size?: number; type?: string }> | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorCustodyBalanceDto {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  materialId?: string | null;
  materialCode?: string | null;
  materialName?: string | null;
  productId?: string | null;
  productSku?: string | null;
  productName?: string | null;
  uomId: string;
  uomCode: string;
  uomSymbol?: string | null;
  totalIssued: number;
  totalAllocated: number;
  totalConsumed: number;
  totalScrap: number;
  currentBalance: number;
  activeJobOrdersCount: number;
  materials?: Array<{
    materialId?: string | null;
    materialCode?: string | null;
    materialName?: string | null;
    productId?: string | null;
    productSku?: string | null;
    productName?: string | null;
    uomCode: string;
    uomSymbol?: string | null;
    totalIssued: number;
    totalAllocated: number;
    totalConsumed: number;
    totalScrap: number;
    currentBalance: number;
  }>;
}

export interface JobWorkAnalyticsDto {
  totalOrders: number;
  activeOrders: number;
  totalCustodyStockTons: number;
  totalAllocatedTons: number;
  totalShortageClaims: number;
  openDebitNotesCount: number;
  vendorPerformance: Array<{
    vendorId: string;
    vendorName: string;
    ordersCount: number;
    totalIssued: number;
    totalReturned: number;
    scrapYieldPercent: number;
    shortageRatePercent: number;
  }>;
}
