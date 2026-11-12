'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { fetchApi } from '@/features/api/client';
import { usePODetail } from '@/features/purchases/hooks';
import { useGrnDocuments } from '@/features/goods-receipt/hooks';
import { DebitNotePDF, DebitNoteDocumentData } from '@/components/DebitNotePDF';
import { PurchaseOrderPDF } from '@/components/PurchaseOrderPDF';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import {
  ArrowLeft,
  Printer,
  AlertTriangle,
  Building2,
  Receipt,
  FileText,
  Layers,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Split,
  Send,
} from 'lucide-react';
import { SendDebitNoteModal } from '@/features/accounts/components/SendDebitNoteModal';

interface PageProps {
  params: { id: string };
}

const formatMoney = (val?: number | string | null, cur = 'INR') =>
  `${cur === 'INR' ? '₹' : cur + ' '}${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (val?: string | null) =>
  val
    ? new Date(val).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default function DebitNoteDetailPage({ params }: PageProps) {
  const { id } = params;
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const printPoRef = useRef<HTMLDivElement>(null);

  const [previewTab, setPreviewTab] = useState<'both' | 'claim' | 'po' | 'vendor_doc'>('both');
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery<DebitNoteDocumentData>({
    queryKey: ['debit-note', id],
    queryFn: () => fetchApi<DebitNoteDocumentData>(`/debit-notes/${id}`),
  });

  const { data: poDetail } = usePODetail(data?.poId || '');
  const { data: grnDocs } = useGrnDocuments(data?.grnId || '');
  const uploadedVendorDoc = grnDocs?.[0]?.fileUrl || null;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: data ? `DebitNote-${data.debitNoteNumber}` : 'Debit-Note',
  });

  const handlePrintPo = useReactToPrint({
    contentRef: printPoRef,
    documentTitle: poDetail ? `PO-${poDetail.poNumber}` : 'Purchase-Order',
  });

  if (isLoading) return <LoadingState message="Loading vendor debit note…" />;
  if (error || !data) {
    return <ErrorState error={error instanceof Error ? error : new Error('Unable to load debit note.')} />;
  }

  const statusTone =
    data.status === 'RECORDED' || data.status === 'APPROVED'
      ? 'bg-tone-green-solid text-tone-green-text border-tone-green-solid/25'
      : data.status === 'SUBMITTED'
      ? 'bg-tone-blue-solid text-tone-blue-text border-tone-blue-solid/25'
      : 'bg-tone-amber-solid text-tone-amber-text border-tone-amber-solid/25';

  const lines = data.lines || [];
  const totalClaimedUnits = lines.reduce(
    (sum, l) =>
      sum +
      (Number(l.shortQuantity || 0) +
        Number(l.rejectedQuantity || 0) +
        Number(l.damagedQuantity || 0) || Number(l.expectedQuantity || 0)),
    0
  );

  const totalContractExpected = lines.reduce((sum, l) => sum + Number(l.expectedQuantity || 0), 0);
  const totalDeliveredPhysical = lines.reduce((sum, l) => sum + Number(l.receivedQuantity || 0), 0);
  const totalAcceptedStock = lines.reduce((sum, l) => sum + Number(l.acceptedQuantity || 0), 0);

  const priceOnlyAmount = lines.reduce((sum, line) => {
    const discrepancyQuantity =
      Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
    const quantity = discrepancyQuantity > 0 ? discrepancyQuantity : Number(line.expectedQuantity || 0);
    return sum + quantity * Number(line.unitPrice || 0);
  }, 0);

  return (
    <main className="min-h-screen bg-muted/20 pb-20 w-full">
      {/* Top Header & Breadcrumb Ribbon (Full Width) */}
      <div className="border-border-strong border-border bg-card w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5">
          <nav className="mb-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href={data.grnId ? '/accounts/debit-notes' : '/debit-notes'} className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft size={13} /> Debit Notes
            </Link>
            <span className="text-border">/</span>
            <span className="font-mono font-medium text-foreground">{data.debitNoteNumber}</span>
          </nav>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25">
                <Receipt className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Vendor Discrepancy &amp; Claim Workspace
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${statusTone}`}
                  >
                    {(data.status === 'RECORDED' || data.status === 'APPROVED') && <CheckCircle2 size={12} />}
                    {data.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-0.5">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                    {data.debitNoteNumber}
                  </h1>
                  <span className="text-sm font-semibold text-muted-foreground">
                    · Against <strong className="text-foreground">{data.vendor?.name || data.vendorId}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsSendModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-n-600 hover:bg-n-700 text-inverse px-3.5 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Send size={13} />
                <span>Send to Vendor</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrint()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-xs hover:bg-muted transition-colors cursor-pointer"
              >
                <Printer size={13} />
                <span>Print Claim Voucher</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Main Content Workspace (Full Width) */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* KPI Ribbon */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Debit Claim
            </p>
            <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-foreground">
              {formatMoney(priceOnlyAmount, data.currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Claim amount; not yet applied to a payment</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Discrepant Quantity
            </p>
            <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-destructive">
              {totalClaimedUnits} units
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Across {lines.length} claimed line item(s)</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Contract Purchase Order
            </p>
            <div className="mt-1 flex items-center gap-1 font-mono text-sm font-bold text-foreground">
              {data.po ? (
                <Link
                  href={`/procurement/purchase-orders/${data.poId}`}
                  className="text-primary hover:underline flex items-center gap-1 truncate"
                >
                  <span>{data.po.poNumber}</span>
                  <ExternalLink size={12} />
                </Link>
              ) : (
                <span className="text-muted-foreground">Direct Receiving</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Value: {formatMoney(data.po?.totalAmount, data.currency)}
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Source Goods Receipt
            </p>
            <div className="mt-1 flex items-center gap-1 font-mono text-sm font-bold text-foreground">
              {data.grn ? (
                <Link
                  href={`/receiving/goods-receipts/${data.grnId}`}
                  className="text-primary hover:underline flex items-center gap-1 truncate"
                >
                  <span>{data.grn.grnNumber}</span>
                  <ExternalLink size={12} />
                </Link>
              ) : (
                <span className="text-muted-foreground">{data.grnId || '—'}</span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Received {formatDate(data.grn?.receivedAt || data.createdAt)}
            </p>
          </div>
        </div>

        {/* 2-COLUMN COMPARISON WORKSPACE */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start w-full">
          {/* LEFT COLUMN: Discrepancy Comparison Table & Commercial Details (6 cols) */}
          <div className="space-y-6 lg:col-span-6">
            {/* Vendor Commercial Information */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-border-strong border-border/70 pb-3">
                <Building2 size={16} className="text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Vendor Commercial Identification
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Vendor Legal Name
                  </p>
                  <p className="mt-1 font-bold text-foreground text-sm">
                    {data.vendor?.name || data.vendorId}
                  </p>
                  {data.vendor?.code && (
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      Code: {data.vendor.code}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Claim Basis Category
                  </p>
                  <span className="mt-1 inline-flex rounded-md bg-tone-amber-solid px-2 py-0.5 text-[11px] font-bold text-tone-amber-text uppercase">
                    {(data.evidence as { reasonCategory?: string } | null | undefined)?.reasonCategory?.replaceAll('_', ' ') || 'RECEIPT SHORTAGE / DAMAGE'}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Currency: {data.currency || 'INR'}
                  </p>
                </div>
              </div>
            </div>

            {/* Comprehensive Discrepancies Comparison Table */}
            <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-border-strong border-border/70 bg-muted/20 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers size={15} className="text-primary" />
                    <span>Discrepancy Comparison Matrix</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Comparative audit between PO contract baseline, slip delivery count, and claimed deduction.
                  </p>
                </div>
                <span className="rounded-full bg-destructive/10 border border-destructive/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-destructive">
                  {lines.length} Line Variance(s)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-border-strong border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Item Specification</th>
                      <th className="px-2 py-3 text-center">PO Expected</th>
                      <th className="px-2 py-3 text-center">Delivered</th>
                      <th className="px-2 py-3 text-center">Stock Accepted</th>
                      <th className="px-3 py-3 text-center text-destructive">Claimed Short/Dmg</th>
                      <th className="px-3 py-3 text-right">Unit Rate</th>
                      <th className="px-4 py-3 text-right">Debit Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((line) => {
                      const exp = Number(line.expectedQuantity || 0);
                      const rec = Number(line.receivedQuantity || 0);
                      const acc = Number(line.acceptedQuantity || 0);
                      const short = Number(line.shortQuantity || 0);
                      const rej = Number(line.rejectedQuantity || 0);
                      const dam = Number(line.damagedQuantity || 0);
                      const claimed = short + rej + dam || exp;
                      const rate = Number(line.unitPrice || 0);
                      const totalDebit = claimed * rate;

                      return (
                        <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                          {/* Item info */}
                          <td className="px-4 py-3.5 max-w-[200px]">
                            <p className="font-semibold text-xs text-foreground leading-snug">
                              {line.description}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                              <span>{line.itemCode || 'No Code'}</span>
                              <span>·</span>
                              <span className="uppercase">{line.uomSymbol || 'EA'}</span>
                            </div>
                            {line.reason && (
                              <p className="mt-1 text-[11px] text-tone-amber-text italic bg-tone-amber-bg rounded px-1.5 py-0.5 border border-tone-amber-solid/25">
                                {line.reason}
                              </p>
                            )}
                          </td>

                          {/* PO Expected */}
                          <td className="px-2 py-3.5 text-center font-mono text-xs font-semibold text-muted-foreground">
                            {exp}
                          </td>

                          {/* Delivered Physical */}
                          <td className="px-2 py-3.5 text-center font-mono text-xs font-bold text-foreground">
                            {rec}
                          </td>

                          {/* Accepted Stock */}
                          <td className="px-2 py-3.5 text-center font-mono text-xs font-bold text-tone-green-text">
                            {acc}
                          </td>

                          {/* Claimed Variance */}
                          <td className="px-3 py-3.5 text-center font-mono text-xs font-bold text-destructive bg-destructive/5">
                            {claimed}
                          </td>

                          {/* Unit Rate */}
                          <td className="px-3 py-3.5 text-right font-mono text-xs text-muted-foreground">
                            {formatMoney(rate, data.currency)}
                          </td>

                          {/* Total Line Claim */}
                          <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-foreground">
                            {formatMoney(totalDebit, data.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                    <tr>
                      <td className="px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                        Reconciliation Totals
                      </td>
                      <td className="px-2 py-3 text-center font-mono text-xs">{totalContractExpected}</td>
                      <td className="px-2 py-3 text-center font-mono text-xs">{totalDeliveredPhysical}</td>
                      <td className="px-2 py-3 text-center font-mono text-xs text-tone-green-text">{totalAcceptedStock}</td>
                      <td className="px-3 py-3 text-center font-mono text-xs text-destructive">{totalClaimedUnits}</td>
                      <td className="px-3 py-3 text-right text-[10px] uppercase text-muted-foreground">Total</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-foreground">
                        {formatMoney(priceOnlyAmount, data.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Discrepancy Justification */}
            <div className="rounded-2xl border border-tone-amber-solid/25 bg-tone-amber-bg p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-tone-amber-text">
                <AlertTriangle size={16} className="text-tone-amber-text" />
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  Commercial Discrepancy Justification
                </h2>
              </div>

              <div className="rounded-xl border border-tone-amber-solid/25 bg-surface/90 p-4 text-xs leading-relaxed text-tone-amber-text shadow-2xs">
                <p className="font-semibold text-tone-amber-text mb-1">
                  Reason Note:
                </p>
                <p>{data.reason}</p>
              </div>

              {(() => {
                const evidence = data.evidence as { discrepancyIds?: string[] } | null | undefined;
                return evidence?.discrepancyIds && evidence.discrepancyIds.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-tone-amber-text">
                    <ShieldCheck size={13} className="text-tone-amber-text" />
                    <span>
                      Linked to {evidence.discrepancyIds.length} formal inspection discrepancy marker(s).
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Workflow Timeline */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-border-strong border-border/70 pb-3">
                <Clock size={16} className="text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Authorization &amp; Financial Workflow
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Created by Accounts</span>
                  <p className="font-semibold text-foreground mt-1 truncate">{data.creator?.name || 'Warehouse Staff'}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(data.createdAt)}</p>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Debit Note Status</span>
                  <p className="font-semibold text-foreground mt-1">{data.status === 'RECORDED' ? 'Recorded' : data.status}</p>
                  <p className="text-[10px] text-muted-foreground">Recorded without an approval workflow</p>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Recorded by</span>
                  <p className="font-semibold text-foreground mt-1 truncate">
                    {data.creator?.name || 'Accounts'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(data.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: PDF Preview Comparison of Raised PO vs. Received Receipt / Claim (6 cols) */}
          <div className="space-y-4 lg:col-span-6">
            <div className="sticky top-4 space-y-4">
              {/* Document Comparison Navigation Bar */}
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Split size={16} className="text-primary" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Document Evidence Comparison
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Visual audit of Raised Purchase Order vs. Claim Voucher / Vendor Proof
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-1 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('both')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        previewTab === 'both' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Side-by-Side
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('claim')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        previewTab === 'claim' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Claim Voucher
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('po')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        previewTab === 'po' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Raised PO
                    </button>
                    {uploadedVendorDoc && (
                      <button
                        type="button"
                        onClick={() => setPreviewTab('vendor_doc')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          previewTab === 'vendor_doc' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Delivery Proof
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* PDF Preview Comparison Container */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-inner max-h-[calc(100vh-10rem)] overflow-y-auto space-y-6">
                {/* 1. SIDE-BY-SIDE OR TOGGLED VIEWS */}
                {previewTab === 'both' && (
                  <div className="space-y-6">
                    {/* Top: Raised Purchase Order Contract */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-border-strong border-border/60 pb-2 px-1">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-primary" />
                          <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                            1. Raised Contractual Purchase Order ({poDetail?.poNumber || data.po?.poNumber || 'PO'})
                          </span>
                        </div>
                        {poDetail && (
                          <button
                            type="button"
                            onClick={() => handlePrintPo()}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                          >
                            <Printer size={11} />
                            <span>Print PO</span>
                          </button>
                        )}
                      </div>
                      <div className="rounded-xl border border-border/80 bg-surface p-2 shadow-xs overflow-x-auto min-h-[500px]">
                        {poDetail ? (
                          <PurchaseOrderPDF po={poDetail} ref={printPoRef} isPrintPreview={true} />
                        ) : (
                          <div className="p-8 text-center text-xs text-muted-foreground">
                            Purchase order document details not available for this record.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Generated Claim Voucher */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-border-strong border-border/60 pb-2 px-1">
                        <div className="flex items-center gap-2">
                          <Receipt size={14} className="text-tone-amber-text" />
                          <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                            2. Commercial Debit Claim Voucher ({data.debitNoteNumber})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePrint()}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          <Printer size={11} />
                          <span>Print Claim</span>
                        </button>
                      </div>
                      <div className="rounded-xl border border-border/80 bg-surface p-2 shadow-xs overflow-x-auto min-h-[500px]">
                        <DebitNotePDF note={data} ref={printRef} />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. ONLY CLAIM VOUCHER */}
                {previewTab === 'claim' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-border-strong border-border/60 pb-2 px-1">
                      <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                        Official Debit Claim Voucher ({data.debitNoteNumber})
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePrint()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        <Printer size={11} />
                        <span>Print Claim</span>
                      </button>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-surface p-2 shadow-xs overflow-auto">
                      <DebitNotePDF note={data} ref={printRef} />
                    </div>
                  </div>
                )}

                {/* 3. ONLY PURCHASE ORDER */}
                {previewTab === 'po' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-border-strong border-border/60 pb-2 px-1">
                      <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                        Contractual Purchase Order ({poDetail?.poNumber || data.po?.poNumber || 'PO'})
                      </span>
                      {poDetail && (
                        <button
                          type="button"
                          onClick={() => handlePrintPo()}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          <Printer size={11} />
                          <span>Print PO</span>
                        </button>
                      )}
                    </div>
                    <div className="rounded-xl border border-border/80 bg-surface p-2 shadow-xs overflow-auto">
                      {poDetail ? (
                        <PurchaseOrderPDF po={poDetail} ref={printPoRef} isPrintPreview={true} />
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          Purchase order document details not available for this record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. ATTACHED VENDOR DELIVERY PROOF */}
                {previewTab === 'vendor_doc' && uploadedVendorDoc && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-border-strong border-border/60 pb-2 px-1">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-primary" />
                        <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                          Vendor Delivery Slip / Inward Proof ({data.grn?.grnNumber || 'GRN'})
                        </span>
                      </div>
                      <a
                        href={uploadedVendorDoc}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        <ExternalLink size={11} />
                        <span>Open Raw File</span>
                      </a>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-surface p-2 shadow-xs overflow-hidden">
                      {/\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(uploadedVendorDoc) ||
                      Boolean(grnDocs?.[0]?.fileName?.match(/\.(png|jpe?g|webp|gif|bmp|svg)$/i)) ? (
                        <div className="min-h-[500px] flex items-center justify-center p-2 bg-muted/50 rounded-lg">
                          <img
                            src={uploadedVendorDoc}
                            alt="Vendor Delivery Proof"
                            className="max-w-full max-h-[750px] object-contain mx-auto rounded shadow-sm bg-surface"
                          />
                        </div>
                      ) : (
                        <iframe
                          src={uploadedVendorDoc}
                          title="Vendor Delivery Proof"
                          className="w-full h-[750px] rounded-lg border-accent bg-surface"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SendDebitNoteModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        debitNote={{
          id: data.id,
          debitNoteNumber: data.debitNoteNumber,
          totalAmount: priceOnlyAmount,
          reason: data.reason,
        }}
        vendor={data.vendor}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['debit-note', id] });
          queryClient.invalidateQueries({ queryKey: ['debit-notes'] });
          queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] });
          queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] });
          queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
          queryClient.invalidateQueries({ queryKey: ['purchases', 'vendor-history'] });
          queryClient.invalidateQueries({ queryKey: ['vendors'] });
        }}
      />
    </main>
  );
}
