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
 a.download = `Plinth_Daily_Operations_${summary.dateStr}.json`;
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
 <div className="flex flex-col h-full bg-white rounded-2xl border border-border/90 shadow-2xs overflow-hidden">
 {/* 1. Header with Shift Lead & Actions */}
 <div className="p-5 border-b border-border ">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="flex items-center gap-2.5">
 <h2 className="text-xl font-bold tracking-tight text-ink ">
 {formattedDate}
 </h2>
 {isToday ? (
 <span className="rounded-full bg-[#3E63DD]/10 text-[#3E63DD] border border-[#3E63DD]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
 Today
 </span>
 ) : (
 <span className="rounded-full bg-muted text-ink-secondary px-2.5 py-0.5 text-[10px] font-semibold">
 Scheduled Operations
 </span>
 )}
 </div>
 
 <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary mt-1.5">
 <span className="inline-flex items-center gap-1 font-medium text-ink-secondary ">
 <User className="h-3.5 w-3.5 text-ink-muted" />
 Shift Lead: <strong className="font-semibold">{summary.shiftSupervisor}</strong>
 </span>
 <span className="text-ink-placeholder ">•</span>
 <span className="truncate max-w-lg">{summary.dayNotes || 'Nominal production and facility operations schedule.'}</span>
 </div>
 </div>

 {/* Clean Quick Actions: Print PDF & Export JSON */}
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={handlePrint}
 title="Print / Save PDF Report"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-ink-secondary hover:bg-muted transition-colors shadow-2xs text-xs font-medium cursor-pointer"
 >
 <Printer className="h-3.5 w-3.5 text-ink-secondary" />
 <span>Print / PDF</span>
 </button>
 <button
 type="button"
 onClick={handleExportSummary}
 title="Export Day JSON Data"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-ink-secondary hover:bg-muted transition-colors shadow-2xs text-xs font-medium cursor-pointer"
 >
 <Download className="h-3.5 w-3.5 text-ink-secondary" />
 <span>Export Data</span>
 </button>
 </div>
 </div>

 {/* 2. Executive Daily KPI Stat Ribbon (5 Pillars in Real INR & Units) */}
 <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
 {/* Pillar 1: Production */}
 <div className="p-3 rounded-xl border border-border bg-muted/50 ">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-semibold uppercase text-ink-secondary">Planned Output</span>
 <span className="text-[10px] font-bold text-[#3E63DD] ">{quotaPct}% quota</span>
 </div>
 <div className="mt-1 text-base font-bold text-ink ">
 {number.format(summary.actualOutputUnits)} <span className="text-xs font-normal text-ink-muted">/ {number.format(summary.plannedOutputUnits)} pcs</span>
 </div>
 </div>

 {/* Pillar 2: Sales & Orders */}
 <div className="p-3 rounded-xl border border-border bg-muted/50 ">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-semibold uppercase text-ink-secondary">Sales Bookings</span>
 <span className="text-[10px] font-bold text-link ">{summary.ordersCount} orders</span>
 </div>
 <div className="mt-1 text-base font-bold text-ink ">
 {money(summary.ordersTotalValue)}
 </div>
 </div>

 {/* Pillar 3: Inbound GRNs */}
 <div className="p-3 rounded-xl border border-border bg-muted/50 ">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-semibold uppercase text-ink-secondary">Inbound Dock</span>
 <span className="text-[10px] font-bold text-tone-green-text ">{summary.inboundReceipts.length} GRNs</span>
 </div>
 <div className="mt-1 text-base font-bold text-ink ">
 {summary.inboundReceipts.filter((i) => i.status === 'cleared').length} <span className="text-xs font-normal text-ink-muted">cleared</span>
 </div>
 </div>

 {/* Pillar 4: Logistics & Dispatches */}
 <div className="p-3 rounded-xl border border-border bg-muted/50 ">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-semibold uppercase text-ink-secondary">Dispatches</span>
 <span className="text-[10px] font-bold text-tone-amber-text ">{number.format(summary.dispatchedWeightKg)} kg/units</span>
 </div>
 <div className="mt-1 text-base font-bold text-ink ">
 {summary.dispatchesCount} <span className="text-xs font-normal text-ink-muted">manifests</span>
 </div>
 </div>

 {/* Pillar 5: Finance & Debit Notes */}
 <div className="p-3 rounded-xl border border-border bg-muted/50 ">
 <div className="flex items-center justify-between">
 <span className="text-[10px] font-semibold uppercase text-ink-secondary">Finance Adjustments</span>
 <span className="text-[10px] font-bold text-tone-purple-text ">{summary.financeCount} notes</span>
 </div>
 <div className="mt-1 text-base font-bold text-ink ">
 {money(summary.financeTotalValue)}
 </div>
 </div>
 </div>

 {/* 3. Unique Feature: Operational Risk & Health Scanner */}
 {summary.criticalAlertsCount > 0 ? (
 <div className="mt-3.5 p-3 rounded-xl border border-tone-red-solid bg-tone-rose-bg/60 flex items-center justify-between gap-3 text-xs">
 <div className="flex items-center gap-2 text-tone-red-text font-medium">
 <AlertTriangle className="h-4 w-4 shrink-0 text-tone-red-text" />
 <span>
 Attention Required: {summary.criticalAlertsCount} operational roadblock(s) detected on this schedule (discrepant receipts or interrupted runs).
 </span>
 </div>
 <Link
 href="/receiving/goods-receipts"
 className="text-xs font-bold text-tone-red-text hover:underline shrink-0"
 >
 Resolve Discrepancies →
 </Link>
 </div>
 ) : (
 <div className="mt-3.5 p-2.5 rounded-xl border border-border bg-muted/60 flex items-center justify-between text-xs text-ink-secondary">
 <div className="flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-tone-green-text " />
 <span>Plant & supply chain operations nominal for this date with zero critical blocks.</span>
 </div>
 <span className="text-ink-muted text-[11px]">Plinth Workflow Guard Active</span>
 </div>
 )}
 </div>

 {/* 4. Tab Switcher & Filter Toolbar */}
 <div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-muted/40 ">
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
 ? 'bg-[#3E63DD] text-white shadow-2xs font-bold'
 : 'text-ink-secondary hover:text-ink hover:bg-muted '
 }`}
 >
 <span>{tab.label}</span>
 <span
 className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
 activeTab === tab.id
 ? 'bg-white/20 text-white'
 : 'bg-active text-ink-secondary '
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
 <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-ink-muted" />
 <input
 type="text"
 placeholder="Filter items, codes..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="rounded-xl border border-border bg-white pl-8 pr-3 py-1 text-xs text-ink focus:outline-none focus:border-[#3E63DD]"
 />
 </div>

 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="rounded-xl border border-border bg-white px-2.5 py-1 text-xs font-semibold text-ink-secondary focus:outline-none focus:border-[#3E63DD]"
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
 <div className="py-16 text-center text-xs text-ink-muted">
 <Clock className="h-8 w-8 text-ink-placeholder mx-auto mb-2" />
 No scheduled activities recorded on this date. Click &quot;+ Schedule Event&quot; to log tasks.
 </div>
 ) : (
 <div className="grid gap-3">
 {/* Production preview */}
 {filteredProd.map((p) => (
 <div
 key={p.id}
 className="p-4 rounded-xl border border-border/80 bg-white shadow-2xs flex items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary ">
 <Factory className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{p.code}</span>
 <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-muted text-ink-secondary border border-border ">
 {p.status}
 </span>
 </div>
 <p className="text-xs font-semibold text-ink-secondary truncate mt-0.5">
 {p.productName} <span className="text-ink-muted font-normal">({p.sku})</span>
 </p>
 </div>
 </div>
 <div className="text-right shrink-0">
 <span className="font-mono font-bold text-xs text-ink ">
 {p.completedQuantity} / {p.targetQuantity} {p.unit}
 </span>
 <span className="block text-[10px] text-ink-muted mt-0.5">{p.line}</span>
 </div>
 </div>
 ))}

 {/* Orders preview */}
 {filteredOrders.map((o) => (
 <div
 key={o.id}
 className="p-4 rounded-xl border border-border/80 bg-white shadow-2xs flex items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary ">
 <ShoppingCart className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{o.orderNumber}</span>
 <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-muted text-ink-secondary border border-border ">
 {o.status}
 </span>
 </div>
 <p className="text-xs font-semibold text-ink-secondary truncate mt-0.5">
 {o.clientName}
 </p>
 </div>
 </div>
 <div className="text-right shrink-0">
 <span className="font-mono font-bold text-xs text-ink ">
 {money(o.totalValue, o.currency)}
 </span>
 <span className="block text-[10px] text-ink-muted mt-0.5">{o.itemsCount} line item(s)</span>
 </div>
 </div>
 ))}

 {/* GRN Inbound preview */}
 {filteredInbound.map((i) => (
 <div
 key={i.id}
 className="p-4 rounded-xl border border-border/80 bg-white shadow-2xs flex items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary ">
 <PackageCheck className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{i.poNumber}</span>
 <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-muted text-ink-secondary border border-border ">
 {i.status}
 </span>
 </div>
 <p className="text-xs font-semibold text-ink-secondary truncate mt-0.5">
 {i.vendorName} • {i.materialName}
 </p>
 </div>
 </div>
 <div className="text-right shrink-0">
 <span className="font-mono font-bold text-xs text-ink ">
 {i.quantity} {i.unit}
 </span>
 <span className="block text-[10px] text-ink-muted mt-0.5">{i.dockNumber}</span>
 </div>
 </div>
 ))}

 {/* Finance Debit Notes preview */}
 {filteredFinance.map((f) => (
 <div
 key={f.id}
 className="p-4 rounded-xl border border-border/80 bg-white shadow-2xs flex items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-ink-secondary ">
 <Receipt className="h-4 w-4" />
 </span>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{f.debitNoteNumber}</span>
 <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-muted text-ink-secondary border border-border ">
 {f.status}
 </span>
 </div>
 <p className="text-xs font-semibold text-ink-secondary truncate mt-0.5">
 {f.vendorName} • {f.reason}
 </p>
 </div>
 </div>
 <div className="text-right shrink-0">
 <span className="font-mono font-bold text-xs text-ink ">
 {money(f.totalAmount, f.currency)}
 </span>
 <span className="block text-[10px] text-ink-muted mt-0.5">{f.grnNumber || f.poNumber || 'Adjustment'}</span>
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
 <div className="py-12 text-center text-xs text-ink-muted">
 No production plans matching criteria.
 </div>
 ) : (
 filteredProd.map((p) => (
 <div
 key={p.id}
 className="p-4 rounded-xl border border-border/90 bg-white shadow-2xs space-y-3"
 >
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{p.code}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-ink-secondary border border-border ">
 {p.status}
 </span>
 <span className="text-[10px] font-semibold text-[#3E63DD] ">{p.bomCode}</span>
 </div>
 <h4 className="text-sm font-bold text-ink mt-1">
 {p.productName} <span className="text-xs font-normal text-ink-muted">({p.sku})</span>
 </h4>
 </div>
 <Link
 href={`/production/planning/${p.id}`}
 className="p-1.5 rounded-lg border border-border text-ink-secondary hover:text-[#3E63DD] transition"
 >
 <ArrowUpRight className="h-4 w-4" />
 </Link>
 </div>

 {/* Progress bar */}
 <div>
 <div className="flex justify-between text-xs text-ink-secondary mb-1">
 <span>Batch Output Progress</span>
 <span className="font-bold text-ink ">
 {p.completedQuantity} / {p.targetQuantity} {p.unit} ({p.progressPct}%)
 </span>
 </div>
 <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
 <div className="bg-[#3E63DD] h-full rounded-full transition-all duration-300" style={{ width: `${p.progressPct}%` }} />
 </div>
 </div>

 <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
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
 <div className="py-12 text-center text-xs text-ink-muted">
 No orders matching criteria.
 </div>
 ) : (
 filteredOrders.map((o) => (
 <div
 key={o.id}
 className="p-4 rounded-xl border border-border/90 bg-white shadow-2xs space-y-3"
 >
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{o.orderNumber}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-ink-secondary border border-border ">
 {o.status}
 </span>
 <span className="text-[10px] font-semibold text-link ">{o.clientTier}</span>
 </div>
 <h4 className="text-sm font-bold text-ink mt-1">
 {o.clientName}
 </h4>
 </div>
 <div className="text-right">
 <span className="font-mono font-bold text-sm text-ink ">
 {money(o.totalValue, o.currency)}
 </span>
 </div>
 </div>

 {/* Line items snippet */}
 <div className="space-y-1 bg-muted/70 p-2.5 rounded-lg text-xs">
 {o.items.map((item, idx) => (
 <div key={idx} className="flex justify-between text-ink-secondary ">
 <span>{item.name}</span>
 <span className="font-mono font-semibold">{item.qty} units</span>
 </div>
 ))}
 </div>

 <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
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
 <div className="py-12 text-center text-xs text-ink-muted">
 No inbound receipts recorded on this date.
 </div>
 ) : (
 filteredInbound.map((i) => (
 <div
 key={i.id}
 className="p-4 rounded-xl border border-border/90 bg-white shadow-2xs space-y-2.5"
 >
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{i.poNumber}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-tone-emerald-bg/10 text-tone-green-text border border-tone-green-solid/20">
 {i.status}
 </span>
 </div>
 <h4 className="text-sm font-bold text-ink mt-1">
 {i.vendorName}
 </h4>
 </div>
 <div className="text-right">
 <span className="font-mono font-bold text-xs text-ink ">
 {i.quantity} {i.unit}
 </span>
 </div>
 </div>

 <div className="text-xs text-ink-secondary ">
 <span className="font-medium">Material:</span> {i.materialName}
 </div>

 <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
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
 <div className="py-12 text-center text-xs text-ink-muted">
 No dispatches or internal movements on this date.
 </div>
 ) : (
 filteredDispatches.map((d) => (
 <div
 key={d.id}
 className="p-4 rounded-xl border border-border/90 bg-white shadow-2xs space-y-2.5"
 >
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{d.manifestNumber}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-tone-amber-bg/10 text-tone-amber-text border border-tone-amber-solid/20">
 {d.status.replaceAll('_', ' ')}
 </span>
 </div>
 <h4 className="text-sm font-bold text-ink mt-1">
 {d.carrierName} • {d.vehicleNumber}
 </h4>
 </div>
 <div className="text-right">
 <span className="font-mono font-bold text-xs text-ink ">
 {d.totalWeightKg} kg/units
 </span>
 </div>
 </div>

 <div className="text-xs text-ink-secondary ">
 <span className="font-medium">Destination:</span> {d.destination} ({d.dockNumber})
 </div>

 <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
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
 <div className="py-12 text-center text-xs text-ink-muted">
 No debit notes or billing adjustments on this date.
 </div>
 ) : (
 filteredFinance.map((f) => (
 <div
 key={f.id}
 className="p-4 rounded-xl border border-border/90 bg-white shadow-2xs space-y-2.5"
 >
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="font-mono font-bold text-xs text-ink ">{f.debitNoteNumber}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-tone-purple-bg/10 text-tone-purple-text border border-tone-purple-solid/20">
 {f.status}
 </span>
 </div>
 <h4 className="text-sm font-bold text-ink mt-1">
 {f.vendorName}
 </h4>
 </div>
 <div className="text-right">
 <span className="font-mono font-bold text-xs text-ink ">
 {money(f.totalAmount, f.currency)}
 </span>
 </div>
 </div>

 <div className="p-2.5 rounded-lg bg-muted text-xs text-ink-secondary ">
 <span className="font-semibold text-ink ">Reason:</span> {f.reason}
 </div>

 <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
 <span>Linked: {f.grnNumber || f.poNumber || 'Vendor Adjustment'}</span>
 <Link href="/finance/debit-notes" className="text-[#3E63DD] font-semibold hover:underline">
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
 <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-active ">
 {summary.timeline.map((item) => (
 <div key={item.id} className="relative">
 <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#3E63DD]" />
 <div className="p-3.5 rounded-xl border border-border/80 bg-white shadow-2xs">
 <div className="flex items-center justify-between">
 <span className="font-mono text-xs font-bold text-ink ">{item.time}</span>
 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-ink-secondary ">
 {item.badgeText}
 </span>
 </div>
 <h5 className="text-xs font-bold text-ink mt-1">{item.title}</h5>
 <p className="text-xs text-ink-secondary mt-0.5">{item.description}</p>
 <span className="block text-[10px] text-ink-muted mt-2">Actor: {item.actor}</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* 6. Quick Launchpad Footer */}
 <div className="px-5 py-3 border-t border-border bg-muted/50 flex flex-wrap items-center justify-between gap-3 text-xs">
 <span className="text-ink-secondary font-medium">Quick ERP Navigation:</span>
 <div className="flex items-center gap-2 flex-wrap">
 <Link href="/production/planning" className="font-semibold text-[#3E63DD] hover:underline">
 Production Plans
 </Link>
 <span className="text-ink-placeholder ">•</span>
 <Link href="/sales/orders" className="font-semibold text-[#3E63DD] hover:underline">
 Sales Orders
 </Link>
 <span className="text-ink-placeholder ">•</span>
 <Link href="/receiving/goods-receipts" className="font-semibold text-[#3E63DD] hover:underline">
 Goods Inward (GRN)
 </Link>
 <span className="text-ink-placeholder ">•</span>
 <Link href="/finance/debit-notes" className="font-semibold text-[#3E63DD] hover:underline">
 Debit Notes
 </Link>
 </div>
 </div>
 </div>
 );
}
