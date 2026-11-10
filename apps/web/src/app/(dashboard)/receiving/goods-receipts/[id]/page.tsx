'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Printer,
  X,
  Building2,
  Calendar,
  AlertTriangle,
  ExternalLink,
  FileSearch,
  Scale,
  PackageCheck,
  ReceiptText,
  Package,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from '@synergy/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { fetchApi } from '@/features/api/client';
import { accountsApi } from '@/features/accounts/api';
import {
  useFinalizeGrn,
  useGrnCapabilities,
  useGrnDetail,
  useGrnDocuments,
  useRecordMeasurement,
  useSignOffGrn,
  useVerifyGrnLines,
} from '@/features/goods-receipt/hooks';
import { PhysicalVerificationModal } from '@/features/goods-receipt/components/PhysicalVerificationModal';
import type { GrnLine } from '@/features/goods-receipt/api';
import { MeasurementType } from '@synergy/types';
import { showToast } from '@/components/toast-store';
import { formatIndianDate, formatINR, getVendorDisplayDetails } from '@/features/purchases/utils';
import { GoodsReceiptPDF } from '@/components/GoodsReceiptPDF';

interface PageProps {
  params: { id: string };
}

interface DebitNoteRecord {
  id: string;
  debitNoteNumber: string;
  vendorId: string;
  grnId?: string;
  status: string;
  reason: string;
  currency: string;
  totalAmount: string | number;
  createdAt: string;
}

type ViewMode = 'details' | 'document';

