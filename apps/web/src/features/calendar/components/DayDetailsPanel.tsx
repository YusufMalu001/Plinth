'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Factory,
  ShoppingCart,
  PackageCheck,
  Clock,
  Download,
  Search,
  Printer,
  User,
  AlertTriangle,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { DayOperationalSummary } from '../types';
import { printDayOperationsReport } from '../utils/printReport';

interface DayDetailsPanelProps {
  summary: DayOperationalSummary;
  selectedDate: Date;
}

type TabType = 'all' | 'production' | 'orders' | 'inbound' | 'dispatch' | 'finance' | 'timeline';

const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function DayDetailsPanel({
  summary,
  selectedDate,
}: DayDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const formattedDate = selectedDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  // Filtered lists
  const filteredProd = summary.productionEvents.filter((p) => {
    const matchesSearch =
      p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.line.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supervisor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredOrders = summary.salesOrders.filter((o) => {
    const matchesSearch =
      o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.salesRep.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredInbound = summary.inboundReceipts.filter((i) => {
    const matchesSearch =
      i.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.poNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDispatches = summary.dispatches.filter((d) => {
    const matchesSearch =
      d.carrierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.manifestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.driverName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredFinance = summary.financeEvents.filter((f) => {
    const matchesSearch =
      f.debitNoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.poNumber && f.poNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.grnNumber && f.grnNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || f.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const handleExportSummary = () => {
    const jsonStr = JSON.stringify(summary, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Synergy_Daily_Operations_${summary.dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    printDayOperationsReport(summary, summary.dateStr);
  };

  const quotaPct = summary.plannedOutputUnits > 0
    ? Math.round((summary.actualOutputUnits / summary.plannedOutputUnits) * 100)
    : 0;

  const totalActivitiesCount =
    summary.productionEvents.length +
    summary.salesOrders.length +
    summary.inboundReceipts.length +
    summary.dispatches.length +
    summary.financeEvents.length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0c121e] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
      {/* 1. Header with Shift Lead & Actions */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {formattedDate}
              </h2>
              {isToday ? (
                <span className="rounded-full bg-[#004a80]/10 text-[#004a80] dark:text-blue-300 border border-[#004a80]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Today
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-0.5 text-[10px] font-semibold">
                  Scheduled Operations
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Shift Lead: <strong className="font-semibold">{summary.shiftSupervisor}</strong>
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="truncate max-w-lg">{summary.dayNotes || 'Nominal production and facility operations schedule.'}</span>
            </div>
          </div>

          {/* Clean Quick Actions: Print PDF & Export JSON */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              title="Print / Save PDF Report"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs text-xs font-medium cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportSummary}
              title="Export Day JSON Data"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs text-xs font-medium cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export Data</span>
            </button>
          </div>
        </div>

        {/* 2. Executive Daily KPI Stat Ribbon (5 Pillars in Real INR & Units) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Pillar 1: Production */}
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Planned Output</span>
              <span className="text-[10px] font-bold text-[#004a80] dark:text-blue-400">{quotaPct}% quota</span>
            </div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {number.format(summary.actualOutputUnits)} <span className="text-xs font-normal text-slate-400">/ {number.format(summary.plannedOutputUnits)} pcs</span>
            </div>
          </div>

          {/* Pillar 2: Sales & Orders */}
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Sales Bookings</span>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{summary.ordersCount} orders</span>
            </div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {money(summary.ordersTotalValue)}
            </div>
          </div>

          {/* Pillar 3: Inbound GRNs */}
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Inbound Dock</span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{summary.inboundReceipts.length} GRNs</span>
            </div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {summary.inboundReceipts.filter((i) => i.status === 'cleared').length} <span className="text-xs font-normal text-slate-400">cleared</span>
            </div>
          </div>

          {/* Pillar 4: Logistics & Dispatches */}
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Dispatches</span>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{number.format(summary.dispatchedWeightKg)} kg/units</span>
            </div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {summary.dispatchesCount} <span className="text-xs font-normal text-slate-400">manifests</span>
            </div>
          </div>

          {/* Pillar 5: Finance & Debit Notes */}
          <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Finance Adjustments</span>
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">{summary.financeCount} notes</span>
            </div>
            <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              {money(summary.financeTotalValue)}
            </div>
          </div>
        </div>

        {/* 3. Unique Feature: Operational Risk & Health Scanner */}
        {summary.criticalAlertsCount > 0 ? (
          <div className="mt-3.5 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>
                Attention Required: {summary.criticalAlertsCount} operational roadblock(s) detected on this schedule (discrepant receipts or interrupted runs).
              </span>
            </div>
            <Link
              href="/receiving/goods-receipts"
              className="text-xs font-bold text-rose-700 dark:text-rose-300 hover:underline shrink-0"
            >
              Resolve Discrepancies →
            </Link>
          </div>
        ) : (
          <div className="mt-3.5 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Plant & supply chain operations nominal for this date with zero critical blocks.</span>
            </div>
            <span className="text-slate-400 text-[11px]">Synergy Workflow Guard Active</span>
          </div>
        )}
      </div>

      {/* 4. Tab Switcher & Filter Toolbar */}
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-900/20">
        {/* Module Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'All Operations', count: totalActivitiesCount },
            { id: 'production', label: 'Production', count: summary.productionEvents.length },
            { id: 'orders', label: 'Sales & Orders', count: summary.salesOrders.length },
            { id: 'inbound', label: 'Goods Inward', count: summary.inboundReceipts.length },
            { id: 'dispatch', label: 'Dispatch', count: summary.dispatches.length },
            { id: 'finance', label: 'Finance & Debit Notes', count: summary.financeEvents.length },
            { id: 'timeline', label: 'Timeline', count: summary.timeline.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-[#004a80] text-white shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter items, codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#004a80]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#004a80]"
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>
      </div>

      {/* 5. Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[600px]">
        {/* TAB: ALL OPERATIONS */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            {totalActivitiesCount === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                No scheduled activities recorded on this date. Click &quot;+ Schedule Event&quot; to log tasks.
              </div>
            ) : (
              <div className="grid gap-3">
                {/* Production preview */}
                {filteredProd.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <Factory className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{p.code}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {p.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                          {p.productName} <span className="text-slate-400 font-normal">({p.sku})</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {p.completedQuantity} / {p.targetQuantity} {p.unit}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{p.line}</span>
                    </div>
                  </div>
                ))}

                {/* Orders preview */}
                {filteredOrders.map((o) => (
                  <div
                    key={o.id}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <ShoppingCart className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{o.orderNumber}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {o.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                          {o.clientName}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {money(o.totalValue, o.currency)}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{o.itemsCount} line item(s)</span>
                    </div>
                  </div>
                ))}

                {/* GRN Inbound preview */}
                {filteredInbound.map((i) => (
                  <div
                    key={i.id}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <PackageCheck className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{i.poNumber}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {i.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                          {i.vendorName} • {i.materialName}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {i.quantity} {i.unit}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{i.dockNumber}</span>
                    </div>
                  </div>
                ))}

                {/* Finance Debit Notes preview */}
                {filteredFinance.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{f.debitNoteNumber}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {f.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                          {f.vendorName} • {f.reason}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {money(f.totalAmount, f.currency)}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{f.grnNumber || f.poNumber || 'Adjustment'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: PRODUCTION */}
        {activeTab === 'production' && (
          <div className="space-y-3">
            {filteredProd.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No production plans matching criteria.
              </div>
            ) : (
              filteredProd.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{p.code}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.status}
                        </span>
                        <span className="text-[10px] font-semibold text-[#004a80] dark:text-blue-400">{p.bomCode}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {p.productName} <span className="text-xs font-normal text-slate-400">({p.sku})</span>
                      </h4>
                    </div>
                    <Link
                      href={`/production/planning/${p.id}`}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#004a80] transition"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Batch Output Progress</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {p.completedQuantity} / {p.targetQuantity} {p.unit} ({p.progressPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#004a80] h-full rounded-full transition-all duration-300" style={{ width: `${p.progressPct}%` }} />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>{p.line} • {p.shift}</span>
                    <span>Lead: {p.supervisor}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: SALES & ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No orders matching criteria.
              </div>
            ) : (
              filteredOrders.map((o) => (
                <div
                  key={o.id}
                  className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{o.orderNumber}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {o.status}
                        </span>
                        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">{o.clientTier}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {o.clientName}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {money(o.totalValue, o.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Line items snippet */}
                  <div className="space-y-1 bg-slate-50/70 dark:bg-slate-900/40 p-2.5 rounded-lg text-xs">
                    {o.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>{item.name}</span>
                        <span className="font-mono font-semibold">{item.qty} units</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Fulfillment: {o.fulfillmentDate}</span>
                    <span>Rep: {o.salesRep}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: GOODS INWARD (GRN) */}
        {activeTab === 'inbound' && (
          <div className="space-y-3">
            {filteredInbound.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No inbound receipts recorded on this date.
              </div>
            ) : (
              filteredInbound.map((i) => (
                <div
                  key={i.id}
                  className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{i.poNumber}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          {i.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {i.vendorName}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {i.quantity} {i.unit}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Material:</span> {i.materialName}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Location: {i.dockNumber}</span>
                    <span>Dock Time: {i.expectedTime}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: DISPATCH */}
        {activeTab === 'dispatch' && (
          <div className="space-y-3">
            {filteredDispatches.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No dispatches or internal movements on this date.
              </div>
            ) : (
              filteredDispatches.map((d) => (
                <div
                  key={d.id}
                  className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{d.manifestNumber}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          {d.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {d.carrierName} • {d.vehicleNumber}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {d.totalWeightKg} kg/units
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">Destination:</span> {d.destination} ({d.dockNumber})
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Driver: {d.driverName} ({d.driverPhone})</span>
                    <span>Departure: {d.departureTime}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: FINANCE & ACCOUNTS */}
        {activeTab === 'finance' && (
          <div className="space-y-3">
            {filteredFinance.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No debit notes or billing adjustments on this date.
              </div>
            ) : (
              filteredFinance.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{f.debitNoteNumber}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                          {f.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                        {f.vendorName}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {money(f.totalAmount, f.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">Reason:</span> {f.reason}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Linked: {f.grnNumber || f.poNumber || 'Vendor Adjustment'}</span>
                    <Link href="/finance/debit-notes" className="text-[#004a80] dark:text-blue-400 font-semibold hover:underline">
                      View Accounts Note →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: TIMELINE */}
        {activeTab === 'timeline' && (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {summary.timeline.map((item) => (
              <div key={item.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0c121e] bg-[#004a80]" />
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{item.time}</span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.badgeText}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white mt-1">{item.title}</h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                  <span className="block text-[10px] text-slate-400 mt-2">Actor: {item.actor}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Quick Launchpad Footer */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-slate-500 font-medium">Quick ERP Navigation:</span>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/production/planning" className="font-semibold text-[#004a80] dark:text-blue-300 hover:underline">
            Production Plans
          </Link>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <Link href="/sales/orders" className="font-semibold text-[#004a80] dark:text-blue-300 hover:underline">
            Sales Orders
          </Link>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <Link href="/receiving/goods-receipts" className="font-semibold text-[#004a80] dark:text-blue-300 hover:underline">
            Goods Inward (GRN)
          </Link>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <Link href="/finance/debit-notes" className="font-semibold text-[#004a80] dark:text-blue-300 hover:underline">
            Debit Notes
          </Link>
        </div>
      </div>
    </div>
  );
}
