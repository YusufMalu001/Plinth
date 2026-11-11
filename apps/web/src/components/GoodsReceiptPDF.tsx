import React from 'react';
import type { Grn, GrnLine } from '../features/goods-receipt/api';
import {
  formatINR,
  formatIndianDate,
  numberToIndianWords,
  COMPANY_INFO,
  getVendorDisplayDetails,
} from '../features/purchases/utils';

export interface GoodsReceiptPDFProps {
  grn: Grn;
  isPrintPreview?: boolean;
}

export const GoodsReceiptPDF = React.forwardRef<HTMLDivElement, GoodsReceiptPDFProps>(
  ({ grn, isPrintPreview = false }, ref) => {
    const lines: GrnLine[] = grn?.lines || [];

    // Aggregates
    const totalExpected = lines.reduce((sum: number, l: GrnLine) => sum + (l.expectedQuantity ?? 0), 0);
    const totalReceived = lines.reduce((sum: number, l: GrnLine) => sum + (l.receivedQuantity || 0), 0);
    const totalAccepted = lines.reduce((sum: number, l: GrnLine) => sum + (l.acceptedQuantity || 0), 0);
    const totalRejected = lines.reduce((sum: number, l: GrnLine) => sum + (l.rejectedQuantity || 0), 0);
    const totalDamaged = lines.reduce((sum: number, l: GrnLine) => sum + (l.damagedQuantity || 0), 0);
    const totalShort = lines.reduce((sum: number, l: GrnLine) => sum + (l.shortQuantity || 0), 0);

    const totalAcceptedValue = lines.reduce(
      (sum: number, l: GrnLine) => sum + Number(l.acceptedQuantity || 0) * Number(l.invoiceUnitPrice ?? l.poLine?.unitPrice ?? 0),
      0
    );
    const totalDebitValue = lines.reduce(
      (sum: number, l: GrnLine) =>
        sum +
        (Number(l.shortQuantity || 0) + Number(l.rejectedQuantity || 0) + Number(l.damagedQuantity || 0)) *
          Number(l.invoiceUnitPrice ?? l.poLine?.unitPrice ?? 0),
      0
    );

    // Vendor Details & Address
    const vendorDetails = getVendorDisplayDetails(grn?.vendor);
    const vendorGstin = vendorDetails.gstin !== '—' ? vendorDetails.gstin : '';
    const stateName = vendorDetails.stateName !== '—' ? vendorDetails.stateName : '';
    const stateCode =
      vendorDetails.stateCode !== '—'
        ? vendorDetails.stateCode
        : vendorGstin.length >= 2
        ? vendorGstin.slice(0, 2)
        : '';

    const addressStreet =
      vendorDetails.street ||
      (vendorDetails.cityStateZip ? '' : vendorDetails.fullAddress !== 'Address not provided' ? vendorDetails.fullAddress : '');
    const addressCityState = vendorDetails.cityStateZip || '';

    // Supplier invoice is stored as an attachment; values are manually verified.
    const allDocs = grn?.documents || [];
    const invoiceNumber =
      allDocs[0]?.fileName ||
      (grn as unknown as { invoiceNumber?: string })?.invoiceNumber ||
      '';

    const poNumber = grn?.po?.poNumber || '—';
    const poDate = (grn?.po as unknown as { createdAt?: string })?.createdAt ? formatIndianDate((grn?.po as unknown as { createdAt?: string })?.createdAt) : '—';
    const destination = grn?.location?.name || 'Main Warehouse / Receiving Bay';
    const primaryUom = lines[0]?.uom?.symbol || lines[0]?.uom?.code || '';
    const wordsAmount = numberToIndianWords(totalAcceptedValue);

    return (
      <div
        ref={ref}
        data-printable="true"
        className={`printable-document print-target w-full bg-white text-slate-900 font-sans select-text ${
          isPrintPreview
            ? 'p-0 max-w-[800px] mx-auto text-xs leading-tight'
            : 'p-4 sm:p-8 max-w-[850px] mx-auto text-[11px] leading-normal shadow-sm border border-slate-200'
        } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-[800px] print:block print:visible`}
        style={{ colorScheme: 'light', visibility: 'visible' }}
      >
        {/* Top Header: Title */}
        <div className="text-center pb-2 relative">
          <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-black">
            GOODS RECEIPT NOTE (GRN)
          </h1>
          <p className="text-[9.5px] uppercase tracking-widest text-slate-600 font-bold">
            Physical Inward &amp; Quality Inspection Record
          </p>
        </div>

        {/* Company Header with Plinth Logo and Address */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">Plinth</span>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-black uppercase">
                {COMPANY_INFO.name}
              </h2>
              <p className="text-[10px] leading-snug text-slate-800 font-medium">
                {COMPANY_INFO.addressLine1}
              </p>
              <p className="text-[10px] leading-snug text-slate-800 font-medium">
                {COMPANY_INFO.addressLine2}
              </p>
              <p className="text-[10px] leading-snug text-slate-800 font-medium">
                {COMPANY_INFO.addressLine3}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 text-[10px] font-semibold text-slate-900 pt-0.5">
                <span>GSTIN: {COMPANY_INFO.gstin}</span>
                <span>📞 {COMPANY_INFO.phone}</span>
                <span>✉ {COMPANY_INFO.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Master ERP Grid Box */}
        <div className="border border-black grid grid-cols-1 md:grid-cols-2 text-[11px]">
          {/* Left Column: Supplier / Consignor */}
          <div className="p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
            <div>
              <div className="text-[9.5px] uppercase font-bold text-slate-600 mb-1">
                Supplier (Dispatched by)
              </div>
              <div className="font-black text-xs sm:text-sm text-black">
                {vendorDetails.name}
              </div>
              {grn?.vendor?.code && (
                <div className="text-[10px] font-mono text-slate-700">
                  Vendor Code: {grn.vendor.code}
                </div>
              )}
              <div className="text-[10.5px] text-slate-800 whitespace-pre-line mt-0.5 leading-snug">
                {addressStreet && <div>{addressStreet}</div>}
                {addressCityState && <div>{addressCityState}</div>}
                {!addressStreet && !addressCityState && <div>Address not provided</div>}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-300 font-medium space-y-0.5 text-[10.5px]">
              <div className="flex">
                <span className="w-24 text-slate-700">GSTIN/UIN</span>
                <span className="font-mono font-bold text-black">: {vendorGstin || '—'}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-slate-700">State Name</span>
                <span className="font-semibold text-black">
                  : {stateName || '—'}{stateCode ? `, Code : ${stateCode}` : ''}
                </span>
              </div>
              {invoiceNumber && (
                <div className="flex pt-0.5">
                  <span className="w-24 text-slate-700">Challan / Inv.</span>
                  <span className="font-mono font-bold text-black">: {invoiceNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: GRN Details & Logistics Meta Grid */}
          <div className="text-[11px]">
            {/* Row 1: GRN Number & Received Date */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">GRN Number</div>
                <div className="font-mono font-black text-[12px] text-black">{grn.grnNumber}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Received Date</div>
                <div className="font-mono font-bold text-[12px] text-black">
                  {formatIndianDate(grn.receivedAt)}
                </div>
              </div>
            </div>

            {/* Row 2: Purchase Order Reference & Date */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Purchase Order</div>
                <div className="font-mono font-bold text-[11px] text-black">{poNumber}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">PO Date</div>
                <div className="font-mono font-medium text-[11px] text-black">{poDate}</div>
              </div>
            </div>

            {/* Row 3: Destination & Verification Date */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Receiving Bay / Store</div>
                <div className="font-semibold text-black">{destination}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Verified Date</div>
                <div className="font-mono text-black">
                  {grn.verifiedAt ? formatIndianDate(grn.verifiedAt) : 'Under Verification'}
                </div>
              </div>
            </div>

            {/* Row 4: Status & Inward Quality */}
            <div className="grid grid-cols-2 divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Inward Status</div>
                <div className="font-bold uppercase text-black">{grn.status.replaceAll('_', ' ')}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9px] uppercase font-bold text-slate-600">Quality Inspection</div>
                <div className="font-medium text-black">
                  {totalRejected > 0 || totalDamaged > 0 || totalShort > 0 ? (
                    <span className="font-bold text-rose-700">Variances Recorded</span>
                  ) : (
                    <span className="font-bold text-emerald-800">100% Accepted</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Received Goods Table */}
        <div className="border border-black border-t-0 overflow-x-auto">
          <table className="w-full text-[10.5px] border-collapse">
            <thead>
              <tr className="border-b border-black bg-slate-100 font-bold text-[9.5px] uppercase text-black text-center">
                <th className="border-r border-black p-1.5 w-8">Sl<br />No.</th>
                <th className="border-r border-black p-1.5 text-left min-w-[160px]">Description of Goods</th>
                <th className="border-r border-black p-1.5 w-16">HSN/SAC</th>
                <th className="border-r border-black p-1.5 w-14 text-right">Ordered</th>
                <th className="border-r border-black p-1.5 w-14 text-right">Received</th>
                <th className="border-r border-black p-1.5 w-14 text-right">Accepted</th>
                <th className="border-r border-black p-1.5 w-16 text-right">Rejected / Damage</th>
                <th className="border-r border-black p-1.5 w-12 text-right">Short</th>
                <th className="border-r border-black p-1.5 w-16 text-right">Rate (₹)</th>
                <th className="p-1.5 w-20 text-right">Accepted Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line: GrnLine, idx: number) => {
                const item = line.product || line.material;
                const itemDesc = item?.name || (line.product?.sku ? `Product ${line.product.sku}` : '') || (line.material?.code ? `Material ${line.material.code}` : '') || 'Item';
                const code = line.product?.sku || line.material?.code || '';
                const uom = line.uom?.symbol || line.uom?.code || '';
                const hsnSac = (line as unknown as { hsnSac?: string }).hsnSac || '—';
                const rate = Number(line.invoiceUnitPrice ?? line.poLine?.unitPrice ?? 0);
                const lineVal = Number(line.acceptedQuantity || 0) * rate;

                return (
                  <tr key={line.id || idx} className="text-black align-top font-medium">
                    <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
                    <td className="border-r border-black p-1.5">
                      <div className="font-bold uppercase text-[10.5px] leading-tight">{itemDesc}</div>
                      <div className="text-[9px] font-mono text-slate-600">
                        {code ? `${code} · ` : ''}{uom}
                      </div>
                    </td>
                    <td className="border-r border-black p-1.5 text-center font-mono">{hsnSac}</td>
                    <td className="border-r border-black p-1.5 text-right font-mono">{line.expectedQuantity ?? '—'}</td>
                    <td className="border-r border-black p-1.5 text-right font-mono">{line.receivedQuantity}</td>
                    <td className="border-r border-black p-1.5 text-right font-mono font-bold text-black bg-slate-50/50">
                      {line.acceptedQuantity}
                    </td>
                    <td className="border-r border-black p-1.5 text-right font-mono text-slate-700">{Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0)}</td>
                    <td className="border-r border-black p-1.5 text-right font-mono text-slate-700">{line.shortQuantity}</td>
                    <td className="border-r border-black p-1.5 text-right font-mono">{rate > 0 ? rate.toFixed(2) : '—'}</td>
                    <td className="p-1.5 text-right font-mono font-bold">
                      {lineVal > 0 ? lineVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </td>
                  </tr>
                );
              })}

              {/* Spacer rows if few items */}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border-r border-black p-4 text-center text-slate-500 italic">
                    No received items recorded for this goods receipt note.
                  </td>
                </tr>
              ) : lines.length < 2 ? (
                <tr className="h-8 text-transparent select-none">
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
              <tr className="border-t-2 border-black bg-slate-50 font-bold text-black text-[11px]">
                <td className="border-r border-black p-1.5 text-center"></td>
                <td className="border-r border-black p-1.5 uppercase font-bold">Total Physical Intake</td>
                <td className="border-r border-black p-1.5"></td>
                <td className="border-r border-black p-1.5 text-right font-mono font-bold">{totalExpected}</td>
                <td className="border-r border-black p-1.5 text-right font-mono font-bold">{totalReceived}</td>
                <td className="border-r border-black p-1.5 text-right font-mono font-black">{totalAccepted}</td>
                <td className="border-r border-black p-1.5 text-right font-mono">{totalRejected + totalDamaged}</td>
                <td className="border-r border-black p-1.5 text-right font-mono">{totalShort}</td>
                <td className="border-r border-black p-1.5"></td>
                <td className="p-1.5 text-right font-mono font-black text-xs">
                  {formatINR(totalAcceptedValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Summary Details: Accepted Value in Words & Potential Claims */}
        <div className="border border-black border-t-0 p-2 text-[10.5px] flex flex-col sm:flex-row justify-between items-start gap-2">
          <div className="max-w-[70%]">
            <span className="text-[9.5px] uppercase font-bold text-slate-600 block">
              Accepted Material Value (in words)
            </span>
            <span className="font-bold text-black text-xs">
              {wordsAmount}
            </span>
            {totalDebitValue > 0 && (
              <p className="mt-1 text-[9.5px] font-semibold text-rose-800">
                *Potential Supplier Debit Value: {formatINR(totalDebitValue)} (Rejected / Damage: {totalRejected + totalDamaged}, Short: {totalShort})
              </p>
            )}
          </div>
          <div className="text-right text-[10px] text-slate-700">
            <div>Ordered / Received / Accepted: <strong className="font-mono text-black">{totalExpected} / {totalReceived} / {totalAccepted} {primaryUom}</strong></div>
            <div className="italic text-slate-600 font-semibold mt-0.5">E. &amp; O.E</div>
          </div>
        </div>

        {/* Signatory Box */}
        <div className="border border-black border-t-0 grid grid-cols-2 text-[11px]">
          <div className="p-3 border-r border-black flex flex-col justify-between h-24">
            <div className="font-bold text-black text-[10.5px]">
              Inspected &amp; Physically Verified By
            </div>
            <div className="pt-6 text-black font-semibold text-[10px] border-t border-slate-300 w-44 text-center">
              Receiving &amp; QC Officer
            </div>
          </div>
          <div className="p-3 text-right flex flex-col justify-between h-24">
            <div className="font-bold text-black text-[10.5px]">
              for PLINTH {COMPANY_INFO.financialYear}
            </div>
            <div className="pt-6 text-black font-semibold text-[10px] border-t border-slate-300 w-44 ml-auto text-center">
              Authorised Receiving Manager
            </div>
          </div>
        </div>

        {/* Bottom Jurisdiction */}
        <div className="text-center pt-2 font-bold text-[9.5px] uppercase tracking-wider text-black">
          {COMPANY_INFO.jurisdiction}
        </div>
      </div>
    );
  }
);

GoodsReceiptPDF.displayName = 'GoodsReceiptPDF';
