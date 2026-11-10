"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLossAnalytics, useLossEvents } from '@/features/loss-management/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import { useProcurementSelectors } from '@/features/purchases/hooks';
import { Button } from '@synergy/ui';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Trash2,
  AlertTriangle,
  Plus,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Building2,
  Package,
  Layers,
  BarChart3,
  Truck,
  Cog,
  ShieldAlert,
  RotateCcw,
  FileSpreadsheet,
  ArrowUpRight,
  Clock,
  ChevronRight,
  Boxes,
} from 'lucide-react';
import { format, startOfWeek, startOfMonth, startOfQuarter } from 'date-fns';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export default function ScrapWastageDashboardPage() {
  const [departmentId, setDepartmentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timePreset, setTimePreset] = useState<'all' | 'today' | 'week' | 'month' | 'quarter'>('all');

  const handleTimePreset = (preset: 'all' | 'today' | 'week' | 'month' | 'quarter') => {
    setTimePreset(preset);
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const todayStr = format(now, 'yyyy-MM-dd');
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (preset === 'quarter') {
      setStartDate(format(startOfQuarter(now), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  };

  const { data: selectors } = useProcurementSelectors();
  const { data: departmentsData } = useDepartments('ACTIVE');
  const departments = departmentsData?.items ?? selectors?.departments.items ?? [];

  const {
    data: analytics,
    isLoading: isAnalyticsLoading,
    refetch: refetchAnalytics
  } = useLossAnalytics({
    departmentId: departmentId || undefined,
    locationId: locationId || undefined,
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    endDate: endDate ? new Date(`${endDate}T23:59:59.999Z`).toISOString() : undefined,
  });

  const {
    data: recentEventsData,
    isLoading: isEventsLoading,
    refetch: refetchEvents
  } = useLossEvents({
    departmentId: departmentId || undefined,
    take: 8,
  });

  const rawEventsList = useMemo(() => {
    return Array.isArray(recentEventsData) ? recentEventsData : (recentEventsData?.items ?? []);
  }, [recentEventsData]);

  const handleRefreshAll = () => {
    refetchAnalytics();
    refetchEvents();
  };

  // Derived metrics
  const totalEvents = analytics?.totalEvents ?? 0;
  const totalQty = analytics?.totalQuantity ?? 0;
  const abnormalCount = analytics?.abnormalCount ?? 0;
  const abnormalQty = analytics?.abnormalQuantity ?? 0;
  const withinTolCount = analytics?.withinToleranceCount ?? 0;

  const complianceRate = totalEvents > 0 ? Math.round((withinTolCount / totalEvents) * 100) : 100;

  // Scenario counts from source types / events
  const scenarioDistribution = useMemo(() => {
    const rawSources = (analytics?.bySourceType || {}) as Record<string, { count: number; quantity: number }>;
    const dockDiscrepancy = rawSources.GRN_DISCREPANCY || { count: 0, quantity: 0 };
    const shopfloorException = rawSources.DEPARTMENT_EXECUTION_EXCEPTION || { count: 0, quantity: 0 };
    const qaRejection = rawSources.QC_REJECTION_NO_BATCH || { count: 0, quantity: 0 };
    const manualRma = rawSources.MANUAL_REPORT || { count: 0, quantity: 0 };

    return [
      {
        number: '01',
        label: 'Inward Raw Material QC',
        icon: Truck,
        count: dockDiscrepancy.count,
        quantity: dockDiscrepancy.quantity,
        color: 'text-foreground',
        bg: 'bg-muted text-foreground border-border',
        iconBg: 'bg-primary/10 text-primary border-primary/20',
        barColor: 'bg-primary',
        filterQuery: '01',
      },
      {
        number: '02',
        label: 'In-Process WIP Defect',
        icon: Cog,
        count: shopfloorException.count,
        quantity: shopfloorException.quantity,
        color: 'text-foreground',
        bg: 'bg-muted text-foreground border-border',
        iconBg: 'bg-primary/10 text-primary border-primary/20',
        barColor: 'bg-primary',
        filterQuery: '02',
      },
      {
        number: '03',
        label: 'Final Assembly QA Defect',
        icon: ShieldAlert,
        count: qaRejection.count,
        quantity: qaRejection.quantity,
        color: 'text-foreground',
        bg: 'bg-muted text-foreground border-border',
        iconBg: 'bg-primary/10 text-primary border-primary/20',
        barColor: 'bg-primary',
        filterQuery: '03',
      },
      {
        number: '04',
        label: 'Customer / Dealer RMA',
        icon: RotateCcw,
        count: manualRma.count,
        quantity: manualRma.quantity,
        color: 'text-foreground',
        bg: 'bg-muted text-foreground border-border',
        iconBg: 'bg-primary/10 text-primary border-primary/20',
        barColor: 'bg-primary',
        filterQuery: '04',
      },
    ];
  }, [analytics]);

  const activeDepartmentName = departmentId
    ? departments.find((d) => d.id === departmentId)?.name || 'Department'
    : 'All Departments';

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 dark:bg-[#070b14]/70 font-manrope">
      <div className="mx-auto max-w-[1680px] space-y-6">

        {/* ======================================================== */}
        {/* 1. HERO COMMAND BAR (THEME PRIMARY ACCENTS)               */}
        {/* ======================================================== */}
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-6 shadow-xs">
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-2xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary border border-primary/20">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Live Loss &amp; Scrap Governance
                </span>
                <span className="text-xs text-muted-foreground font-medium">•</span>
                <span className="text-xs text-muted-foreground font-semibold">{activeDepartmentName}</span>
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Scrap, Wastage &amp; <span className="text-primary font-extrabold">Loss Dashboard</span>
              </h1>
            </div>

            {/* Timeframe Selector & Executive Actions Suite */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Segmented Timeframe Switcher */}
              <div className="flex items-center rounded-2xl border border-border bg-muted/40 p-1 shadow-2xs">
                {(['all', 'today', 'week', 'month', 'quarter'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleTimePreset(val)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      timePreset === val
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {val === 'all'
                      ? 'All'
                      : val === 'today'
                      ? 'Today'
                      : val === 'week'
                      ? 'Week'
                      : val === 'month'
                      ? 'Month'
                      : 'Quarter'}
                  </button>
                ))}
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                disabled={isAnalyticsLoading || isEventsLoading}
                className="h-8.5 px-3 text-xs font-semibold shadow-2xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isAnalyticsLoading ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                <span>{isAnalyticsLoading ? 'Syncing...' : 'Live Sync'}</span>
              </Button>

              {/* Loss Events & Ledger Link */}
              <Link href="/scrap-wastage/ledger">
                <Button variant="outline" size="sm" className="h-8.5 px-3 text-xs font-semibold shadow-2xs">
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  <span>Scrap Ledger</span>
                </Button>
              </Link>

              {/* Report New Loss Action */}
              <Link href="/scrap-wastage/new">
                <Button size="sm" className="h-8.5 px-3.5 text-xs font-bold shadow-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Report Scrap</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. SECONDARY FILTER TOOLBAR (DEPARTMENT, LOCATION, DATES) */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="uppercase tracking-wider text-[11px] font-bold text-muted-foreground">Rollup Scope:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Department Selector */}
            <select
              aria-label="Filter by department"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setTimePreset('all');
              }}
              className="h-8.5 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
            >
              <option value="">All Manufacturing Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>

            {/* Location Selector */}
            <select
              aria-label="Filter by location"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setTimePreset('all');
              }}
              className="h-8.5 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
            >
              <option value="">All Storage / Bay Locations</option>
              {(selectors?.locations.items ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>

            {/* Custom Dates */}
            <div className="flex items-center gap-1.5 bg-background p-1 rounded-xl border border-input text-xs">
              <input
                type="date"
                aria-label="From date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setTimePreset('all');
                }}
                className="bg-transparent px-2 text-xs font-mono text-foreground focus:outline-hidden"
              />
              <span className="text-muted-foreground font-medium">to</span>
              <input
                type="date"
                aria-label="To date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setTimePreset('all');
                }}
                className="bg-transparent px-2 text-xs font-mono text-foreground focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. PRIMARY EXECUTIVE KPI METRIC CARDS (BALANCED GRID)    */}
        {/* ======================================================== */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          
          {/* KPI 1: Total Loss / Scrap Quantity */}
          <Link
            href="/scrap-wastage/ledger"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Plant Scrap &amp; Loss
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 transition-transform">
                <Trash2 className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  {number.format(totalQty)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">units</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Boxes className="h-3.5 w-3.5" />
                <span>Across {totalEvents} recorded incidents</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span>View full ledger breakdown</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* KPI 2: Abnormal Discrepancies */}
          <Link
            href="/scrap-wastage/abnormal-queue"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Abnormal Discrepancies
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 transition-transform">
                <AlertTriangle className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  {abnormalCount}
                  <span className="text-xs font-normal text-muted-foreground ml-1">incidents</span>
                </div>
                {abnormalCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Action Required
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <span className="font-bold text-foreground">{number.format(abnormalQty)} units</span>
                <span>exceeded tolerance</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Open abnormal review queue</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* KPI 3: Tolerance Compliance */}
          <Link
            href="/scrap-wastage/ledger?classification=WITHIN_TOLERANCE"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tolerance Compliance
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  {complianceRate}%
                  <span className="text-xs font-normal text-muted-foreground ml-1">governed</span>
                </div>
                <span className="text-xs font-bold text-primary">
                  {withinTolCount} / {totalEvents} events
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2.5 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(complianceRate, 100)}%` }}
                />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Within standard BOM scrap rules</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </div>
          </Link>

          {/* KPI 4: 4 Operational Loss Scenarios */}
          <Link
            href="/scrap-wastage/ledger"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Governed Scenarios
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-105 transition-transform">
                <Layers className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                  4 Ways
                </div>
                <span className="text-xs font-bold text-primary">
                  Fully Monitored
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground font-medium truncate">
                <span>Inward QC · WIP Run · Assembly · RMA</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span>View 4-way classification trail</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
            </div>
          </Link>
        </div>

        {/* ======================================================== */}
        {/* 4. 4 INDUSTRIAL SCENARIOS DETAILED BREAKDOWN CARDS       */}
        {/* ======================================================== */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4.5 h-4.5 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                4 Core Industrial Loss &amp; Scrap Scenarios
              </h2>
            </div>
            <Link href="/scrap-wastage/ledger" className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
              <span>Explore Scenarios in Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {scenarioDistribution.map((sc) => {
              const Icon = sc.icon;
              const percentOfTotal = totalQty > 0 ? Math.round((sc.quantity / totalQty) * 100) : 0;

              return (
                <div
                  key={sc.number}
                  className="rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary/50 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sc.bg}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span>Way {sc.number}</span>
                      </span>
                      <span className="font-mono text-xs font-bold text-muted-foreground">
                        {sc.count} incidents
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-foreground">{sc.label}</h3>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between items-baseline text-xs font-semibold mb-1.5">
                        <span className="text-muted-foreground font-medium">Scrapped Quantity:</span>
                        <span className="font-mono font-bold text-foreground">
                          {number.format(sc.quantity)} units
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${sc.barColor}`}
                          style={{ width: `${Math.max(6, percentOfTotal)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-muted-foreground mt-1.5">
                        <span>{percentOfTotal}% of total plant loss</span>
                        <span className="font-semibold text-foreground">{sc.count} logs</span>
                      </div>
                    </div>
                  </div>

                  <Link href={`/scrap-wastage/ledger?scenario=${sc.filterQuery}`} className="pt-3 border-t border-border">
                    <span className="text-xs font-bold text-primary hover:underline flex items-center justify-between">
                      <span>Inspect Way {sc.number} Records</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 5. DEPARTMENT ROLLUP MATRIX (7 COLS) & TOP ITEMS (5 COLS)*/}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Department Rollup Table (7 columns) */}
          <div className="lg:col-span-7 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4.5 h-4.5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  Manufacturing Department Rollup Matrix
                </h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {(analytics?.byDepartment || []).length} active departments
              </span>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Manufacturing Department</th>
                      <th className="px-4 py-3 text-right">Incidents</th>
                      <th className="px-4 py-3 text-right">Scrapped Qty</th>
                      <th className="px-4 py-3 text-right">Abnormal</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-medium">
                    {(analytics?.byDepartment && analytics.byDepartment.length > 0) ? (
                      analytics.byDepartment.map((dept, idx) => {
                        const hasAbnormal = dept.abnormalCount > 0;
                        return (
                          <tr key={dept.departmentId || `dept-${idx}`} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary font-mono text-[11px] font-bold border border-primary/20">
                                  {dept.departmentName ? dept.departmentName.slice(0, 3).toUpperCase() : 'DEP'}
                                </span>
                                <div>
                                  <p className="font-bold text-foreground text-xs">{dept.departmentName || 'General Floor'}</p>
                                  <p className="text-[10px] font-mono text-muted-foreground">{dept.departmentId ? `ID: ${dept.departmentId.slice(0, 8)}` : 'Plant-wide'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                              {dept.count}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                              {number.format(dept.quantity)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold">
                              {hasAbnormal ? (
                                <span className="text-foreground">{dept.abnormalCount}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasAbnormal ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                  Actionable
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                  Governed
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link href={`/scrap-wastage/ledger?department=${dept.departmentId || ''}`}>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                                  <span>Inspect</span>
                                  <ChevronRight className="w-3 h-3" />
                                </span>
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-muted-foreground">
                          No department scrap records found for the selected timeframe.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top Scrapped Materials Leaderboard (5 columns) */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4.5 h-4.5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  Top Scrapped Materials &amp; Products
                </h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                By volume lost
              </span>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Item / SKU</th>
                      <th className="px-4 py-3 text-right">Qty Lost</th>
                      <th className="px-4 py-3 text-right">% Plant Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-medium">
                    {(analytics?.byMaterial && analytics.byMaterial.length > 0) ? (
                      analytics.byMaterial.slice(0, 7).map((mat, idx) => {
                        const share = totalQty > 0 ? Math.round((mat.quantity / totalQty) * 100) : 0;
                        return (
                          <tr key={mat.materialId || mat.productId || `mat-${idx}`} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-foreground text-xs line-clamp-1">{mat.name}</p>
                              <p className="text-[10px] font-mono text-muted-foreground">
                                SKU: {mat.code} · {mat.materialId ? 'Raw Material' : 'Finished Good'}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
                              {number.format(mat.quantity)} {mat.uomSymbol || 'units'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-muted text-[11px] font-bold text-primary">
                                {share}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-xs text-muted-foreground">
                          No scrapped materials recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 6. LIVE RECENT LOSS INCIDENTS FEED (4-COL CARDS)         */}
        {/* ======================================================== */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                Recent Loss Incidents &amp; Live Exception Stream
              </h2>
            </div>
            <Link href="/scrap-wastage/ledger" className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
              <span>Open Full Ledger ({totalEvents} entries)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rawEventsList.slice(0, 4).map((evt) => {
              return (
                <div
                  key={evt.id}
                  className="rounded-3xl border border-border bg-card p-5 shadow-xs hover:border-primary/40 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {evt.lossNumber}
                      </span>
                      <StatusBadge status={evt.status} />
                    </div>

                    <div>
                      <p className="font-bold text-foreground text-xs line-clamp-1">
                        {evt.materialName || evt.productName || 'Unspecified Item'}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        {format(new Date(evt.reportedAt), 'MMM d, yyyy')} · {evt.departmentName || 'Plant-wide'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-muted/40 text-[11px] text-foreground line-clamp-2 leading-relaxed border border-border">
                      {evt.reason}
                    </div>

                    <div className="flex items-baseline justify-between pt-1 text-xs">
                      <span className="text-muted-foreground font-medium">Scrapped Quantity:</span>
                      <span className="font-mono font-bold text-foreground">
                        {number.format(Number(evt.quantity))} {evt.uomCode || 'units'}
                      </span>
                    </div>
                  </div>

                  <Link href={`/scrap-wastage/${evt.id}`} className="pt-2 border-t border-border">
                    <span className="text-xs font-bold text-primary hover:underline flex items-center justify-between">
                      <span>Inspect Event Record</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>


      </div>
    </main>
  );
}
