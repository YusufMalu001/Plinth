import {
  DayOperationalSummary,
  MonthOverviewData,
} from '../types';

// Helper to format Date to YYYY-MM-DD in local time
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Creates a clean, empty operational day summary with zero dummy data.
 */
export function createEmptyDaySummary(dateStr: string): DayOperationalSummary {
  return {
    dateStr,
    plannedOutputUnits: 0,
    actualOutputUnits: 0,
    targetOutputUnits: 0,
    plantUtilizationPct: 0,
    activeLinesCount: 0,
    totalLinesCount: 6,
    ordersCount: 0,
    ordersTotalValue: 0,
    dispatchesCount: 0,
    dispatchedWeightKg: 0,
    inboundReceiptsCount: 0,
    financeCount: 0,
    financeTotalValue: 0,
    criticalAlertsCount: 0,
    shiftSupervisor: 'Operations Lead',
    dayNotes: undefined,
    productionEvents: [],
    salesOrders: [],
    dispatches: [],
    inboundReceipts: [],
    financeEvents: [],
    timeline: [],
  };
}

/**
 * Creates empty month statistics structure
 */
export function createEmptyMonthOverview(year: number, month: number): MonthOverviewData {
  return {
    year,
    month,
    totalEvents: 0,
    dayStats: {},
  };
}

// In-memory cache for user-created session updates
const sessionDayOverrides: Record<string, DayOperationalSummary> = {};

export function getDaySummary(dateStr: string): DayOperationalSummary {
  if (sessionDayOverrides[dateStr]) {
    return sessionDayOverrides[dateStr];
  }
  return createEmptyDaySummary(dateStr);
}

export function saveDaySummaryOverride(summary: DayOperationalSummary) {
  sessionDayOverrides[summary.dateStr] = summary;
}
