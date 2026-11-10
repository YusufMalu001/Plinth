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

export interface ProductionPlanLineInput {
  scheduleDate: string;
  productId: string;
  bomVersionId: string;
  routeId?: string | null;
  ownerId?: string | null;
  groupKey?: string | null;
  scheduleType: string;
  quantity: number;
  bufferQuantity?: number;
  priority?: number;
  notes?: string | null;
}

