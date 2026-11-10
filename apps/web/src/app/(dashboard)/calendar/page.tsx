'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Plus,
} from 'lucide-react';
import { MasterCalendar } from '@/features/calendar/components/MasterCalendar';
import { DayDetailsPanel } from '@/features/calendar/components/DayDetailsPanel';
import { AddScheduleModal } from '@/features/calendar/components/AddScheduleModal';
import { formatDateKey } from '@/features/calendar/data/mockScheduleData';
import { fetchLiveCalendarData, fetchLiveMonthData, clearCalendarCache } from '@/features/calendar/data/calendarDataProvider';
import { DayOperationalSummary, MonthOverviewData } from '@/features/calendar/types';

export default function OperationsCalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<DayOperationalSummary | null>(null);
  const [monthOverview, setMonthOverview] = useState<MonthOverviewData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [isLoadingDay, setIsLoadingDay] = useState(false);

  // Load Month Overview
  const loadMonthData = useCallback(async (date: Date, bypassCache = false) => {
    setIsLoadingMonth(true);
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const overview = await fetchLiveMonthData(y, m, bypassCache);
    setMonthOverview(overview);
    setIsLoadingMonth(false);
  }, []);

  // Load Day Details
  const loadDataForDate = useCallback(async (date: Date, bypassCache = false) => {
    setIsLoadingDay(true);
    const key = formatDateKey(date);
    const data = await fetchLiveCalendarData(key, bypassCache);
    setCurrentSummary(data);
    setIsLoadingDay(false);
  }, []);

  useEffect(() => {
    loadMonthData(currentDate);
  }, [currentDate, loadMonthData]);

  useEffect(() => {
    loadDataForDate(selectedDate);
  }, [selectedDate, loadDataForDate]);

  const handleNavigateDate = (delta: number) => {
    setCurrentDate((prev) => {
      const nextDate = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      return nextDate;
    });
  };

  const handleSelectMonthYear = (newYear: number, newMonth: number) => {
    const nextDate = new Date(newYear, newMonth, 1);
    setCurrentDate(nextDate);
    // If selected date is not in this month/year, move selected date to 1st of that month
    if (selectedDate.getFullYear() !== newYear || selectedDate.getMonth() !== newMonth) {
      setSelectedDate(nextDate);
    }
  };

  const handleJumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handleSaveSummary = (updated: DayOperationalSummary) => {
    setCurrentSummary(updated);
    // Trigger month stats refresh
    loadMonthData(currentDate, true);
  };

  const handleSyncRealtime = async () => {
    setIsRefreshing(true);
    clearCalendarCache();
    await Promise.all([
      loadMonthData(currentDate, true),
      loadDataForDate(selectedDate, true),
    ]);
    setIsRefreshing(false);
  };

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-7 overflow-y-auto bg-slate-50/50 dark:bg-[#070b14]/70">
      <div className="max-w-[1680px] mx-auto space-y-5">
        {/* Clean Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Operations Calendar
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live manufacturing, procurement, goods receipt, and dispatch schedules
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncRealtime}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#004a80]' : 'text-slate-400'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Live'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Schedule Event</span>
            </button>
          </div>
        </div>

        {/* Two-Column Cockpit Layout: Left Clean Calendar (40%) + Right Day Details (60%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Master Calendar (5 Columns ~ 41.7%) */}
          <div className="lg:col-span-5 flex flex-col">
            <MasterCalendar
              currentDate={currentDate}
              selectedDate={selectedDate}
              monthOverview={monthOverview}
              isLoadingMonth={isLoadingMonth}
              onSelectDate={setSelectedDate}
              onNavigateDate={handleNavigateDate}
              onSelectMonthYear={handleSelectMonthYear}
              onJumpToToday={handleJumpToToday}
            />
          </div>

          {/* Right Statistics & Day Details Panel (7 Columns ~ 58.3%) */}
          <div className="lg:col-span-7 flex flex-col relative">
            {isLoadingDay && (
              <div className="absolute inset-0 bg-white/50 dark:bg-slate-950/50 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-2xl">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2 rounded-xl shadow-lg">
                  <RefreshCw className="h-4 w-4 text-[#004a80] animate-spin" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Updating day operations...</span>
                </div>
              </div>
            )}
            {currentSummary ? (
              <DayDetailsPanel
                summary={currentSummary}
                selectedDate={selectedDate}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] text-xs text-slate-400 p-24">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 text-[#004a80] animate-spin" />
                  <span>Loading live operations data...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Schedule Modal */}
      {currentSummary && (
        <AddScheduleModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          selectedDate={selectedDate}
          currentSummary={currentSummary}
          onSave={handleSaveSummary}
        />
      )}
    </div>
  );
}
