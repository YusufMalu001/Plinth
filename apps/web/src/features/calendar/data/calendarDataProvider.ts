import { fetchApi } from '../../api/client';
import { DayOperationalSummary, MonthOverviewData } from '../types';
import { createEmptyDaySummary, createEmptyMonthOverview, saveDaySummaryOverride } from './mockScheduleData';

// In-memory cache for live fetched day summaries
const liveDayCache: Record<string, DayOperationalSummary> = {};
const liveMonthCache: Record<string, MonthOverviewData> = {};

/**
 * Fetches live real-time operational calendar data from the Synergy backend for a specific date (YYYY-MM-DD).
 * Never fabricates dummy or fake data.
 */
export async function fetchLiveCalendarData(dateKey: string, bypassCache = false): Promise<DayOperationalSummary> {
  if (!bypassCache && liveDayCache[dateKey]) {
    return liveDayCache[dateKey];
  }

  try {
    const apiResult = await fetchApi<DayOperationalSummary>(`/calendar/day?date=${dateKey}`);
    if (apiResult && apiResult.dateStr) {
      liveDayCache[dateKey] = apiResult;
      saveDaySummaryOverride(apiResult);
      return apiResult;
    }
  } catch (error) {
    console.error(`[CalendarDataProvider] /calendar/day fetch error for ${dateKey}:`, error);
  }

  // If backend returns empty or network error, return genuine clean zero-state structure
  const cleanEmptySummary = createEmptyDaySummary(dateKey);
  liveDayCache[dateKey] = cleanEmptySummary;
  saveDaySummaryOverride(cleanEmptySummary);
  return cleanEmptySummary;
}

/**
 * Fetches live real-time month-level event aggregates for the calendar month grid directly from the database.
 */
export async function fetchLiveMonthData(year: number, month: number, bypassCache = false): Promise<MonthOverviewData> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  if (!bypassCache && liveMonthCache[monthKey]) {
    return liveMonthCache[monthKey];
  }

  try {
    const apiResult = await fetchApi<MonthOverviewData>(`/calendar/month?year=${year}&month=${month}`);
    if (apiResult && apiResult.dayStats) {
      liveMonthCache[monthKey] = apiResult;
      return apiResult;
    }
  } catch (error) {
    console.error(`[CalendarDataProvider] /calendar/month fetch error for ${monthKey}:`, error);
  }

  // Clean empty month stats
  const fallbackMonth = createEmptyMonthOverview(year, month);
  liveMonthCache[monthKey] = fallbackMonth;
  return fallbackMonth;
}

/**
 * Clears the local in-memory cache to force an immediate fresh database sync
 */
export function clearCalendarCache(): void {
  Object.keys(liveDayCache).forEach((k) => delete liveDayCache[k]);
  Object.keys(liveMonthCache).forEach((k) => delete liveMonthCache[k]);
}
