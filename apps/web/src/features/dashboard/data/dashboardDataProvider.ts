import { fetchApi } from '../../api/client';

export type DashboardTimeframe = 'month' | 'quarter' | 'year';

export interface DashboardAnalytics {
  timeframe: DashboardTimeframe;
  generatedAt: string;
  period: { from: string; to: string };
  scope: { allLocations: boolean; locationId: string | null };
  kpis: {
    catalogProducts: number;
    catalogMaterials: number;
    activeVendors: number;
    purchaseOrderCount: number;
    openPurchaseOrders: number;
    goodsReceipts: number;
    finalizedReceipts: number;
    receiptDiscrepancies: number;
    inventoryValue: number;
    inventoryBalanceCount: number;
    stockedItems: number;
    onHandQuantity: number;
    availableQuantity: number;
    reservedQuantity: number;
    lowStockItems: number;
    outOfStockItems: number;
    productionPlannedQuantity: number;
    productionOutputQuantity: number;
    productionCompletedPlans: number;
    productionInProgressPlans: number;
    productionPendingApproval: number;
    productionShortagePlans: number;
    approvedBoms: number;
    unreadNotifications: number;
  };
  procurementSpendByCurrency: Array<{ currency: string; value: number }>;
  productionTrend: Array<{ period: string; label: string; planned: number; completed: number; acceptedOutput: number; rejectedOutput: number }>;
  procurementTrend: Array<{ period: string; label: string; orderedValue: number; receivedValue: number; poCount: number; grnCount: number }>;
  inventoryByCategory: Array<{ name: string; value: number; onHand: number; itemCount: number; color: string }>;
  actions: Array<{ id: string; title: string; count: number; href: string; severity: string }>;
  recentEvents: Array<{ id: string; title: string; code: string; type: 'PO' | 'GRN' | 'PLAN' | 'STOCK'; status: string; timestamp: string; valueLabel: string; href: string }>;
}

export function fetchDashboardAnalytics(timeframe: DashboardTimeframe): Promise<DashboardAnalytics> {
  return fetchApi<DashboardAnalytics>(`/dashboard/overview?timeframe=${timeframe}`);
}
