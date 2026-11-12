import React from 'react';

export interface DebitNoteDocumentData {
 id: string;
 debitNoteNumber: string;
 vendorId: string;
 poId?: string | null;
 grnId?: string | null;
 invoiceNumber?: string | null;
 currency?: string;
 status: string;
 reason: string;
 totalAmount: number | string;
 evidence?: { reasonCategory?: string; discrepancyIds?: string[] } | Record<string, unknown> | null;
 createdAt: string;
 createdBy?: string | null;
 submittedAt?: string | null;
 approvedBy?: string | null;
 approvedAt?: string | null;
 vendor?: {
 id: string;
 name: string;
 code: string;
 legalName?: string | null;
 contactEmail?: string | null;
 contactPhone?: string | null;
 address?: Record<string, unknown> | string | null;
 } | null;
 po?: {
 id: string;
 poNumber: string;
 totalAmount?: number | string | null;
 status?: string;
 paymentTerms?: string | null;
 deliveryLocation?: string | null;
 createdAt?: string;
 } | null;
 grn?: {
 id: string;
 grnNumber: string;
 status?: string;
 receivedAt?: string;
 } | null;
 creator?: {
 id: string;
 name: string;
 email: string;
 role?: string;
 } | null;
 approver?: {
 id: string;
 name: string;
 email: string;
 role?: string;
 } | null;
 lines: Array<{
 id: string;
 description: string;
 itemCode?: string;
 uomSymbol?: string;
 expectedQuantity: number | string;
 receivedQuantity: number | string;
 acceptedQuantity: number | string;
 rejectedQuantity: number | string;
 damagedQuantity: number | string;
 shortQuantity: number | string;
 unitPrice: number | string;
 totalAmount: number | string;
 reason?: string | null;
 }>;
}

