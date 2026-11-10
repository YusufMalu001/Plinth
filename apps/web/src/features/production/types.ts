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

export interface ProductionInventoryAvailabilityLine {
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  itemName: string;
  itemCode?: string | null;
  uomId: string;
  uomSymbol: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
}

export interface ProductionInventoryAvailability {
  canCreate: boolean;
  requirements: ProductionInventoryAvailabilityLine[];
}

export const PRODUCTION_EXECUTION_DEPARTMENT_CODES = [
  'DEPT-BUFF',
  'DEPT-LASER',
  'DEPT-PIPE',
  'DEPT-PROD',
  'DEPT-STORE',
  'DEPT-TUBE',
  'MOULDING'
] as const;

export const ASSEMBLY_DEPARTMENT_CODE = 'DEPT-ASSEMBLY-DEPART-W225';

export interface AssemblyDepartmentReference {
  id: string;
  code?: string | null;
  name?: string | null;
  isAssembly?: boolean | null;
}

/** Resolve the fixed final-assembly department, preferring the dedicated department record or isAssembly flag. */
export function resolveAssemblyDepartment<T extends AssemblyDepartmentReference>(departments: T[]): T | null {
  return departments.find((department) => Boolean((department as any).isAssembly))
    || departments.find((department) => department.code?.trim().toUpperCase() === ASSEMBLY_DEPARTMENT_CODE)
    || departments.find((department) => /^(assembly|assembly department)$/i.test(department.name?.trim() || ''))
    || departments.find((department) => /^assembly\b/i.test(department.name?.trim() || ''))
    || departments.find((department) => /assembly/i.test(department.code?.trim() || ''))
    || null;
}

export function isAssemblyDepartment(dept: { code?: string | null; name?: string | null; isAssembly?: boolean | null }): boolean {
  if (dept.isAssembly) return true;
  const code = (dept.code || '').trim().toUpperCase();
  if (code === ASSEMBLY_DEPARTMENT_CODE || code.includes('ASSEMBLY')) return true;
  const name = (dept.name || '').trim().toLowerCase();
  return /assembly/i.test(name);
}

export type ProductionExecutionDepartmentCode = typeof PRODUCTION_EXECUTION_DEPARTMENT_CODES[number];

export function isProductionExecutionDepartment(dept: { code?: string | null; name?: string | null; isAssembly?: boolean | null }): boolean {
  if (dept.isAssembly) return false;
  const code = (dept.code || '').trim().toUpperCase();
  if (code === ASSEMBLY_DEPARTMENT_CODE || code.includes('ASSEMBLY')) return false;
  if (/^(assembly|assembly department)$/i.test(dept.name || '')) return false;
  if ((PRODUCTION_EXECUTION_DEPARTMENT_CODES as readonly string[]).includes(code)) {
    return true;
  }
  const name = (dept.name || '').trim().toLowerCase();
  if (name.includes('assembly')) return false;
  if (code.startsWith('SHOP-')) return true;
  if (name.includes('moulding') || name.includes('molding')) {
    return true;
  }
  return false;
}

