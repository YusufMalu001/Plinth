import React from 'react';
import { PR } from '../features/purchases/api';

const money = (v: number | string | null | undefined) =>
 `₹${Number(v || 0).toLocaleString('en-IN', {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 })}`;

const date = (v?: string | null) =>
 v
 ? new Date(v).toLocaleDateString('en-IN', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 })
 : '—';

export const PurchaseRequisitionPDF = React.forwardRef<HTMLDivElement, { pr: PR }>(
 ({ pr }, ref) => {
 const rows = pr.lines ?? [];
 const total = rows.reduce(
 (sum, line) =>
 sum + Number(line.requestedQuantity || 0) * Number(line.estimatedUnitCost || 0),
 0
 );

 return (
 <div
 ref={ref}
 data-printable="true"
 className="printable-document print-target w-full max-w-[840px] bg-white p-6 sm:p-8 text-[11px] text-ink shadow-sm print:w-[840px] print:max-w-none print:p-0 print:shadow-none print:block print:visible font-sans"
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 {/* Top Dual Accent Lines: Corporate Royal Navy & Accent */}
 <div className="h-1.5 bg-[#171717] w-full rounded-t-sm" />
 <div className="h-0.5 bg-[#2E2E2E]/30 w-full mb-4" />

 {/* Corporate Header */}
 <header className="flex items-start justify-between border-b border-border pb-5">
 <div>
 <span className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">Plinth</span>
 <div className="mt-1.5 text-[9px] font-semibold tracking-wider text-ink-muted uppercase">
 Plinth · Procurement &amp; Operations
 </div>
 </div>

 <div className="text-right">
 <h1 className="text-xl font-bold tracking-tight text-ink uppercase">
 Purchase Requisition
 </h1>
 <div className="mt-1.5 text-xs font-medium text-ink-secondary">
 DOCUMENT NO:
 <span className="ml-1.5 font-mono font-bold text-ink text-sm">
 {pr.prNumber}
 </span>
 </div>
 <div className="mt-1 flex items-center justify-end gap-2 text-xs text-ink-secondary">
 <span>{date(pr.createdAt)}</span>
 <span>·</span>
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-muted border-border text-ink-secondary">
 {String(pr.status).replaceAll('_', ' ')}
 </span>
 </div>
 </div>
 </header>

 {/* Request & Controls 2-Column Section */}
 <section className="mt-5 grid grid-cols-2 rounded-lg border border-border text-[11px] overflow-hidden">
 <div className="border-r border-border">
 <div className="bg-muted/80 px-3.5 py-2 font-semibold uppercase tracking-wider text-ink-secondary border-b border-border text-[10px]">
 Requester &amp; Delivery Context
 </div>
 <dl className="grid grid-cols-[105px_1fr] gap-y-1.5 p-3.5">
 <dt className="text-ink-secondary font-medium">Requester</dt>
 <dd className="font-semibold text-ink">
 {pr.requester?.name || pr.requester?.email || '—'}
 </dd>

 <dt className="text-ink-secondary font-medium">Department</dt>
 <dd className="text-ink">{pr.department?.name || '—'}</dd>

 <dt className="text-ink-secondary font-medium">Delivery Site</dt>
 <dd className="text-ink">{pr.deliveryLocation || '—'}</dd>

 <dt className="text-ink-secondary font-medium">Cost Center</dt>
 <dd className="font-mono text-ink-secondary">{pr.costCenter || '—'}</dd>
 </dl>
 </div>

 <div>
 <div className="bg-muted/80 px-3.5 py-2 font-semibold uppercase tracking-wider text-ink-secondary border-b border-border text-[10px]">
 Requisition Controls &amp; Dates
 </div>
 <dl className="grid grid-cols-[105px_1fr] gap-y-1.5 p-3.5">
 <dt className="text-ink-secondary font-medium">Created Date</dt>
 <dd className="text-ink-secondary">{date(pr.createdAt)}</dd>

 <dt className="text-ink-secondary font-medium">Required By</dt>
 <dd className="font-mono font-semibold text-ink">{date(pr.needDate)}</dd>

 <dt className="text-ink-secondary font-medium">Priority</dt>
 <dd className="font-semibold text-ink">{pr.priority || 'NORMAL'}</dd>

 <dt className="text-ink-secondary font-medium">Workflow Status</dt>
 <dd className="font-mono font-semibold uppercase text-ink">
 {String(pr.status).replaceAll('_', ' ')}
 </dd>
 </dl>
 </div>
 </section>

 {/* Requirements Table */}
 <section className="mt-5 rounded-lg border border-border overflow-hidden">
 <div className="bg-muted/80 px-3.5 py-2 font-semibold uppercase tracking-wider text-ink-secondary border-b border-border text-[10px] flex items-center justify-between">
 <span>Requisition Line Items</span>
 <span className="text-[10px] font-mono text-ink-secondary font-normal">
 {rows.length} {rows.length === 1 ? 'item' : 'items'}
 </span>
 </div>
 <table className="w-full border-collapse text-left table-fixed">
 <colgroup><col className="w-[5%]" /><col className="w-[20%]" /><col className="w-[33%]" /><col className="w-[10%]" /><col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup>
 <thead>
 <tr className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary border-b border-border">
 <th className="px-2.5 py-2.5 text-center">#</th>
 <th className="px-2.5 py-2.5">Item Code</th>
 <th className="px-2.5 py-2.5">Description &amp; Specifications</th>
 <th className="px-2.5 py-2.5 text-right">Qty</th>
 <th className="px-2.5 py-2.5 text-center">UOM</th>
 <th className="px-2.5 py-2.5 text-right">Est. Unit Cost</th>
 <th className="px-2.5 py-2.5 text-right">Total Est. Cost</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border text-xs">
 {rows.map((line, i) => {
 const code = line.product?.sku || line.material?.code || '—';
 const description = line.product?.name || line.material?.name || '—';
 const amount =
 Number(line.requestedQuantity || 0) * Number(line.estimatedUnitCost || 0);
 return (
 <tr key={line.id || i} className="hover:bg-muted/50 transition-colors">
 <td className="px-2.5 py-2.5 text-center font-mono text-ink-muted text-[11px] align-top">
 {i + 1}
 </td>
 <td className="px-2.5 py-2.5 font-mono font-semibold text-ink text-[11px] align-top break-words">
 {code}
 </td>
 <td className="px-2.5 py-2.5 align-top">
 <div className="font-medium text-ink leading-snug">{description}</div>
 {line.specifications && (
 <div className="text-[10px] text-ink-secondary mt-0.5">
 {line.specifications}
 </div>
 )}
 </td>
 <td className="px-2.5 py-2.5 text-right font-mono font-bold text-ink align-top">
 {line.requestedQuantity}
 </td>
 <td className="px-2.5 py-2.5 text-center font-mono text-ink-secondary text-[11px] align-top">
 {line.uom?.symbol || line.uom?.code || '—'}
 </td>
 <td className="px-2.5 py-2.5 text-right font-mono text-ink-secondary whitespace-nowrap align-top">
 {money(line.estimatedUnitCost)}
 </td>
 <td className="px-2.5 py-2.5 text-right font-mono font-bold text-ink whitespace-nowrap align-top">
 {money(amount)}
 </td>
 </tr>
 );
 })}
 {!rows.length && (
 <tr>
 <td colSpan={7} className="p-6 text-center text-ink-muted italic">
 No requisition lines recorded.
 </td>
 </tr>
 )}
 </tbody>
 <tfoot>
 <tr className="border-t border-border bg-muted/70">
 <td
 colSpan={6}
 className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-ink"
 >
 Total Estimated Budget Required
 </td>
 <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-ink">
 {money(total)}
 </td>
 </tr>
 </tfoot>
 </table>
 </section>

 {/* Justification & Notes (2 Columns) */}
 <section className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
 <div className="rounded-lg border border-border overflow-hidden">
 <div className="bg-muted/80 px-3.5 py-2 font-semibold uppercase tracking-wider text-ink-secondary border-b border-border text-[10px]">
 Business Justification
 </div>
 <p className="min-h-16 whitespace-pre-wrap p-3.5 text-ink-secondary leading-relaxed">
 {pr.businessJustification || 'No justification provided.'}
 </p>
 </div>

 <div className="rounded-lg border border-border overflow-hidden">
 <div className="bg-muted/80 px-3.5 py-2 font-semibold uppercase tracking-wider text-ink-secondary border-b border-border text-[10px]">
 Preferred Vendor &amp; Notes
 </div>
 <div className="p-3.5 space-y-1.5 text-ink-secondary leading-relaxed">
 <p>
 <strong className="text-ink">Preferred Supplier:</strong>{' '}
 {pr.preferredVendor?.name || 'Not specified'}
 </p>
 <p>
 <strong className="text-ink">Procurement Notes:</strong> {pr.notes || '—'}
 </p>
 </div>
 </div>
 </section>

 {/* 3-Tier Signatures */}
 <footer className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5 text-[10px]">
 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">
 Requested By
 </div>
 <div className="text-ink-muted text-[10px]">Department Requisitioner</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink">
 {pr.requester?.name || '—'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">{date(pr.createdAt)}</div>
 </div>

 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">
 Store &amp; Inventory Review
 </div>
 <div className="text-ink-muted text-[10px]">Stock Availability Check</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink">
 {pr.approvals?.find((a) => a.stage === 'STORE_REVIEW')?.actor?.name || 'Store Officer'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">Inventory Verification</div>
 </div>

 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">
 Administrative Approval
 </div>
 <div className="text-ink-muted text-[10px]">Budget &amp; Authorization</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink">
 {pr.approvals?.find((a) => a.stage === 'ADMIN_REVIEW')?.actor?.name || 'Admin Manager'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">Commercial Authorization</div>
 </div>
 </footer>
 </div>
 );
 }
);
PurchaseRequisitionPDF.displayName = 'PurchaseRequisitionPDF';

