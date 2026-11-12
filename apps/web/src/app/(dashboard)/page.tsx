'use client';

import Link from 'next/link';
import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { useCurrentUser } from '@/features/auth/hooks';
import { EmployeePortalDashboard } from '@/features/hr/components/EmployeePortalDashboard';
import { ExecutiveDashboardReportPDF } from '@/components/ExecutiveDashboardReportPDF';
import { ErrorState } from '@/components/ErrorState';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Factory,
  Layers,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DashboardTimeframe,
  fetchDashboardAnalytics,
} from '@/features/dashboard/data/dashboardDataProvider';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

interface ChartPayloadItem {
  color?: string;
  stroke?: string;
  fill?: string;
  name: string;
  value: number | string;
}

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: ChartPayloadItem[];
  label?: string;
  isCurrency?: boolean;
}

function CustomChartTooltip({ active, payload, label, isCurrency = false }: CustomChartTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-border bg-inverse/95 p-3 text-xs text-inverse shadow-popover backdrop-blur-md">
        <p className="font-bold text-ink-secondary mb-1.5 border-border-strong border-border pb-1">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-secondary">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-inverse">
                {isCurrency ? money(Number(entry.value)) : number.format(Number(entry.value))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export default function DashboardOverview() {
  const { data: currentUser } = useCurrentUser();
  const userRoleKey = (currentUser?.roleDefinition?.key || currentUser?.role || '').toLowerCase();
  const roleKeys = [userRoleKey, ...(currentUser?.roles || []).map((role) => String(role.key || role.name || '').toLowerCase())];
  const isShopFloorWorker = roleKeys.some((role) => ['shop_floor_operator', 'shop-floor-operator', 'operator'].includes(role));
  const hasCustomGrantedModules = (currentUser?.permissions || []).length > 0 && userRoleKey !== 'admin' && userRoleKey !== 'super-admin' && userRoleKey !== 'employee';
  const isStandardEmployee = isShopFloorWorker || (userRoleKey === 'employee' && !hasCustomGrantedModules);
  const [timeframe, setTimeframe] = useState<DashboardTimeframe>('month');
  const [activityFilter, setActivityFilter] = useState<string>('ALL');
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);
  const printRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['dashboard-overview', timeframe],
    queryFn: () => fetchDashboardAnalytics(timeframe),
    staleTime: 45_000,
  });
  const data = query.data;

  const handleExportPdf = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Plinth_Executive_Report_${timeframe}_${new Date().toISOString().slice(0, 10)}`,
  });
  const filteredEvents = useMemo(() => {
    if (!data?.recentEvents) return [];
    return data.recentEvents.filter((event) => {
      const matchesType = activityFilter === 'ALL' || event.type === activityFilter;
      const matchesSearch =
        !activitySearch ||
        event.code.toLowerCase().includes(activitySearch.toLowerCase()) ||
        event.title.toLowerCase().includes(activitySearch.toLowerCase()) ||
        event.status.toLowerCase().includes(activitySearch.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [data?.recentEvents, activityFilter, activitySearch]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEvents.slice(startIndex, startIndex + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  const handleFilterChange = (filter: string) => {
    setActivityFilter(filter);
    setPage(1);
  };

  const handleSearchChange = (search: string) => {
    setActivitySearch(search);
    setPage(1);
  };
  // If logged-in user is an employee, display their dedicated Employee Portal Dashboard
  if (isStandardEmployee) {
    return <EmployeePortalDashboard includeProductionWork={isShopFloorWorker} />;
  }
  if (query.isLoading) {
    return (
      <main className="flex-1 overflow-y-auto bg-muted/50 p-6 lg:p-8">
        <div className="mx-auto max-w-[1680px] space-y-6">
          <div className="h-14 rounded-2xl bg-surface border border-border animate-pulse" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-44 rounded-2xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="h-80 rounded-2xl bg-surface border border-border lg:col-span-8 animate-pulse" />
            <div className="h-80 rounded-2xl bg-surface border border-border lg:col-span-4 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }
  if (query.isError || !data) {
    return (
      <main className="flex-1 bg-muted/50 p-6 sm:p-8 flex items-center justify-center min-h-[80vh]">
        <ErrorState
          error={query.error}
          title="Operations Dashboard Access"
          resourceName="Dashboard"
          actionName="read"
          retry={() => query.refetch()}
        />
      </main>
    );
  }

  const primarySpend = data.procurementSpendByCurrency.find((entry) => entry.currency === 'INR') ?? data.procurementSpendByCurrency[0];
  const productionHasData = data.productionTrend.some((entry) => entry.planned || entry.acceptedOutput || entry.completed);
  const procurementHasData = data.procurementTrend.some((entry) => entry.orderedValue || entry.receivedValue);
  const inventoryHasData = data.inventoryByCategory.some((entry) => entry.value > 0);
  const receiptRate = data.kpis.goodsReceipts ? Math.round((data.kpis.finalizedReceipts / data.kpis.goodsReceipts) * 100) : 0;
  const productionExecutionRate = data.kpis.productionPlannedQuantity > 0
    ? Math.min(100, Math.round((data.kpis.productionOutputQuantity / data.kpis.productionPlannedQuantity) * 100))
    : 0;

  const totalStockAttention = data.kpis.lowStockItems + data.kpis.outOfStockItems;
  const totalActionsCount = data.actions.reduce((s, a) => s + a.count, 0);
  const periodLabel = `${new Date(data.period.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(data.period.to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <main className="flex-1 overflow-y-auto bg-muted/50 p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        
        {/* ======================================================== */}
        {/* 1. CLEAN TOP PAGE HEADER (No fake containers or capsules) */}
        {/* ======================================================== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Operations Dashboard
            </h1>
            <p className="mt-1 text-xs text-ink-muted">
              Overview for {periodLabel}
            </p>
          </div>

          {/* Timeframe & Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Timeframe Switcher */}
            <div className="flex items-center rounded-xl border border-border bg-surface p-1 shadow-2xs">
              {(['month', 'quarter', 'year'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTimeframe(val)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    timeframe === val
                      ? 'bg-action text-inverse shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {val === 'month' ? 'This Month' : val === 'quarter' ? 'This Quarter' : 'This Year'}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              title="Refresh Data"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-hover transition shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin text-link' : 'text-ink-muted'}`} />
              <span>{query.isFetching ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Operations Calendar Link */}
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-hover transition shadow-2xs"
            >
              <Calendar className="h-3.5 w-3.5 text-ink-muted" />
              <span>Calendar</span>
            </Link>

            {/* Export PDF Report */}
            <button
              type="button"
              onClick={() => handleExportPdf()}
              disabled={!data || query.isLoading}
              title="Export Executive Report as PDF"
              className="inline-flex items-center gap-1.5 rounded-xl bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse px-3.5 py-2 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
        {/* 2. PRIMARY EXECUTIVE KPI METRIC CARDS (Generous Padding)  */}
        {/* ======================================================== */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          
          {/* KPI 1: Inventory Valuation */}
          <Link
            href="/stock"
            className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-2xs hover:border-accent transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Total Inventory Value
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary group-hover:text-link group-hover:border-accent/30 transition-colors">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                  {money(data.kpis.inventoryValue)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-secondary">
                  <span className="font-semibold text-link">{data.kpis.stockedItems.toLocaleString()} SKUs in Stock</span>
                  <span className="text-ink-secondary">•</span>
                  <span className="text-ink-muted">{data.kpis.inventoryBalanceCount} records</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-ink-muted">
                {number.format(data.kpis.availableQuantity)} avail / {number.format(data.kpis.reservedQuantity)} rsvd
              </span>
              <span className="flex items-center gap-1 font-semibold text-link group-hover:translate-x-0.5 transition-transform">
                View Stock <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 2: Procurement Commitments */}
          <Link
            href="/procurement/purchase-orders"
            className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-2xs hover:border-accent transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Procurement Commitments
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary group-hover:text-link group-hover:border-accent/30 transition-colors">
                  <ShoppingCart className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                  {primarySpend ? money(primarySpend.value, primarySpend.currency) : money(0)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-secondary">
                  <span className="font-semibold text-link">{data.kpis.openPurchaseOrders} Open POs</span>
                  <span className="text-ink-secondary">•</span>
                  <span className="text-ink-muted">{data.kpis.purchaseOrderCount} in period</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-ink-muted">{data.kpis.activeVendors} active suppliers</span>
              <span className="flex items-center gap-1 font-semibold text-link group-hover:translate-x-0.5 transition-transform">
                Purchase Orders <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 3: Manufacturing Output */}
          <Link
            href="/production"
            className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-2xs hover:border-accent transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Manufacturing Output
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary group-hover:text-link group-hover:border-accent/30 transition-colors">
                  <Factory className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                    {number.format(data.kpis.productionOutputQuantity)}
                    <span className="text-xs font-normal text-ink-placeholder ml-1.5">units</span>
                  </div>
                  <span className="text-xs font-semibold text-ink-secondary">
                    {productionExecutionRate}% run rate
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2.5 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-action h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(productionExecutionRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-ink-muted">{data.kpis.productionInProgressPlans} active • {number.format(data.kpis.productionPlannedQuantity)} quota</span>
              <span className="flex items-center gap-1 font-semibold text-link group-hover:translate-x-0.5 transition-transform">
                Production <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 4: Inbound Goods Receipts */}
          <Link
            href="/receiving/goods-receipts"
            className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-2xs hover:border-accent transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Inbound Goods Inward
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary group-hover:text-link group-hover:border-accent/30 transition-colors">
                  <PackageCheck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                    {number.format(data.kpis.goodsReceipts)}
                    <span className="text-xs font-normal text-ink-placeholder ml-1.5">GRNs</span>
                  </div>
                  <span className="text-xs font-semibold text-ink-secondary">
                    {receiptRate}% finalized
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2.5 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-action h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(receiptRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-ink-muted">
                {data.kpis.finalizedReceipts} cleared {data.kpis.receiptDiscrepancies > 0 && `• ${data.kpis.receiptDiscrepancies} discrepant`}
              </span>
              <span className="flex items-center gap-1 font-semibold text-link group-hover:translate-x-0.5 transition-transform">
                GRN Dock <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </div>

        {/* ======================================================== */}
        {/* 3. SECONDARY STATUS STRIP (Polished & Spacious)           */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          
          <Link
            href="/products"
            className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border hover:border-accent transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-ink-muted">Master Catalog</p>
                <p className="text-sm font-bold text-ink">
                  {number.format(data.kpis.catalogProducts + data.kpis.catalogMaterials)} items
                </p>
              </div>
            </div>
            <span className="text-xs text-ink-placeholder group-hover:text-link transition">
              {data.kpis.catalogProducts}P / {data.kpis.catalogMaterials}M
            </span>
          </Link>

          <Link
            href="/production/bom"
            className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border hover:border-accent transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-ink-muted">Approved BOMs</p>
                <p className="text-sm font-bold text-ink">
                  {number.format(data.kpis.approvedBoms)} formulas
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-link">
              {data.kpis.productionPendingApproval} pending
            </span>
          </Link>

          <Link
            href="/stock?tab=stockouts"
            className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border hover:border-accent transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-ink-muted">Stock Attention</p>
                <p className="text-sm font-bold text-ink">
                  {totalStockAttention} alerts
                </p>
              </div>
            </div>
            <span className="text-xs text-tone-red-text font-semibold">
              {data.kpis.outOfStockItems} stockouts
            </span>
          </Link>

          <Link
            href="/notifications"
            className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border hover:border-accent transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-ink-muted">Action Queue</p>
                <p className="text-sm font-bold text-ink">
                  {totalActionsCount} action tasks
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-ink-secondary">
              {data.actions.length} queues
            </span>
          </Link>
        </div>

        {/* ======================================================== */}
        {/* 4. PRIMARY ANALYTICS ROW: PRODUCTION & INVENTORY DONUT   */}
        {/* ======================================================== */}
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* PRODUCTION OUTPUT TREND */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-2xs lg:col-span-8 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-border-strong border-border pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    <h2 className="font-bold text-base text-ink">
                      Production Quota vs Actual Output Yield
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Target manufacturing run quotas against finished units and completion milestones
                  </p>
                </div>

                {/* Chart Legend */}
                <div className="flex items-center gap-3.5 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-ink-secondary">
                    <span className="h-2.5 w-2.5 rounded-sm bg-action/30 border border-accent" /> Planned Quota
                  </span>
                  <span className="flex items-center gap-1.5 text-ink-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-action" /> Finished Output
                  </span>
                  <span className="flex items-center gap-1.5 text-ink-secondary">
                    <span className="h-2.5 w-2.5 rounded-full bg-tone-green-solid" /> Completed
                  </span>
                </div>
              </div>

              {/* Sub-header mini metrics */}
              <div className="mt-3.5 grid grid-cols-3 gap-3">
                <div className="p-2.5 rounded-xl border border-border bg-muted/50">
                  <span className="text-[10px] font-semibold uppercase text-ink-placeholder block">Total Planned Quota</span>
                  <span className="text-sm font-bold text-ink">
                    {number.format(data.kpis.productionPlannedQuantity)} <span className="text-xs font-normal text-ink-placeholder">units</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-border bg-muted/50">
                  <span className="text-[10px] font-semibold uppercase text-ink-placeholder block">Finished Output Yield</span>
                  <span className="text-sm font-bold text-ink">
                    {number.format(data.kpis.productionOutputQuantity)} <span className="text-xs font-normal text-ink-placeholder">units ({productionExecutionRate}%)</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-border bg-muted/50">
                  <span className="text-[10px] font-semibold uppercase text-ink-placeholder block">Active Work Orders</span>
                  <span className="text-sm font-bold text-ink">
                    {data.kpis.productionInProgressPlans} <span className="text-xs font-normal text-ink-placeholder">in progress</span>
                  </span>
                </div>
              </div>

              <div className="mt-4 h-60">
                {!productionHasData ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-xs text-ink-placeholder">
                    <Factory className="h-8 w-8 text-ink-secondary mb-2" />
                    No production plans or output runs recorded for this timeframe.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.productionTrend} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
                      <defs>
                        <linearGradient id="navyProductionGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                      <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => compactNumber.format(Number(v))} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Bar
                        dataKey="planned"
                        name="Planned Target Quota"
                        fill="var(--chart-1)"
                        fillOpacity={0.16}
                        stroke="var(--chart-1)"
                        strokeWidth={1}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={42}
                      />
                      <Area
                        dataKey="acceptedOutput"
                        name="Finished Output"
                        type="monotone"
                        stroke="var(--chart-1)"
                        strokeWidth={2.5}
                        fill="url(#navyProductionGlow)"
                      />
                      <Line
                        dataKey="completed"
                        name="Completed Plan Units"
                        type="monotone"
                        stroke="var(--tone-green-solid)"
                        strokeWidth={2}
                        dot={{ r: 3.5, fill: 'var(--tone-green-solid)' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {data.kpis.productionPlannedQuantity > 0 && data.kpis.productionOutputQuantity === 0 && (
              <div className="mt-3 flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/60 text-xs text-ink-muted">
                <span>
                  {number.format(data.kpis.productionPlannedQuantity)} target units scheduled across {data.kpis.productionInProgressPlans} active lines. Realized output will plot live once batch runs are logged.
                </span>
                <Link
                  href="/production/planning"
                  className="font-semibold text-link hover:underline inline-flex items-center gap-1 shrink-0 ml-2"
                >
                  <span>Production Plans</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </section>

          {/* INVENTORY VALUATION DONUT */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-2xs lg:col-span-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-border-strong border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                    <Layers className="h-4 w-4" />
                  </span>
                  <h2 className="font-bold text-base text-ink">
                    Stock Asset Allocation
                  </h2>
                </div>
                <Link href="/stock" className="text-xs font-semibold text-link hover:underline">
                  Details
                </Link>
              </div>

              {/* Donut Chart with Centered Total Value */}
              <div className="relative mt-4 h-44 flex items-center justify-center">
                {!inventoryHasData ? (
                  <div className="text-center text-xs text-ink-placeholder">No valued inventory available.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.inventoryByCategory}
                          dataKey="value"
                          innerRadius={52}
                          outerRadius={74}
                          paddingAngle={3}
                        >
                          {data.inventoryByCategory.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomChartTooltip isCurrency />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-semibold uppercase text-ink-placeholder">Total Stock</span>
                      <span className="text-sm font-bold text-ink">
                        {money(data.kpis.inventoryValue)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Category Breakdown Progress Bars */}
            <div className="mt-4 space-y-2.5">
              {data.inventoryByCategory.slice(0, 4).map((entry) => {
                const pct = data.kpis.inventoryValue > 0
                  ? Math.round((entry.value / data.kpis.inventoryValue) * 100)
                  : 0;
                return (
                  <div key={entry.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-ink-secondary font-medium truncate max-w-[160px]">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="font-mono font-bold text-ink text-xs">
                        {money(entry.value)} <span className="text-[10px] text-ink-placeholder font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: entry.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ======================================================== */}
        {/* 5. SECONDARY ANALYTICS ROW: SPEND VS GRN & ACTION CENTER */}
        {/* ======================================================== */}
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* PROCUREMENT VS INBOUND BAR CHART */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-2xs lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-border-strong border-border pb-4">
              <div>
                <h2 className="font-bold text-base text-ink">
                  Procurement Commitments vs Realized GRN Postings
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Value of Purchase Orders issued vs inventory postings received from goods inward
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-ink-secondary">
                  <span className="h-2.5 w-2.5 rounded-sm bg-action" /> PO Value
                </span>
                <span className="flex items-center gap-1.5 text-ink-secondary">
                  <span className="h-2.5 w-2.5 rounded-sm bg-tone-green-solid" /> GRN Realized
                </span>
              </div>
            </div>

            <div className="mt-5 h-60">
              {!procurementHasData ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-xs text-ink-placeholder">
                  <ShoppingCart className="h-8 w-8 text-ink-secondary mb-2" />
                  No purchase orders or GRN postings recorded in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.procurementTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                    <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => compactNumber.format(Number(v))} />
                    <Tooltip content={<CustomChartTooltip isCurrency />} />
                    <Bar dataKey="orderedValue" name="PO Ordered Value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="receivedValue" name="GRN Realized Value" fill="var(--tone-green-solid)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* ACTION & PRIORITY RESOLUTION CENTER */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-2xs lg:col-span-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-border-strong border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary">
                    <Zap className="h-4 w-4" />
                  </span>
                  <h2 className="font-bold text-base text-ink">
                    Operational Attention Center
                  </h2>
                </div>
                <span className="rounded-full bg-muted border border-border text-ink font-semibold px-2.5 py-0.5 text-xs">
                  {totalActionsCount} Pending
                </span>
              </div>

              <div className="mt-4 space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {data.actions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-ink-placeholder">
                    <CheckCircle2 className="h-6 w-6 text-tone-green-text mx-auto mb-1.5" />
                    All operational queues are clear with zero pending exceptions.
                  </div>
                ) : (
                  data.actions.map((action) => (
                    <Link
                      key={action.id}
                      href={action.href}
                      className="group flex items-center justify-between p-3 rounded-xl border border-border bg-muted/50 hover:border-accent transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-ink-placeholder group-hover:text-link transition-colors">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span className="text-xs font-semibold text-ink-secondary group-hover:text-link transition-colors truncate">
                          {action.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <span className="rounded-md bg-surface border border-border font-mono font-bold text-xs px-2 py-0.5 text-ink shadow-2xs">
                          {action.count}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-ink-placeholder group-hover:text-link group-hover:translate-x-0.5 transition" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-ink-placeholder">
              <span>Resolutions update in real-time</span>
              <span className="text-ink-secondary font-medium">Plinth Workflow Guard</span>
            </div>
          </section>
        </div>

        {/* ======================================================== */}
        {/* 6. REAL-TIME AUDIT STREAM & ACTIVITY TABLE WITH PAGINATION*/}
        {/* ======================================================== */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-border-strong border-border pb-4">
            <div>
              <h2 className="font-bold text-base text-ink">
                Live Operational Activity & Ledger Stream
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Audit trail of recent purchase orders, goods receipts, production schedules, and inventory movements
              </p>
            </div>

            {/* Filter Pills and Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center rounded-xl bg-muted/80 p-1 border border-border">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'PO', label: 'Procurement' },
                  { id: 'GRN', label: 'Goods Inward' },
                  { id: 'PLAN', label: 'Production' },
                  { id: 'STOCK', label: 'Stock Movements' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleFilterChange(tab.id)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      activityFilter === tab.id
                        ? 'bg-action text-inverse font-bold shadow-2xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-placeholder" />
                <input
                  type="text"
                  placeholder="Search stream..."
                  value={activitySearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="rounded-xl border border-border bg-surface pl-8.5 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Structured Activity Table */}
          <div className="mt-4 overflow-x-auto">
            {filteredEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-ink-placeholder">
                No matching operational activities found for the selected filter.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-border-strong border-border text-[11px] font-bold text-ink-placeholder uppercase tracking-wider">
                    <th className="py-3 px-3">Type & Ref</th>
                    <th className="py-3 px-3">Description / Partner</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Value / Movement</th>
                    <th className="py-3 px-3 text-right">Timestamp</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedEvents.map((event) => {
                    const badgeClass =
                      event.type === 'GRN'
                        ? 'bg-muted text-ink border-border'
                        : event.type === 'PO'
                        ? 'bg-muted text-ink border-border'
                        : event.type === 'PLAN'
                        ? 'bg-muted text-ink border-border'
                        : 'bg-muted text-ink border-border';

                    return (
                      <tr
                        key={event.id}
                        className="hover:bg-muted/80 transition-colors group"
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                              {event.type}
                            </span>
                            <span className="font-mono font-bold text-ink">
                              {event.code}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 max-w-[280px] truncate text-ink-secondary font-medium">
                          {event.title}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-muted text-ink-secondary border border-border">
                            {event.status.replaceAll('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-ink whitespace-nowrap">
                          {event.valueLabel}
                        </td>

                        <td className="py-3 px-3 text-right text-ink-placeholder whitespace-nowrap text-[11px]">
                          {new Date(event.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                          {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Link
                            href={event.href}
                            className="inline-flex items-center gap-1 font-semibold text-link hover:underline text-[11px]"
                          >
                            <span>Open</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Interactive Pagination Toolbar */}
          {filteredEvents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-ink-muted">
              <div className="flex items-center gap-3">
                <span>
                  Showing{' '}
                  <span className="font-semibold text-ink">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-semibold text-ink">
                    {Math.min(currentPage * pageSize, filteredEvents.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-ink">
                    {filteredEvents.length}
                  </span>{' '}
                  events
                </span>

                <div className="flex items-center gap-1.5 pl-2 border-l border-border">
                  <span className="text-ink-placeholder">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-ink-secondary focus:outline-none focus:border-accent"
                  >
                    <option value={6}>6</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-secondary hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={`h-7 w-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                        pageNum === currentPage
                          ? 'bg-action text-inverse'
                          : 'border border-border bg-surface text-ink-secondary hover:bg-hover'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-secondary hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Hidden container for High-Fidelity Executive PDF Export */}
      <div className="hidden">
        {data && (
          <ExecutiveDashboardReportPDF
            ref={printRef}
            data={data}
            timeframe={timeframe}
          />
        )}
      </div>
    </main>
  );
}
