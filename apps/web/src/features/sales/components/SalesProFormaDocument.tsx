import React, { useMemo } from 'react';
import { CreditCard } from 'lucide-react';
import {
 formatINR,
 formatIndianDate,
 numberToIndianWords,
 COMPANY_INFO,
} from '../../purchases/utils';
import type { CommercialEditorLine, CommercialEditorTerms } from './SalesOrderCommercialsEditor';

export interface SalesProFormaDocumentProps {
 order: any;
 proForma: any;
 canEdit?: boolean;
 liveLines?: CommercialEditorLine[];
 liveTerms?: CommercialEditorTerms;
 isPrintPreview?: boolean;
 onPrint?: () => void;
}

export type ProFormaDisplayLine = {
 salesOrderLineId: string;
 description: string;
 sku: string;
 hsnSac: string;
 uom: string;
 quantity: number;
 unitPrice: number;
 discountAmount: number;
 taxRate: number;
 taxableAmount: number;
 taxAmount: number;
 totalAmount: number;
};

export const SalesProFormaDocument = React.forwardRef<HTMLDivElement, SalesProFormaDocumentProps>(
 (
 {
 order,
 proForma,
 liveLines,
 liveTerms,
 isPrintPreview = false,
 },
 ref
 ) => {
 const shipping = order?.addresses?.find((a: any) => a.kind === 'SHIPPING');
 const billing = order?.addresses?.find((a: any) => a.kind === 'BILLING') || shipping;

 // Compute live display lines dynamically from liveLines or fallback to proForma / order lines
 const displayLines: ProFormaDisplayLine[] = useMemo(() => {
 if (liveLines && liveLines.length > 0) {
 return liveLines.map((line) => {
 const qty = Number(line.quantity || 0);
 const price = Number(line.unitPrice || 0);
 const discount = Number(line.discountAmount || 0);
 const gross = qty * price;
 const taxable = Math.max(0, gross - discount);
 const rate = Number(line.taxRate || 0);
 const tax = taxable * (rate / 100);
 const total = taxable + tax;
 return {
 salesOrderLineId: line.salesOrderLineId,
 description: line.description,
 sku: line.sku,
 hsnSac: '94032090',
 uom: line.uom || 'PCS',
 quantity: qty,
 unitPrice: price,
 discountAmount: discount,
 taxRate: rate,
 taxableAmount: taxable,
 taxAmount: tax,
 totalAmount: total,
 };
 });
 }

 const raw =
 Array.isArray(proForma?.lines) && proForma.lines.length > 0
 ? proForma.lines
 : order?.lines || [];

 return raw.map((original: any) => {
 const qty = Number(original.quantity || original.orderedQuantity || 0);
 const price = Number(original.unitPrice || 0);
 const discount = Number(original.discountAmount || 0);
 const gross = qty * price;
 const taxable = Math.max(0, gross - discount);
 const rate = Number(original.taxRate || original.gstRate || 18);
 const tax = taxable * (rate / 100);
 const total = taxable + tax;
 return {
 salesOrderLineId: original.salesOrderLineId || original.id || '',
 description: original.description || original.itemName || 'Commercial Product',
 sku: original.sku || original.itemCode || '',
 hsnSac: original.hsnSac || '94032090',
 uom: original.uom || 'PCS',
 quantity: qty,
 unitPrice: price,
 discountAmount: discount,
 taxRate: rate,
 taxableAmount:
 original.taxableAmount !== undefined ? Number(original.taxableAmount) : taxable,
 taxAmount: original.taxAmount !== undefined ? Number(original.taxAmount) : tax,
 totalAmount:
 original.totalAmount !== undefined ? Number(original.totalAmount) : total,
 };
 });
 }, [liveLines, proForma?.lines, order?.lines]);

 const subtotal = displayLines.reduce(
 (sum: number, l: ProFormaDisplayLine) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0),
 0
 );
 const discountTotal = displayLines.reduce(
 (sum: number, l: ProFormaDisplayLine) => sum + Number(l.discountAmount || 0),
 0
 );
 const taxableTotal = Math.max(0, subtotal - discountTotal);
 const taxTotal = displayLines.reduce(
 (sum: number, l: ProFormaDisplayLine) => sum + Number(l.taxAmount || 0),
 0
 );
 const grandTotal = taxableTotal + taxTotal;
 const totalQuantity = displayLines.reduce(
 (sum: number, l: ProFormaDisplayLine) => sum + Number(l.quantity || 0),
 0
 );

 // GST Tax Breakdown (Madhya Pradesh State Code = 23)
 const customerState = billing?.state || 'Madhya Pradesh';
 const isIntraState =
 customerState.toLowerCase().includes('madhya') ||
 customerState.toLowerCase().includes('mp') ||
 billing?.stateCode === '23' ||
 !billing?.state;

 const cgstAmount = isIntraState ? taxTotal / 2 : 0;
 const sgstAmount = isIntraState ? taxTotal / 2 : 0;
 const igstAmount = !isIntraState ? taxTotal : 0;

 const isDispatched =
 Boolean(order?.dispatchedAt) ||
 ['DISPATCHED', 'DELIVERED', 'CLOSED'].includes(order?.status);
 const isLocked = proForma?.status === 'LOCKED' || isDispatched;

 const paymentTerms =
 liveTerms?.paymentTerms ||
 (order?.notes?.includes('Terms:') ? order.notes.split('Terms:')[1]?.trim() : '') ||
 'Payment before dispatch / Net 30 Days';

 const customerPoRef = liveTerms?.customerPoNumber || order?.externalOrderId || '—';
 const promisedDateStr = liveTerms?.promisedAt
 ? formatIndianDate(liveTerms.promisedAt)
 : order?.promisedAt
 ? formatIndianDate(order.promisedAt)
 : 'Standard Delivery';
 const orderDateStr = formatIndianDate(order?.orderedAt || new Date().toISOString());
 const proFormaDateStr = formatIndianDate(
 proForma?.issueDate || order?.orderedAt || new Date().toISOString()
 );
 const voucherNo = proForma?.proFormaNumber || `PI-${order?.orderNumber || 'DRAFT'}`;
 const destination = shipping?.city
 ? `${shipping.city}, ${shipping.state || 'Madhya Pradesh'}`
 : 'Indore, Madhya Pradesh';

 const customerName =
 proForma?.customerName || order?.customer?.name || billing?.name || 'Testing Business';
 const customerGstin =
 proForma?.customerGstin || billing?.taxNumber || order?.customer?.taxNumber || '23AAACT1234A1Z5';
 const billAddress1 = billing?.line1 || billing?.address || '123 Commercial Plaza, M.G. Road';
 const billAddress2 = billing?.city
 ? `${billing.city}, ${billing.state || 'Madhya Pradesh'} - ${billing.postalCode || '452001'}`
 : 'Indore, Madhya Pradesh - 452001';

 const shipAddress1 = shipping?.line1 || shipping?.address || billAddress1;
 const shipAddress2 = shipping?.city
 ? `${shipping.city}, ${shipping.state || 'Madhya Pradesh'} - ${shipping.postalCode || '452001'}`
 : billAddress2;

 return (
 <div className="w-full flex justify-center">
 <div
 ref={ref}
 data-printable="true"
 className={`printable-document print-target w-full bg-white text-ink font-sans select-text ${
 isPrintPreview
 ? 'p-0 max-w-[850px] mx-auto text-xs leading-tight'
 : 'p-4 sm:p-8 max-w-[850px] mx-auto text-[12px] leading-normal shadow-sm border border-border'
 } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-[800px] print:block print:visible`}
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 {/* Top Document Header: Document Title */}
 <div className="text-center pb-2 relative border-b border-black">
 <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-black">
 PROFORMA INVOICE
 </h1>
 <p className="text-[10px] uppercase font-bold text-ink-secondary">
 (Commercial Pre-Dispatch Valuation &amp; Quotation)
 </p>
 <span className="sm:absolute right-0 top-0 text-[10px] font-bold px-2 py-0.5 border border-black uppercase text-black">
 {isLocked ? 'CONFIRMED' : proForma?.status || 'DRAFT'}
 </span>
 </div>

 {/* Company Header with Plinth Logo and Address (Identical to PO PDF) */}
 <div className="flex items-start justify-between border-b-2 border-black pb-3 pt-2">
 <div className="flex items-center gap-3">
 <span className="text-xl font-black tracking-tight text-ink uppercase">Plinth</span>
 <div>
 <h2 className="text-sm sm:text-base font-black tracking-wide text-black uppercase">
 {COMPANY_INFO.name}
 </h2>
 <p className="text-[10.5px] leading-snug text-ink font-medium">
 {COMPANY_INFO.addressLine1}
 </p>
 <p className="text-[10.5px] leading-snug text-ink font-medium">
 {COMPANY_INFO.addressLine2}
 </p>
 <p className="text-[10.5px] leading-snug text-ink font-medium">
 {COMPANY_INFO.addressLine3}
 </p>
 <div className="flex flex-wrap items-center gap-x-3 text-[10.5px] font-semibold text-ink pt-0.5">
 <span>📞 {COMPANY_INFO.phone}</span>
 <span>✉ {COMPANY_INFO.email}</span>
 </div>
 </div>
 </div>
 </div>

 {/* GSTIN / UIN Row */}
 <div className="text-center py-1 font-bold text-[11.5px] text-black border-b border-black bg-muted/60">
 <span>GSTIN/UIN: {COMPANY_INFO.gstin}</span>
 <span className="mx-2">·</span>
 <span>State: {COMPANY_INFO.state} ({COMPANY_INFO.stateCode})</span>
 </div>

 {/* 2-Column Master ERP Grid Box (Matching PO PDF / Debit Note PDF) */}
 <div className="border border-black border-t-0 grid grid-cols-1 md:grid-cols-2 text-[11px]">
 {/* Left Column: Buyer & Consignee Details */}
 <div className="p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
 <div>
 <div className="text-[10px] uppercase font-bold text-ink-secondary mb-1">
 Buyer (Bill to)
 </div>
 <div className="font-black text-xs sm:text-sm text-black">
 {customerName}
 </div>
 <div className="text-[11px] text-ink whitespace-pre-line mt-0.5 leading-snug">
 {billAddress1}
 <br />
 {billAddress2}
 </div>

 <div className="mt-2 pt-2 border-t border-border-strong">
 <div className="text-[10px] uppercase font-bold text-ink-secondary mb-0.5">
 Consignee (Ship to)
 </div>
 <div className="font-bold text-black text-[11px]">
 {shipping?.name || customerName}
 </div>
 <div className="text-[10.5px] text-ink leading-snug">
 {shipAddress1}, {shipAddress2}
 </div>
 </div>
 </div>

 <div className="mt-3 pt-2 border-t border-border-strong font-medium space-y-0.5">
 <div className="flex">
 <span className="w-24 text-ink-secondary">GSTIN/UIN</span>
 <span className="font-mono font-bold text-black">: {customerGstin}</span>
 </div>
 <div className="flex">
 <span className="w-24 text-ink-secondary">State Name</span>
 <span className="font-semibold text-black">
 : {customerState}, Code : {isIntraState ? '23' : 'Inter-State'}
 </span>
 </div>
 </div>
 </div>

 {/* Right Column: Order Details & Logistics Meta Grid */}
 <div className="text-[11px]">
 {/* Row 1: Pro Forma No & Dated */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Proforma No.</div>
 <div className="font-mono font-black text-[12px] text-black">{voucherNo}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Dated</div>
 <div className="font-mono font-bold text-[12px] text-black">{proFormaDateStr}</div>
 </div>
 </div>

 {/* Row 2: Sales Order Ref & Payment Terms */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Sales Order No. &amp; Date</div>
 <div className="font-mono font-semibold text-black">{order?.orderNumber} ({orderDateStr})</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Mode/Terms of Payment</div>
 <div className="font-medium text-black">{paymentTerms}</div>
 </div>
 </div>

 {/* Row 3: Buyer's Order No & Despatched Through */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Buyer&apos;s Order / PO Ref</div>
 <div className="font-mono font-semibold text-black">{customerPoRef}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Despatched through</div>
 <div className="font-medium text-black">Road Transport / Courier</div>
 </div>
 </div>

 {/* Row 4: Terms of Delivery & Destination */}
 <div className="grid grid-cols-2 divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Terms of Delivery</div>
 <div className="font-medium text-black">Door Delivery · Promised: {promisedDateStr}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Destination</div>
 <div className="font-medium text-black">{destination}</div>
 </div>
 </div>
 </div>
 </div>

 {/* Itemized Goods Table (Exact Statutory Styling as PurchaseOrderPDF) */}
 <div className="border border-black border-t-0 overflow-x-auto">
 <table className="w-full text-[11px] border-collapse">
 <thead>
 <tr className="border-b border-black bg-muted font-bold text-[10px] uppercase text-black text-center">
 <th className="border-r border-black p-1.5 w-10">Sl<br />No.</th>
 <th className="border-r border-black p-1.5 text-left min-w-[200px]">Description of Goods</th>
 <th className="border-r border-black p-1.5 w-20">HSN/SAC</th>
 <th className="border-r border-black p-1.5 w-20">Promised</th>
 <th className="border-r border-black p-1.5 w-20 text-right">Quantity</th>
 <th className="border-r border-black p-1.5 w-20 text-right">Rate (₹)</th>
 <th className="border-r border-black p-1.5 w-12 text-center">per</th>
 <th className="border-r border-black p-1.5 w-16 text-right">Disc. (₹)</th>
 <th className="border-r border-black p-1.5 w-14 text-center">GST %</th>
 <th className="p-1.5 w-24 text-right">Amount (₹)</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {displayLines.map((line: ProFormaDisplayLine, idx: number) => {
 const lineAmount = Number(line.totalAmount || 0);

 return (
 <tr key={line.salesOrderLineId || idx} className="text-black align-top font-medium">
 <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">
 <div>{line.description}</div>
 {line.sku && (
 <div className="text-[9.5px] font-mono font-normal text-ink-secondary">
 SKU: {line.sku}
 </div>
 )}
 </td>
 <td className="border-r border-black p-1.5 text-center font-mono">{line.hsnSac}</td>
 <td className="border-r border-black p-1.5 text-center font-mono">{promisedDateStr}</td>
 <td className="border-r border-black p-1.5 text-right font-mono font-bold">
 {line.quantity.toLocaleString('en-IN')} {line.uom}
 </td>
 <td className="border-r border-black p-1.5 text-right font-mono">
 {line.unitPrice.toFixed(2)}
 </td>
 <td className="border-r border-black p-1.5 text-center">{line.uom}</td>
 <td className="border-r border-black p-1.5 text-right font-mono text-ink-secondary">
 {line.discountAmount > 0 ? line.discountAmount.toFixed(2) : '—'}
 </td>
 <td className="border-r border-black p-1.5 text-center font-mono">
 {line.taxRate}%
 </td>
 <td className="p-1.5 text-right font-mono font-bold">
 {lineAmount.toFixed(2)}
 </td>
 </tr>
 );
 })}
 </tbody>

 {/* Subtotal & Output Tax Summary Footer */}
 <tfoot>
 <tr className="border-t-2 border-black font-bold text-black bg-muted">
 <td colSpan={4} className="border-r border-black p-1.5 text-right uppercase">
 Total
 </td>
 <td className="border-r border-black p-1.5 text-right font-mono">
 {totalQuantity.toLocaleString('en-IN')} PCS
 </td>
 <td colSpan={4} className="border-r border-black p-1.5 text-right uppercase font-sans">
 Taxable Subtotal:
 </td>
 <td className="p-1.5 text-right font-mono">
 {taxableTotal.toFixed(2)}
 </td>
 </tr>

 {/* Intra-State CGST & SGST Rows */}
 {isIntraState ? (
 <>
 <tr className="border-t border-border-strong font-semibold text-ink">
 <td colSpan={9} className="border-r border-black p-1.5 text-right font-sans">
 Output CGST (Central Goods &amp; Services Tax)
 </td>
 <td className="p-1.5 text-right font-mono">
 {cgstAmount.toFixed(2)}
 </td>
 </tr>
 <tr className="border-t border-border-strong font-semibold text-ink">
 <td colSpan={9} className="border-r border-black p-1.5 text-right font-sans">
 Output SGST (State Goods &amp; Services Tax)
 </td>
 <td className="p-1.5 text-right font-mono">
 {sgstAmount.toFixed(2)}
 </td>
 </tr>
 </>
 ) : (
 <tr className="border-t border-border-strong font-semibold text-ink">
 <td colSpan={9} className="border-r border-black p-1.5 text-right font-sans">
 Output IGST (Integrated Goods &amp; Services Tax)
 </td>
 <td className="p-1.5 text-right font-mono">
 {igstAmount.toFixed(2)}
 </td>
 </tr>
 )}

 {/* Net Total Row */}
 <tr className="border-t-2 border-black font-black text-black bg-muted text-[12px]">
 <td colSpan={9} className="border-r border-black p-2 text-right uppercase tracking-wider font-sans">
 Grand Total (INR)
 </td>
 <td className="p-2 text-right font-mono font-black text-sm">
 {formatINR(grandTotal)}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>

 {/* Amount In Words & Bank Remittance Box */}
 <div className="border border-black border-t-0 p-2 text-[11px] leading-snug">
 <div className="font-bold text-ink">
 Amount Chargeable (in words):
 </div>
 <div className="font-bold text-black text-xs mt-0.5 capitalize">
 INR {numberToIndianWords(grandTotal)}
 </div>
 </div>

 {/* Tax Breakdown Grid & Bank Details Box */}
 <div className="border border-black border-t-0 grid grid-cols-1 md:grid-cols-2 text-[11px] divide-y md:divide-y-0 md:divide-x divide-black">
 {/* Left Column: Bank Remittance Details */}
 <div className="p-2.5 space-y-1">
 <div className="font-bold text-ink uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
 <CreditCard className="h-3.5 w-3.5 text-black" /> Company&apos;s Bank Details
 </div>
 <div className="grid grid-cols-[100px_1fr] gap-y-0.5 text-[10.5px]">
 <span className="text-ink-secondary">Bank Name:</span>
 <span className="font-bold text-black">HDFC Bank Limited</span>
 <span className="text-ink-secondary">A/c Holder:</span>
 <span className="font-bold text-black">{COMPANY_INFO.name}</span>
 <span className="text-ink-secondary">A/c No.:</span>
 <span className="font-mono font-bold text-black">50200088921134</span>
 <span className="text-ink-secondary">Branch &amp; IFS Code:</span>
 <span className="font-mono font-bold text-black">HDFC0001234 (Indore Main)</span>
 </div>
 </div>

 {/* Right Column: Declaration & Signature */}
 <div className="p-2.5 flex flex-col justify-between">
 <div>
 <div className="font-bold text-ink uppercase text-[10px] tracking-wider mb-1">
 Declaration
 </div>
 <p className="text-[10px] text-ink-secondary leading-tight">
 We declare that this Proforma Invoice shows the actual price of the goods described and that all particulars are true and correct. Official Tax Invoice will be issued upon dispatch.
 </p>
 </div>

 <div className="mt-4 pt-2 border-t border-border-strong flex justify-between items-end">
 <div className="text-[10px] text-ink-secondary">
 Customer Acceptance
 </div>
 <div className="text-right">
 <div className="text-[10px] font-bold text-black">
 For {COMPANY_INFO.name}
 </div>
 <div className="h-8 flex items-center justify-end">
 <span className="text-[9px] text-ink-muted italic">Authorised Signatory</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Bottom System Footnote */}
 <div className="pt-2 text-center text-[9px] text-ink-secondary print:text-[8px]">
 This is a Computer Generated Proforma Document · Governed by Plinth Commercial ERP
 </div>
 </div>
 </div>
 );
 }
);

SalesProFormaDocument.displayName = 'SalesProFormaDocument';
