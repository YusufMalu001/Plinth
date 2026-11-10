export type EventCategory = 'production' | 'order' | 'dispatch' | 'inbound' | 'finance';

export type EventStatus = 
  | 'scheduled' 
  | 'in_progress' 
  | 'completed' 
  | 'delayed' 
  | 'critical' 
  | 'pending';

export interface ProductionEvent {
  id: string;
  code: string; // e.g. "PLAN-2026-0001"
  productName: string;
  sku: string;
  line: string; // e.g. "Main Assembly Line"
  shift: string;
  supervisor: string;
  targetQuantity: number;
  completedQuantity: number;
  unit: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'delayed';
  progressPct: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  bomCode: string;
  notes?: string;
  startTime: string;
  endTime: string;
}

export interface SalesOrderEvent {
  id: string;
  orderNumber: string; // e.g. "SO-2026-00004"
  clientName: string;
  clientTier: 'Platinum' | 'Gold' | 'Enterprise' | 'Standard';
  destination: string;
  itemsCount: number;
  totalValue: number;
  currency: string;
  status: 'confirmed' | 'processing' | 'ready_for_dispatch' | 'dispatched' | 'hold';
  priority: 'standard' | 'high' | 'rush';
  fulfillmentDate: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
  }>;
  salesRep: string;
}

export interface DispatchEvent {
  id: string;
  manifestNumber: string; // e.g. "DSP-5501"
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  carrierName: string;
  destination: string;
  dockNumber: string;
  departureTime: string;
  estimatedArrival: string;
  packagesCount: number;
  totalWeightKg: number;
  status: 'dock_loading' | 'gate_cleared' | 'in_transit' | 'delivered' | 'delayed';
  associatedOrders: string[];
}

export interface InboundReceiptEvent {
  id: string;
  poNumber: string; // e.g. "GRN-2026-001"
  vendorName: string;
  materialName: string;
  quantity: number;
  unit: string;
  dockNumber: string;
  expectedTime: string;
  status: 'expected' | 'docked' | 'inspecting' | 'cleared' | 'rejected';
  qualityScore?: number;
}

export interface FinanceDebitNoteEvent {
  id: string;
  debitNoteNumber: string; // e.g. "DN-2026-00003"
  vendorName: string;
  poNumber?: string;
  grnNumber?: string;
  totalAmount: number;
  currency: string;
  status: string;
  reason: string;
  createdAt: string;
  approvedAt?: string;
}

export interface HourlyTimelineItem {
  id: string;
  time: string;
  title: string;
  description: string;
  category: EventCategory;
  status: EventStatus;
  badgeText: string;
  actor: string;
}

export interface DayOperationalSummary {
  dateStr: string; // "YYYY-MM-DD"
  plannedOutputUnits: number;
  actualOutputUnits: number;
  targetOutputUnits: number;
  plantUtilizationPct: number;
  activeLinesCount: number;
  totalLinesCount: number;
  ordersCount: number;
  ordersTotalValue: number;
  dispatchesCount: number;
  dispatchedWeightKg: number;
  inboundReceiptsCount: number;
  financeCount: number;
  financeTotalValue: number;
  criticalAlertsCount: number;
  shiftSupervisor: string;
  dayNotes?: string;
  productionEvents: ProductionEvent[];
  salesOrders: SalesOrderEvent[];
  dispatches: DispatchEvent[];
  inboundReceipts: InboundReceiptEvent[];
  financeEvents: FinanceDebitNoteEvent[];
  timeline: HourlyTimelineItem[];
}

export interface DayStats {
  productionCount: number;
  ordersCount: number;
  inboundCount: number;
  dispatchCount: number;
  financeCount?: number;
  totalCount: number;
  hasCritical: boolean;
}

export interface MonthOverviewData {
  year: number;
  month: number;
  totalEvents: number;
  dayStats: Record<string, DayStats>;
}
