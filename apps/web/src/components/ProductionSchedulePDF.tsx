import React from 'react';
import { ProductionPlan } from '../features/production/types';
import { formatIndianDate, COMPANY_INFO } from '../features/purchases/utils';

export interface ProductionSchedulePDFProps {
 data: ProductionPlan;
 isPrintPreview?: boolean;
}

export const ProductionSchedulePDF = React.forwardRef<HTMLDivElement, ProductionSchedulePDFProps>(
 ({ data, isPrintPreview = false }, ref) => {
 if (!data) return null;

 const quantity = Number(data.quantity) || 0;
 const uom = data.product?.uom?.symbol || data.product?.uom?.name || 'Nos.';
 const dateFormatted = data.scheduleDate
 ? new Date(data.scheduleDate).toLocaleDateString('en-US', {
 weekday: 'long',
 day: 'numeric',
 month: 'long',
 year: 'numeric',
 })
 : formatIndianDate(new Date().toISOString());

 const shiftLabel =
 data.scheduleType === 'NIGHT'
 ? '7:00 PM - 9:00 AM (Night Shift)'
 : data.scheduleType === 'GENERAL'
 ? '9:00 AM - 5:30 PM (General Shift)'
 : `${data.scheduleType || 'Day'} Shift (9:00 AM - 5:30 PM)`;

 const department =
 (data as unknown as { targetDepartment?: { name?: string } }).targetDepartment?.name ||
 data.targetDepartmentId ||
 'Accessories + Ironing Mat Dept';

 const productName = data.product?.name || 'Standard Product Item';
 const productCode = data.product?.sku || 'SKU-PENDING';
 const bomLabel = data.bomVersion
 ? `${data.bomVersion.bomNumber} (v${data.bomVersion.version})`
 : 'Standard Formula';

 const lines = (data.bomVersion?.lines && data.bomVersion.lines.length > 0)
 ? data.bomVersion.lines.map((line, idx) => {
 const raw = line as unknown as Record<string, unknown>;
 const lineQuantity = Number(line.quantity) || 0;
 const totalQuantity = raw.quantityMode === 'FIXED' ? lineQuantity : lineQuantity * quantity;
 const lineNote = (line.note || '').trim();
 const name = line.material
 ? line.material.name
 : line.componentProduct
 ? line.componentProduct.name
 : lineNote
 ? lineNote.split(' — ')[0]
 : 'Standard Material';
 const code = line.material
 ? line.material.code
 : line.componentProduct
 ? line.componentProduct.sku
 : `COMP-${idx + 1}`;

 const unitWeight = (raw.weightKg ?? raw.unitWeightKg ?? null) as number | null;
 const systemWeight = unitWeight ? unitWeight * totalQuantity : ((raw.systemWeightKg ?? null) as number | null);
 const correctedWeight = (raw.correctedWeightKg ?? null) as number | null;

 return {
 seq: line.sequence || idx + 1,
 name,
 code,
 lineQuantity,
 totalQuantity,
 uom: line.uom?.symbol || line.uom?.name || 'pcs',
 unitWeight,
 systemWeight,
 correctedWeight,
 note: line.note,
 };
 })
 : (data.requirements || []).map((req, idx) => {
 const totalQuantity = Number(req.requiredQuantity) || 0;
 const lineQuantity = quantity > 0 ? totalQuantity / quantity : totalQuantity;
 return {
 seq: idx + 1,
 name: req.itemName || `Component ${idx + 1}`,
 code: req.itemCode || `COMP-${idx + 1}`,
 lineQuantity: Number(lineQuantity.toFixed(3)),
 totalQuantity,
 uom: req.requiredUom?.symbol || req.requiredUom?.name || 'pcs',
 unitWeight: null,
 systemWeight: null,
 correctedWeight: null,
 note: req.shortageQuantity && Number(req.shortageQuantity) > 0 ? `Shortage: ${req.shortageQuantity}` : null,
 };
 });

 const totalComponentQuantity = lines.reduce((sum, line) => sum + line.totalQuantity, 0);
 const totalSystemWeight = lines.reduce((sum, line) => sum + (line.systemWeight || 0), 0);

 const scheduleMetadata = ((data.product?.metadata as Record<string, unknown> | undefined)?.productionSchedule ||
 {}) as {
 componentTotalLabel?: string;
 productSummaryLabel?: string;
 };

 const componentTotalLabel =
 scheduleMetadata.componentTotalLabel ||
 (lines.some((line) => /\b(pipe|rod|tube)\b/i.test(line.name))
 ? 'TOTAL NO. OF PIPES'
 : 'TOTAL NO. OF COMPONENTS');

 return (
 <div
 ref={ref}
 data-printable="true"
 className={`production-schedule-document printable-document print-target w-full bg-white text-ink font-sans select-text ${
 isPrintPreview
 ? 'p-3 sm:p-5 max-w-[800px] mx-auto text-xs leading-tight'
 : 'p-4 sm:p-8 max-w-[850px] mx-auto text-[11px] leading-normal shadow-none border border-border'
 } print:p-0 print:border-none print:shadow-none print:max-w-none print:w-[800px] print:block print:visible`}
 style={{ colorScheme: 'light', visibility: 'visible' }}
 >
 <style>{`
 @media print {
 @page {
 size: A4 portrait;
 margin: 12mm 10mm 12mm 10mm;
 }
 body {
 print-color-adjust: exact !important;
 }
 .production-schedule-document {
 width: 100% !important;
 max-width: 100% !important;
 border: none !important;
 box-shadow: none !important;
 padding: 0 !important;
 margin: 0 !important;
 background: white !important;
 color: black !important;
 }
 .production-schedule-document table {
 border-collapse: collapse !important;
 width: 100% !important;
 page-break-inside: auto !important;
 break-inside: auto !important;
 }
 .production-schedule-document thead {
 display: table-header-group !important;
 break-inside: avoid !important;
 page-break-inside: avoid !important;
 }
 .production-schedule-document tfoot {
 display: table-row-group !important;
 break-inside: avoid !important;
 page-break-inside: avoid !important;
 }
 .production-schedule-document tr {
 break-inside: avoid !important;
 page-break-inside: avoid !important;
 }
 .production-schedule-document .page-break-avoid,
 .production-schedule-document .signoff-section,
 .production-schedule-document .header-grid,
 .production-schedule-document .metrics-strip {
 break-inside: avoid !important;
 page-break-inside: avoid !important;
 }
 }
 `}</style>

 {/* Top Header: Title & Status */}
 <div className="flex items-center justify-between pb-2 border-b border-border gap-2 page-break-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <div className="w-24 shrink-0" />
 <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-black text-center flex-1">
 PRODUCTION SCHEDULE &amp; SHOP-FLOOR ORDER
 </h1>
 <div className="w-24 shrink-0 text-right">
 {data.status && (
 <span className="inline-block text-[9.5px] font-bold px-2 py-0.5 border border-black uppercase text-black bg-white whitespace-nowrap">
 {data.status.replace(/_/g, ' ')}
 </span>
 )}
 </div>
 </div>
 <div className="flex items-start justify-between border-b-2 border-black pb-3 pt-2">
 <div className="flex items-center gap-3">
 <span className="text-xl sm:text-2xl font-black tracking-tight text-black uppercase">Plinth</span>
 <div>
 <h2 className="text-sm sm:text-base font-black tracking-wide text-black uppercase">
 {COMPANY_INFO.name}
 </h2>
 <p className="text-[10px] leading-snug text-ink font-medium">
 {COMPANY_INFO.addressLine1} {COMPANY_INFO.addressLine2}
 </p>
 <p className="text-[10px] leading-snug text-ink font-medium">
 {COMPANY_INFO.addressLine3}
 </p>
 <div className="flex flex-wrap items-center gap-x-3 text-[10px] font-semibold text-ink pt-0.5">
 <span>📞 {COMPANY_INFO.phone}</span>
 <span>✉ {COMPANY_INFO.email}</span>
 <span>GSTIN: {COMPANY_INFO.gstin}</span>
 </div>
 </div>
 </div>
 </div>

 {/* Master Schedule Header Grid */}
 <div className="border border-black border-t-0 grid grid-cols-2 text-[11px]">
 {/* Left Column: Product & Formula References */}
 <div className="p-2.5 border-r border-black flex flex-col justify-between">
 <div>
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary mb-0.5">Target Product &amp; Specification</div>
 <div className="font-black text-xs sm:text-sm text-black uppercase">{productName}</div>
 <div className="text-[10.5px] font-mono font-bold text-ink mt-0.5">SKU: {productCode}</div>
 </div>
 <div className="text-[10.5px] text-ink leading-snug space-y-1 pt-1 border-t border-border">
 <div>
 <span className="text-ink-secondary">Department:</span> <strong>{department}</strong>
 </div>
 <div>
 <span className="text-ink-secondary">BOM Formula:</span> <span className="font-mono font-bold">{bomLabel}</span>
 </div>
 </div>
 </div>

 {/* Right Column: Schedule & Shift Meta Details */}
 <div className="text-[11px]">
 {/* Row 1: Plan No & Date */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Schedule Plan No.</div>
 <div className="font-mono font-black text-[12px] text-black">{data.planNumber}</div>
 </div>
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Schedule Date</div>
 <div className="font-mono font-bold text-[11px] text-black">{dateFormatted}</div>
 </div>
 </div>

 {/* Row 2: Shift & Incharge */}
 <div className="grid grid-cols-2 border-b border-black divide-x divide-black">
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Shift &amp; Timings</div>
 <div className="font-semibold text-black">{shiftLabel}</div>
 </div>
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Shift Incharge</div>
 <div className="font-bold text-black">{data.incharge || 'Plant Supervisor'}</div>
 </div>
 </div>

 {/* Row 3: Batch Identity & Created By */}
 <div className="grid grid-cols-2 divide-x divide-black">
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Batch Identity / Lot</div>
 <div className="font-mono font-bold text-black">{data.batchIdentity || 'Pending Release'}</div>
 </div>
 <div className="p-2 px-2.5">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Created By</div>
 <div className="font-medium text-black">{data.createdByActor?.name || data.createdByActor?.email || 'Admin'}</div>
 </div>
 </div>
 </div>
 </div>

 {/* Master Output Summary Metrics Strip */}
 <div className="border border-black border-t-0 grid grid-cols-3 text-center text-[11px] bg-muted divide-x divide-black font-bold">
 <div className="p-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Planned Output Qty</div>
 <div className="text-sm font-black font-mono text-black">
 {quantity.toLocaleString('en-IN')} {uom}
 </div>
 </div>
 <div className="p-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">{componentTotalLabel}</div>
 <div className="text-sm font-black font-mono text-black">
 {totalComponentQuantity ? totalComponentQuantity.toLocaleString('en-IN') : '—'} Units
 </div>
 </div>
 <div className="p-2">
 <div className="text-[9.5px] uppercase font-bold text-ink-secondary">Total Material Weight</div>
 <div className="text-sm font-black font-mono text-black">
 {totalSystemWeight > 0 ? `${totalSystemWeight.toFixed(2)} Kgs` : '—'}
 </div>
 </div>
 </div>

 {/* Component Cut-List Table */}
 <div className="border border-black border-t-0 overflow-x-auto print:overflow-visible">
 <table className="w-full text-[10.5px] border-collapse" style={{ pageBreakInside: 'auto', breakInside: 'auto' }}>
 <thead style={{ display: 'table-header-group', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <tr className="border-b border-black bg-muted font-bold text-[9.5px] uppercase text-black text-center" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <th className="border-r border-black p-1.5 w-10">Seq</th>
 <th className="border-r border-black p-1.5 text-left min-w-[200px]">Raw Material / Component Description</th>
 <th className="border-r border-black p-1.5 w-24 text-right">Cut Qty / Unit</th>
 <th className="border-r border-black p-1.5 w-24 text-right">Total Req. Qty</th>
 <th className="border-r border-black p-1.5 w-14 text-center">UOM</th>
 <th className="border-r border-black p-1.5 w-24 text-right">Unit Wt (Kg)</th>
 <th className="border-r border-black p-1.5 w-24 text-right">System Wt (Kg)</th>
 <th className="p-1.5 w-24 text-right">Corrected Wt</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {lines.length ? (
 lines.map((line) => (
 <tr key={line.seq} className="text-black align-top font-medium" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center font-mono">{line.seq}</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">
 <div>{line.name}</div>
 <div className="text-[9px] font-mono font-normal text-ink-secondary">{line.code}</div>
 {line.note && <div className="text-[8.5px] text-ink-secondary font-normal italic mt-0.5">{line.note}</div>}
 </td>
 <td className="border-r border-black p-1.5 text-right font-mono">{line.lineQuantity}</td>
 <td className="border-r border-black p-1.5 text-right font-mono font-black">{line.totalQuantity.toLocaleString('en-IN')}</td>
 <td className="border-r border-black p-1.5 text-center">{line.uom}</td>
 <td className="border-r border-black p-1.5 text-right font-mono">{line.unitWeight !== null ? line.unitWeight.toFixed(3) : '—'}</td>
 <td className="border-r border-black p-1.5 text-right font-mono font-semibold">{line.systemWeight !== null ? line.systemWeight.toFixed(2) : '—'}</td>
 <td className="p-1.5 text-right font-mono">{line.correctedWeight !== null ? line.correctedWeight.toFixed(2) : '—'}</td>
 </tr>
 ))
 ) : (
 <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td colSpan={8} className="p-4 text-center text-ink-secondary italic">
 Standard production component formula active.
 </td>
 </tr>
 )}
 </tbody>
 <tfoot style={{ display: 'table-row-group', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <tr className="border-t-2 border-black bg-muted font-bold text-black text-[11px]" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center"></td>
 <td className="border-r border-black p-1.5 text-right font-bold uppercase">Total Batch Cut Requirements</td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5 text-right font-mono font-black">{totalComponentQuantity.toLocaleString('en-IN')}</td>
 <td className="border-r border-black p-1.5 text-center">Units</td>
 <td className="border-r border-black p-1.5"></td>
 <td className="border-r border-black p-1.5 text-right font-mono font-black">
 {totalSystemWeight > 0 ? `${totalSystemWeight.toFixed(2)} Kg` : '—'}
 </td>
 <td className="p-1.5 text-right font-mono font-black">—</td>
 </tr>
 </tfoot>
 </table>
 </div>

 {/* Production Route & Work Center Routing Flow */}
 <div className="border border-black border-t-0 bg-white">
 <div className="bg-inverse text-white px-3 py-1 flex items-center justify-between page-break-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <div className="flex items-center gap-2">
 <span className="font-bold uppercase text-[10.5px] tracking-wide">
 Production Process Route: {data.route?.name || 'Standard Production Route'}
 </span>
 </div>
 {data.route?.steps && data.route.steps.length > 0 && (
 <span className="text-[9.5px] font-mono font-medium text-ink-placeholder">
 {data.route.steps.length} {data.route.steps.length === 1 ? 'Step' : 'Steps'}
 </span>
 )}
 </div>

 {/* Route Steps Table */}
 <div className="overflow-x-auto print:overflow-visible">
 <table className="w-full text-[10.5px] border-collapse" style={{ pageBreakInside: 'auto', breakInside: 'auto' }}>
 <thead style={{ display: 'table-header-group', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <tr className="border-b border-black bg-muted font-bold text-[9px] uppercase text-black text-center" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <th className="border-r border-black p-1.5 w-10">Seq</th>
 <th className="border-r border-black p-1.5 text-left min-w-[180px]">Operation / Process Step</th>
 <th className="border-r border-black p-1.5 text-left min-w-[150px]">Department</th>
 <th className="border-r border-black p-1.5 text-left min-w-[160px]">Work Center / Machine</th>
 <th className="border-r border-black p-1.5 w-24 text-right">Std Time</th>
 <th className="p-1.5 w-24 text-center">QC Check</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {data.route?.steps && data.route.steps.length > 0 ? (
 data.route.steps.map((step, sIdx) => {
 const seq = step.sequenceNumber ?? step.sequence ?? sIdx + 1;
 const stepName = step.stepName || step.name || `Operation ${seq}`;
 const deptName = step.department?.name || department;
 const wcName = step.workCenter?.name || step.workCenter?.code || '—';
 const stdTime = step.standardDurationMinutes ? `${step.standardDurationMinutes} mins` : '—';

 return (
 <tr key={step.id || sIdx} className="text-black align-middle font-medium" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center font-mono font-bold">{seq}</td>
 <td className="border-r border-black p-1.5 font-bold uppercase text-ink">
 {stepName}
 </td>
 <td className="border-r border-black p-1.5 text-ink-secondary">
 {deptName}
 </td>
 <td className="border-r border-black p-1.5 text-ink-secondary font-mono text-[10px]">
 {wcName}
 </td>
 <td className="border-r border-black p-1.5 text-right font-mono text-ink-secondary">
 {stdTime}
 </td>
 <td className="p-1.5 text-center">
 {step.isQcRequired ? (
 <span className="font-bold text-[9px] uppercase px-1.5 py-0.5 border border-black bg-muted rounded">
 Required
 </span>
 ) : (
 <span className="text-ink-muted font-mono text-[9px]">Optional</span>
 )}
 </td>
 </tr>
 );
 })
 ) : (
 <>
 <tr className="text-black align-middle font-medium" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center font-mono font-bold">1</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">Cutting &amp; Prep</td>
 <td className="border-r border-black p-1.5 text-ink-secondary">{department}</td>
 <td className="border-r border-black p-1.5 text-ink-secondary font-mono text-[10px]">Shop Floor Line 1</td>
 <td className="border-r border-black p-1.5 text-right font-mono text-ink-secondary">—</td>
 <td className="p-1.5 text-center text-ink-muted font-mono text-[9px]">Optional</td>
 </tr>
 <tr className="text-black align-middle font-medium" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center font-mono font-bold">2</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">Fabrication / Forming</td>
 <td className="border-r border-black p-1.5 text-ink-secondary">{department}</td>
 <td className="border-r border-black p-1.5 text-ink-secondary font-mono text-[10px]">Shop Floor Line 2</td>
 <td className="border-r border-black p-1.5 text-right font-mono text-ink-secondary">—</td>
 <td className="p-1.5 text-center text-ink-muted font-mono text-[9px]">Optional</td>
 </tr>
 <tr className="text-black align-middle font-medium" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <td className="border-r border-black p-1.5 text-center font-mono font-bold">3</td>
 <td className="border-r border-black p-1.5 font-bold uppercase">Assembly &amp; Final QA</td>
 <td className="border-r border-black p-1.5 text-ink-secondary">{department}</td>
 <td className="border-r border-black p-1.5 text-ink-secondary font-mono text-[10px]">QA Station</td>
 <td className="border-r border-black p-1.5 text-right font-mono text-ink-secondary">—</td>
 <td className="p-1.5 text-center">
 <span className="font-bold text-[9px] uppercase px-1.5 py-0.5 border border-black bg-muted rounded">
 Required
 </span>
 </td>
 </tr>
 </>
 )}
 </tbody>
 </table>
 </div>
 </div>
 <div className="border border-black border-t-0 p-2 bg-muted flex items-center justify-between text-[10px] page-break-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <div>
 <span className="font-bold uppercase text-ink-secondary">Weight Reconciliation Formula: </span>
 <span className="font-mono text-ink-secondary">Difference = (System Weight + Raw Material Returned) - Gross Issued Weight</span>
 </div>
 <div className="font-bold text-ink font-mono">Scrap Allowance: Standard (≤ 1.5%)</div>
 </div>

 {/* 3-Column Industrial Handover & Sign-Off Section */}
 <div className="border border-black border-t-0 grid grid-cols-3 divide-x divide-black text-[10.5px] signoff-section page-break-avoid" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
 <div className="p-2.5 space-y-1.5">
 <div className="font-black uppercase text-black text-[10px] pb-1 border-b border-border-strong">
 1. Raw Material Store Handover
 </div>
 <div className="pt-1 space-y-1 font-mono text-[10px] text-ink">
 <div className="flex justify-between">
 <span>ISSUED TIME:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="flex justify-between">
 <span>BUNDLE / LOT ID:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="flex justify-between">
 <span>GROSS WEIGHT:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="pt-4 flex justify-between items-end">
 <span className="text-[9px] uppercase font-bold text-ink-secondary">STORE OFFICER:</span>
 <span className="text-[9px] italic text-ink-secondary">Sign &amp; Stamp</span>
 </div>
 </div>
 </div>

 {/* Box 2: Shop Floor Inward Verification */}
 <div className="p-2.5 space-y-1.5">
 <div className="font-black uppercase text-black text-[10px] pb-1 border-b border-border-strong">
 2. Shop Floor Line Inward
 </div>
 <div className="pt-1 space-y-1 font-mono text-[10px] text-ink">
 <div className="flex justify-between">
 <span>RECEIVED TIME:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="flex justify-between">
 <span>VERIFIED PIECES:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="flex justify-between">
 <span>OPERATOR ID:</span>
 <span className="border-b border-dotted border-black w-24"></span>
 </div>
 <div className="pt-4 flex justify-between items-end">
 <span className="text-[9px] uppercase font-bold text-ink-secondary">LINE INCHARGE:</span>
 <span className="text-[9px] italic text-ink-secondary">Sign &amp; Stamp</span>
 </div>
 </div>
 </div>

 {/* Box 3: Shift Completion & QA Sign-Off */}
 <div className="p-2.5 space-y-1.5 flex flex-col justify-between">
 <div>
 <div className="font-black uppercase text-black text-[10px] pb-1 border-b border-border-strong">
 3. Shift Completion &amp; QA Sign-Off
 </div>
 <div className="pt-1 text-[10px] text-ink-secondary space-y-0.5">
 <div>
 <span className="font-semibold text-ink">Remarks:</span>{' '}
 <span className="italic">{data.notes || 'Standard production batch release.'}</span>
 </div>
 </div>
 </div>

 <div className="pt-4 flex justify-between items-end font-mono text-[10px]">
 <div>
 <div className="text-[9px] uppercase font-bold text-ink-secondary">SUPERVISOR / QA:</div>
 <div className="font-bold text-black">{data.incharge || 'Shift Supervisor'}</div>
 </div>
 <div className="text-[9px] italic text-ink-secondary border-t border-black pt-1 px-3">
 Authorized Signatory
 </div>
 </div>
 </div>
 </div>

 {/* Footer Notes */}
 <div className="mt-2 flex flex-wrap items-center justify-between text-[9px] text-ink-secondary font-medium px-1">
 <span>Plinth · Production Schedule · Document Ref: {data.planNumber}</span>
 <span>BOM: {bomLabel}</span>
 </div>
 </div>
 );
 }
);

ProductionSchedulePDF.displayName = 'ProductionSchedulePDF';
