import React from 'react';
import { PO } from '../features/purchases/api';
import {
 formatINR,
 formatIndianDate,
 numberToIndianWords,
 COMPANY_INFO,
 getVendorDisplayDetails,
 getPoPaymentTerms,
} from '../features/purchases/utils';

export interface PurchaseOrderPDFProps {
 po: PO;
 isPrintPreview?: boolean;
}

export const PurchaseOrderPDF = React.forwardRef<HTMLDivElement, PurchaseOrderPDFProps>(
 ({ po, isPrintPreview = false }, ref) => {
 const lines = po?.lines || [];

 // Calculate Financial Figures
 const subtotal = Number(
 po?.subtotal ??
 lines.reduce(
 (sum, line) =>
 sum + Number(line.lineTotal ?? Number(line.quantity || 0) * Number(line.unitPrice || 0)),
 0
 )
 );

 const totalTax = Number(po?.taxAmount ?? 0);
 const grandTotal = Number(po?.totalAmount ?? (subtotal + totalTax));

 // Determine GST Breakdown (Intra-state MP to MP -> CGST + SGST, Inter-state -> IGST)
 const vendorDetails = getVendorDisplayDetails(po?.vendor);
 const vendorGstin = vendorDetails.gstin !== '—' ? vendorDetails.gstin : '';
 const stateCode = vendorDetails.stateCode !== '—' ? vendorDetails.stateCode : (vendorGstin.length >= 2 ? vendorGstin.slice(0, 2) : '');
 
 const isIntraState = stateCode === '23' || (!stateCode && !vendorGstin);
 const cgstAmount = isIntraState ? totalTax / 2 : 0;
 const sgstAmount = isIntraState ? totalTax / 2 : 0;
 const igstAmount = !isIntraState ? totalTax : 0;
 // Total Quantity calculation
 const quantityTotals = new Map<string, number>();
 for (const line of lines) {
 const unit = line.uom?.symbol || line.uom?.code || '';
 quantityTotals.set(unit, (quantityTotals.get(unit) || 0) + Number(line.quantity || 0));
 }
 const quantitySummary = [...quantityTotals.entries()].map(([unit, quantity]) => `${quantity.toLocaleString('en-IN')} ${unit}`.trim()).join(' / ');

 // Vendor Details & Address
 const addressStreet = vendorDetails.street || (vendorDetails.cityStateZip ? '' : vendorDetails.fullAddress !== 'Address not provided' ? vendorDetails.fullAddress : '');
 const addressCityState = vendorDetails.cityStateZip || '';
 // Voucher References - strictly using backend PO data
 const voucherNo = po?.poNumber || '';
 const orderDate = po?.createdAt ? formatIndianDate(po.createdAt) : '';
 const referenceNo = po?.sourcePr?.prNumber ? `${po.sourcePr.prNumber} & ${orderDate}` : voucherNo;
 const paymentTerms = getPoPaymentTerms(po);
 const dispatchedThrough = po?.dispatchedThrough || '';
 const destination = (po as { destination?: string })?.destination || po?.deliveryLocation || '';
 const termsOfDelivery = po?.termsOfDelivery || '';
 const otherReferences = po?.otherReferences || '';
 const wordsAmount = numberToIndianWords(grandTotal);

 return (
 <div
 ref={ref}
 data-printable="true"
 className={`printable-document print-target w-full bg-white text-ink font-sans select-text ${
 isPrintPreview
 ? 'p-0 max-w-[800px] mx-auto text-xs leading-tight'
 : 'p-4 sm:p-8 max-w-[850px] mx-auto text-[12px] leading-normal shadow-sm border border-border'
 } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-[800px] print:block print:visible`}
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 {/* Top Header: Title */}
 <div className="text-center pb-2 relative">
 <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-black">
 PURCHASE ORDER
 </h1>
 </div>

 {/* Company Header with Plinth Logo and Address */}
 <div className="flex items-start justify-between border-b-2 border-black pb-3 pt-1">
 <div className="flex items-center gap-3">
 <span className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">Plinth</span>
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
 <p className="pt-0.5 text-[10px] font-semibold text-ink">GSTIN/UIN: {COMPANY_INFO.gstin}</p>
 </div>
 </div>
 </div>

 {/* 2-Column Master ERP Grid Box */}
 <div className="border border-black grid grid-cols-1 md:grid-cols-2 text-[11px]">
 {/* Left Column: Supplier Bill From */}
 <div className="p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
 <div>
 <div className="text-[10px] uppercase font-bold text-ink-secondary mb-1">
 Supplier (Bill from)
 </div>
 <div className="font-black text-xs sm:text-sm text-black">
 {vendorDetails.name}
 </div>
 <div className="text-[11px] text-ink whitespace-pre-line mt-0.5 leading-snug">
 {addressStreet && <div>{addressStreet}</div>}
 {addressCityState && <div>{addressCityState}</div>}
 {!addressStreet && !addressCityState && <div>Address not provided</div>}
 </div>
 </div>

 <div className="mt-3 pt-2 border-t border-border-strong font-medium space-y-0.5">
 <div className="flex">
 <span className="w-24 text-ink-secondary">GSTIN/UIN</span>
 <span className="font-mono font-bold text-black">: {vendorGstin || '—'}</span>
 </div>
 </div>
 </div>

 {/* Right Column: Order Details & Logistics Meta Grid */}
 <div className="text-[11px]">
 {/* Row 1: Voucher No & Dated */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Voucher No.</div>
 <div className="font-mono font-black text-[12px] text-black">{voucherNo}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Dated</div>
 <div className="font-mono font-bold text-[12px] text-black">{orderDate}</div>
 </div>
 </div>

 {/* Row 2: Reference & Payment Terms */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Reference No. &amp; Date.</div>
 <div className="font-mono font-semibold text-black">{referenceNo}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Mode/Terms of Payment</div>
 <div className="font-medium text-black">{paymentTerms || '—'}</div>
 </div>
 </div>

 {/* Row 3: Dispatch & Other References */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Dispatched through</div>
 <div className="font-medium text-black">{dispatchedThrough || '—'}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Other References</div>
 <div className="font-medium text-black">{otherReferences || '—'}</div>
 </div>
 </div>

 {/* Row 4: Terms of Delivery & Destination */}
 <div className="grid grid-cols-2 divide-x divide-black">
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Terms of Delivery</div>
 <div className="font-medium text-black">{termsOfDelivery || '—'}</div>
 </div>
 <div className="p-1.5 px-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Destination</div>
 <div className="font-medium text-black">{destination || '—'}</div>
 </div>
 </div>
 </div>
 </div>

 {/* Ordered Goods Table */}
 <div className="border border-black border-t-0">
 <table className="w-full table-fixed text-[10px] border-collapse">
 <colgroup>
 <col style={{ width: '4%' }} /><col style={{ width: '25%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} />
 <col style={{ width: '9%' }} /><col style={{ width: '7%' }} /><col style={{ width: '9%' }} /><col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '15%' }} />
 </colgroup>
 <thead>
 <tr className="border-b border-black bg-muted font-bold text-[10px] uppercase text-black text-center">
 <th className="border-r border-black p-1.5 w-10">Sl<br />No.</th>
 <th className="border-r border-black p-1.5 text-left min-w-[200px]">Description of Goods</th>
 <th className="border-r border-black p-1.5 w-20">HSN/SAC</th>
 <th className="border-r border-black p-1.5 w-20">Due on</th>
 <th className="border-r border-black p-1.5 text-right">Quantity</th>
 <th className="border-r border-black p-1.5 text-center">UOM</th>
 <th className="border-r border-black p-1.5 w-16 text-right">Rate</th>
 <th className="border-r border-black p-1.5 w-12 text-center">per</th>
 <th className="border-r border-black p-1.5 w-14 text-right">Disc. %</th>
 <th className="p-1.5 w-24 text-right">Amount</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {lines.map((line, idx) => {
 const itemDesc =
 line.product?.name ||
 line.material?.name ||
 (line.product?.sku ? `Product ${line.product.sku}` : '') ||
 (line.material?.code ? `Material ${line.material.code}` : '') ||
 '';

 const hsnSac =
 line.hsnSac ||
 ((line.material?.specs as Record<string, unknown>)?.hsnCode as string | undefined) ||
 ((line.material?.specs as Record<string, unknown>)?.hsn as string | undefined) ||
 ((line.product as Record<string, unknown>)?.metadata ? ((line.product as { metadata?: Record<string, unknown> }).metadata?.hsnCode as string | undefined) || ((line.product as { metadata?: Record<string, unknown> }).metadata?.hsn as string | undefined) : undefined) ||
 '—';

 const dueOn = line.needDate ? formatIndianDate(line.needDate) : po.createdAt ? formatIndianDate(po.createdAt) : '—';
 const qtyFormatted = Number(line.quantity || 0).toLocaleString('en-IN');
 const rate = Number(line.unitPrice || 0).toFixed(2);
 const uomSymbol = line.uom?.symbol || line.uom?.code || '—';
 const lineAmount = Number(
 line.lineTotal ?? Number(line.quantity || 0) * Number(line.unitPrice || 0)
 );

 return (
 <tr key={line.id || idx} className="text-black align-top font-medium">
 <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">
 <div>{itemDesc}</div>
 {(line.product?.sku || line.material?.code) && (
 <div className="text-[9.5px] font-mono font-normal text-ink-secondary">
 {line.product?.sku || line.material?.code}
 </div>
 )}
 </td>
 <td className="border-r border-black p-1.5 text-center font-mono">{hsnSac}</td>
 <td className="border-r border-black p-1.5 text-center font-mono">{dueOn}</td>
 <td className="border-r border-black p-1.5 text-right font-mono font-bold">{qtyFormatted}</td>
 <td className="border-r border-black p-1.5 text-center">{uomSymbol}</td>
 <td className="border-r border-black p-1.5 text-right font-mono">{rate}</td>
 <td className="border-r border-black p-1.5 text-center">{uomSymbol}</td>
 <td className="border-r border-black p-1.5 text-right font-mono">—</td>
 <td className="p-1.5 text-right font-mono font-bold">
 {lineAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </td>
 </tr>
 );
 })}

 {/* Tax Sub-Rows */}
 {isIntraState && (cgstAmount > 0 || totalTax > 0) && (
 <>
 <tr className="text-black align-top">
 <td className="border-r border-black p-1 text-center"></td>
 <td className="border-r border-black p-1 font-bold pl-12">C-GST</td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="p-1 text-right font-mono font-bold">
 {(cgstAmount || totalTax / 2).toLocaleString('en-IN', {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 })}
 </td>
 </tr>
 <tr className="text-black align-top">
 <td className="border-r border-black p-1 text-center"></td>
 <td className="border-r border-black p-1 font-bold pl-12">S-GST</td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="p-1 text-right font-mono font-bold">
 {(sgstAmount || totalTax / 2).toLocaleString('en-IN', {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 })}
 </td>
 </tr>
 </>
 )}

 {!isIntraState && igstAmount > 0 && (
 <tr className="text-black align-top">
 <td className="border-r border-black p-1 text-center"></td>
 <td className="border-r border-black p-1 font-bold pl-12">I-GST</td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="border-r border-black p-1"></td>
 <td className="p-1 text-right font-mono font-bold">
 {igstAmount.toLocaleString('en-IN', {
 minimumFractionDigits: 2,
 maximumFractionDigits: 2,
 })}
 </td>
 </tr>
 )}

 {/* Spacer rows if few items or empty message */}
 {lines.length === 0 ? (
 <tr>
 <td colSpan={10} className="border-r border-black p-4 text-center text-ink-secondary italic">
 No line items recorded for this purchase order.
 </td>
 </tr>
 ) : lines.length < 3 ? (
 <tr className="h-10 text-transparent select-none">
 <td className="border-r border-black">.</td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td className="border-r border-black"></td>
 <td></td>
 </tr>
 ) : null}
 </tbody>
 <tfoot>
 <tr className="border-t-2 border-black bg-muted font-bold text-black text-xs">
 <td className="border-r border-black p-1.5 text-center"></td>
 <td className="border-r border-black p-1.5 text-right font-bold uppercase">Total</td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5 text-right font-mono font-black">{quantitySummary}</td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5"></td>
 <td className="p-1.5 text-right font-mono font-black text-[13px]">
 {formatINR(grandTotal)}
 </td>
 </tr>
 </tfoot>
 </table>
 </div>

 {/* Footer Summary: Amount in Words & E. & O.E */}
 <div className="border border-black border-t-0 p-2 text-[11px] flex justify-between items-start">
 <div className="max-w-[70%]">
 <span className="text-[10px] uppercase font-bold text-ink-secondary block">Amount Chargeable (in words)</span>
 <span className="font-bold text-black text-xs sm:text-sm">{wordsAmount}</span>
 </div>
 <div className="font-bold text-black text-xs italic text-right">
 E. &amp; O.E
 </div>
 </div>

 {/* Signatory Box */}
 <div className="border border-black border-t-0 grid grid-cols-1 md:grid-cols-2 text-[11px]">
 <div className="p-4 hidden md:block"></div>
 <div className="p-3 text-right flex flex-col justify-between h-28 border-t md:border-t-0 md:border-l border-black">
 <div className="font-bold text-black text-xs">
 for PLINTH {COMPANY_INFO.financialYear}
 </div>
 <div className="pt-8 text-black font-semibold text-[11px] border-t border-border-strong w-48 ml-auto text-center">
 Authorised Signatory
 </div>
 </div>
 </div>

 {/* Bottom Jurisdiction */}
 <div className="text-center pt-2 font-bold text-[10px] uppercase tracking-wider text-black">
 {COMPANY_INFO.jurisdiction}
 </div>
 </div>
 );
 }
);

PurchaseOrderPDF.displayName = 'PurchaseOrderPDF';
