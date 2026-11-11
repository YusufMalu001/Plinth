import React from 'react';
import type { JobWorkMaterialIssueDto } from '@plinth/types';

export interface JobWorkChallanPDFProps {
  challan: JobWorkMaterialIssueDto;
  isPrintPreview?: boolean;
}

export const JobWorkChallanPDF = React.forwardRef<HTMLDivElement, JobWorkChallanPDFProps>(
  ({ challan, isPrintPreview = false }, ref) => {
    if (!challan) return null;

    return (
      <div
        ref={ref}
        data-printable="true"
        className={`printable-document print-target w-full bg-white text-slate-900 font-manrope ${
          isPrintPreview
            ? 'p-8 max-w-4xl mx-auto shadow-xl border border-slate-200'
            : 'p-8 w-full'
        } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-full print:block print:visible`}
        style={{ colorScheme: 'light', visibility: 'visible' }}
      >
        {/* Header with Plinth Branding */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#173796]">PLINTH</h1>
            <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider mt-0.5">
              Industrial Manufacturing & Outsourcing Division
            </p>
            <div className="text-xs text-slate-500 mt-2 space-y-0.5">
              <p>Plot 42, Heavy Industrial Estate, Phase II</p>
              <p>GSTIN: 27AABCS1429B1Z8 | PAN: AABCS1429B</p>
              <p>Email: operations@plinth.example</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-mono font-black text-slate-900">{challan.challanNumber}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Date: {new Date(challan.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Dispatch & Consignee Information */}
        <div className="grid grid-cols-2 gap-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60 mb-6 text-xs">
          <div>
            <h3 className="font-extrabold uppercase text-[#173796] mb-1.5">Dispatched From (Sender)</h3>
            <div className="font-bold text-slate-900">{challan.dispatchLocation?.name || 'Central Manufacturing Plant'}</div>
            <div className="text-slate-600 mt-0.5">Location Code: {challan.dispatchLocation?.code}</div>
            <div className="text-slate-600">Material Ownership: <strong>Plinth (Held in Vendor Custody)</strong></div>
          </div>
          <div>
            <h3 className="font-extrabold uppercase text-[#173796] mb-1.5">Outsource Vendor (Consignee)</h3>
            <div className="font-bold text-slate-900">{challan.vendor?.name}</div>
            <div className="text-slate-600 mt-0.5">Vendor Code: {challan.vendor?.code}</div>
            <div className="text-slate-600">Nature of Transaction: Job Work Processing / Outsource</div>
          </div>
        </div>

        {/* Transport & Vehicle Details */}
        <div className="grid grid-cols-3 gap-4 p-3 rounded-lg border border-slate-200 bg-white mb-6 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Vehicle / Lorry No:</span>
            <div className="font-bold text-slate-900 mt-0.5">{challan.vehicleNumber || '—'}</div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Transporter Name:</span>
            <div className="font-bold text-slate-900 mt-0.5">{challan.transporterName || '—'}</div>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Driver Contact:</span>
            <div className="font-bold text-slate-900 mt-0.5">{challan.driverContact || '—'}</div>
          </div>
        </div>

        {/* Dispatched Material Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Material / Item Description</th>
                <th className="p-3">HSN/SAC</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">UOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="p-3 font-bold">1</td>
                <td className="p-3">
                  <div className="font-extrabold text-slate-900">
                    {challan.material?.name || challan.product?.name || 'Raw Material for Processing'}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Item Code: {challan.material?.code || challan.product?.sku}
                  </div>
                </td>
                <td className="p-3 font-mono text-slate-600">7204</td>
                <td className="p-3 text-right font-black text-slate-900 text-sm">
                  {challan.quantity.toLocaleString('en-IN')}
                </td>
                <td className="p-3 text-right font-bold text-slate-700">
                  {challan.uom?.symbol || challan.uom?.code || 'MT'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Declaration and Statutory Statements */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 mb-8 text-[11px] text-slate-600 space-y-1.5">
          <p className="font-bold text-slate-800 uppercase tracking-wide">Job Work Statutory Declaration (Under Section 143 of CGST Act):</p>
          <p>
            1. The goods dispatched under this delivery challan are for Job Work processing only and NOT FOR SALE.
          </p>
          <p>
            2. Ownership of the raw material remains exclusively with Plinth throughout transit and processing custody.
          </p>
          <p>
            3. The processed output and any resultant scrap/wastage must be returned to Plinth in accordance with agreed specifications.
          </p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-8 pt-6 border-t border-slate-300 text-xs">
          <div className="text-center">
            <div className="h-14 flex items-end justify-center font-bold text-slate-700">
              {challan.issuedBy?.name || 'Store Manager'}
            </div>
            <div className="border-t border-slate-400 pt-1 font-extrabold text-slate-900">
              Prepared / Dispatched By
            </div>
          </div>
          <div className="text-center">
            <div className="h-14 flex items-end justify-center font-bold text-slate-700">
              {challan.driverContact ? 'Verified' : '—'}
            </div>
            <div className="border-t border-slate-400 pt-1 font-extrabold text-slate-900">
              Transporter / Driver Sign
            </div>
          </div>
          <div className="text-center">
            <div className="h-14 flex items-end justify-center font-bold text-slate-700">
              Pending Gate Entry
            </div>
            <div className="border-t border-slate-400 pt-1 font-extrabold text-slate-900">
              Vendor Receiver Seal & Sign
            </div>
          </div>
        </div>
      </div>
    );
  }
);

JobWorkChallanPDF.displayName = 'JobWorkChallanPDF';