export interface ProductionPlan {
  id: string;
  planNumber: string;
  scheduleDate: string;
  productId: string;
  bomVersionId: string;
  routeId?: string | null;
  ownerId?: string | null;
  groupKey?: string | null;
  scheduleType: string;
  quantity: string | number;
  quantityUomId?: string;
  bufferQuantity: string | number;
  priority: number;
  incharge?: string | null;
  notes?: string | null;
  targetDepartmentId?: string | null;
  targetLocationId?: string | null;
  targetLocation?: { id: string; code: string; name: string } | null;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  status: ProductionPlanStatus;
  approvedShortageAck?: boolean;
  materialSnapshot?: {
    shortages?: Array<{
      item?: string;
      itemName?: string;
      itemCode?: string;
      itemType?: string;
      itemId?: string;
      bomLineId?: string;
      required?: number;
      available?: number;
      shortage: number;
      uomId?: string;
      locationId?: string;
    }>;
  } | null;
  requirementSnapshot?: unknown;
  interruptionReason?: string | null;
  partialQuantity?: string | number | null;
  completedQuantity?: string | number | null;
  batchIdentity?: string | null;
  product?: {
    id?: string;
    name: string;
    sku: string;
    metadata?: Record<string, unknown> | null;
    productFamily?: { id: string; name: string; code: string } | null;
    category?: { id: string; name: string; code: string } | null;
    uom?: { symbol?: string | null; name: string } | null;
  };
  bomVersion?: {
    bomNumber: string;
    version: number;
    lines?: Array<{
      id: string;
      sequence: number;
      materialId?: string | null;
      componentProductId?: string | null;
      material?: { id?: string; name: string; code: string } | null;
      componentProduct?: { id?: string; name: string; sku: string } | null;
      quantity: number;
      uom?: { symbol?: string | null; name: string } | null;
      note?: string | null;
    }>;
  };
  route?: {
    name: string;
    code: string;
    version?: number;
    steps?: Array<{
      id: string;
      sequence?: number;
      sequenceNumber?: number;
      branchKey?: string | null;
      stepOrder?: number | null;
      parentStepId?: string | null;
      name?: string;
      stepName?: string;
      department?: { name: string; code?: string } | null;
      workCenter?: { name: string; code?: string } | null;
      standardDurationMinutes?: number | null;
      isQcRequired?: boolean | null;
    }>;
  } | null;
  createdByActor?: { id: string; name?: string | null; email: string } | null;
  events?: Array<{ id: string; eventType: string; reason?: string | null; createdAt: string }>;
  requirements?: Array<{ id: string; bomLineId?: string; itemType: string; itemId: string; itemName?: string; itemCode?: string; requiredQuantity: string | number; inventoryQuantity: string | number; availableQuantity?: string | number; reservedQuantity: string | number; issuedQuantity: string | number; shortageQuantity: string | number; locationId: string; requiredUom?: { symbol?: string | null; name?: string | null } | null }>;
  materialIssues?: Array<{ id: string; issueNumber: string; quantity: string | number; itemType: string; itemId: string; locationId?: string; issuedAt: string; reversedAt?: string | null }>;
  outputs?: Array<{ id: string; outputNumber: string; quantity: string | number; rejectedQuantity: string | number; damagedQuantity: string | number; recordedAt: string }>;
  executionBatches?: Array<{
    id: string;
    routeStepId?: string | null;
    stageSequenceNumber: number;
    status: string;
    received_qty: string | number;
    completed_qty: string | number;
    department?: { id: string; code: string; name: string } | null;
    routeStep?: { id: string; sequenceNumber: number; stepName: string } | null;
  }>;
}

export interface ProductionPlanListResponse {
  items: ProductionPlan[];
  total: number;
}

export interface WorkspaceUser {
  id: string;
  name?: string | null;
  email: string;
  role: string;
}

export type BatchExecutionStatus =
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

export interface WorkerAssignment {
  id: string;
  batchId: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    role: string;
  };
  subtaskDescription?: string | null;
  assignedByActorId: string;
  assignedAt: string;
}

export interface ProgressEvent {
  id: string;
  batchId: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
  eventType: ProgressEventType;
  quantityDelta: number | string;
  notes?: string | null;
  timestamp: string;
}

export interface ExceptionRecord {
  id: string;
  batchId: string;
  type: ExceptionRecordType;
  quantity: number | string;
  reason: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
  timestamp: string;
}

export interface Handover {
  id: string;
  outgoingBatchId: string;
  outgoingDepartmentId: string;
  incomingDepartmentId: string;
  incomingDepartment?: { id: string; code: string; name: string } | null;
  outgoingDepartment?: { id: string; code: string; name: string } | null;
  quantity: number | string;
  transferredItemName?: string | null;
  transferredItemCode?: string | null;
  transferredItemType?: string | null;
  transferredUomSymbol?: string | null;
  status: HandoverStatus;
  proposedByActorId: string;
  proposedAt: string;
  decidedByActorId?: string | null;
  decidedAt?: string | null;
  refusalReason?: string | null;
  idempotencyKey: string;
  notes?: string | null;
  createdBatch?: {
    id: string;
    batchNumber: string;
    status: string;
    departmentId: string;
    department?: { id: string; code: string; name: string } | null;
  } | null;
  outgoingBatch?: DepartmentExecutionBatch | null;
}

