'use client';

import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { formatDateKey } from '../data/mockScheduleData';
import { MonthOverviewData } from '../types';

interface MasterCalendarProps {
  currentDate: Date;
  selectedDate: Date;
  monthOverview?: MonthOverviewData | null;
  isLoadingMonth?: boolean;
  onSelectDate: (date: Date) => void;
  onNavigateDate: (delta: number) => void;
  onSelectMonthYear: (year: number, month: number) => void;
  onJumpToToday: () => void;
}

export function MasterCalendar({
  currentDate,
  selectedDate,
  monthOverview,
  isLoadingMonth = false,
  onSelectDate,
  onNavigateDate,
  onSelectMonthYear,
  onJumpToToday,
}: MasterCalendarProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const currentActualYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentActualYear - 3; y <= currentActualYear + 3; y++) {
      years.push(y);
    }
    return years;
  }, [currentActualYear]);

  // Calculate Month Grid
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const totalDaysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const days: Array<{
      date: Date;
      isCurrentMonth: boolean;
      dateKey: string;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    const todayStr = formatDateKey(new Date());
    const selectedStr = formatDateKey(selectedDate);

    // Prev month padding
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const key = formatDateKey(d);
      days.push({
        date: d,
        isCurrentMonth: false,
        dateKey: key,
        isToday: key === todayStr,
        isSelected: key === selectedStr,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i);
      const key = formatDateKey(d);
      days.push({
        date: d,
        isCurrentMonth: true,
        dateKey: key,
        isToday: key === todayStr,
        isSelected: key === selectedStr,
      });
    }

    // Next month padding
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = formatDateKey(d);
      days.push({
        date: d,
        isCurrentMonth: false,
        dateKey: key,
        isToday: key === todayStr,
        isSelected: key === selectedStr,
      });
    }

    return days;
  }, [year, month, selectedDate]);

  return (
    <div className="flex flex-col bg-white dark:bg-[#0c121e] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
      {/* Header with Month/Year dropdowns */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Month Selector */}
          <select
            value={month}
            onChange={(e) => onSelectMonthYear(year, parseInt(e.target.value, 10))}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#004a80] rounded-lg pr-2 py-0.5"
          >
            {monthNames.map((mName, idx) => (
              <option key={mName} value={idx} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-semibold">
                {mName}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={year}
            onChange={(e) => onSelectMonthYear(parseInt(e.target.value, 10), month)}
            className="text-base sm:text-lg font-bold tracking-tight text-[#004a80] dark:text-blue-400 bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#004a80] rounded-lg pr-2 py-0.5"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-semibold">
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Jumpers */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onJumpToToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-[#004a80]/10 hover:text-[#004a80] hover:border-[#004a80]/30 dark:hover:bg-[#004a80]/20 dark:hover:text-blue-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-[#004a80] dark:text-blue-400" />
            <span>Today</span>
          </button>
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => onNavigateDate(-1)}
              title="Previous Month"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateDate(1)}
              title="Next Month"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Row */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 text-center py-2.5 bg-slate-50/50 dark:bg-slate-900/30">
        {daysOfWeek.map((day, idx) => (
          <div
            key={day}
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              idx >= 5 ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 p-4 sm:p-5 bg-white dark:bg-[#0c121e] relative">
        {isLoadingMonth && (
          <div className="absolute inset-0 bg-white/40 dark:bg-slate-950/40 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <span className="text-xs text-[#004a80] dark:text-blue-300 font-medium animate-pulse">
              Syncing operational schedule...
            </span>
          </div>
        )}

        {calendarDays.map((cell) => {
          const dayNum = cell.date.getDate();
          const dayStat = monthOverview?.dayStats?.[cell.dateKey];
          const totalEvents = dayStat?.totalCount ?? 0;
          const hasEvents = totalEvents > 0;
          const hasCritical = dayStat?.hasCritical;

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              className={`group relative flex flex-col items-center justify-center aspect-square w-full rounded-xl sm:rounded-2xl transition-all duration-150 text-center cursor-pointer p-1 ${
                cell.isSelected
                  ? 'bg-[#004a80] text-white font-bold shadow-md shadow-[#004a80]/25 scale-[1.02] border border-[#004a80]'
                  : cell.isToday
                  ? 'bg-[#004a80]/10 dark:bg-[#004a80]/20 text-[#004a80] dark:text-blue-300 border-2 border-[#004a80]'
                  : cell.isCurrentMonth
                  ? 'bg-slate-50/70 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800/80 hover:bg-[#004a80]/5 dark:hover:bg-[#004a80]/20 hover:border-[#004a80]/40'
                  : 'bg-transparent text-slate-300 dark:text-slate-700 opacity-30 hover:opacity-60 border border-transparent'
              }`}
            >
              {/* Day Number */}
              <span
                className={`text-sm sm:text-base font-semibold transition-transform ${
                  cell.isSelected
                    ? 'text-white font-extrabold'
                    : cell.isToday
                    ? 'text-[#004a80] dark:text-blue-300 font-bold'
                    : cell.isCurrentMonth
                    ? 'text-slate-800 dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                {dayNum}
              </span>

              {/* Module Micro Indicator Dots */}
              {hasEvents && cell.isCurrentMonth && dayStat && (
                <div className="mt-1 flex items-center justify-center gap-0.5 flex-wrap max-w-[36px]">
                  {cell.isSelected ? (
                    <span className="text-[10px] font-bold text-white/95 leading-none">
                      {totalEvents}
                    </span>
                  ) : (
                    <>
                      {dayStat.productionCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#004a80]" title={`${dayStat.productionCount} Production`} />
                      )}
                      {dayStat.inboundCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={`${dayStat.inboundCount} Inbound GRN`} />
                      )}
                      {dayStat.ordersCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title={`${dayStat.ordersCount} Orders`} />
                      )}
                      {dayStat.dispatchCount > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${dayStat.dispatchCount} Dispatches`} />
                      )}
                      {(dayStat.financeCount ?? 0) > 0 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" title={`${dayStat.financeCount} Finance`} />
                      )}
                      {hasCritical && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" title="Critical Alert" />
                      )}
                    </>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Module Legend */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#004a80]" /> Production
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Inbound GRN
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Orders
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Dispatches
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-500" /> Finance
          </span>
        </div>
        <span className="font-semibold text-slate-600 dark:text-slate-300">Live Enterprise Schedule</span>
      </div>
    </div>
  );
}