export default function GrnDetailPage({ params }: PageProps) {
  const { id } = params;
  const printRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [copied, setCopied] = useState(false);
  const [approvalFlowPending, setApprovalFlowPending] = useState(false);

  // Core Data
  const { data: grn, isLoading, error } = useGrnDetail(id);
  const { data: capabilities, isPending: capabilitiesLoading } = useGrnCapabilities();
  const { data: documents } = useGrnDocuments(id);

  // Mutations
  const signOff = useSignOffGrn();
  const finalize = useFinalizeGrn();
  const recordMeasurement = useRecordMeasurement();
  const verifyLines = useVerifyGrnLines();

  // Print trigger
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: grn ? `${grn.grnNumber}-receipt` : 'Goods-Receipt',
  });

  // Modals & Drawers State
  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedDocPreviewUrl, setSelectedDocPreviewUrl] = useState<string | null>(null);
  const [activeMeasurementLine, setActiveMeasurementLine] = useState<GrnLine | null>(null);
  const [measurementType, setMeasurementType] = useState<MeasurementType>('WEIGHT');
  const [measurementValue, setMeasurementValue] = useState<number>(0);
  const [measurementUnit, setMeasurementUnit] = useState<string>('kg');
  const [measurementNote, setMeasurementNote] = useState<string>('');
  const [showPhysicalVerificationModal, setShowPhysicalVerificationModal] = useState(false);

  // Linked Debit Notes Query
  const { data: linkedDebitNotes } = useQuery({
    queryKey: ['debit-notes', 'by-grn', id],
    queryFn: async () => {
      try {
        const res = await fetchApi<{ items?: DebitNoteRecord[] } | DebitNoteRecord[]>(`/debit-notes?grnId=${id}`);
        if (Array.isArray(res)) return res;
        return res.items || [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(id && id !== 'new'),
  });

  // Linked Supplier Bill Query
  const { data: grnAccountsData } = useQuery({
    queryKey: ['accounts', 'ap', 'accepted-grn', id],
    queryFn: () => accountsApi.acceptedGrn(id),
    enabled: Boolean(id && id !== 'new'),
  });

  const linkedDebitNote = linkedDebitNotes?.[0] || null;
  const linkedSupplierBill = grnAccountsData?.supplierInvoices?.[0] || null;
  const supplierBillHref = linkedSupplierBill
    ? `/accounts/purchases/bills/${linkedSupplierBill.id}`
    : `/accounts/purchases`;

  if (isLoading) return <LoadingState message="Loading Goods Receipt..." />;
  if (error || !grn) return <ErrorState error={error || new Error('Goods Receipt record could not be loaded.')} />;

  const locked = grn.status === 'FINALIZED';
  const openDiscrepancies = grn.lines.flatMap((line) => {
    const allDiscrepancies = line.discrepancies || [];
    const activeDiscrepancies = allDiscrepancies.filter((discrepancy) => discrepancy.status !== 'RESOLVED');
    const details: Array<{ id: string; type: string; quantity: number; line: typeof line }> = activeDiscrepancies.map((discrepancy) => ({
      id: discrepancy.id,
      type: discrepancy.type,
      quantity: Number(discrepancy.quantity),
      line,
    }));

    // Rejected quantities are stored on the GRN line rather than as a
    // GoodsReceiptDiscrepancy record, so add them to this detail breakdown.
    const rejectedQuantity = Number(line.rejectedQuantity || 0);
    const hasRejectedRecord = allDiscrepancies.some((discrepancy) => String(discrepancy.type) === 'REJECTED');
    if (rejectedQuantity > 1e-6 && !hasRejectedRecord) {
      details.push({ id: `${line.id}-rejected`, type: 'REJECTED', quantity: rejectedQuantity, line });
    }

    // Damage normally has a persisted discrepancy. Include legacy line-only
    // damage values too, while respecting any previously resolved record.
    const damagedQuantity = Number(line.damagedQuantity || 0);
    const hasDamageRecord = allDiscrepancies.some((discrepancy) => discrepancy.type === 'DAMAGE');
    if (damagedQuantity > 1e-6 && !hasDamageRecord) {
      details.push({ id: `${line.id}-damage`, type: 'DAMAGE', quantity: damagedQuantity, line });
    }

    return details;
  });
  // A quantity variance exists whenever accepted stock differs from the PO
  // quantity. This is the same comparison shown in the delivered-lines table.
  const varianceLines = grn.lines.filter(
    (line) => Math.abs((line.expectedQuantity ?? 0) - Number(line.acceptedQuantity ?? 0)) > 1e-6
  );
  const totalVariance = varianceLines.reduce(
    (total, line) => total + Math.abs((line.expectedQuantity ?? 0) - Number(line.acceptedQuantity ?? 0)),
    0
  );

  const canVerify =
    !locked &&
    (grn.status === 'ARRIVED' ||
      grn.status === 'UNDER_VERIFICATION' ||
      grn.status === 'DISCREPANCY_PENDING' ||
      grn.status === 'VERIFIED') &&
    (capabilities?.verify ?? true);

  const discrepancyVerificationComplete =
    grn.status === 'DISCREPANCY_PENDING' &&
    grn.lines.length > 0 &&
    grn.lines.every((line) =>
      (line.status === 'VERIFIED' || line.status === 'DISCREPANT') &&
      Math.abs(line.receivedQuantity - (line.acceptedQuantity + line.rejectedQuantity + line.damagedQuantity)) <= 1e-6
    );
  const canSignOff =
    !locked &&
    (grn.status === 'VERIFIED' || grn.status === 'CLAIM_RAISED' || discrepancyVerificationComplete) &&
    (capabilities?.signOff ?? false);

  const canFinalize =
    !locked && grn.status === 'SIGNED_OFF' && (capabilities?.finalize ?? false);

  const handleCopyGrnNumber = () => {
    navigator.clipboard.writeText(grn.grnNumber);
    setCopied(true);
    showToast({ kind: 'success', title: 'Copied', message: `GRN Number ${grn.grnNumber} copied to clipboard.` });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApproveAndCommit = async () => {
    if (approvalFlowPending) return;
    setApprovalFlowPending(true);
    try {
      await signOff.mutateAsync({ id: grn.id });
      if (capabilities?.finalize) {
        await finalize.mutateAsync({ id: grn.id });
        showToast({ title: 'Receipt Posted', message: `${grn.grnNumber} was approved and posted to inventory.`, kind: 'success' });
      } else {
        showToast({
          title: 'Receiving Approved',
          message: 'The receipt is signed off and ready for an authorized user to post to inventory.',
          kind: 'success',
        });
      }
    } catch (caught: unknown) {
      showToast({
        title: 'Could Not Complete Receiving',
        message: caught instanceof Error ? caught.message : 'The receipt could not be approved and posted.',
        kind: 'error',
      });
    } finally {
      setApprovalFlowPending(false);
    }
  };

  // Aggregated KPIs
  const totalExpected = grn.lines.reduce((acc, l) => acc + (l.expectedQuantity ?? 0), 0);
  const totalReceived = grn.lines.reduce((acc, l) => acc + (l.receivedQuantity || 0), 0);
  const totalAccepted = grn.lines.reduce((acc, l) => acc + (l.acceptedQuantity || 0), 0);
  const totalAcceptedValue = grn.lines.reduce(
    (acc, line) => acc + Number(line.acceptedQuantity || 0) * Number(line.invoiceUnitPrice ?? line.poLine?.unitPrice ?? 0),
    0
  );

  const allDocs = documents || grn.documents || [];
  const physicalVerificationNotes = Array.from(new Set(
    grn.lines.flatMap((line) => line.measurements || [])
      .map((measurement) => measurement.note?.trim())
      .filter((note): note is string => Boolean(note && note.startsWith('Physical Verification:')))
      .map((note) => note.replace(/^Physical Verification:\s*/, '').trim())
      .filter(Boolean)
  ));

  // Handlers
  const handleMeasurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMeasurementLine) return;
    const val = Number(measurementValue);
    if (!val || val <= 0 || isNaN(val)) {
      showToast({ title: 'Validation Error', message: 'Measurement value must be greater than 0.', kind: 'error' });
      return;
    }
    const unit = measurementUnit.trim();
    if (!unit) {
      showToast({ title: 'Validation Error', message: 'Unit label is required (e.g. kg, pcs).', kind: 'error' });
      return;
    }
    try {
      await recordMeasurement.mutateAsync({
        grnId: grn.id,
        lineId: activeMeasurementLine.id,
        data: {
          type: measurementType,
          value: val,
          unitLabel: unit,
          note: measurementNote.trim() || undefined,
        },
      });
      showToast({ title: 'Measurement Logged', message: 'Physical measurement logged to line.', kind: 'success' });
      setActiveMeasurementLine(null);
      setMeasurementValue(0);
      setMeasurementNote('');
    } catch (caught: unknown) {
      showToast({
        title: 'Measurement Failed',
        message: caught instanceof Error ? caught.message : 'Could not record measurement.',
        kind: 'error',
      });
    }
  };

  const handlePhysicalVerificationSave = async (payload: {
    lines: Array<{
      lineId: string;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity?: number;
      damagedQuantity?: number;
      invoiceUnitPrice?: number;
      notes?: string;
    }>;
    overallNotes?: string;
  }) => {
    await verifyLines.mutateAsync({ grnId: grn.id, data: payload });
  };

  return (
    <div className="flex-1 min-h-screen bg-background p-3 sm:p-4 lg:p-5 overflow-y-auto">
      <div className="w-full space-y-3">
        {/* Top Breadcrumbs & View Mode Bar */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
              <Link href="/receiving/goods-receipts" className="font-semibold text-muted-foreground transition-colors hover:text-primary">
                Goods Receipts
              </Link>
              <span aria-hidden="true" className="text-muted-foreground/60">›</span>
              <span className="font-bold text-foreground">{grn.grnNumber}</span>
            </nav>
            {/* View Mode Toggle Controls */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center gap-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('details')}
                  className={`flex items-center gap-1.5 border-b-2 px-1 py-2 transition-colors cursor-pointer ${viewMode === 'details'
                      ? 'border-primary text-primary font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <PackageCheck className="h-3.5 w-3.5" />
                  <span>GRN Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('document')}
                  className={`flex items-center gap-1.5 border-b-2 px-1 py-2 transition-colors cursor-pointer ${viewMode === 'document'
                      ? 'border-primary text-primary font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>PDF Preview</span>
                </button>
              </div>

              {viewMode === 'document' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePrint()}
                  className="font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-none cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Print Document
                </Button>
              )}
            </div>
          </div>

          {/* Clean Executive Header Card (Matching PO Detail Page standard) */}
          <div className="relative border-b border-border bg-background py-4 sm:py-5">
            <div className="flex flex-col gap-4 lg:block">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 text-primary">
                      <PackageCheck className="h-5 w-5" />
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
                      {grn.grnNumber}
                    </h1>
                    <button
                      type="button"
                      onClick={handleCopyGrnNumber}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Copy GRN Number"
                      aria-label="Copy GRN number"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <StatusBadge status={grn.status} className="text-xs px-2.5 py-1 font-bold shadow-none" />
                </div>

                {/* Sub-Header Metadata Details (Cleaned up, no raw UUID capsules) */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-medium">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    {grn.vendorId || grn.vendor?.id ? (
                      <Link
                        href={`/vendors/${grn.vendor?.id || grn.vendorId}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline transition-colors"
                      >
                        {grn.vendor?.name || '—'}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground">{grn.vendor?.name || '—'}</span>
                    )}
                  </div>

                  {grn.po?.poNumber && (
                    <div className="flex items-center gap-1.5">
                      <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                      <span>PO: </span>
                      <Link
                        href={`/procurement/purchase-orders/${grn.poId || grn.po?.id}`}
                        className="font-mono font-bold text-foreground hover:text-primary hover:underline transition-colors"
                      >
                        {grn.po.poNumber}
                      </Link>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span>Received: <strong className="text-foreground">{formatIndianDate(grn.receivedAt)}</strong></span>
                  </div>

                  {grn.verifiedAt && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Verified: <strong className="text-foreground">{formatIndianDate(grn.verifiedAt)}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="ml-auto flex max-w-full flex-nowrap items-center justify-start gap-2.5 overflow-x-auto pb-1 lg:absolute lg:right-6 lg:top-6 lg:max-w-[calc(100%-3rem)]">
                {grn.poId && grn.vendorId && ['SIGNED_OFF', 'FINALIZED'].includes(grn.status) && (
                  <Link href={supplierBillHref} className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold border-border shadow-none hover:bg-muted"
                    >
                      <ReceiptText className="h-3.5 w-3.5 text-primary" />
                      <span>Supplier Bill</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDocPreviewUrl(allDocs[0]?.fileUrl || null);
                    setShowDocModal(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border-primary/20 bg-background font-semibold text-foreground shadow-none hover:border-primary/40 hover:bg-primary/5"
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>Vendor Invoice</span>
                  {allDocs.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                      {allDocs.length}
                    </span>
                  )}
                </Button>

                {capabilitiesLoading ? (
                  <div className="h-9 min-w-40 animate-pulse rounded-lg bg-muted" aria-label="Loading receipt actions" />
                ) : (canVerify || canSignOff || canFinalize || approvalFlowPending) && (
                  <div className="flex flex-nowrap items-center gap-2.5">
                    {canVerify && (
                      <Button
                        variant={grn.status === 'VERIFIED' ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => setShowPhysicalVerificationModal(true)}
                        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg shadow-none ${grn.status === 'VERIFIED' ? 'font-semibold border-primary/30 bg-background text-primary hover:bg-primary/5' : 'bg-primary hover:bg-primary/90 text-primary-foreground font-bold'}`}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        <span>{grn.status === 'VERIFIED' ? 'Review Verification' : 'Physical Verification'}</span>
                      </Button>
                    )}

                    {((canSignOff && capabilities?.finalize) || approvalFlowPending) && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => void handleApproveAndCommit()}
                        disabled={approvalFlowPending || signOff.isPending || finalize.isPending}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-emerald-600 text-white shadow-none hover:bg-emerald-700"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>{approvalFlowPending || signOff.isPending || finalize.isPending ? 'Approving & posting…' : 'Approve & Commit to Inventory'}</span>
                      </Button>
                    )}

                    {canSignOff && !capabilities?.finalize && !approvalFlowPending && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => signOff.mutate({ id: grn.id })}
                        disabled={signOff.isPending}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-emerald-600 text-white shadow-none hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{signOff.isPending ? 'Signing off...' : 'Approve Receiving (Sign-Off)'}</span>
                      </Button>
                    )}

                    {canFinalize && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => finalize.mutate({ id: grn.id })}
                        disabled={finalize.isPending}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-emerald-600 text-white shadow-none hover:bg-emerald-700"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>{finalize.isPending ? 'Finalizing...' : 'Commit & Post to Inventory'}</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick 4-Stat Metric Strip */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border lg:grid-cols-4 lg:divide-y-0">
            <div className="px-3 py-3 first:pl-0 lg:px-5 lg:py-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Contract Lines</span>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold text-foreground">
                {grn.lines.length} items
              </div>
            </div>

            <div className="px-3 py-3 lg:px-5 lg:py-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Physically Received</span>
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold text-foreground">
                {totalReceived.toLocaleString('en-IN')} units
              </div>
            </div>

            <div className="px-3 py-3 lg:px-5 lg:py-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Accepted to Stock</span>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold text-foreground">
                {totalAccepted.toLocaleString('en-IN')} units
              </div>
            </div>

            <div className="px-3 py-3 last:pr-0 lg:px-5 lg:py-3">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Discrepancies</span>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-mono text-xl font-bold text-foreground">
                {varianceLines.length > 0 ? `${totalVariance.toLocaleString('en-IN')} units` : '0 units'}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic View Mode Content */}
        {/* Details View (Full width without split preview) */}
        {viewMode === 'details' && (
          <div className="space-y-4">

            {/* Vendor & Receiving Specifications Card (styled like PO page) */}
            <section className="py-2">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold tracking-tight text-foreground">
                    Vendor &amp; Receiving Specifications
                  </h2>
                </div>
                {grn.vendor?.code && (
                  <span className="text-[11px] font-mono font-semibold text-muted-foreground">Vendor code · <span className="text-foreground">{grn.vendor.code}</span></span>
                )}
              </div>

              {(() => {
                const vendorDetails = getVendorDisplayDetails(grn.vendor);
                const invoiceNum = allDocs[0]?.fileName;
                return (
                  <div className="grid grid-cols-1 divide-y divide-border text-sm lg:grid-cols-[1.05fr_1fr] lg:divide-x lg:divide-y-0">
                    <div className="py-2.5 lg:pr-5 lg:py-1">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Supplier</p>
                      {grn.vendorId || grn.vendor?.id ? (
                        <Link
                          href={`/vendors/${grn.vendor?.id || grn.vendorId}`}
                          className="block font-bold leading-5 text-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {vendorDetails.name}
                        </Link>
                      ) : (
                        <p className="font-bold leading-5 text-foreground">{vendorDetails.name}</p>
                      )}
                      {vendorDetails.fullAddress !== 'Address not provided' && (
                        <p className="mt-1 text-xs leading-4 text-foreground whitespace-pre-line">{vendorDetails.fullAddress}</p>
                      )}
                      {(vendorDetails.gstin !== '—' || vendorDetails.stateName !== '—') && (
                        <p className="mt-1 text-xs font-semibold text-foreground">
                          {vendorDetails.gstin !== '—' && <>GSTIN: {vendorDetails.gstin}</>}
                          {vendorDetails.gstin !== '—' && vendorDetails.stateName !== '—' && ' · '}
                          {vendorDetails.stateName !== '—' && <>State: {vendorDetails.stateName}</>}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-x-5 gap-y-2 py-2.5 sm:grid-cols-2 lg:pl-5 lg:py-1">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              {(grn as any).jobWorkReceiptReturn?.jobWorkOrder?.orderNumber ? 'Job work order' : 'Purchase order'}
                            </p>
                            {grn.po?.poNumber ? (
                              <Link
                                href={`/procurement/purchase-orders/${grn.poId || grn.po?.id}`}
                                className="mt-0.5 block truncate font-mono font-bold text-primary hover:underline"
                              >
                                {grn.po.poNumber}
                              </Link>
                            ) : (grn as any).jobWorkReceiptReturn?.jobWorkOrder?.orderNumber ? (
                              <Link
                                href={`/job-work/${(grn as any).jobWorkReceiptReturn.jobWorkOrder.id}`}
                                className="mt-0.5 block truncate font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                {(grn as any).jobWorkReceiptReturn.jobWorkOrder.orderNumber}
                              </Link>
                            ) : (
                              <span className="mt-0.5 block font-medium text-foreground">Unreferenced</span>
                            )}
                          </div>
                          {invoiceNum && (
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Supplier invoice / DC</p>
                              <span className="mt-0.5 block break-all font-mono text-xs font-semibold text-foreground">{invoiceNum}</span>
                            </div>
                          )}
                          <div className="sm:col-span-2 flex items-center justify-between border-t border-border/60 pt-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Receipt status</span>
                            <span className="font-bold uppercase text-foreground">{grn.status.replaceAll('_', ' ')}</span>
                          </div>
                    </div>
                  </div>
                );
              })()}
            </section>

            {physicalVerificationNotes.length > 0 && (
              <section className="border-y border-border py-3">
                <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-2.5">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Physical Verification Summary</h2>
                </div>
                <div className="space-y-2">
                  {physicalVerificationNotes.map((note, index) => (
                    <p key={`${index}-${note}`} className="border-b border-border/70 py-2 text-sm leading-relaxed text-foreground last:border-b-0">{note}</p>
                  ))}
                </div>
              </section>
            )}

            {/* Linked Debit Note Recovery Banner (if any) */}
            {linkedDebitNote && (
              <div className="border-y border-primary/30 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center text-primary">
                      <ReceiptText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-foreground">Linked Debit Note Recovery Claim</span>
                        <span className="text-xs font-mono font-bold text-foreground">
                          {linkedDebitNote.debitNoteNumber}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Claim Amount: <strong className="font-mono text-foreground">{linkedDebitNote.currency} {Number(linkedDebitNote.totalAmount).toLocaleString()}</strong>
                        {linkedDebitNote.reason && <span> · {linkedDebitNote.reason}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/accounts/purchases/grns/${grn.id}`}>
                      <Button variant="default" size="sm" className="text-xs h-8">
                        <span>Accounts Review</span>
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Delivered Physical Line Items Console */}
            <section className="border-y border-border">
              <div className="flex flex-col gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center text-primary">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                      <span>Delivered Physical Line Items</span>
                      <span className="text-[11px] font-mono font-bold text-muted-foreground">
                        {grn.lines.length}
                      </span>
                    </h3>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table className="w-full min-w-[1240px] table-fixed border-collapse text-left text-sm">
                  <TableHeader>
                    <TableRow className="border-b border-border bg-muted/40 text-xs uppercase font-bold text-muted-foreground tracking-wider">
                      <TableHead className="w-12 px-3 py-3.5 text-center font-bold">#</TableHead>
                      <TableHead className="w-[260px] px-4 py-3.5 font-bold">Product / Material</TableHead>
                      <TableHead className="w-20 px-3 py-3.5 text-center font-bold">UOM</TableHead>
                      <TableHead className="w-24 px-3 py-3.5 text-center font-bold">PO Expected</TableHead>
                      <TableHead className="w-24 px-3 py-3.5 text-center font-bold">Delivered</TableHead>
                      <TableHead className="w-24 px-3 py-3.5 text-center font-bold">Accepted</TableHead>
                      <TableHead className="w-28 px-3 py-3.5 text-center font-bold">Rejected / Damage</TableHead>
                      <TableHead className="w-24 px-3 py-3.5 text-center font-bold">Short</TableHead>
                      <TableHead className="w-32 px-3 py-3.5 text-right font-bold">Invoice Rate</TableHead>
                      <TableHead className="w-36 px-3 py-3.5 text-center font-bold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grn.lines.map((line, idx) => {
                      const item = line.product || line.material;
                      const unit = line.uom?.symbol || line.uom?.code || 'units';
                      const rejectedDamage = Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
                      const invoiceRate = Number(line.invoiceUnitPrice ?? line.poLine?.unitPrice ?? 0);
                      const lineOpenDiscrepancies = (line.discrepancies || []).filter((d) => d.status !== 'RESOLVED');

                      return (
                        <TableRow key={line.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="px-3 py-4 text-center font-mono text-muted-foreground font-bold text-xs">
                            {idx + 1}
                          </TableCell>

                          <TableCell className="px-4 py-4">
                            <p className="font-bold text-sm text-foreground leading-snug">
                              {item?.name || 'Unnamed item'}
                            </p>
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{unit}</span>
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center font-mono text-sm font-medium tabular-nums text-muted-foreground">
                            {line.expectedQuantity ?? '—'}
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center font-mono text-sm font-bold tabular-nums text-foreground">
                            {line.receivedQuantity}
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center font-mono text-sm font-bold tabular-nums text-foreground">
                            {line.acceptedQuantity}
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center font-mono text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                            {rejectedDamage}
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center font-mono text-sm font-semibold tabular-nums">
                            {line.shortQuantity}
                          </TableCell>

                          <TableCell className="whitespace-nowrap px-3 py-4 text-right font-mono text-sm font-bold tabular-nums text-foreground">
                            {formatINR(invoiceRate)}
                          </TableCell>

                          <TableCell className="px-3 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <StatusBadge
                                status={lineOpenDiscrepancies.length > 0 ? 'DISCREPANT' : line.status === 'DISCREPANT' ? 'VERIFIED' : line.status}
                                fallback={grn.status === 'FINALIZED' ? 'Posted' : lineOpenDiscrepancies.length > 0 ? 'Discrepant' : line.status === 'PENDING' ? 'Pending verification' : 'Verified'}
                              />
                              {lineOpenDiscrepancies.length > 0 && (
                                <span className="text-xs font-semibold text-muted-foreground">
                                  {lineOpenDiscrepancies.length} discrepancy
                                </span>
                              )}
                            </div>
                          </TableCell>

                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="border-t-2 border-border bg-muted/40 font-bold text-sm">
                      <TableCell colSpan={3} className="px-4 py-3.5 text-right uppercase tracking-wider text-muted-foreground text-xs">
                        Totals
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono font-bold text-muted-foreground text-sm">
                        {totalExpected}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono font-bold text-foreground text-sm">
                        {totalReceived}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono font-bold text-foreground text-sm">
                        {totalAccepted}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono font-bold text-foreground text-sm">
                        {grn.lines.reduce((sum, line) => sum + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0), 0)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center font-mono font-bold text-foreground text-sm">
                        {grn.lines.reduce((sum, line) => sum + Number(line.shortQuantity || 0), 0)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-center text-muted-foreground text-xs">—</TableCell>
                      <TableCell className="px-4 py-3.5 text-right font-mono font-bold text-foreground text-sm">
                        {formatINR(totalAcceptedValue)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </section>

            {/* Unresolved Discrepancies Breakdown (if any) */}
            {openDiscrepancies.length > 0 && (
              <section className="border-y border-border py-4">
                <div className="mb-1 flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Discrepancy Details
                    </h4>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {openDiscrepancies.length} {openDiscrepancies.length === 1 ? 'issue' : 'issues'}
                  </span>
                </div>
                <div>
                  {openDiscrepancies.map((disc) => {
                    const line = disc.line;
                    const item = line?.product || line?.material;
                    const unit = line?.uom?.symbol || 'units';

                    return (
                      <div
                        key={disc.id}
                        className="grid grid-cols-1 gap-1.5 border-b border-border/70 py-3 last:border-b-0 sm:grid-cols-[minmax(150px,0.7fr)_minmax(130px,0.55fr)_minmax(0,2fr)] sm:items-center sm:gap-4"
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wider text-destructive">
                          {disc.type.replaceAll('_', ' ')}
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                          {disc.quantity} <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
                        </span>
                        <span className="min-w-0 text-sm font-semibold text-foreground">
                          {item?.name || 'Item'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Job Work Rework & Replacement Banner */}
            {(grn as any).jobWorkReceiptReturn && grn.lines.some((l) => Number(l.rejectedQuantity || 0) + Number(l.damagedQuantity || 0) > 0) && (
              <section className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400 mt-0.5">
                      <PackageCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Outsourced Rework Protocol · Vendor Replacement at Own Expense
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                        {grn.lines.reduce((s, l) => s + Number(l.rejectedQuantity || 0) + Number(l.damagedQuantity || 0), 0)} rejected/damaged units will not be deducted from vendor custody. Upon clicking <strong>Approve &amp; Commit to Inventory</strong>, the system posts the {totalAccepted} accepted units to stock, bills only accepted items, notifies {grn.vendor?.name} for rework, and automatically creates a new Job Work Order for the balance.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 shrink-0">
                    Rework Automated
                  </span>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Full Official Document View */}
        {/* Full Document PDF Preview */}
        {viewMode === 'document' && (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-2xl border border-border p-4 sm:p-8 flex justify-center">
              <div className="w-full max-w-[850px] bg-white shadow-xl rounded-sm border border-border/40">
                <GoodsReceiptPDF grn={grn} ref={printRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POPUP MODAL 1: Attached Supplier Invoice */}
      {showDocModal && (
        <div
          className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Supplier Invoice Attachment</h3>
                  <p className="text-xs text-muted-foreground">Original invoice attached to {grn.grnNumber}; no automated extraction is performed.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {selectedDocPreviewUrl ? (
                <div className="rounded-xl border border-border overflow-hidden bg-muted/20">
                  {selectedDocPreviewUrl.toLowerCase().includes('.pdf') ? (
                    <iframe title="Receipt document" src={selectedDocPreviewUrl} className="h-[500px] w-full" />
                  ) : (
                    <div className="flex items-center justify-center p-4">
                      <img
                        src={selectedDocPreviewUrl}
                        alt="Delivery slip"
                        className="max-h-[500px] max-w-full rounded-lg object-contain"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-12 text-center text-xs text-muted-foreground">
                  <FileSearch className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                  <span>No delivery documents attached to this goods receipt.</span>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 2: Physical Measurement Recording Modal */}
      {activeMeasurementLine && (
        <div
          className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Scale className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Record Physical Measurement</h3>
                  <p className="text-xs text-muted-foreground">Log quality &amp; dimension verification</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveMeasurementLine(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form data-keyboard-submit="off" onSubmit={handleMeasurementSubmit} className="p-6 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Line Item</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {(activeMeasurementLine.product || activeMeasurementLine.material)?.name}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Measurement Type</label>
                <select
                  value={measurementType}
                  onChange={(e) => {
                    const newType = e.target.value as MeasurementType;
                    setMeasurementType(newType);
                    if (newType === 'WEIGHT') setMeasurementUnit('kg');
                    else if (newType === 'PIECE') setMeasurementUnit('pcs');
                    else if (newType === 'BUNDLE') setMeasurementUnit('bundle');
                    else if (newType === 'PACKET') setMeasurementUnit('pkt');
                  }}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
                >
                  <option value="WEIGHT">Weight (WEIGHT)</option>
                  <option value="PIECE">Piece Count (PIECE)</option>
                  <option value="BUNDLE">Bundle Count (BUNDLE)</option>
                  <option value="PACKET">Packet Count (PACKET)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Value</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="Enter value > 0"
                    value={measurementValue || ''}
                    onChange={(e) => setMeasurementValue(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground font-mono focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Unit Label</label>
                  <input
                    required
                    value={measurementUnit}
                    onChange={(e) => setMeasurementUnit(e.target.value)}
                    placeholder="e.g. kg, pcs, bundle"
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Inspection Notes</label>
                <textarea
                  rows={2}
                  value={measurementNote}
                  onChange={(e) => setMeasurementNote(e.target.value)}
                  placeholder="Additional quality observation notes…"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setActiveMeasurementLine(null)}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordMeasurement.isPending}
                  className="rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {recordMeasurement.isPending ? 'Saving…' : 'Record Measurement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL 3: Physical Verification & Inspection Modal */}
      {showPhysicalVerificationModal && (
        <PhysicalVerificationModal
          grn={grn}
          isOpen={showPhysicalVerificationModal}
          onClose={() => setShowPhysicalVerificationModal(false)}
          onSave={handlePhysicalVerificationSave}
          isSubmitting={verifyLines.isPending}
        />
      )}

    </div>
  );
}