export interface DepartmentExecutionBatch {
  id: string;
  batchNumber: string;
  productionPlanId: string;
  materialIssueId?: string | null;
  departmentId: string;
  workCenterId?: string | null;
  routeStepId?: string | null;
  stageSequenceNumber: number;
  status: BatchExecutionStatus;
  received_qty: number | string;
  completed_qty: number | string;
  rejected_qty: number | string;
  scrap_qty: number | string;
  wastage_qty: number | string;
  pending_qty: number | string;
  expectedOutputQty?: number | string;
  notes?: string | null;
  sourceHandoverId?: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;

  productionPlan?: {
    id: string;
    planNumber: string;
    status: string;
    productId: string;
    quantity: number | string;
    completedQuantity?: number | string | null;
    partialQuantity?: number | string | null;
    route?: {
      id: string;
      name: string;
      code: string;
      assemblyDepartmentId?: string | null;
      assemblyDepartment?: { id: string; code: string; name: string } | null;
      steps?: Array<{
        id: string;
        sequenceNumber: number;
        branchKey?: string | null;
        stepOrder?: number | null;
        parentStepId?: string | null;
        stepName: string;
        departmentId: string;
        workCenterId?: string | null;
        department?: { id: string; code: string; name: string } | null;
        workCenter?: { id: string; code: string; name: string } | null;
      }>;
    } | null;
    product?: {
      id: string;
      sku: string;
      name: string;
      uom?: { id: string; code: string; symbol?: string | null; name: string } | null;
    };
  } | null;
  materialIssue?: {
    id: string;
    issueNumber: string;
    quantity: number | string;
    issuedAt: string;
    reversedAt?: string | null;
  } | null;
  department?: {
    id: string;
    code: string;
    name: string;
  } | null;
  workCenter?: {
    id: string;
    code: string;
    name: string;
  } | null;
  routeStep?: {
    id: string;
    sequenceNumber: number;
    stepName: string;
    standardDurationMinutes?: number | null;
    isQcRequired?: boolean;
  } | null;
  workerAssignments?: WorkerAssignment[];
  progressEvents?: ProgressEvent[];
  exceptionRecords?: ExceptionRecord[];
  outgoingHandovers?: Handover[];
  incomingHandovers?: Handover[];
  sourceHandover?: Handover | null;
  materialAssignments?: Array<{
    id: string;
    productionPlanId: string;
    batchId?: string | null;
    destinationDepartmentId: string;
    bomLineId: string;
    itemType: string;
    itemId: string;
    uomId: string;
    locationId: string;
    lotId?: string | null;
    requiredQty: number | string;
    issuedQty: number | string;
    receivedQty: number | string;
    returnedQty?: number | string;
    bomLine?: {
      id: string;
      lineType?: string;
      quantity?: number | string;
      material?: { id: string; code: string; name: string; category?: any } | null;
      componentProduct?: { id: string; sku: string; name: string } | null;
      uom?: { id: string; code: string; name: string; symbol?: string | null } | null;
    } | null;
  }>;
}

export interface DepartmentQueueResponse {
  items: DepartmentExecutionBatch[];
  total: number;
  page: number;
  limit: number;
  incomingHandovers?: Handover[];
}

export interface BatchTimelineEntry {
  timestamp: string;
  type: string;
  details: Record<string, unknown>;
}

export interface BatchHistoryResponse {
  batch: DepartmentExecutionBatch;
  timeline: BatchTimelineEntry[];
}

export interface ProductionScheduleTask {
  id: string;
  departmentId: string;
  department: { id: string; name: string; code?: string };
  status: string;
  completed_qty: string | number;
  expectedOutputQty: string | number;
  routeStep: { branchKey: string; stepOrder: number; stepName: string } | null;
}

export interface ProductionScheduleAssemblyBatch {
  status: string;
  actualOutputQuantity: string | number;
  targetOutputQuantity?: string | number;
}

export interface ProductionScheduleSummary {
  id: string;
  planNumber: string;
  scheduleDate: string;
  shift: string;
  status: ProductionPlanStatus;
  quantity: string | number;
  completedQuantity: string | number | null;
  product: { id: string; name: string; sku?: string };
  quantityUom: { symbol: string; name: string } | null;
  route: { assemblyDepartmentId?: string | null } | null;
  batches: ProductionScheduleTask[];
  assembledQuantity: number;
  buildableQuantity: number;
  assemblyBatches: ProductionScheduleAssemblyBatch[];
  assemblyIntakeRequirements: AssemblyIntakeRequirement[];
}

