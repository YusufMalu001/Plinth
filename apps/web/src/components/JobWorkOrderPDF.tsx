import React from 'react';
import type { JobWorkOrderDto } from '@synergy/types';
import {
  formatIndianDate,
  SYNERGY_COMPANY_INFO,
  getVendorDisplayDetails,
} from '../features/purchases/utils';

export interface JobWorkOrderPDFProps {
  order: JobWorkOrderDto;
  isPrintPreview?: boolean;
}

export const JobWorkOrderPDF = React.forwardRef<HTMLDivElement, JobWorkOrderPDFProps>(
  ({ order, isPrintPreview = false }, ref) => {
    const lines = order?.lines || [];

    // Vendor details
    const vendorDetails = getVendorDisplayDetails(order?.vendor);
    const vendorGstin = vendorDetails.gstin !== '—' ? vendorDetails.gstin : '';

    const addressStreet =
      vendorDetails.street ||
      (vendorDetails.cityStateZip ? '' : vendorDetails.fullAddress !== 'Address not provided' ? vendorDetails.fullAddress : '');
    const addressCityState = vendorDetails.cityStateZip || '';

    // Order voucher details
    const voucherNo = order?.orderNumber || '';
    const orderDate = order?.createdAt ? formatIndianDate(order.createdAt) : '';
    const referenceNo = order?.purchaseOrder?.poNumber
      ? `${order.purchaseOrder.poNumber} & ${orderDate}`
      : voucherNo;

    const deliveryLocation = order?.deliveryLocation?.name || 'Main Store (MAIN-STORE)';
    const natureOfProcessing = order?.natureOfProcessing || 'Machining & Outsourced Processing';

    // Quantity calculations
    const primaryUom = order?.targetUom?.symbol || order?.targetUom?.code || 'Units';
    const totalTargetQty = order?.targetQuantity || 0;

    return (
      <div
        ref={ref}
        data-printable="true"
        className={`printable-document print-target w-full bg-white text-slate-900 font-sans select-text ${
          isPrintPreview
            ? 'p-0 max-w-[800px] mx-auto text-xs leading-tight'
            : 'p-4 sm:p-8 max-w-[850px] mx-auto text-[12px] leading-normal shadow-sm border border-slate-200'
        } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-[800px] print:block print:visible`}
        style={{ colorScheme: 'light', visibility: 'visible' }}
      >
        {/* Top Header: Title */}
        <div className="text-center pb-2 relative">
          <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-black">
            JOB WORK ORDER
          </h1>
        </div>

        {/* Company Header with Synergy Logo and Address (Identical to PO PDF) */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3 pt-1">
          <div className="flex items-center gap-3">
            <img
              src="/synergy.png"
              alt="Synergy Logo"
              className="h-10 sm:h-12 w-auto object-contain shrink-0"
            />
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-black uppercase">
                {SYNERGY_COMPANY_INFO.name}
              </h2>
              <p className="text-[10.5px] leading-snug text-slate-800 font-medium">
                {SYNERGY_COMPANY_INFO.addressLine1}
              </p>
              <p className="text-[10.5px] leading-snug text-slate-800 font-medium">
                {SYNERGY_COMPANY_INFO.addressLine2}
              </p>
              <p className="text-[10.5px] leading-snug text-slate-800 font-medium">
                {SYNERGY_COMPANY_INFO.addressLine3}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 text-[10.5px] font-semibold text-slate-900 pt-0.5">
                <span>📞 {SYNERGY_COMPANY_INFO.phone}</span>
                <span>✉ {SYNERGY_COMPANY_INFO.email}</span>
              </div>
              <p className="pt-0.5 text-[10px] font-semibold text-slate-900">
                GSTIN/UIN: {SYNERGY_COMPANY_INFO.gstin}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Master ERP Grid Box (Matching PO PDF exactly) */}
        <div className="border border-black grid grid-cols-1 md:grid-cols-2 text-[11px]">
          {/* Left Column: Job Worker (Outsource Partner) */}
          <div className="p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-600 mb-1">
                Outsource Partner / Job Worker
              </div>
              <div className="font-black text-xs sm:text-sm text-black">
                {vendorDetails.name}
              </div>
              <div className="text-[11px] text-slate-800 whitespace-pre-line mt-0.5 leading-snug">
                {addressStreet && <div>{addressStreet}</div>}
                {addressCityState && <div>{addressCityState}</div>}
                {!addressStreet && !addressCityState && <div>Address not provided</div>}
              </div>
              {order?.vendor?.contactEmail && (
                <div className="text-[10.5px] text-slate-700 mt-1">
                  ✉ {order.vendor.contactEmail}
                </div>
              )}
              {order?.vendor?.contactPhone && (
                <div className="text-[10.5px] text-slate-700">
                  📞 {order.vendor.contactPhone}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-300 font-medium space-y-0.5">
              <div className="flex">
                <span className="w-24 text-slate-700">GSTIN/UIN</span>
                <span className="font-mono font-bold text-black">: {vendorGstin || '—'}</span>
              </div>
              <div className="flex">
                <span className="w-24 text-slate-700">Vendor Code</span>
                <span className="font-mono font-semibold text-black">: {order?.vendor?.code || '—'}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Order Details & Logistics Meta Grid */}
          <div className="text-[11px]">
            {/* Row 1: Order No & Dated */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Job Work Order No.</div>
                <div className="font-mono font-black text-[12px] text-black">{voucherNo}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Dated</div>
                <div className="font-mono font-bold text-[12px] text-black">{orderDate}</div>
              </div>
            </div>

            {/* Row 2: Reference & Status */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Linked Purchase Order</div>
                <div className="font-mono font-semibold text-black">{referenceNo}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Order Status</div>
                <div className="font-bold text-black">{order.status}</div>
              </div>
            </div>

            {/* Row 3: Nature of Processing & Scrap Allowance */}
            <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Nature of Processing</div>
                <div className="font-medium text-black">{natureOfProcessing}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Expected Scrap Rate</div>
                <div className="font-mono font-semibold text-black">{order.expectedScrapRate ?? 0}%</div>
              </div>
            </div>

            {/* Row 4: Delivery Location & Target Product */}
            <div className="grid grid-cols-2 divide-x divide-black">
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Delivery Destination</div>
                <div className="font-medium text-black">{deliveryLocation}</div>
              </div>
              <div className="p-1.5 px-2">
                <div className="text-[9.5px] uppercase font-bold text-slate-600">Target Output SKU</div>
                <div className="font-mono font-bold text-black">{order.product?.sku || 'Custom Assembly'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Output Specification Banner */}
        <div className="border border-black border-t-0 bg-slate-50 p-2.5 flex justify-between items-center text-[11px]">
          <div>
            <span className="text-[9.5px] uppercase font-bold text-slate-600 block">Target Manufactured Item</span>
            <span className="font-black text-black text-xs sm:text-sm">
              {order.product?.name || order.product?.sku || 'Processed Product'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[9.5px] uppercase font-bold text-slate-600 block">Ordered Output Qty</span>
            <span className="font-mono font-black text-xs sm:text-sm text-black">
              {totalTargetQty.toLocaleString('en-IN')} {primaryUom}
            </span>
          </div>
        </div>

        {/* Bill of Materials / Raw Material Input Table */}
        <div className="border border-black border-t-0">
          <table className="w-full table-fixed text-[10px] border-collapse">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-black bg-slate-100 font-bold text-[10px] uppercase text-black text-center">
                <th className="border-r border-black p-1.5">Sl<br />No.</th>
                <th className="border-r border-black p-1.5 text-left">Raw Material / Component Description</th>
                <th className="border-r border-black p-1.5 text-right">Required Qty</th>
                <th className="border-r border-black p-1.5 text-right">Allocated Qty</th>
                <th className="border-r border-black p-1.5 text-center">UOM</th>
                <th className="p-1.5 text-right">Issued to Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-r border-black p-4 text-center text-slate-500 italic">
                    No individual BOM lines configured. Total raw material input allocation: {order.rawMaterialInputQty} MT / Units.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const itemDesc =
                    line.material?.name ||
                    line.product?.name ||
                    (line.material?.code ? `Material ${line.material.code}` : '') ||
                    (line.product?.sku ? `Product ${line.product.sku}` : '') ||
                    'Raw Material';

                  const itemCode = line.material?.code || line.product?.sku || '';
                  const uomLabel = line.uom?.symbol || line.uom?.code || primaryUom;
                  const reqQty = Number(line.requiredQuantity || 0).toLocaleString('en-IN');
                  const allocQty = Number(line.allocatedQuantity || 0).toLocaleString('en-IN');
                  const issuedQty = Number(line.issuedQuantity || 0).toLocaleString('en-IN');

                  return (
                    <tr key={line.id || idx} className="text-black align-top font-medium">
                      <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
                      <td className="border-r border-black p-1.5 font-bold uppercase">
                        <div>{itemDesc}</div>
                        {itemCode && (
                          <div className="text-[9.5px] font-mono font-normal text-slate-600">
                            {itemCode}
                          </div>
                        )}
                        {line.notes && (
                          <div className="text-[9px] font-normal text-slate-500 italic">
                            {line.notes}
                          </div>
                        )}
                      </td>
                      <td className="border-r border-black p-1.5 text-right font-mono font-bold">{reqQty}</td>
                      <td className="border-r border-black p-1.5 text-right font-mono font-bold text-amber-700">{allocQty}</td>
                      <td className="border-r border-black p-1.5 text-center">{uomLabel}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-emerald-700">{issuedQty}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-slate-50 font-bold text-black text-xs">
                <td className="border-r border-black p-1.5 text-center"></td>
                <td className="border-r border-black p-1.5 text-right font-bold uppercase">Total Allocation</td>
                <td className="border-r border-black p-1.5 text-right font-mono">
                  {lines.reduce((s, l) => s + Number(l.requiredQuantity || 0), 0).toLocaleString('en-IN')}
                </td>
                <td className="border-r border-black p-1.5 text-right font-mono font-black text-amber-700">
                  {lines.reduce((s, l) => s + Number(l.allocatedQuantity || 0), 0).toLocaleString('en-IN') || order.rawMaterialInputQty}
                </td>
                <td className="border-r border-black p-1.5 text-center">{primaryUom}</td>
                <td className="p-1.5 text-right font-mono font-black text-emerald-700">
                  {lines.reduce((s, l) => s + Number(l.issuedQuantity || 0), 0).toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes & Special Instructions */}
        <div className="border border-black border-t-0 p-2.5 text-[11px] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-600 block">Processing &amp; Delivery Instructions:</span>
          <p className="font-medium text-slate-900 leading-relaxed">
            {order.notes || 'Raw material allocated from vendor deposit. Standard delivery in 14 days. Defective goods must be replaced by vendor without additional custody deduction.'}
          </p>
          <p className="text-[10px] text-slate-600 italic">
            * Material dispatched under Rule 55 Delivery Challan remains the property of Synergy International held in vendor custody.
          </p>
        </div>

        {/* Signatory Box (Identical to PO PDF) */}
        <div className="border border-black border-t-0 grid grid-cols-1 md:grid-cols-2 text-[11px]">
          <div className="p-3 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-600">Job Worker Acknowledgement</span>
            <div className="pt-10 text-slate-600 font-semibold text-[10px] border-t border-slate-300 w-48 text-center">
              Authorised Signatory &amp; Stamp
            </div>
          </div>
          <div className="p-3 text-right flex flex-col justify-between h-28">
            <div className="font-bold text-black text-xs">
              for SYNERGY INTERNATIONAL {SYNERGY_COMPANY_INFO.financialYear}
            </div>
            <div className="pt-8 text-black font-semibold text-[11px] border-t border-slate-300 w-48 ml-auto text-center">
              Authorised Signatory
            </div>
          </div>
        </div>

        {/* Bottom Jurisdiction */}
        <div className="text-center pt-2 font-bold text-[10px] uppercase tracking-wider text-black">
          {SYNERGY_COMPANY_INFO.jurisdiction}
        </div>
      </div>
    );
  }
);

JobWorkOrderPDF.displayName = 'JobWorkOrderPDF';
