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
      <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 text-xs text-white shadow-xl backdrop-blur-md">
        <p className="font-bold text-slate-300 mb-1.5 border-b border-slate-700/60 pb-1">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white">
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
      <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6 lg:p-8 dark:bg-[#070b14]/70">
        <div className="mx-auto max-w-[1680px] space-y-6">
          <div className="h-14 rounded-2xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-44 rounded-2xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="h-80 rounded-2xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 lg:col-span-8 animate-pulse" />
            <div className="h-80 rounded-2xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-slate-800 lg:col-span-4 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }
  if (query.isError || !data) {
    return (
      <main className="flex-1 bg-slate-50/50 p-6 sm:p-8 dark:bg-[#070b14]/70 flex items-center justify-center min-h-[80vh]">
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
    <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6 lg:p-8 dark:bg-[#070b14]/70">
      <div className="mx-auto max-w-[1680px] space-y-6">
        
        {/* ======================================================== */}
        {/* 1. CLEAN TOP PAGE HEADER (No fake containers or capsules) */}
        {/* ======================================================== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Operations Dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Overview for {periodLabel}
            </p>
          </div>

          {/* Timeframe & Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Timeframe Switcher */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-2xs">
              {(['month', 'quarter', 'year'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTimeframe(val)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    timeframe === val
                      ? 'bg-[#004a80] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin text-[#004a80]' : 'text-slate-500'}`} />
              <span>{query.isFetching ? 'Syncing...' : 'Sync'}</span>
            </button>

            {/* Operations Calendar Link */}
            <Link
              href="/calendar"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-2xs"
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span>Calendar</span>
            </Link>

            {/* Export PDF Report */}
            <button
              type="button"
              onClick={() => handleExportPdf()}
              disabled={!data || query.isLoading}
              title="Export Executive Report as PDF"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-3.5 py-2 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
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
            className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs hover:border-[#004a80] dark:hover:border-[#004a80]/60 transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Inventory Value
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 group-hover:text-[#004a80] group-hover:border-[#004a80]/30 transition-colors">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {money(data.kpis.inventoryValue)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-[#004a80] dark:text-blue-300">{data.kpis.stockedItems.toLocaleString()} SKUs in Stock</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-slate-500">{data.kpis.inventoryBalanceCount} records</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {number.format(data.kpis.availableQuantity)} avail / {number.format(data.kpis.reservedQuantity)} rsvd
              </span>
              <span className="flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-300 group-hover:translate-x-0.5 transition-transform">
                View Stock <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 2: Procurement Commitments */}
          <Link
            href="/procurement/purchase-orders"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs hover:border-[#004a80] dark:hover:border-[#004a80]/60 transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Procurement Commitments
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 group-hover:text-[#004a80] group-hover:border-[#004a80]/30 transition-colors">
                  <ShoppingCart className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {primarySpend ? money(primarySpend.value, primarySpend.currency) : money(0)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-[#004a80] dark:text-blue-300">{data.kpis.openPurchaseOrders} Open POs</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-slate-500">{data.kpis.purchaseOrderCount} in period</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">{data.kpis.activeVendors} active suppliers</span>
              <span className="flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-300 group-hover:translate-x-0.5 transition-transform">
                Purchase Orders <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 3: Manufacturing Output */}
          <Link
            href="/production"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs hover:border-[#004a80] dark:hover:border-[#004a80]/60 transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Manufacturing Output
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 group-hover:text-[#004a80] group-hover:border-[#004a80]/30 transition-colors">
                  <Factory className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {number.format(data.kpis.productionOutputQuantity)}
                    <span className="text-xs font-normal text-slate-400 ml-1.5">units</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {productionExecutionRate}% run rate
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#004a80] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(productionExecutionRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">{data.kpis.productionInProgressPlans} active • {number.format(data.kpis.productionPlannedQuantity)} quota</span>
              <span className="flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-300 group-hover:translate-x-0.5 transition-transform">
                Production <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>

          {/* KPI 4: Inbound Goods Receipts */}
          <Link
            href="/receiving/goods-receipts"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs hover:border-[#004a80] dark:hover:border-[#004a80]/60 transition-all duration-150"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Inbound Goods Inward
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 group-hover:text-[#004a80] group-hover:border-[#004a80]/30 transition-colors">
                  <PackageCheck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {number.format(data.kpis.goodsReceipts)}
                    <span className="text-xs font-normal text-slate-400 ml-1.5">GRNs</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {receiptRate}% finalized
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#004a80] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(receiptRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {data.kpis.finalizedReceipts} cleared {data.kpis.receiptDiscrepancies > 0 && `• ${data.kpis.receiptDiscrepancies} discrepant`}
              </span>
              <span className="flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-300 group-hover:translate-x-0.5 transition-transform">
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
            className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200/90 dark:border-slate-800 hover:border-[#004a80] transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Master Catalog</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {number.format(data.kpis.catalogProducts + data.kpis.catalogMaterials)} items
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 group-hover:text-[#004a80] transition">
              {data.kpis.catalogProducts}P / {data.kpis.catalogMaterials}M
            </span>
          </Link>

          <Link
            href="/production/bom"
            className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200/90 dark:border-slate-800 hover:border-[#004a80] transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Approved BOMs</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {number.format(data.kpis.approvedBoms)} formulas
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#004a80] dark:text-blue-300">
              {data.kpis.productionPendingApproval} pending
            </span>
          </Link>

          <Link
            href="/stock?tab=stockouts"
            className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200/90 dark:border-slate-800 hover:border-[#004a80] transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Stock Attention</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {totalStockAttention} alerts
                </p>
              </div>
            </div>
            <span className="text-xs text-rose-600 font-semibold">
              {data.kpis.outOfStockItems} stockouts
            </span>
          </Link>

          <Link
            href="/notifications"
            className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-[#0c121e] border border-slate-200/90 dark:border-slate-800 hover:border-[#004a80] transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Action Queue</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {totalActionsCount} action tasks
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {data.actions.length} queues
            </span>
          </Link>
        </div>

        {/* ======================================================== */}
        {/* 4. PRIMARY ANALYTICS ROW: PRODUCTION & INVENTORY DONUT   */}
        {/* ======================================================== */}
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* PRODUCTION OUTPUT TREND */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs lg:col-span-8 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    <h2 className="font-bold text-base text-slate-900 dark:text-white">
                      Production Quota vs Actual Output Yield
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Target manufacturing run quotas against finished units and completion milestones
                  </p>
                </div>

                {/* Chart Legend */}
                <div className="flex items-center gap-3.5 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#004a80]/30 border border-[#004a80]" /> Planned Quota
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#004a80]" /> Finished Output
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completed
                  </span>
                </div>
              </div>

              {/* Sub-header mini metrics */}
              <div className="mt-3.5 grid grid-cols-3 gap-3">
                <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">Total Planned Quota</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {number.format(data.kpis.productionPlannedQuantity)} <span className="text-xs font-normal text-slate-400">units</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">Finished Output Yield</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {number.format(data.kpis.productionOutputQuantity)} <span className="text-xs font-normal text-slate-400">units ({productionExecutionRate}%)</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 block">Active Work Orders</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {data.kpis.productionInProgressPlans} <span className="text-xs font-normal text-slate-400">in progress</span>
                  </span>
                </div>
              </div>

              <div className="mt-4 h-60">
                {!productionHasData ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-400">
                    <Factory className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    No production plans or output runs recorded for this timeframe.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.productionTrend} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
                      <defs>
                        <linearGradient id="navyProductionGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#004a80" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#004a80" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => compactNumber.format(Number(v))} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Bar
                        dataKey="planned"
                        name="Planned Target Quota"
                        fill="#004a80"
                        fillOpacity={0.16}
                        stroke="#004a80"
                        strokeWidth={1}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={42}
                      />
                      <Area
                        dataKey="acceptedOutput"
                        name="Finished Output"
                        type="monotone"
                        stroke="#004a80"
                        strokeWidth={2.5}
                        fill="url(#navyProductionGlow)"
                      />
                      <Line
                        dataKey="completed"
                        name="Completed Plan Units"
                        type="monotone"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3.5, fill: '#10b981' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {data.kpis.productionPlannedQuantity > 0 && data.kpis.productionOutputQuantity === 0 && (
              <div className="mt-3 flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-xs text-slate-500">
                <span>
                  {number.format(data.kpis.productionPlannedQuantity)} target units scheduled across {data.kpis.productionInProgressPlans} active lines. Realized output will plot live once batch runs are logged.
                </span>
                <Link
                  href="/production/planning"
                  className="font-semibold text-[#004a80] dark:text-blue-300 hover:underline inline-flex items-center gap-1 shrink-0 ml-2"
                >
                  <span>Production Plans</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </section>

          {/* INVENTORY VALUATION DONUT */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs lg:col-span-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                    <Layers className="h-4 w-4" />
                  </span>
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">
                    Stock Asset Allocation
                  </h2>
                </div>
                <Link href="/stock" className="text-xs font-semibold text-[#004a80] dark:text-blue-300 hover:underline">
                  Details
                </Link>
              </div>

              {/* Donut Chart with Centered Total Value */}
              <div className="relative mt-4 h-44 flex items-center justify-center">
                {!inventoryHasData ? (
                  <div className="text-center text-xs text-slate-400">No valued inventory available.</div>
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
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Total Stock</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
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
                      <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[160px]">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                        {money(entry.value)} <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
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
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">
                  Procurement Commitments vs Realized GRN Postings
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Value of Purchase Orders issued vs inventory postings received from goods inward
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#004a80]" /> PO Value
                </span>
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> GRN Realized
                </span>
              </div>
            </div>

            <div className="mt-5 h-60">
              {!procurementHasData ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-400">
                  <ShoppingCart className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                  No purchase orders or GRN postings recorded in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.procurementTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => compactNumber.format(Number(v))} />
                    <Tooltip content={<CustomChartTooltip isCurrency />} />
                    <Bar dataKey="orderedValue" name="PO Ordered Value" fill="#004a80" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="receivedValue" name="GRN Realized Value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* ACTION & PRIORITY RESOLUTION CENTER */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs lg:col-span-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                    <Zap className="h-4 w-4" />
                  </span>
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">
                    Operational Attention Center
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold px-2.5 py-0.5 text-xs">
                  {totalActionsCount} Pending
                </span>
              </div>

              <div className="mt-4 space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {data.actions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1.5" />
                    All operational queues are clear with zero pending exceptions.
                  </div>
                ) : (
                  data.actions.map((action) => (
                    <Link
                      key={action.id}
                      href={action.href}
                      className="group flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 hover:border-[#004a80] dark:hover:border-[#004a80] transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-slate-400 group-hover:text-[#004a80] transition-colors">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-[#004a80] transition-colors truncate">
                          {action.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <span className="rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs px-2 py-0.5 text-slate-900 dark:text-white shadow-2xs">
                          {action.count}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#004a80] group-hover:translate-x-0.5 transition" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Resolutions update in real-time</span>
              <span className="text-slate-600 dark:text-slate-300 font-medium">Plinth Workflow Guard</span>
            </div>
          </section>
        </div>

        {/* ======================================================== */}
        {/* 6. REAL-TIME AUDIT STREAM & ACTIVITY TABLE WITH PAGINATION*/}
        {/* ======================================================== */}
        <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-6 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                Live Operational Activity & Ledger Stream
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Audit trail of recent purchase orders, goods receipts, production schedules, and inventory movements
              </p>
            </div>

            {/* Filter Pills and Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center rounded-xl bg-slate-100/80 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800">
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
                        ? 'bg-[#004a80] text-white font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search stream..."
                  value={activitySearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8.5 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#004a80]"
                />
              </div>
            </div>
          </div>

          {/* Structured Activity Table */}
          <div className="mt-4 overflow-x-auto">
            {filteredEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No matching operational activities found for the selected filter.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3">Type & Ref</th>
                    <th className="py-3 px-3">Description / Partner</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Value / Movement</th>
                    <th className="py-3 px-3 text-right">Timestamp</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {paginatedEvents.map((event) => {
                    const badgeClass =
                      event.type === 'GRN'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        : event.type === 'PO'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        : event.type === 'PLAN'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700';

                    return (
                      <tr
                        key={event.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors group"
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                              {event.type}
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {event.code}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 max-w-[280px] truncate text-slate-700 dark:text-slate-300 font-medium">
                          {event.title}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                            {event.status.replaceAll('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {event.valueLabel}
                        </td>

                        <td className="py-3 px-3 text-right text-slate-400 whitespace-nowrap text-[11px]">
                          {new Date(event.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                          {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Link
                            href={event.href}
                            className="inline-flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-300 hover:underline text-[11px]"
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
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span>
                  Showing{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {Math.min(currentPage * pageSize, filteredEvents.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {filteredEvents.length}
                  </span>{' '}
                  events
                </span>

                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#004a80]"
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
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
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
                          ? 'bg-[#004a80] text-white'
                          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
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