export interface TaskMaterialAssignment {
  id: string;
  destinationDepartmentId: string;
  destinationDepartmentName: string;
  itemName: string;
  unitName: string;
  lotNumber: string | null;
  requiredQty: string | number;
  issuedQty: string | number;
  receivedQty: string | number;
  returnedQty?: string | number;
  ledgerEntryId: string | null;
  batchId?: string | null;
}

export interface ScheduleBatchHandover {
  id: string;
  quantity: string | number;
  status: string;
  proposedAt: string;
  decidedAt?: string | null;
  refusalReason?: string | null;
  incomingDepartmentId?: string;
  itemName?: string;
  unitName?: string;
}

export interface ScheduleBatchWorkerAssignment {
  id: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode?: string };
}

export interface ScheduleBatchProgressEvent {
  id: string;
  timestamp: string;
  eventType: string;
  notes?: string;
}

export interface ScheduleBatchDetail {
  id: string;
  batchNumber: string;
  departmentId: string;
  department: { id: string; name: string; code?: string };
  routeStepId: string;
  routeStep: {
    branchKey: string;
    stepOrder: number;
    stepName: string;
    parentStepId: string | null;
    nextDepartmentId?: string | null;
    standardDurationMinutes?: number;
  } | null;
  status: string;
  received_qty: string | number;
  pending_qty: string | number;
  completed_qty: string | number;
  scrap_qty: string | number;
  rejected_qty: string | number;
  wastage_qty: string | number;
  expectedOutputQty: string | number;
  outputItemId: string | null;
  outputItemType: string | null;
  outputItemName: string;
  outputUnitName: string;
  destinationDepartmentId: string | null;
  destinationDepartmentName: string;
  availableToSend: number;
  workerAssignments: ScheduleBatchWorkerAssignment[];
  materialAssignments: TaskMaterialAssignment[];
  incomingHandovers: ScheduleBatchHandover[];
  outgoingHandovers: ScheduleBatchHandover[];
  progressEvents: ScheduleBatchProgressEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AssemblyIntakeRequirement {
  id: string;
  itemName: string;
  unitName: string;
  requiredPerUnit: string | number;
  requiredQty: string | number;
  acceptedQty: string | number;
  allocatedQty: string | number;
  sourceStep: { stepName: string; departmentId?: string; department?: { id: string; name: string } } | null;
  handovers: Array<{
    id: string;
    quantity: string | number;
    status: string;
    outgoingDepartment?: { id: string; name: string };
    outgoingBatch?: { batchNumber: string };
    notes?: string | null;
  }>;
}

export interface AssemblyWaveBatch {
  id: string;
  batchNumber: string;
  status: string;
  targetOutputQuantity: string | number;
  actualOutputQuantity: string | number;
  workerAssignments?: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    subtaskDescription?: string | null;
  }>;
  fgReadyOutputs?: Array<{
    id: string;
    outputNumber: string;
    quantity: number;
    packagingStatus?: string | null;
    isReceived: boolean;
    receiptNumber?: string | null;
    locationName?: string | null;
  }>;
}

export interface ProductionScheduleDetail {
  id: string;
  planNumber: string;
  scheduleDate: string;
  shift: string;
  status: ProductionPlanStatus;
  quantity: string | number;
  completedQuantity: string | number | null;
  product: { id: string; name: string; sku?: string };
  quantityUom: { symbol: string; name: string } | null;
  route: {
    id: string;
    assemblyDepartmentId?: string | null;
    assemblyDepartment: { id: string; name: string; code?: string; departmentHead?: any } | null;
    steps: Array<{
      id: string;
      stepName: string;
      stepOrder: number;
      branchKey: string;
      departmentId: string;
      department: { id: string; name: string; code?: string };
      parentStepId: string | null;
      nextStepId: string | null;
      outputQuantityPerUnit: string | number;
    }>;
  } | null;
  batches: ScheduleBatchDetail[];
  taskMaterialAssignments: TaskMaterialAssignment[];
  assemblyIntakeRequirements: AssemblyIntakeRequirement[];
  assemblyBatches: AssemblyWaveBatch[];
}
