'use client';

import React, { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  ArrowLeft,
  CheckCircle2,
  Pencil,
  Printer,
  CreditCard,
  Wallet,
  Building2,
  AlertCircle,
  ExternalLink,
  FileText,
  AlertTriangle,
  Receipt,
  Tag,
  Maximize2,
  Minimize2,
  Send,
  ShoppingBag,
  PackageCheck,
  Layers,
} from 'lucide-react';
import { Button } from '@plinth/ui';
import Link from 'next/link';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { RecordBillPaymentModal } from '@/features/accounts/components/RecordBillPaymentModal';
import { EditBillModal } from '@/features/accounts/components/EditBillModal';
import { SendDebitNoteModal } from '@/features/accounts/components/SendDebitNoteModal';
import { DebitCreditNoteModal } from '@/features/accounts/components/DebitCreditNoteModal';
import { EditGrnDebitNoteModal } from '@/features/accounts/components/EditGrnDebitNoteModal';
import { formatCurrency, formatDate } from '@/features/accounts/utils';
import { useCurrentUser } from '@/features/auth/hooks';
import { PurchaseBill, PaymentMode } from '@/features/accounts/types';
import { showToast } from '@/components/toast-store';

export default function SupplierBillDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [pending, setPending] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDebitCreditNoteModalOpen, setIsDebitCreditNoteModalOpen] = useState(false);
  const [editingDebitNoteId, setEditingDebitNoteId] = useState<string | null>(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'full'>('split');
  const [activeLineageTab, setActiveLineageTab] = useState<'po' | 'grn' | 'debit_notes' | 'payments'>('po');
  const [selectedDebitNoteForSend, setSelectedDebitNoteForSend] = useState<{
    id: string;
    debitNoteNumber: string;
    totalAmount?: string | number;
    reason?: string;
  } | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Supplier-Bill',
  });

  const billQuery = useQuery({
    queryKey: ['accounts', 'ap', 'bill', params.id],
    queryFn: () => accountsApi.apBill(params.id),
  });
  const bill = billQuery.data;
  const entities = useQuery({ queryKey: ['accounts', 'entities'], queryFn: accountsApi.entities });
  const permissions = new Set((user.data?.permissions || []).map((permission) => permission.toLowerCase()));
  const isAdmin = user.data?.role === 'admin';
  const can = (action: string) => isAdmin || permissions.has(`${action}:purchasebill`);

  const runAction = async (action: () => Promise<PurchaseBill>, success: string) => {
    setPending(true);
    try {
      const updated = await action();
      if (updated) await queryClient.setQueryData(['accounts', 'ap', 'bill', params.id], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] }),
      ]);
      showToast({
        kind: 'success',
        title: 'Action Completed',
        message: success,
      });
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Action Failed',
        message: error instanceof Error ? error.message : 'Could not complete this action.',
      });
    } finally {
      setPending(false);
    }
  };

  const handleRecordPayment = async (input: {
    paymentDate: string;
    amount: string;
    paymentMode: PaymentMode;
    reference: string;
    notes?: string;
  }) => {
    if (!bill) return;
    setIsSavingPayment(true);
    try {
      await accountsApi.recordBillPayment(bill.id, input);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] }),
      ]);
      showToast({
        kind: 'success',
        title: 'Payment Recorded',
        message: `Payment of ${formatCurrency(input.amount)} recorded against this bill.`,
      });
      setIsPaymentModalOpen(false);
    } catch (e: any) {
      showToast({
        kind: 'error',
        title: 'Payment Failed',
        message: e?.message || 'Could not record payment.',
      });
      throw e;
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleSaveBillEdits = async (payload: any) => {
    if (!bill) return;
    try {
      const updated = await accountsApi.updateApBill(bill.id, payload);
      queryClient.setQueryData(['accounts', 'ap', 'bill', params.id], updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] }),
      ]);
      showToast({
        kind: 'success',
        title: isAdmin ? 'Supplier Bill Updated' : 'Changes Submitted',
        message: isAdmin
          ? 'Supplier bill updated successfully.'
          : 'Bill details updated. Admin has been notified for approval.',
      });
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Update Failed',
        message: err?.message || 'Failed to update supplier bill.',
      });
      throw err;
    }
  };

  if (billQuery.isLoading) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-n-600 border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Loading supplier bill…</p>
      </main>
    );
  }

  if (billQuery.isError || !bill) {
    return (
      <main className="space-y-4 p-5 md:p-8 max-w-2xl mx-auto mt-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Could not load this supplier bill</h2>
        <p className="text-xs text-muted-foreground">{billQuery.error instanceof Error ? billQuery.error.message : ''}</p>
        <Link href="/accounts/purchases">
          <Button variant="outline" size="sm" className="mt-2 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Purchases &amp; Payables
          </Button>
        </Link>
      </main>
    );
  }

  // Financial calculations
  const totalTaxable = bill.lines.reduce((sum, line) => sum + Number(line.taxableAmount || 0), 0);
  const totalCgst = bill.lines.reduce((sum, line) => sum + Number(line.cgstAmount || 0), 0);
  const totalSgst = bill.lines.reduce((sum, line) => sum + Number(line.sgstAmount || 0), 0);
  const totalIgst = bill.lines.reduce((sum, line) => sum + Number(line.igstAmount || 0), 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const grossTotal = Number(bill.grossTotal ?? (totalTaxable + totalTax));
  const debitNoteDeduction = Number(bill.debitNoteDeduction ?? 0);
  const debitNoteClaimTotal = Number(bill.debitNoteClaimTotal ?? bill.debitNotes?.reduce((sum, note) => sum + Number(note.totalAmount || 0), 0) ?? 0);
  const pendingDebitNoteClaimTotal = Number(bill.pendingDebitNoteClaimTotal ?? Math.max(0, debitNoteClaimTotal - debitNoteDeduction));
  const netPayable = Math.max(0, Number(bill.netPayable ?? (grossTotal - debitNoteDeduction)));
  const paid = Number(bill.paidAmount ?? 0);
  const balance = Math.max(0, Number(bill.balanceAmount ?? (netPayable - paid)));

  const canEdit = (bill.status === 'DRAFT' || bill.status === 'SUBMITTED' || bill.status === 'APPROVED') && can('update');
  const isApprovedOrPosted = bill.status === 'APPROVED' || bill.status === 'POSTED';
  const paymentStatus = bill.paymentStatus || (netPayable === 0 ? 'NO_VALUE' : balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING');

  const primaryPo = bill.primaryPoNumber || bill.relatedPurchaseOrders?.[0]?.poNumber || bill.lines[0]?.poLine?.purchaseOrder?.poNumber;
  const primaryGrn = bill.primaryGrnNumber || bill.relatedGrns?.[0]?.grnNumber || bill.lines[0]?.grnLine?.grn?.grnNumber;

  // Aggregated Lineage items for PO and GRN
  const linkedPos = (() => {
    const map = new Map<
      string,
      {
        id?: string;
        poNumber: string;
        status?: string;
        date?: string;
        lines: typeof bill.lines;
      }
    >();

    if (bill?.relatedPurchaseOrders) {
      for (const po of bill.relatedPurchaseOrders) {
        if (po.poNumber) {
          map.set(po.poNumber, {
            id: po.id,
            poNumber: po.poNumber,
            status: po.status,
            date: po.date,
            lines: [],
          });
        }
      }
    }

    if (bill?.lines) {
      for (const line of bill.lines) {
        const poObj = line.poLine?.purchaseOrder;
        const poNum = poObj?.poNumber || bill.primaryPoNumber;
        if (poNum) {
          const existing = map.get(poNum) || {
            id: poObj?.id,
            poNumber: poNum,
            status: poObj?.status,
            date: poObj?.orderDate,
            lines: [],
          };
          if (poObj?.id && !existing.id) existing.id = poObj.id;
          if (poObj?.status && !existing.status) existing.status = poObj.status;
          if (poObj?.orderDate && !existing.date) existing.date = poObj.orderDate;
          existing.lines.push(line);
          map.set(poNum, existing);
        }
      }
    }
    return Array.from(map.values());
  })();

  const linkedGrns = (() => {
    const map = new Map<
      string,
      {
        id?: string;
        grnNumber: string;
        status?: string;
        receivedDate?: string;
        lines: typeof bill.lines;
      }
    >();

    if (bill?.relatedGrns) {
      for (const grn of bill.relatedGrns) {
        if (grn.grnNumber) {
          map.set(grn.grnNumber, {
            id: grn.id,
            grnNumber: grn.grnNumber,
            status: grn.status,
            receivedDate: grn.receivedDate,
            lines: [],
          });
        }
      }
    }

    if (bill?.lines) {
      for (const line of bill.lines) {
        const grnObj = line.grnLine?.grn;
        const grnNum = grnObj?.grnNumber || bill.primaryGrnNumber;
        if (grnNum) {
          const existing = map.get(grnNum) || {
            id: grnObj?.id,
            grnNumber: grnNum,
            status: grnObj?.status,
            receivedDate: grnObj?.receivedDate,
            lines: [],
          };
          if (grnObj?.id && !existing.id) existing.id = grnObj.id;
          if (grnObj?.status && !existing.status) existing.status = grnObj.status;
          if (grnObj?.receivedDate && !existing.receivedDate) existing.receivedDate = grnObj.receivedDate;
          existing.lines.push(line);
          map.set(grnNum, existing);
        }
      }
    }
    return Array.from(map.values());
  })();

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Supplier Bill Details"
        entities={entities.data || []}
        selectedEntityId={bill.entityId}
        onSelectEntity={() => undefined}
        hideCompany
      />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/accounts/purchases"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Purchases &amp; Payables Register
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Bill Details for Accounts */}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditModalOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="h-4 w-4" /> Edit Bill Details
            </Button>
          )}

          {/* Admin Approval Button */}
          {bill.status === 'SUBMITTED' && can('approve') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              onClick={() =>
                void runAction(
                  () => accountsApi.approveApBill(bill.id, bill.version),
                  'Supplier bill approved. Accounts can now disburse payment.'
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Bill Changes
            </Button>
          )}

          {/* Direct Approval for Draft Bills if Admin */}
          {bill.status === 'DRAFT' && isAdmin && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              onClick={() =>
                void runAction(
                  () => accountsApi.approveApBill(bill.id, bill.version),
                  'Supplier bill approved and marked ready for payment.'
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Bill
            </Button>
          )}

          {/* Record Payment */}
          {isApprovedOrPosted && balance > 0 && can('create') && (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm"
              onClick={() => setIsPaymentModalOpen(true)}
            >
              <CreditCard className="h-4 w-4" /> Record Payment
            </Button>
          )}

          {/* Issue Debit / Credit Note */}
          {bill.status !== 'CANCELLED' && can('create') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsDebitCreditNoteModalOpen(true)}
              className="gap-1.5 text-xs font-semibold shadow-sm border-n-200 hover:bg-muted text-foreground dark:text-n-300 dark:border-n-900"
            >
              <FileText className="h-4 w-4" /> Credit / Debit Note
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewMode(viewMode === 'split' ? 'full' : 'split')}
            className="gap-1.5"
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

          <Button variant="outline" size="sm" onClick={() => handlePrint()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>



      {/* Admin Review Notification Banner if SUBMITTED */}
      {bill.status === 'SUBMITTED' && (
        <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-5 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-950 dark:text-amber-200">
                  Bill Changes Awaiting Admin Approval
                </h3>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed max-w-2xl">
                  {bill.submittedByUser
                    ? `Accounts user ${bill.submittedByUser.name || bill.submittedByUser.email} edited the details of this bill.`
                    : 'Accounts personnel updated this bill.'}{' '}
                  An Administrator must review and approve these modifications before payment disbursement can proceed.
                </p>
                {bill.resolutionNote && (
                  <p className="mt-2 text-xs font-medium italic text-amber-900 dark:text-amber-200">
                    Accounts note: &ldquo;{bill.resolutionNote}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {can('approve') && (
              <Button
                size="sm"
                disabled={pending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-md"
                onClick={() =>
                  void runAction(
                    () => accountsApi.approveApBill(bill.id, bill.version),
                    'Supplier bill approved successfully. Payments can now be recorded.'
                  )
                }
              >
                <CheckCircle2 className="h-4 w-4" /> Approve Changes Now
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Bill Header Hero Banner */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-n-500/5 p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
                Supplier Tax Invoice
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold font-mono">
                {bill.kind}
              </span>
              <span className="rounded-full bg-n-50 px-2 py-0.5 text-[10px] font-bold text-foreground dark:bg-n-950/50 dark:text-n-300">
                Direct GRN Conversion
              </span>
            </div>
            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {bill.supplierInvoiceNumber}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground">
                {bill.vendor?.legalName || bill.vendorNameSnapshot}
              </span>
              {bill.vendor?.code && <span className="font-mono text-xs">({bill.vendor.code})</span>}
              <span>·</span>
              <span>GSTIN: {bill.vendorGstinSnapshot || bill.vendor?.taxNumber || 'Unregistered'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PaymentStatusPill status={paymentStatus} />
            <StatusPill
              tone={
                bill.status === 'APPROVED' || bill.status === 'POSTED'
                  ? 'green'
                  : bill.status === 'SUBMITTED'
                  ? 'amber'
                  : 'blue'
              }
            >
              {billStatusLabel(bill.status)}
            </StatusPill>
          </div>
        </div>

        {/* Linked Document Cross-References Bar */}
        <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-border/60">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Linked References:
          </span>

          {primaryPo ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>PO:</span>
              <span className="font-bold text-foreground">{primaryPo}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">No linked PO</span>
          )}

          {primaryGrn ? (
            <Link
              href={`/receiving/goods-receipts/${bill.relatedGrns?.[0]?.id || ''}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl hover:border-primary hover:text-primary transition"
            >
              <Receipt className="h-3.5 w-3.5 text-emerald-600" />
              <span>GRN:</span>
              <span className="font-bold text-foreground">{primaryGrn}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground italic">Direct Intake</span>
          )}

          {bill.debitNotes && bill.debitNotes.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-mono font-bold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              <Tag className="h-3.5 w-3.5 text-rose-600" />
              <span>Debit Notes ({bill.debitNotes.length}):</span>
              <span>{bill.debitNotes.map((d) => d.debitNoteNumber).join(', ')}</span>
              <span>Claim {formatCurrency(debitNoteClaimTotal)}</span>
              {pendingDebitNoteClaimTotal > 0 && <span className="text-amber-700">· {formatCurrency(pendingDebitNoteClaimTotal)} awaiting approval</span>}
              {debitNoteDeduction > 0 && <span>· {formatCurrency(debitNoteDeduction)} offset</span>}
            </span>
          )}
        </div>

        {/* 4 Financial Highlight Metric Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Invoiced Gross Total</span>
            <p className="mt-1 text-xl font-bold font-mono text-foreground">{formatCurrency(grossTotal)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatCurrency(totalTaxable)} taxable + {formatCurrency(totalTax)} GST
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Debit Notes Offset</span>
            <p className="mt-1 text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {debitNoteDeduction > 0 ? `- ${formatCurrency(debitNoteDeduction)}` : '₹0.00'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {debitNoteDeduction > 0 ? 'Approved and deducted from payable' : pendingDebitNoteClaimTotal > 0 ? `${formatCurrency(pendingDebitNoteClaimTotal)} claim awaiting approval` : 'No approved debit note offset'}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Settled / Paid</span>
            <p className="mt-1 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(paid)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {netPayable > 0 ? `${Math.min(100, Math.round((paid / netPayable) * 100))}% of net payable paid` : 'No payable balance'}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-4 shadow-sm ${
              balance > 0
                ? 'border-border bg-n-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Net Outstanding Balance</span>
              {balance > 0 && isApprovedOrPosted && (
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="text-[10px] font-bold text-foreground dark:text-n-300 underline hover:opacity-80"
                >
                  Pay Now
                </button>
              )}
            </div>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                balance > 0 ? 'text-foreground dark:text-n-300' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {formatCurrency(balance)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {balance <= 0 ? 'Fully settled invoice' : 'Pending accounts disbursement'}
            </p>
          </div>
        </div>
      </section>

      {/* Main Container: Split View / Full View for Document & Lineage Tabs */}
      <div className={viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : 'space-y-6'}>
        {/* Left / Primary: Bill Document Preview */}
        <section
          aria-labelledby="bill-preview-title"
          className={`${
            viewMode === 'split' ? 'lg:col-span-7' : 'w-full'
          } min-w-0 rounded-3xl border border-border bg-slate-100/80 p-4 shadow-sm md:p-6 dark:bg-card print:border-0 print:bg-white print:p-0 print:shadow-none`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h2 id="bill-preview-title" className="text-base font-bold text-foreground">
                Supplier Bill Document
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Formal Accounts Payable record with complete PO, GRN, and Debit Note lineage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setIsEditModalOpen(true)} className="gap-1.5 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> Edit Details
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setViewMode(viewMode === 'split' ? 'full' : 'split')}
                className="gap-1.5 text-xs font-semibold shadow-sm text-foreground dark:text-n-300 border-n-200 dark:border-n-900/50 hover:bg-muted dark:hover:bg-n-950/30"
              >
                {viewMode === 'split' ? (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Expand Full</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Split View</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div
            id="supplier-bill-document"
            ref={printRef}
            className={`mx-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-md md:p-7 dark:bg-card dark:text-foreground dark:border-border print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none ${
              viewMode === 'full' ? 'max-w-[1040px]' : 'w-full'
            }`}
          >
            {/* Document Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-border pb-5">
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black tracking-tight text-ink uppercase">Plinth</span>
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">Accounts Payable</p>
                  <h2 className="mt-0.5 text-xl md:text-2xl font-bold">Supplier Bill</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
                    Plinth · INR (₹)
                  </p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-500 dark:text-muted-foreground">Supplier Invoice Reference</p>
                <p className="font-mono font-bold text-base">{bill.supplierInvoiceNumber}</p>
                <p className="mt-1.5 text-slate-500 dark:text-muted-foreground">Bill Status</p>
                <p className="font-semibold text-foreground dark:text-n-300">
                  {billStatusLabel(bill.status)}
                </p>
              </div>
            </div>

            {/* Entity & Vendor Profile Cards */}
            <div className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2 dark:border-border">
              {/* Supplier Info */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Supplier / Vendor</p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {bill.vendor?.legalName || bill.vendorNameSnapshot}
                </p>
                {bill.vendor?.code && (
                  <p className="text-slate-500 dark:text-muted-foreground">Vendor Code: <span className="font-mono font-medium">{bill.vendor.code}</span></p>
                )}
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{bill.vendorGstinSnapshot || bill.vendor?.taxNumber || 'Unregistered'}</span>
                </p>
                {bill.vendor?.address && (
                  <p className="text-slate-600 dark:text-muted-foreground text-[11px] leading-relaxed">
                    {typeof bill.vendor.address === 'string'
                      ? bill.vendor.address
                      : [bill.vendor.address.street, bill.vendor.address.city, bill.vendor.address.state, bill.vendor.address.postalCode]
                          .filter(Boolean)
                          .join(', ')}
                  </p>
                )}
                {(bill.vendor?.contactEmail || bill.vendor?.contactPhone) && (
                  <p className="text-slate-500 dark:text-muted-foreground text-[11px]">
                    Contact: {[bill.vendor.contactEmail, bill.vendor.contactPhone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Billed Entity & Date Info */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Billed Entity (Buyer)</p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {bill.entity?.legalName || entities.data?.find((e) => e.id === bill.entityId)?.legalName || 'Plinth'}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{bill.entity?.gstin || entities.data?.find((e) => e.id === bill.entityId)?.gstin || 'Main'}</span>
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 dark:border-border/60">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Invoice Date</span>
                    <p className="font-semibold text-foreground">{formatDate(bill.invoiceDate)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Payment Due Date</span>
                    <p className="font-semibold text-foreground">{formatDate(bill.dueDate)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Classification</span>
                    <p className="font-semibold text-foreground">{bill.kind}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Payment Terms</span>
                    <p className="font-semibold text-foreground">{bill.vendor?.paymentTerms || 'Net 30'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Document References Block: PO, GRN, Debit Notes */}
            <div className="border-b border-slate-200 py-3 px-3.5 bg-n-50/40 rounded-xl my-3.5 text-xs flex flex-wrap items-center justify-between gap-4 dark:bg-muted/10 dark:border-border">
              <div className="flex flex-wrap items-center gap-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Purchase Order
                  </span>
                  <p className="font-mono font-bold text-foreground">
                    {primaryPo || 'Direct PO Intake'}
                  </p>
                </div>
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Goods Receipt (GRN)
                  </span>
                  <p className="font-mono font-bold text-foreground">
                    {primaryGrn || 'Direct Receipt'}
                  </p>
                </div>
                {bill.debitNotes && bill.debitNotes.length > 0 && (
                  <div className="border-l border-slate-200 pl-4 dark:border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Debit Note Claims
                    </span>
                    <p className="font-mono font-bold text-rose-700 dark:text-rose-300">
                      {bill.debitNotes.map((d) => d.debitNoteNumber).join(', ')} · Claim {formatCurrency(debitNoteClaimTotal)} · Offset {formatCurrency(debitNoteDeduction)}
                    </p>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-muted-foreground">
                  Audit Version
                </span>
                <p className="font-mono font-semibold text-foreground">v{bill.version}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-border print:overflow-visible">
              <table className="w-full min-w-[680px] text-left text-xs print:min-w-0 print:text-[9px]">
                <thead className="bg-n-800 text-white print:bg-slate-100 print:text-slate-900">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold w-7">#</th>
                    <th className="px-2.5 py-2 font-semibold">Item &amp; Description</th>
                    <th className="px-2.5 py-2 font-semibold font-mono">HSN/SAC</th>
                    <th className="px-2.5 py-2 font-semibold font-mono">PO / GRN</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Accepted Qty</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Unit Rate (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-center">GST %</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Taxable (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Tax (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-border">
                  {bill.lines.map((line) => {
                    const lineTax =
                      Number(line.cgstAmount || 0) + Number(line.sgstAmount || 0) + Number(line.igstAmount || 0);
                    const lineTotal = Number(line.taxableAmount || 0) + lineTax;
                    const grnNumber = line.grnLine?.grn.grnNumber || primaryGrn;
                    const poNumber = line.poLine?.purchaseOrder.poNumber || primaryPo;
                    const itemCode = line.product?.sku || line.material?.code;

                    return (
                      <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-muted/10 transition">
                        <td className="px-2.5 py-2 font-mono text-slate-500">{line.lineNumber}</td>
                        <td className="px-2.5 py-2">
                          <p className="font-semibold text-foreground">{line.description}</p>
                          {itemCode && (
                            <p className="font-mono text-[10px] text-slate-500 dark:text-muted-foreground">
                              SKU: {itemCode}
                            </p>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-mono">{line.hsnSacCode || '—'}</td>
                        <td className="px-2.5 py-2">
                          <div className="font-mono text-xs text-foreground">{poNumber || '—'}</div>
                          <div className="font-mono text-slate-500 text-[10px] dark:text-muted-foreground">
                            {grnNumber || '—'}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 font-mono text-right font-medium">
                          {line.quantity}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-right">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-2.5 py-2 text-center font-mono">{line.gstRate}%</td>
                        <td className="px-2.5 py-2 font-mono text-right">{formatCurrency(line.taxableAmount)}</td>
                        <td className="px-2.5 py-2 font-mono text-right text-slate-600 dark:text-muted-foreground">
                          {formatCurrency(lineTax)}
                        </td>
                        <td className="px-2.5 py-2 font-mono font-bold text-right text-foreground">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Subtotal & Deductions Summary */}
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_290px]">
              <div className="rounded-xl bg-slate-50 p-3.5 text-xs dark:bg-muted/20 space-y-1.5">
                <p className="font-bold text-foreground">Accounts Control &amp; Settlement Policy</p>
                <p className="text-slate-600 dark:text-muted-foreground leading-relaxed text-[11px]">
                  This bill was generated directly from verified warehouse receipt intake. All unit prices adhere to the
                  authorized Purchase Order terms. Any damaged, short, or rejected items are offset via formal Debit Notes.
                </p>
                <div className="pt-2 border-t border-slate-200 dark:border-border/60 text-[11px] text-slate-500 dark:text-muted-foreground space-y-1">
                  <p>• Created from GRN: <span className="font-mono font-medium text-foreground">{primaryGrn || 'N/A'}</span></p>
                  {bill.createdByUser && (
                    <p>• Generated by: <span className="font-medium text-foreground">{bill.createdByUser.name || bill.createdByUser.email}</span></p>
                  )}
                  {bill.approvedByUser && (
                    <p>• Approved by Admin: <span className="font-medium text-emerald-700 dark:text-emerald-400 font-semibold">{bill.approvedByUser.name || bill.approvedByUser.email}</span></p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-border bg-slate-50/50 dark:bg-muted/10">
                <Amount label="Taxable Subtotal" value={formatCurrency(totalTaxable)} />
                {totalCgst > 0 && <Amount label="CGST" value={formatCurrency(totalCgst)} />}
                {totalSgst > 0 && <Amount label="SGST" value={formatCurrency(totalSgst)} />}
                {totalIgst > 0 && <Amount label="IGST" value={formatCurrency(totalIgst)} />}
                <Amount label="Total Input GST" value={formatCurrency(totalTax)} />

                <div className="border-t border-slate-200 pt-1.5 dark:border-border font-bold">
                  <Amount label="Gross Invoiced Total" value={formatCurrency(grossTotal)} strong />
                </div>

                {debitNoteDeduction > 0 && (
                  <div className="text-rose-600 dark:text-rose-400">
                    <Amount label="Less: Debit Notes Deduction" value={`- ${formatCurrency(debitNoteDeduction)}`} />
                  </div>
                )}

                <div className="border-t-2 border-slate-300 pt-1.5 dark:border-border font-bold text-sm">
                  <Amount label="Net Payable to Vendor" value={formatCurrency(netPayable)} strong />
                </div>

                <div className="border-t border-slate-200 pt-1.5 dark:border-border text-emerald-600 dark:text-emerald-400">
                  <Amount label="Total Settled / Paid" value={formatCurrency(paid)} />
                </div>

                <div className="border-t border-slate-200 pt-1.5 dark:border-border font-bold text-sm">
                  <Amount label="Net Balance Due" value={formatCurrency(balance)} strong />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right / Secondary: Lineage Workspace Tabs (PO, GRN, Debit Note, Payments) */}
        <div
          className={`${
            viewMode === 'split' ? 'lg:col-span-5 sticky top-6' : 'w-full'
          } min-w-0 space-y-4 print:hidden`}
        >
          {/* Tab Navigation Controls */}
          <div className="rounded-3xl border border-border bg-card p-3 shadow-sm space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-foreground" />
                <h3 className="text-sm font-bold text-foreground">Lineage &amp; Documents</h3>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">
                Connected Records
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveLineageTab('po')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeLineageTab === 'po'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px]">PO</span>
                {linkedPos.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[9px] font-mono text-foreground dark:text-n-300">
                    {linkedPos.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveLineageTab('grn')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeLineageTab === 'grn'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[11px]">GRN</span>
                {linkedGrns.length > 0 && (
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-mono text-emerald-700 dark:text-emerald-300">
                    {linkedGrns.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveLineageTab('debit_notes')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeLineageTab === 'debit_notes'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Tag className="h-3.5 w-3.5 text-rose-600" />
                <span className="text-[11px]">Debit Note</span>
                {bill.debitNotes && bill.debitNotes.length > 0 && (
                  <span className="rounded-full bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-mono font-bold text-rose-700 dark:text-rose-300">
                    {bill.debitNotes.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveLineageTab('payments')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeLineageTab === 'payments'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5 text-foreground" />
                <span className="text-[11px]">Payments</span>
                {bill.payments && bill.payments.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[9px] font-mono text-foreground dark:text-n-300">
                    {bill.payments.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tab 1: Purchase Order (PO) Details */}
          {activeLineageTab === 'po' && (
            <div className="space-y-4">
              {linkedPos.length > 0 ? (
                linkedPos.map((po) => (
                  <div key={po.poNumber} className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-primary" />
                          <span className="font-mono font-bold text-base text-foreground">{po.poNumber}</span>
                          {po.status && (
                            <span className="rounded-full bg-n-100 dark:bg-n-950/50 text-foreground dark:text-n-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                              {po.status}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Purchase Order contract for verified pricing and quantities
                        </p>
                      </div>
                      {po.id && (
                        <Link
                          href={`/procurement/orders/${po.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                        >
                          View Full PO <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/20 p-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Vendor Name</span>
                        <p className="font-medium text-foreground">{bill.vendor?.legalName || bill.vendorNameSnapshot}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Payment Terms</span>
                        <p className="font-medium text-foreground">{bill.vendor?.paymentTerms || 'Net 30'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Currency</span>
                        <p className="font-medium text-foreground">{bill.vendor?.currency || 'INR (₹)'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Order Date</span>
                        <p className="font-medium text-foreground">{po.date ? formatDate(po.date) : 'On File'}</p>
                      </div>
                    </div>

                    {/* PO Items Billed */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-foreground">Billed Lines Under This PO</p>
                      <div className="overflow-x-auto rounded-2xl border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                            <tr>
                              <th className="p-2.5 font-semibold">Item</th>
                              <th className="p-2.5 font-semibold text-right">Qty</th>
                              <th className="p-2.5 font-semibold text-right">Rate</th>
                              <th className="p-2.5 font-semibold text-right">Taxable</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {po.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-muted/10 transition">
                                <td className="p-2.5 font-medium text-foreground max-w-[140px] truncate">
                                  {line.description}
                                </td>
                                <td className="p-2.5 font-mono text-right">{line.quantity}</td>
                                <td className="p-2.5 font-mono text-right">{formatCurrency(line.unitPrice)}</td>
                                <td className="p-2.5 font-mono font-bold text-right text-foreground">
                                  {formatCurrency(line.taxableAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
                  <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">Direct Intake Receipt</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    This bill was created directly from a warehouse intake without an existing pre-contract Purchase Order.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Goods Receipt (GRN) Details */}
          {activeLineageTab === 'grn' && (
            <div className="space-y-4">
              {linkedGrns.length > 0 ? (
                linkedGrns.map((grn) => (
                  <div key={grn.grnNumber} className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <PackageCheck className="h-4 w-4 text-emerald-600" />
                          <span className="font-mono font-bold text-base text-foreground">{grn.grnNumber}</span>
                          {grn.status && (
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                              {grn.status}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Physical warehouse intake &amp; quality inspection record
                        </p>
                      </div>
                      {grn.id && (
                        <Link
                          href={`/receiving/goods-receipts/${grn.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                        >
                          View Full GRN <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/20 p-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Intake Date</span>
                        <p className="font-medium text-foreground">{grn.receivedDate ? formatDate(grn.receivedDate) : 'Verified'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Warehouse Action</span>
                        <p className="font-medium text-emerald-700 dark:text-emerald-400 font-semibold">Goods Inspected &amp; Inwarded</p>
                      </div>
                    </div>

                    {/* GRN Lines Accepted */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-foreground">Verified Receipt Lines</p>
                      <div className="overflow-x-auto rounded-2xl border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                            <tr>
                              <th className="p-2.5 font-semibold">Item</th>
                              <th className="p-2.5 font-semibold font-mono">HSN</th>
                              <th className="p-2.5 font-semibold text-right">Accepted Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {grn.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-muted/10 transition">
                                <td className="p-2.5 font-medium text-foreground max-w-[160px] truncate">
                                  {line.description}
                                </td>
                                <td className="p-2.5 font-mono text-muted-foreground">{line.hsnSacCode || '—'}</td>
                                <td className="p-2.5 font-mono font-bold text-right text-emerald-600 dark:text-emerald-400">
                                  {line.quantity}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
                  <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">No Direct GRN Linked</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    This bill does not have an attached warehouse intake document.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Debit Note Claims & Transmissions */}
          {activeLineageTab === 'debit_notes' && (
            <div className="space-y-4">
              {/* Claims Overview */}
              <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-rose-600" />
                    <span className="text-xs font-bold text-rose-950 dark:text-rose-200 uppercase tracking-wider">
                      Debit Note Claim Value
                    </span>
                  </div>
                  <span className="font-mono font-bold text-rose-700 dark:text-rose-300 text-sm">
                    {formatCurrency(debitNoteClaimTotal)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-rose-800 dark:text-rose-300/80">
                  {pendingDebitNoteClaimTotal > 0 ? `${formatCurrency(pendingDebitNoteClaimTotal)} is pending submission or approval and is not yet deducted from the payable.` : 'Approved debit note claims are deducted from the payable.'}
                </p>
              </div>

              {bill.debitNotes && bill.debitNotes.length > 0 ? (
                bill.debitNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-rose-600" />
                        <span className="font-mono font-bold text-sm text-foreground">{note.debitNoteNumber}</span>
                        <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          {note.status}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                        {formatCurrency(note.totalAmount)}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Discrepancy:</span> {note.reason || 'Inventory inspection discrepancy'}
                      </p>
                      {note.createdAt && (
                        <p className="text-[11px] text-muted-foreground">
                          Issued on: {formatDate(note.createdAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                      {['DRAFT', 'RECORDED'].includes(note.status) && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setEditingDebitNoteId(note.id)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit Claim
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="bg-n-700 hover:bg-n-800 text-white font-semibold gap-1.5 text-xs shadow-sm"
                        onClick={() => setSelectedDebitNoteForSend(note)}
                      >
                        <Send className="h-3.5 w-3.5" /> Send to Vendor
                      </Button>
                      <Link href={`/debit-notes/${note.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" /> View Voucher
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="text-sm font-semibold text-foreground">Zero Deductions or Discrepancies</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    All items received in the GRN passed quality inspection with 100% acceptance. No debit notes are required for this bill.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Payments & Bank Disbursements */}
          {activeLineageTab === 'payments' && (
            <div className="space-y-4">
              {/* Financial Settlement Card */}
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-foreground" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Settlement Balance
                    </h4>
                  </div>
                  <PaymentStatusPill status={paymentStatus} />
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Invoiced Total</span>
                    <span className="font-mono font-medium">{formatCurrency(grossTotal)}</span>
                  </div>
                  {debitNoteDeduction > 0 && (
                    <div className="flex justify-between text-rose-600 dark:text-rose-400">
                      <span>Debit Notes Deduction</span>
                      <span className="font-mono font-medium">- {formatCurrency(debitNoteDeduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1 border-t border-border">
                    <span>Net Payable to Vendor</span>
                    <span className="font-mono">{formatCurrency(netPayable)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Paid to Date</span>
                    <span className="font-mono font-medium">{formatCurrency(paid)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
                    <span className={balance > 0 ? 'text-foreground dark:text-n-300' : 'text-emerald-600'}>
                      Balance Outstanding
                    </span>
                    <span className={`font-mono ${balance > 0 ? 'text-foreground dark:text-n-300' : 'text-emerald-600'}`}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </div>

                {isApprovedOrPosted && balance > 0 && can('create') && (
                  <Button
                    size="sm"
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
                    onClick={() => setIsPaymentModalOpen(true)}
                  >
                    <CreditCard className="h-4 w-4" /> Record Bill Payment
                  </Button>
                )}
              </div>

              {/* Logged Payment Transactions */}
              {bill.payments && bill.payments.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-foreground px-1">Payment History</p>
                  {bill.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-3xl border border-border bg-card p-4 text-xs shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(payment.amount)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground dark:text-n-300">
                          {payment.paymentMode.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border">
                        <div>
                          <span>Date:</span> <span className="font-medium text-foreground">{formatDate(payment.paymentDate)}</span>
                        </div>
                        <div>
                          <span>Ref / UTR:</span> <span className="font-mono font-medium text-foreground">{payment.reference}</span>
                        </div>
                      </div>
                      {payment.notes && (
                        <p className="text-[11px] text-muted-foreground italic">&ldquo;{payment.notes}&rdquo;</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
                  <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">No Payments Recorded</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    {isApprovedOrPosted
                      ? 'Record bank payouts, RTGS, NEFT, or UPI transactions against this invoice.'
                      : 'Once this supplier bill is approved by Admin, payments can be recorded here.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Payment Recording Modal */}
      {bill && (
        <RecordBillPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          bill={bill}
          onSubmit={handleRecordPayment}
          isSaving={isSavingPayment}
        />
      )}

      {/* Edit Bill Modal for Accounts Personnel */}
      {bill && (
        <EditBillModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          bill={bill}
          isAdmin={isAdmin}
          onSave={handleSaveBillEdits}
        />
      )}

      {/* Send Debit Note to Vendor Modal */}
      {bill && selectedDebitNoteForSend && (
        <SendDebitNoteModal
          isOpen={Boolean(selectedDebitNoteForSend)}
          onClose={() => setSelectedDebitNoteForSend(null)}
          debitNote={selectedDebitNoteForSend}
          vendor={bill.vendor}
          onSent={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] });
            queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] });
            queryClient.invalidateQueries({ queryKey: ['vendor-profile'] });
            queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] });
          }}
        />
      )}

      {editingDebitNoteId && (
        <EditGrnDebitNoteModal
          id={editingDebitNoteId}
          onClose={() => setEditingDebitNoteId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'grn-debit-note-claims'] });
          }}
        />
      )}

      {/* Credit / Debit Note Issuance Modal */}
      {bill && isDebitCreditNoteModalOpen && (
        <DebitCreditNoteModal
          isOpen={isDebitCreditNoteModalOpen}
          onClose={() => setIsDebitCreditNoteModalOpen(false)}
          entityId={bill.entityId || entities.data?.[0]?.id || ''}
          defaultType="DEBIT"
          defaultPartyType="VENDOR"
          initialInvoice={bill}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'bill', params.id] });
          }}
        />
      )}
    </main>
  );
}

function billStatusLabel(status: string) {
  if (status === 'DRAFT') return 'Draft';
  if (status === 'SUBMITTED') return 'Awaiting Admin Approval';
  if (status === 'APPROVED') return 'Approved & Ready for Payment';
  if (status === 'POSTED') return 'Posted to GL';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

function StatusPill({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'green' | 'blue' | 'amber' | 'red';
}) {
  const tones = {
    slate: 'bg-muted text-foreground',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function PaymentStatusPill({ status }: { status?: string }) {
  if (status === 'PAID') {
    return (
      <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
        Settled · Paid
      </span>
    );
  }
  if (status === 'PARTIALLY_PAID') {
    return (
      <span className="rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
        Partially Paid
      </span>
    );
  }
  return (
    <span className="rounded-full bg-n-100 text-foreground dark:bg-n-950/40 dark:text-n-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
      Payment Pending
    </span>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        strong ? 'font-bold text-sm text-foreground' : 'text-muted-foreground'
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
