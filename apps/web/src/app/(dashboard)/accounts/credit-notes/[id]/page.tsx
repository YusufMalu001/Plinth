'use client';

import React, { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  ArrowLeft,
  CheckCircle2,
  Printer,
  Maximize2,
  Minimize2,
  AlertCircle,
  FileText,
  Building2,
  ShieldCheck,
  Send,
  ExternalLink,
  BookOpen,
  Clock,
} from 'lucide-react';
import { Button } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { formatCurrency, formatDate } from '@/features/accounts/utils';
import { numberToIndianWords, SYNERGY_COMPANY_INFO } from '@/features/purchases/utils';
import { useCurrentUser } from '@/features/auth/hooks';
import { showToast } from '@/components/toast-store';

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [pending, setPending] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'full'>('split');
  const printRef = useRef<HTMLDivElement>(null);

  const noteQuery = useQuery({
    queryKey: ['accounts', 'credit-note', params.id],
    queryFn: () => accountsApi.arCreditNote(params.id),
  });

  const note = noteQuery.data;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: note?.noteNumber || 'Credit-Note',
  });

  const permissions = new Set((user.data?.permissions || []).map((p) => p.toLowerCase()));
  const isAdmin = user.data?.role === 'admin';
  const can = (action: string) => isAdmin || permissions.has(`${action}:salesarinvoice`) || permissions.has('read:accounts');

  const runAction = async (action: 'submit' | 'approve' | 'post', successMsg: string) => {
    if (!note) return;
    setPending(true);
    try {
      await accountsApi.transitionArCreditNote(note.id, action, note.version || 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'credit-note', params.id] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] }),
      ]);
      showToast({
        kind: 'success',
        title: 'Action Completed',
        message: successMsg,
      });
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Action Failed',
        message: err?.message || 'Could not complete action.',
      });
    } finally {
      setPending(false);
    }
  };

  if (noteQuery.isLoading) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-synergy-600 border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Loading credit note details…</p>
      </main>
    );
  }

  if (noteQuery.isError || !note) {
    return (
      <main className="space-y-4 p-5 md:p-8 max-w-2xl mx-auto mt-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Could not load this credit note</h2>
        <p className="text-xs text-muted-foreground">
          {noteQuery.error instanceof Error ? noteQuery.error.message : 'Credit note not found or access denied.'}
        </p>
        <Link href="/accounts/credit-notes">
          <Button variant="outline" size="sm" className="mt-2 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Credit Notes
          </Button>
        </Link>
      </main>
    );
  }

  const taxableVal = parseFloat(note.taxableAmount || '0');
  const taxVal = parseFloat(note.taxAmount || '0');
  const totalVal = parseFloat(note.totalAmount || '0');
  const cgstVal = taxVal / 2;
  const sgstVal = taxVal / 2;

  return (
    <main className="flex-1 space-y-6 p-4 md:p-8 print:p-0 print:space-y-0">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href="/accounts/credit-notes"
              className="hover:text-foreground transition-colors flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Credit Notes &amp; Returns Workbench
            </Link>
            <span>/</span>
            <span className="font-mono text-foreground font-semibold">{note.noteNumber}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              {note.noteNumber}
            </h1>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                note.status === 'POSTED'
                  ? 'bg-muted text-foreground border border-border'
                  : note.status === 'APPROVED'
                  ? 'bg-muted text-foreground border border-border'
                  : note.status === 'SUBMITTED'
                  ? 'bg-muted text-foreground border border-border'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {note.status}
            </span>

            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              {note.partyType} (AR Sales Return)
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Submit for Approval */}
          {note.status === 'DRAFT' && can('submit') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm text-xs"
              onClick={() => void runAction('submit', 'Credit note submitted for review and approval.')}
            >
              <Send className="h-4 w-4" /> Submit for Approval
            </Button>
          )}

          {/* Approve */}
          {note.status === 'SUBMITTED' && can('approve') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm text-xs"
              onClick={() => void runAction('approve', 'Credit note approved and verified for ledger posting.')}
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Note
            </Button>
          )}

          {/* Post to Ledger */}
          {note.status === 'APPROVED' && can('post') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm text-xs"
              onClick={() => void runAction('post', 'Credit note posted to General Ledger and COGS reversed.')}
            >
              <BookOpen className="h-4 w-4" /> Post to Ledger
            </Button>
          )}

          {/* View Mode Toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewMode(viewMode === 'split' ? 'full' : 'split')}
            className="gap-1.5 text-xs"
          >
            {viewMode === 'split' ? (
              <>
                <Maximize2 className="h-4 w-4" /> Expand Document
              </>
            ) : (
              <>
                <Minimize2 className="h-4 w-4" /> Split View
              </>
            )}
          </Button>

          {/* Print / PDF */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
            className="gap-1.5 text-xs"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Total Credit Value</span>
          <div className="text-xl font-bold text-primary font-mono mt-1">
            {formatCurrency(totalVal)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Net receivable reduction
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Taxable Base Amount</span>
          <div className="text-xl font-bold text-foreground font-mono mt-1">
            {formatCurrency(taxableVal)}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Sales revenue reversal
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">GST Output Adjustment</span>
          <div className="text-xl font-bold text-foreground font-mono mt-1">
            {formatCurrency(taxVal)}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 block font-medium">
            GSTR-1 CDNR Table 9B
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Original Invoice Ref</span>
          <div className="text-sm font-bold font-mono text-foreground mt-1 truncate">
            {note.originalInvoiceNumber || '—'}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Dated: {note.originalInvoiceDate ? formatDate(note.originalInvoiceDate) : 'N/A'}
          </span>
        </div>
      </div>

      {/* Main Grid: Split View or Full View */}
      <div className={`grid gap-6 ${viewMode === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'}`}>
        {/* Left Column: Metadata & Lineage (Hidden in Full Mode or Print) */}
        {viewMode === 'split' && (
          <div className="lg:col-span-5 space-y-4 print:hidden">
            {/* Commercial & Statutory Summary */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/70 pb-3">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Commercial &amp; Statutory Details</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Reason Category:</span>
                  <p className="font-bold text-foreground mt-0.5">{note.reasonCode}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Commercial Memo &amp; Justification:</span>
                  <p className="mt-1 rounded-xl bg-muted/30 p-3 border border-border text-foreground leading-relaxed">
                    {note.reasonDescription || 'Sales return & credit adjustment'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-xl bg-muted/20 p-2.5 border border-border">
                    <span className="text-[11px] text-muted-foreground">GSTR-1 CDNR Reversal</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {note.adjustGst ? 'Yes (Output GST Reduced)' : 'No Tax Adjustment'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/20 p-2.5 border border-border">
                    <span className="text-[11px] text-muted-foreground">Warehouse Restock</span>
                    <p className="font-semibold text-primary mt-0.5">
                      {note.restockInventory ? 'Reversed to Stock (COGS Reversal)' : 'Financial Only'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Party & Document Lineage */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-border/70 pb-3">
                <Building2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Customer &amp; Document Lineage</h3>
              </div>

              <div className="space-y-2.5">
                <div>
                  <span className="text-muted-foreground">Customer Legal Name:</span>
                  <p className="font-bold text-foreground mt-0.5">{note.partyName}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Customer GSTIN:</span>
                  <p className="font-mono font-medium text-foreground mt-0.5">
                    {note.partyGstin || 'Unregistered / Consumer'}
                  </p>
                </div>

                <div>
                  <span className="text-muted-foreground">Place of Supply:</span>
                  <p className="font-medium text-foreground mt-0.5">{note.placeOfSupply}</p>
                </div>

                {note.invoiceId && (
                  <div className="pt-2 border-t border-border/70">
                    <span className="text-muted-foreground">Linked Tax Invoice:</span>
                    <Link
                      href={`/accounts/sales/invoices/${note.invoiceId}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-primary hover:underline font-mono font-semibold"
                    >
                      {note.originalInvoiceNumber} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {note.voucherNumber && (
                  <div>
                    <span className="text-muted-foreground">Posted Journal Voucher:</span>
                    <Link
                      href={`/accounts/journals`}
                      className="mt-1 inline-flex items-center gap-1.5 text-primary hover:underline font-mono font-semibold"
                    >
                      {note.voucherNumber} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Trail */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-border/70 pb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Audit &amp; Accountability</h3>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Issue Date:</span>
                  <span className="font-mono font-medium text-foreground">
                    {formatDate(note.issueDate)}
                  </span>
                </div>
                {note.creator && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prepared By:</span>
                    <span className="font-medium text-foreground">
                      {note.creator.name || note.creator.email} ({note.creator.role || 'Accounts'})
                    </span>
                  </div>
                )}
                {note.approver && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved By:</span>
                    <span className="font-medium text-foreground">
                      {note.approver.name || note.approver.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Master ERP Credit Note Document (Official Printable Sheet) */}
        <div className={viewMode === 'split' ? 'lg:col-span-7' : 'w-full max-w-4xl mx-auto'}>
          <div
            id="credit-note-document"
            ref={printRef}
            className="rounded-3xl border border-border bg-white text-slate-900 p-6 md:p-8 shadow-md dark:bg-card dark:text-foreground dark:border-border print:border-0 print:bg-white print:p-0 print:shadow-none w-full"
          >
            {/* Top Document Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-border pb-5">
              <div className="flex items-center gap-4">
                <Image
                  src="/synergy.png"
                  alt="Synergy International"
                  width={150}
                  height={45}
                  priority
                  className="h-auto w-28 object-contain"
                />
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Accounts Receivable · Statutory GST Adjustment
                  </p>
                  <h2 className="mt-0.5 text-xl md:text-2xl font-bold">Credit Note (CDNR)</h2>
                  <p className="text-[11px] text-slate-500 dark:text-muted-foreground">
                    Issued under Section 34 of the CGST Act, 2017
                  </p>
                </div>
              </div>

              <div className="text-right text-xs">
                <p className="text-slate-500 dark:text-muted-foreground">Credit Note Number</p>
                <p className="font-mono font-bold text-base text-foreground">{note.noteNumber}</p>
                <p className="mt-1 text-slate-500 dark:text-muted-foreground">Credit Note Date</p>
                <p className="font-mono font-semibold text-foreground">{formatDate(note.issueDate)}</p>
              </div>
            </div>

            {/* Issuer & Recipient Profile Cards */}
            <div className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2 dark:border-border">
              {/* Supplier Info */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  Issued By (Seller / Supplier)
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {SYNERGY_COMPANY_INFO.name}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{SYNERGY_COMPANY_INFO.gstin}</span> · State: {SYNERGY_COMPANY_INFO.state} ({SYNERGY_COMPANY_INFO.stateCode})
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  {SYNERGY_COMPANY_INFO.addressLine1} {SYNERGY_COMPANY_INFO.addressLine2} {SYNERGY_COMPANY_INFO.addressLine3}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  Phone: {SYNERGY_COMPANY_INFO.phone} · Email: {SYNERGY_COMPANY_INFO.email}
                </p>
              </div>

              {/* Recipient / Customer Info */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  Issued To (Recipient / Customer)
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {note.partyName}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{note.partyGstin || 'URP / Consumer'}</span>
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  Place of Supply: <span className="font-semibold">{note.placeOfSupply}</span>
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  Original Invoice Ref:{' '}
                  <span className="font-mono font-bold text-foreground dark:text-synergy-300">
                    {note.originalInvoiceNumber}
                  </span>{' '}
                  ({note.originalInvoiceDate ? formatDate(note.originalInvoiceDate) : 'N/A'})
                </p>
              </div>
            </div>

            {/* Reason & Commercial Scope */}
            <div className="py-3 border-b border-slate-200 text-xs flex flex-wrap justify-between items-center gap-2 dark:border-border">
              <div>
                <span className="text-slate-500 dark:text-muted-foreground">Adjustment Reason: </span>
                <span className="font-bold text-foreground uppercase">{note.reasonCode}</span>
                <span className="text-slate-500 dark:text-muted-foreground"> — {note.reasonDescription}</span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                Original Invoice Total: {formatCurrency(note.originalInvoiceTotal || 0)}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 font-bold dark:border-border dark:bg-muted/40 dark:text-muted-foreground">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5">Item Description</th>
                    <th className="p-2.5 text-center w-24">HSN/SAC</th>
                    <th className="p-2.5 text-right w-20">Qty</th>
                    <th className="p-2.5 text-right w-24">Rate (₹)</th>
                    <th className="p-2.5 text-right w-24">Taxable (₹)</th>
                    <th className="p-2.5 text-center w-20">GST %</th>
                    <th className="p-2.5 text-right w-24">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono dark:divide-border/60">
                  {note.lines && note.lines.length > 0 ? (
                    note.lines.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-muted/10">
                        <td className="p-2.5 text-center text-slate-500 dark:text-muted-foreground">{idx + 1}</td>
                        <td className="p-2.5 font-sans font-medium text-foreground">{item.description}</td>
                        <td className="p-2.5 text-center text-slate-500 dark:text-muted-foreground">{item.hsnSacCode || '8421'}</td>
                        <td className="p-2.5 text-right text-foreground font-semibold">{item.quantity}</td>
                        <td className="p-2.5 text-right text-slate-600 dark:text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-2.5 text-right text-foreground font-semibold">{formatCurrency(item.taxableAmount)}</td>
                        <td className="p-2.5 text-center text-slate-600 dark:text-muted-foreground">{item.gstRate}%</td>
                        <td className="p-2.5 text-right font-bold text-foreground">{formatCurrency(item.totalAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-2.5 text-center text-slate-500 dark:text-muted-foreground">1</td>
                      <td className="p-2.5 font-sans font-medium text-foreground">
                        {note.reasonDescription || 'Commercial Credit Note / Rate Adjustment'}
                      </td>
                      <td className="p-2.5 text-center text-slate-500 dark:text-muted-foreground">998319</td>
                      <td className="p-2.5 text-right text-foreground font-semibold">1</td>
                      <td className="p-2.5 text-right text-slate-600 dark:text-muted-foreground">{formatCurrency(taxableVal)}</td>
                      <td className="p-2.5 text-right text-foreground font-semibold">{formatCurrency(taxableVal)}</td>
                      <td className="p-2.5 text-center text-slate-600 dark:text-muted-foreground">18%</td>
                      <td className="p-2.5 text-right font-bold text-foreground">{formatCurrency(totalVal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals & Tax Calculation Breakdown */}
            <div className="grid gap-4 border-t-2 border-slate-300 py-4 sm:grid-cols-2 dark:border-border">
              {/* Amount in words & statutory note */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Credit Amount (in words):
                  </span>
                  <p className="font-bold text-foreground capitalize mt-0.5">
                    {numberToIndianWords(totalVal)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed border border-slate-200 dark:bg-muted/20 dark:text-muted-foreground dark:border-border">
                  <p className="font-semibold text-slate-800 dark:text-foreground mb-1">
                    Statutory Declaration:
                  </p>
                  This Credit Note is issued in accordance with Section 34 of the CGST Act, 2017. Tax liability
                  has been adjusted and will be declared in the GSTR-1 return. Credit is to be accounted for in the
                  recipient&apos;s GSTR-2B ITC reversal.
                </div>
              </div>

              {/* Financial Totals */}
              <div className="space-y-1.5 font-mono text-xs text-right">
                <div className="flex justify-between text-slate-600 dark:text-muted-foreground">
                  <span>Total Taxable Amount:</span>
                  <span className="font-bold text-foreground">{formatCurrency(taxableVal)}</span>
                </div>

                {note.adjustGst && (
                  <>
                    <div className="flex justify-between text-slate-600 dark:text-muted-foreground">
                      <span>Output CGST (9%):</span>
                      <span className="font-bold text-foreground">{formatCurrency(cgstVal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-muted-foreground">
                      <span>Output SGST (9%):</span>
                      <span className="font-bold text-foreground">{formatCurrency(sgstVal)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-sm font-bold text-foreground dark:border-border">
                  <span>Grand Total Credit:</span>
                  <span className="text-foreground">
                    {formatCurrency(totalVal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Signatory Box */}
            <div className="mt-6 pt-6 border-t border-slate-200 flex justify-between items-end text-xs dark:border-border">
              <div className="text-slate-500 dark:text-muted-foreground text-[11px]">
                <p>Generated electronically by Synergy ERP Platform</p>
                <p>Authentic official document · Valid without physical seal</p>
              </div>

              <div className="text-right space-y-8">
                <p className="font-bold text-slate-900 dark:text-foreground">
                  For {SYNERGY_COMPANY_INFO.name}
                </p>
                <div className="border-t border-slate-400 pt-1 text-[11px] font-semibold text-slate-600 dark:text-muted-foreground">
                  Authorized Signatory
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
