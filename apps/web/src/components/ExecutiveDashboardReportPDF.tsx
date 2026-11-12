import React from 'react';
import { DashboardAnalytics, DashboardTimeframe } from '../features/dashboard/data/dashboardDataProvider';
import { COMPANY_INFO } from '../features/purchases/utils';

export interface ExecutiveDashboardReportPDFProps {
 data: DashboardAnalytics;
 timeframe: DashboardTimeframe;
}

const formatCurrency = (val: number, currency = 'INR') => {
 if (currency === 'INR') {
 return new Intl.NumberFormat('en-IN', {
 style: 'currency',
 currency: 'INR',
 maximumFractionDigits: 0,
 }).format(val || 0);
 }
 return new Intl.NumberFormat('en-US', {
 style: 'currency',
 currency,
 maximumFractionDigits: 0,
 }).format(val || 0);
};

const formatNumber = (val: number) =>
 new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(val || 0);

export const ExecutiveDashboardReportPDF = React.forwardRef<
 HTMLDivElement,
 ExecutiveDashboardReportPDFProps
>(({ data, timeframe }, ref) => {
 if (!data) return null;

 const timeframeLabel =
 timeframe === 'month'
 ? 'Monthly Executive Report'
 : timeframe === 'quarter'
 ? 'Quarterly Executive Report'
 : 'Annual Executive Report';

 const periodLabel = `${new Date(data.period.from).toLocaleDateString('en-IN', {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 })} – ${new Date(data.period.to).toLocaleDateString('en-IN', {
 day: 'numeric',
 month: 'short',
 year: 'numeric',
 })}`;

 const generatedDate = data.generatedAt
 ? new Date(data.generatedAt).toLocaleString('en-IN', {
 dateStyle: 'medium',
 timeStyle: 'short',
 })
 : new Date().toLocaleString('en-IN', {
 dateStyle: 'medium',
 timeStyle: 'short',
 });

 const primarySpend =
 data.procurementSpendByCurrency.find((entry) => entry.currency === 'INR') ??
 data.procurementSpendByCurrency[0];

 const totalSpend = primarySpend?.value || 0;
 const receiptRate = data.kpis.goodsReceipts
 ? Math.round((data.kpis.finalizedReceipts / data.kpis.goodsReceipts) * 100)
 : 0;

 const productionRate =
 data.kpis.productionPlannedQuantity > 0
 ? Math.min(
 100,
 Math.round(
 (data.kpis.productionOutputQuantity / data.kpis.productionPlannedQuantity) * 100
 )
 )
 : 0;

 const totalInventoryValuation = data.kpis.inventoryValue || 0;

 return (
 <div
 ref={ref}
 data-printable="true"
 className="printable-document print-target w-full bg-white text-ink font-sans p-6 max-w-[900px] mx-auto text-[11px] leading-relaxed shadow-sm border border-border print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full print:block print:visible"
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 <style>{`
 @media print {
 @page {
 size: A4 portrait;
 margin: 12mm 12mm 12mm 12mm;
 }
 body {
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 background: #FFFFFF !important;
 }
 .page-break-before {
 page-break-before: always;
 break-before: page;
 }
 .avoid-break {
 page-break-inside: avoid;
 break-inside: avoid;
 }
 }
 `}</style>

 {/* ── 1. REPORT HEADER & COMPANY IDENTITY ──────────────────────── */}
 <div className="border-b-2 border-border-strong pb-4 mb-5 flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <span className="h-6 w-1.5 bg-[#171717] rounded-xs inline-block"></span>
 <span className="text-xl font-black tracking-tight text-ink uppercase">
 {COMPANY_INFO.name}
 </span>
 </div>
 <p className="text-[10px] text-ink-secondary font-semibold tracking-wider uppercase mt-0.5">
 Enterprise Operations &amp; Management Dashboard
 </p>
 <p className="text-[9px] text-ink-secondary mt-1 max-w-sm leading-tight">
 {COMPANY_INFO.addressLine1} {COMPANY_INFO.addressLine2}{' '}
 {COMPANY_INFO.addressLine3} · GSTIN: {COMPANY_INFO.gstin}
 </p>
 </div>

 <div className="text-right">
 <span className="inline-block bg-[#171717] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-md mb-1.5">
 {timeframeLabel}
 </span>
 <p className="text-xs font-bold text-ink">Period: {periodLabel}</p>
 <p className="text-[10px] text-ink-secondary mt-0.5">Generated: {generatedDate}</p>
 </div>
 </div>

 {/* ── 2. EXECUTIVE CORE FINANCIAL & OPERATIONAL KPIS ──────────── */}
 <div className="mb-6 avoid-break">
 <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2.5 flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-[#171717]"></span>
 1. Key Performance Indicators &amp; Financial Summary
 </h3>
 <div className="grid grid-cols-4 gap-3">
 {/* Card 1: Inventory Value */}
 <div className="p-3.5 rounded-xl border border-border bg-muted/60 flex flex-col justify-between">
 <div>
 <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary block">
 Total Inventory Value
 </span>
 <span className="text-base font-black text-ink mt-1 block">
 {formatCurrency(totalInventoryValuation)}
 </span>
 </div>
 <div className="mt-2 pt-2 border-t border-border/80 text-[9px] text-ink-secondary">
 <strong>{formatNumber(data.kpis.stockedItems)}</strong> SKUs ·{' '}
 {formatNumber(data.kpis.availableQuantity)} avail
 </div>
 </div>

 {/* Card 2: Procurement Commitments */}
 <div className="p-3.5 rounded-xl border border-border bg-muted/60 flex flex-col justify-between">
 <div>
 <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary block">
 Procurement Commitments
 </span>
 <span className="text-base font-black text-ink mt-1 block">
 {formatCurrency(totalSpend, primarySpend?.currency || 'INR')}
 </span>
 </div>
 <div className="mt-2 pt-2 border-t border-border/80 text-[9px] text-ink-secondary">
 <strong>{data.kpis.openPurchaseOrders}</strong> Open POs · {data.kpis.activeVendors} Suppliers
 </div>
 </div>

 {/* Card 3: Manufacturing Output */}
 <div className="p-3.5 rounded-xl border border-border bg-muted/60 flex flex-col justify-between">
 <div>
 <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary block">
 Manufacturing Output
 </span>
 <span className="text-base font-black text-ink mt-1 block">
 {formatNumber(data.kpis.productionOutputQuantity)}{' '}
 <span className="text-[10px] font-normal text-ink-secondary">units</span>
 </span>
 </div>
 <div className="mt-2 pt-2 border-t border-border/80 text-[9px] text-ink-secondary">
 <strong>{productionRate}%</strong> run rate · {data.kpis.productionInProgressPlans} active plans
 </div>
 </div>

 {/* Card 4: Inbound Goods Receipts */}
 <div className="p-3.5 rounded-xl border border-border bg-muted/60 flex flex-col justify-between">
 <div>
 <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary block">
 Inbound Goods Inward
 </span>
 <span className="text-base font-black text-ink mt-1 block">
 {formatNumber(data.kpis.goodsReceipts)}{' '}
 <span className="text-[10px] font-normal text-ink-secondary">GRNs</span>
 </span>
 </div>
 <div className="mt-2 pt-2 border-t border-border/80 text-[9px] text-ink-secondary">
 <strong>{receiptRate}%</strong> finalized · {data.kpis.receiptDiscrepancies} discrepant
 </div>
 </div>
 </div>
 </div>

 {/* ── 3. OPERATIONAL METRICS & CATALOG STRIP ───────────────────── */}
 <div className="mb-6 avoid-break">
 <div className="grid grid-cols-4 gap-3">
 <div className="p-2.5 rounded-lg border border-border bg-white flex items-center justify-between">
 <div>
 <p className="text-[9px] font-bold uppercase text-ink-muted">Master Catalog</p>
 <p className="text-xs font-bold text-ink">
 {formatNumber(data.kpis.catalogProducts + data.kpis.catalogMaterials)} items
 </p>
 </div>
 <span className="text-[9px] font-semibold text-ink-secondary">
 {data.kpis.catalogProducts}P / {data.kpis.catalogMaterials}M
 </span>
 </div>

 <div className="p-2.5 rounded-lg border border-border bg-white flex items-center justify-between">
 <div>
 <p className="text-[9px] font-bold uppercase text-ink-muted">Approved Formulas</p>
 <p className="text-xs font-bold text-ink">{data.kpis.approvedBoms} BOMs</p>
 </div>
 <span className="text-[9px] font-semibold text-[#171717]">
 {data.kpis.productionPendingApproval} pending
 </span>
 </div>

 <div className="p-2.5 rounded-lg border border-border bg-white flex items-center justify-between">
 <div>
 <p className="text-[9px] font-bold uppercase text-ink-muted">Stock Alerts</p>
 <p className="text-xs font-bold text-ink">
 {data.kpis.lowStockItems + data.kpis.outOfStockItems} items
 </p>
 </div>
 <span className="text-[9px] font-semibold text-tone-red-text">
 {data.kpis.outOfStockItems} stockouts
 </span>
 </div>

 <div className="p-2.5 rounded-lg border border-border bg-white flex items-center justify-between">
 <div>
 <p className="text-[9px] font-bold uppercase text-ink-muted">Action Tasks</p>
 <p className="text-xs font-bold text-ink">
 {data.actions.reduce((s, a) => s + a.count, 0)} open
 </p>
 </div>
 <span className="text-[9px] font-semibold text-tone-amber-text">
 {data.actions.length} queues
 </span>
 </div>
 </div>
 </div>

 {/* ── 4. PRODUCTION OUTPUT & SHOP FLOOR PERFORMANCE ────────────── */}
 {data.productionTrend && data.productionTrend.length > 0 && (
 <div className="mb-6 avoid-break">
 <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2 flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-[#171717]"></span>
 2. Manufacturing &amp; Production Performance Breakdown
 </h3>
 <table className="w-full text-left border-collapse border border-border text-[10px]">
 <thead>
 <tr className="bg-muted text-ink-secondary font-bold border-b border-border">
 <th className="p-2 border-r border-border">Period / Stage</th>
 <th className="p-2 text-right border-r border-border">Planned Quota</th>
 <th className="p-2 text-right border-r border-border">Completed Output</th>
 <th className="p-2 text-right border-r border-border">Accepted Good</th>
 <th className="p-2 text-right border-r border-border">Rejected / Scrap</th>
 <th className="p-2 text-right">Yield Performance</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {data.productionTrend.map((row, idx) => {
 const yieldPct =
 row.planned > 0
 ? Math.min(100, Math.round(((row.acceptedOutput || row.completed) / row.planned) * 100))
 : 0;
 return (
 <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/50' : 'bg-white'}>
 <td className="p-2 font-semibold border-r border-border">{row.label || row.period}</td>
 <td className="p-2 text-right font-mono border-r border-border">
 {formatNumber(row.planned)}
 </td>
 <td className="p-2 text-right font-mono border-r border-border">
 {formatNumber(row.completed)}
 </td>
 <td className="p-2 text-right font-mono text-tone-green-text font-bold border-r border-border">
 {formatNumber(row.acceptedOutput || row.completed)}
 </td>
 <td className="p-2 text-right font-mono text-tone-red-text border-r border-border">
 {formatNumber(row.rejectedOutput || 0)}
 </td>
 <td className="p-2 text-right font-bold font-mono text-[#171717]">
 {yieldPct}%
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}

 {/* ── 5. PROCUREMENT & INVENTORY ASSET VALUATION ───────────────── */}
 <div className="grid grid-cols-2 gap-4 mb-6 avoid-break">
 {/* Inventory Category Breakdown Table */}
 <div>
 <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2 flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-[#171717]"></span>
 3. Inventory Asset Valuation by Category
 </h3>
 <table className="w-full text-left border-collapse border border-border text-[10px]">
 <thead>
 <tr className="bg-muted text-ink-secondary font-bold border-b border-border">
 <th className="p-2 border-r border-border">Category</th>
 <th className="p-2 text-right border-r border-border">SKUs</th>
 <th className="p-2 text-right border-r border-border">On-Hand</th>
 <th className="p-2 text-right">Valuation (INR)</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {data.inventoryByCategory.map((cat, idx) => (
 <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/50' : 'bg-white'}>
 <td className="p-2 font-semibold border-r border-border flex items-center gap-1.5">
 <span
 className="h-2 w-2 rounded-full inline-block"
 style={{ backgroundColor: cat.color || '#171717' }}
 ></span>
 {cat.name}
 </td>
 <td className="p-2 text-right font-mono border-r border-border">
 {formatNumber(cat.itemCount)}
 </td>
 <td className="p-2 text-right font-mono border-r border-border">
 {formatNumber(cat.onHand)}
 </td>
 <td className="p-2 text-right font-mono font-bold text-ink">
 {formatCurrency(cat.value)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Procurement vs Goods Receipt Trend */}
 <div>
 <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2 flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-[#171717]"></span>
 4. Procurement Spend vs Receipts
 </h3>
 <table className="w-full text-left border-collapse border border-border text-[10px]">
 <thead>
 <tr className="bg-muted text-ink-secondary font-bold border-b border-border">
 <th className="p-2 border-r border-border">Period</th>
 <th className="p-2 text-right border-r border-border">Ordered Value</th>
 <th className="p-2 text-right border-r border-border">Inward Value</th>
 <th className="p-2 text-right">PO/GRN Count</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {data.procurementTrend.map((p, idx) => (
 <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/50' : 'bg-white'}>
 <td className="p-2 font-semibold border-r border-border">{p.label || p.period}</td>
 <td className="p-2 text-right font-mono border-r border-border">
 {formatCurrency(p.orderedValue)}
 </td>
 <td className="p-2 text-right font-mono text-tone-green-text font-semibold border-r border-border">
 {formatCurrency(p.receivedValue)}
 </td>
 <td className="p-2 text-right font-mono text-ink-secondary">
 {p.poCount} POs / {p.grnCount} GRNs
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* ── 6. RECENT OPERATIONAL AUDIT EVENTS & LEDGER ──────────────── */}
 {data.recentEvents && data.recentEvents.length > 0 && (
 <div className="mb-6 avoid-break">
 <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-2 flex items-center gap-1.5">
 <span className="h-2 w-2 rounded-full bg-[#171717]"></span>
 5. Operations Event Ledger &amp; Audit Trail
 </h3>
 <table className="w-full text-left border-collapse border border-border text-[10px]">
 <thead>
 <tr className="bg-muted text-ink-secondary font-bold border-b border-border">
 <th className="p-2 border-r border-border">Type</th>
 <th className="p-2 border-r border-border">Document / Ref Code</th>
 <th className="p-2 border-r border-border">Operational Description</th>
 <th className="p-2 border-r border-border text-center">Status</th>
 <th className="p-2 text-right">Value / Metric</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {data.recentEvents.slice(0, 10).map((evt, idx) => (
 <tr key={idx} className={idx % 2 === 1 ? 'bg-muted/50' : 'bg-white'}>
 <td className="p-2 font-bold border-r border-border text-[#171717]">
 {evt.type}
 </td>
 <td className="p-2 font-mono font-bold border-r border-border">
 {evt.code}
 </td>
 <td className="p-2 border-r border-border text-ink-secondary">
 {evt.title}
 </td>
 <td className="p-2 border-r border-border text-center">
 <span className="inline-block px-1.5 py-0.5 rounded-sm bg-muted text-ink font-semibold uppercase text-[8px]">
 {evt.status}
 </span>
 </td>
 <td className="p-2 text-right font-mono font-semibold text-ink">
 {evt.valueLabel || '—'}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {/* ── 7. DOCUMENT FOOTER & CERTIFICATION ────────────────────────── */}
 <div className="border-t border-border-strong pt-3 mt-8 flex items-center justify-between text-[9px] text-ink-secondary avoid-break">
 <div>
 <p className="font-semibold text-ink-secondary">
 Plinth · Automated Enterprise ERP Intelligence
 </p>
 <p className="text-[8px] text-ink-muted mt-0.5">
 Confidential · Generated from live transactional ledger records for internal operational review.
 </p>
 </div>
 <div className="text-right font-mono text-[9px]">
 <span>Page 1 of 1</span>
 </div>
 </div>
 </div>
 );
});

ExecutiveDashboardReportPDF.displayName = 'ExecutiveDashboardReportPDF';