const money = (v: number | string | null | undefined, currency = 'INR') =>
 `${currency === 'INR' ? '₹' : currency + ' '}${Number(v || 0).toLocaleString('en-IN', {
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

export const DebitNotePDF = React.forwardRef<HTMLDivElement, { note: DebitNoteDocumentData }>(
 ({ note }, ref) => {
 const currency = note.currency || 'INR';
 const lines = note.lines || [];

 const lineAmount = (line: DebitNoteDocumentData['lines'][number]) => {
 const discrepancyQuantity =
 Number(line.shortQuantity || 0) +
 Number(line.rejectedQuantity || 0) +
 Number(line.damagedQuantity || 0);
 const quantity = discrepancyQuantity > 0 ? discrepancyQuantity : Number(line.expectedQuantity || 0);
 return quantity * Number(line.unitPrice || 0);
 };
 const totalAmount = lines.reduce((sum, line) => sum + lineAmount(line), 0);

 const formatAddress = (addr: Record<string, unknown> | string | null | undefined) => {
 if (!addr) return '—';
 if (typeof addr === 'string') return addr;
 const addrObj = addr as Record<string, string | undefined>;
 const parts = [
 addrObj.street || addrObj.line1 || addrObj.address,
 addrObj.city,
 addrObj.state,
 addrObj.pincode || addrObj.postalCode,
 addrObj.country,
 ].filter(Boolean);
 return parts.join(', ') || '—';
 };

 const reasonCategory =
 (note.evidence as { reasonCategory?: string } | null | undefined)?.reasonCategory?.replaceAll('_', ' ') || 'GOODS DISCREPANCY';

 return (
 <div
 ref={ref}
 data-printable="true"
 className="printable-document print-target w-full max-w-none bg-white p-5 text-[11px] text-ink shadow-sm sm:p-7 print:w-[840px] print:max-w-none print:p-0 print:shadow-none print:block print:visible font-sans"
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 {/* Clean Top Subtle Accent Line (#171717 Royal Navy) */}
 <div className="h-1.5 bg-[#171717] w-full rounded-t-sm" />

 {/* Corporate Clean Header */}
 <header className="flex items-start justify-between gap-5 border-b border-border pb-5 pt-4">
 <div>
 <span className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">Plinth</span>
 <div className="mt-1.5 text-[9px] font-semibold tracking-wider text-[#171717] uppercase">
 Plinth · Commercial Recovery Division
 </div>
 </div>

 <div className="text-right">
 <h1 className="text-lg font-bold tracking-tight text-ink uppercase">
 Debit Note Voucher
 </h1>
 <div className="mt-1 text-xs font-medium text-ink-secondary">
 Note No:{' '}
 <span className="ml-1 font-mono font-bold text-ink">
 {note.debitNoteNumber}
 </span>
 </div>
 <div className="mt-0.5 text-xs text-ink-secondary">
 Date: <span className="font-medium text-ink-secondary">{date(note.createdAt)}</span> · Status:{' '}
 <span className="font-mono font-semibold uppercase text-[#171717]">
 {note.status.replaceAll('_', ' ')}
 </span>
 </div>
 </div>
 </header>

 {/* Two-Column Metadata Box - Clean Border & Neutral Styling */}
 <section className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border text-[11px]">
 {/* Vendor Details Column */}
 <div className="border-r border-border">
 <div className="border-b border-border bg-muted/70 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink">
 Issued To / Vendor Details
 </div>
 <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 p-3.5">
 <dt className="text-ink-secondary font-medium">Name</dt>
 <dd className="font-semibold text-ink">
 {note.vendor?.name || note.vendorId}
 </dd>

 <dt className="text-ink-secondary font-medium">Vendor Code</dt>
 <dd className="font-mono text-ink-secondary">{note.vendor?.code || '—'}</dd>

 <dt className="text-ink-secondary font-medium">Contact</dt>
 <dd className="text-ink-secondary">
 {note.vendor?.contactEmail || note.vendor?.contactPhone
 ? `${note.vendor?.contactEmail || ''} ${note.vendor?.contactPhone || ''}`
 : '—'}
 </dd>

 <dt className="text-ink-secondary font-medium">Address</dt>
 <dd className="text-[10px] leading-relaxed text-ink-secondary">
 {formatAddress(note.vendor?.address)}
 </dd>
 </dl>
 </div>

 {/* Reference Column */}
 <div>
 <div className="border-b border-border bg-muted/70 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink">
 Receiving &amp; Reference Context
 </div>
 <dl className="grid grid-cols-[105px_1fr] gap-y-1.5 p-3.5">
 <dt className="text-ink-secondary font-medium">Purchase Order</dt>
 <dd className="font-mono font-semibold text-ink">
 {note.po?.poNumber || note.poId || 'Direct / Unreferenced'}
 </dd>

 <dt className="text-ink-secondary font-medium">Goods Receipt</dt>
 <dd className="font-mono font-semibold text-ink">
 {note.grn?.grnNumber || note.grnId || '—'}
 </dd>

 <dt className="text-ink-secondary font-medium">Receipt Date</dt>
 <dd className="text-ink-secondary">{date(note.grn?.receivedAt || note.createdAt)}</dd>

 <dt className="text-ink-secondary font-medium">Claim Category</dt>
 <dd className="font-medium uppercase text-ink">{reasonCategory}</dd>

 <dt className="text-ink-secondary font-medium">Currency</dt>
 <dd className="font-mono text-ink-secondary">{currency}</dd>
 </dl>
 </div>
 </section>

 {/* Claim Justification Statement */}
 <section className="mt-4 rounded-lg border border-border bg-muted/40 p-3.5">
 <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary mb-1">
 Discrepancy Justification
 </div>
 <p className="text-ink leading-relaxed text-xs">
 {note.reason ||
 'Discrepancy observed during physical receiving inspection against purchase order baseline.'}
 </p>
 </section>

 {/* Claimed Line Items Table - Clean Minimal Accounting Table */}
 <section className="mt-4 overflow-hidden rounded-lg border border-border">
 <table className="w-full table-fixed border-collapse text-left">
 <colgroup>
 <col className="w-7" />
 <col className="w-[14%]" />
 <col />
 <col className="w-[9%]" />
 <col className="w-[9%]" />
 <col className="w-[10%]" />
 <col className="w-[8%]" />
 <col className="w-[13%]" />
 <col className="w-[15%]" />
 </colgroup>
 <thead>
 <tr className="border-b border-border bg-muted/70 text-[10px] font-semibold uppercase tracking-wider text-ink">
 <th className="px-3 py-2 text-center w-8">#</th>
 <th className="px-3 py-2">Item Code</th>
 <th className="px-3 py-2">Description</th>
 <th className="px-3 py-2 text-right">PO Qty</th>
 <th className="px-3 py-2 text-right">Rcvd</th>
 <th className="px-3 py-2 text-right font-bold text-ink">Claim Qty</th>
 <th className="px-3 py-2 text-center">UOM</th>
 <th className="px-3 py-2 text-right">Rate</th>
 <th className="px-3 py-2 text-right">Total Debit</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border text-xs">
 {lines.map((line, i) => {
 const claimedQty =
 Number(line.shortQuantity || 0) +
 Number(line.rejectedQuantity || 0) +
 Number(line.damagedQuantity || 0);

 return (
 <tr key={line.id || i} className="hover:bg-muted/50 transition-colors">
 <td className="px-3 py-2 text-center font-mono text-ink-muted text-[11px]">
 {i + 1}
 </td>
 <td className="break-words px-3 py-2 font-mono font-medium text-ink">
 {line.itemCode || '—'}
 </td>
 <td className="max-w-[220px] break-words px-3 py-2">
 <div className="font-medium text-ink">
 {line.description}
 </div>
 {line.reason && (
 <div className="mt-0.5 break-words text-[10px] text-ink-secondary">
 {line.reason}
 </div>
 )}
 </td>
 <td className="px-3 py-2 text-right font-mono text-ink-secondary">
 {line.expectedQuantity}
 </td>
 <td className="px-3 py-2 text-right font-mono text-ink-secondary">
 {line.receivedQuantity}
 </td>
 <td className="px-3 py-2 text-right font-mono font-bold text-ink">
 {claimedQty > 0 ? claimedQty : line.expectedQuantity}
 </td>
 <td className="px-3 py-2 text-center text-ink-secondary font-mono text-[10px]">
 {line.uomSymbol || 'EA'}
 </td>
 <td className="px-3 py-2 text-right font-mono text-ink-secondary">
 {money(line.unitPrice, currency)}
 </td>
 <td className="px-3 py-2 text-right font-mono font-bold text-ink">
 {money(lineAmount(line), currency)}
 </td>
 </tr>
 );
 })}

 {!lines.length && (
 <tr>
 <td colSpan={9} className="p-4 text-center text-ink-muted italic">
 General discrepancy claim — no itemized lines recorded.
 </td>
 </tr>
 )}
 </tbody>
 <tfoot>
 <tr className="border-t border-border bg-muted/50">
 <td
 colSpan={7}
 className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-ink-secondary"
 >
 Product Total
 </td>
 <td colSpan={2} className="px-3 py-2 text-right font-mono font-bold text-ink">
 {money(totalAmount, currency)}
 </td>
 </tr>
 <tr className="border-t border-border bg-muted/50">
 <td
 colSpan={7}
 className="px-3 py-2.5 text-right text-xs font-bold uppercase text-ink"
 >
 Total Debit Amount Recoverable
 </td>
 <td
 colSpan={2}
 className="px-3 py-2.5 text-right text-sm font-bold font-mono text-ink"
 >
 {money(totalAmount, currency)}
 </td>
 </tr>
 </tfoot>
 </table>
 </section>

 {/* Commercial Settlement Notice */}
 <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3 text-[10px] text-ink-secondary leading-relaxed">
 <strong className="text-ink-secondary">Settlement Notice:</strong> This debit note is an official commercial claim recorded by Plinth.
 The total claim amount of <strong className="text-ink">{money(totalAmount, currency)}</strong> will be adjusted against upcoming
 payable invoices or remitted directly by the supplier. Supported by physical receiving inspection records and evidence.
 </div>

 {/* 4-Tier Clean Authorization Block */}
 <footer className="mt-6 grid grid-cols-4 gap-4 border-t border-border pt-4 text-[10px]">
 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">Prepared By</div>
 <div className="text-ink-muted text-[10px]">Warehouse Receiving</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink truncate">
 {note.creator?.name || 'Store Officer'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">{date(note.createdAt)}</div>
 </div>

 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">Audit &amp; AP Review</div>
 <div className="text-ink-muted text-[10px]">Accounts Payable</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink">
 {note.submittedAt ? 'Verified by AP' : 'Pending Review'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">
 {note.submittedAt ? date(note.submittedAt) : '—'}
 </div>
 </div>

 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">Commercial Approval</div>
 <div className="text-ink-muted text-[10px]">Finance Controller</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink">
 {note.approvedBy ? note.approver?.name || 'Approved' : 'Awaiting Sign-off'}
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">
 {note.approvedAt ? date(note.approvedAt) : '—'}
 </div>
 </div>

 <div>
 <div className="font-semibold uppercase tracking-wider text-ink-secondary text-[9px]">Vendor Acknowledgment</div>
 <div className="text-ink-muted text-[10px]">Authorized Signatory</div>
 <div className="mt-6 border-b border-border-strong pb-1 font-medium text-ink-muted italic">
 Signature &amp; Stamp
 </div>
 <div className="mt-0.5 text-[9px] text-ink-muted">Date: ____________</div>
 </div>
 </footer>
 </div>
 );
 }
);

DebitNotePDF.displayName = 'DebitNotePDF';
