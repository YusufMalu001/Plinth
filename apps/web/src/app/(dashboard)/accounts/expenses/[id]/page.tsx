'use client';

import React, { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Printer,
  Trash2,
  Paperclip,
  Building,
  CreditCard,
  Download,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { showToast } from '@/components/toast-store';
import { formatCurrency } from '@/features/accounts/utils';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

const categoryLabels: Record<string, { label: string; color: string }> = {
  TRANSPORTATION: { label: 'Transportation / Tempo Hire', color: 'bg-muted text-foreground border-border' },
  ELECTRICIAN_MAINTENANCE: { label: 'Electrician & Maintenance', color: 'bg-muted text-foreground border-border' },
  LABOUR_WAGES: { label: 'Labour & Daily Wages', color: 'bg-muted text-foreground border-purple-500/20' },
  WAREHOUSE_OPERATIONS: { label: 'Warehouse Operations', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20' },
  UTILITIES_ELECTRICITY: { label: 'Utilities & Power', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20' },
  OFFICE_SUPPLIES: { label: 'Office Supplies & Stationery', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20' },
  FUEL_CONVEYANCE: { label: 'Fuel & Conveyance', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  TEA_REFRESHMENTS: { label: 'Tea & Refreshments', color: 'bg-muted text-foreground border-border' },
  FREIGHT_COURIER: { label: 'Freight & Courier', color: 'bg-muted text-foreground border-indigo-500/20' },
  PROFESSIONAL_LEGAL: { label: 'Professional / Legal', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20' },
  MISCELLANEOUS: { label: 'Miscellaneous / Petty Expense', color: 'bg-muted text-muted-foreground border-border/60' },
};

export default function MiscellaneousExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Expense-Voucher-${params.id}`,
  });

  const expenseQuery = useQuery({
    queryKey: ['accounts', 'expense', params.id],
    queryFn: () => accountsApi.expense(params.id),
    enabled: Boolean(params.id),
  });

  const expense = expenseQuery.data;

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await accountsApi.deleteExpense(params.id);
      showToast({
        kind: 'success',
        title: 'Expense Deleted',
        message: `Expense voucher ${expense?.expenseNumber} was deleted successfully.`,
      });
      setShowConfirmDelete(false);
      router.push('/accounts/expenses');
    } catch (err: any) {
      setDeleteError(err?.message || 'Could not delete expense.');
      setIsDeleting(false);
    }
  };

  if (expenseQuery.isLoading) {
    return (
      <main className="flex-1 p-8 text-center text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
        Loading expense voucher…
      </main>
    );
  }

  if (expenseQuery.isError || !expense) {
    return (
      <main className="flex-1 p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="text-sm font-semibold text-rose-600">Expense voucher not found.</p>
        <Link href="/accounts/expenses">
          <Button variant="outline" className="text-xs">
            Return to Expenses Register
          </Button>
        </Link>
      </main>
    );
  }

  const cat = categoryLabels[expense.category] || { label: expense.category, color: 'bg-muted text-foreground' };

  return (
    <main className="flex-1 space-y-4 p-5 md:p-8">
      {/* Top Navigation & Action Bar */}
      <div className="flex items-center justify-between pb-2 print:hidden">
        <Link
          href="/accounts/expenses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Miscellaneous Expenses
        </Link>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handlePrint()}
            className="rounded-xl text-xs gap-1.5 h-8 px-3 hover:bg-muted hover:text-primary dark:hover:bg-n-950/30 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Voucher
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={isDeleting}
            onClick={() => setShowConfirmDelete(true)}
            className="rounded-xl text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 gap-1.5 h-8 px-3 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Main Printable Voucher Document */}
      <div
        id="expense-voucher-document"
        ref={printRef}
        data-printable="true"
        className="accounts-document printable-document print-target w-full rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-sm space-y-6 print:border-0 print:bg-white print:p-6 print:text-slate-900 print:shadow-none"
      >
        {/* Printable Official Header (Shown both in screen & print) */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b-2 border-border pb-5">
          <div className="flex items-start gap-4">
            <span className="text-xl font-black tracking-tight text-ink uppercase">Plinth</span>
            <div className="border-l border-border/80 pl-4 print:border-slate-300">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground print:text-foreground">
                Finance &amp; Accounts · Petty Cash Disbursement
              </p>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground print:text-slate-900">
                Expense Payment Voucher
              </h2>
              <p className="text-xs text-muted-foreground print:text-slate-600 mt-0.5">
                Plinth · General Ledger Posting
              </p>
            </div>
          </div>

          <div className="sm:text-right space-y-1">
            <div className="flex items-center sm:justify-end gap-2">
              <span className="font-mono text-lg font-bold text-foreground print:text-slate-900 tracking-tight">
                {expense.expenseNumber}
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${cat.color} print:border-slate-300 print:bg-slate-100 print:text-slate-800`}>
                {cat.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground print:text-slate-600">
              Voucher Date:{' '}
              <span className="font-mono font-medium text-foreground print:text-slate-900">
                {expense.expenseDate ? expense.expenseDate.slice(0, 10) : '—'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground print:text-slate-600">
              Status:{' '}
              <span
                className={`inline-flex font-mono font-semibold uppercase text-[11px] ${
                  expense.paymentStatus === 'PAID'
                    ? 'text-emerald-600 print:text-emerald-700'
                    : 'text-amber-600 print:text-amber-700'
                }`}
              >
                {expense.paymentStatus}
              </span>
            </p>
          </div>
        </div>

        {/* Expense Purpose Summary */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 print:bg-slate-50 print:border-slate-200">
          <span className="text-[10px] uppercase font-bold text-muted-foreground print:text-slate-500 block">
            Expense Purpose / Title
          </span>
          <h1 className="text-base font-bold text-foreground print:text-slate-900 mt-0.5">{expense.title}</h1>
          {expense.description && (
            <p className="text-xs text-muted-foreground print:text-slate-700 mt-1">{expense.description}</p>
          )}
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Payee & Purpose */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-slate-700">
              <Building className="h-3.5 w-3.5 text-primary print:text-slate-800" />
              Payee / Contractor Details
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs print:bg-slate-50 print:border-slate-200">
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-slate-600">Payee Name:</span>
                <span className="font-bold text-foreground print:text-slate-900">{expense.payeeName}</span>
              </div>
              {expense.payeeContact && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-slate-600">Contact Number:</span>
                  <span className="font-mono text-foreground print:text-slate-900">{expense.payeeContact}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-slate-600">Recorded By:</span>
                <span className="text-foreground print:text-slate-900">{expense.createdBy?.name || expense.createdBy?.email || 'Accounts'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-slate-600">Entry Timestamp:</span>
                <span className="font-mono text-muted-foreground print:text-slate-700">{expense.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          {/* Column 2: Payment & Money */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-slate-700">
              <CreditCard className="h-3.5 w-3.5 text-primary print:text-slate-800" />
              Payment &amp; Financial Breakdown
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-xs print:bg-slate-50 print:border-slate-200">
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-slate-600">Base / Taxable Amount:</span>
                <span className="font-mono font-semibold text-foreground print:text-slate-900">{formatCurrency(expense.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-slate-600">GST / Tax Amount:</span>
                <span className="font-mono text-muted-foreground print:text-slate-700">
                  {Number(expense.taxAmount) > 0 ? formatCurrency(expense.taxAmount) : '—'}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 print:border-slate-300 pt-2 font-bold">
                <span className="text-foreground print:text-slate-900">Total Disbursement:</span>
                <span className="font-mono text-primary print:text-foreground text-sm font-bold">
                  {formatCurrency(expense.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground print:text-slate-600">Payment Mode:</span>
                <span className="font-semibold text-foreground print:text-slate-900">{expense.paymentMode}</span>
              </div>
              {expense.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground print:text-slate-600">Reference / Trx #:</span>
                  <span className="font-mono text-foreground print:text-slate-900">{expense.referenceNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section: General Ledger & Accounting Impact */}
        <div className="space-y-3 border-t border-border/70 print:border-slate-300 pt-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-slate-700">
            <ShieldCheck className="h-3.5 w-3.5 text-primary print:text-slate-800" />
            General Ledger &amp; Accounting Posting
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 print:bg-slate-50 print:border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground print:text-slate-600 block text-[10px] uppercase font-bold">
                  Expense Head (Debit)
                </span>
                <span className="font-semibold text-foreground print:text-slate-900 mt-0.5 block">
                  {expense.expenseAccount?.name || 'Direct Miscellaneous Expense'}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground print:text-slate-600 block">
                  {expense.expenseAccount?.code ? `Code: ${expense.expenseAccount.code}` : 'P&L Expense'}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground print:text-slate-600 block text-[10px] uppercase font-bold">
                  Paid Through Account (Credit)
                </span>
                <span className="font-semibold text-foreground print:text-slate-900 mt-0.5 block">
                  {expense.paidThroughAccount?.name || 'Cash in Hand / Bank'}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground print:text-slate-600 block">
                  {expense.paidThroughAccount?.code ? `Code: ${expense.paidThroughAccount.code}` : 'Disbursement Ledger'}
                </span>
              </div>
            </div>

            {expense.journalVoucherId && (
              <div className="mt-3 pt-3 border-t border-border/60 print:border-slate-300 flex items-center justify-between text-xs">
                <span className="text-muted-foreground print:text-slate-600">Financial Journal Voucher:</span>
                <span className="font-mono font-bold text-primary print:text-foreground">
                  Linked to Financial Books ({expense.journalVoucherId.slice(0, 8)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Section: Attached Bill / Receipt */}
        <div className="space-y-3 border-t border-border/70 print:border-slate-300 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-slate-700">
              <Paperclip className="h-3.5 w-3.5 text-primary print:text-slate-800" />
              Attached Bill / Receipt Document
            </div>

            {expense.receiptUrl && (
              <a
                href={expense.receiptUrl}
                download={expense.receiptFileName || `expense_${expense.expenseNumber}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline print:hidden"
              >
                <Download className="h-3.5 w-3.5" /> Download File
              </a>
            )}
          </div>

          {expense.receiptUrl ? (
            <div className="rounded-xl border border-border/80 bg-background p-4 space-y-3 print:bg-white print:border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-foreground print:text-slate-900">
                    {expense.receiptFileName || 'Bill Attachment'}
                  </span>
                  {expense.receiptFileSize && (
                    <span className="text-muted-foreground print:text-slate-600 text-[11px] ml-2">
                      ({(expense.receiptFileSize / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>
                <a
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline print:hidden"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in New Tab
                </a>
              </div>

              {expense.receiptFileType?.startsWith('image/') || expense.receiptUrl.startsWith('data:image/') ? (
                <div className="border border-border/60 rounded-lg overflow-hidden bg-muted/20 flex justify-center p-2 print:border-slate-200 print:bg-white">
                  <img
                    src={expense.receiptUrl}
                    alt={expense.receiptFileName || 'Expense Bill'}
                    className="max-h-96 object-contain rounded"
                  />
                </div>
              ) : (
                <div className="border border-border/60 rounded-lg p-6 bg-muted/20 text-center print:border-slate-200 print:bg-white">
                  <FileText className="h-10 w-10 text-primary mx-auto mb-2 print:text-slate-800" />
                  <p className="text-xs font-semibold text-foreground print:text-slate-900">PDF Bill Attached</p>
                  <p className="text-[11px] text-muted-foreground print:text-slate-600 mt-0.5 print:hidden">
                    Click &apos;Open in New Tab&apos; or &apos;Download File&apos; to view the complete PDF bill.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-muted-foreground print:text-slate-600 text-xs print:border-slate-300">
              No physical bill or receipt was attached for this expense.
            </div>
          )}
        </div>

        {/* Audit Remarks */}
        {expense.notes && (
          <div className="border-t border-border/70 print:border-slate-300 pt-4 text-xs">
            <span className="text-muted-foreground print:text-slate-600 font-semibold block mb-1">
              Audit Notes / Remarks:
            </span>
            <p className="text-foreground print:text-slate-900 bg-muted/20 print:bg-slate-50 rounded-lg p-3 border border-border/60 print:border-slate-200">
              {expense.notes}
            </p>
          </div>
        )}

        {/* Formal Accounting Sign-off Block (Crucial for Printed Physical Vouchers) */}
        <div className="mt-8 pt-6 border-t-2 border-border/70 print:border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-xs">
          <div>
            <div className="h-10 border-b border-dashed border-border print:border-slate-400" />
            <p className="mt-1 font-semibold text-foreground print:text-slate-900">Prepared By</p>
            <p className="text-[10px] text-muted-foreground print:text-slate-600">
              {expense.createdBy?.name || expense.createdBy?.email || 'Accounts Team'}
            </p>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-border print:border-slate-400" />
            <p className="mt-1 font-semibold text-foreground print:text-slate-900">Verified By</p>
            <p className="text-[10px] text-muted-foreground print:text-slate-600">Finance Manager</p>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-border print:border-slate-400" />
            <p className="mt-1 font-semibold text-foreground print:text-slate-900">Approved By</p>
            <p className="text-[10px] text-muted-foreground print:text-slate-600">Authorized Signatory</p>
          </div>
          <div>
            <div className="h-10 border-b border-dashed border-border print:border-slate-400" />
            <p className="mt-1 font-semibold text-foreground print:text-slate-900">Payee Signature</p>
            <p className="text-[10px] text-muted-foreground print:text-slate-600">{expense.payeeName}</p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Permanent Expense Deletion */}
      <ConfirmDeleteDialog
        open={showConfirmDelete}
        title="Delete Expense Voucher"
        message={
          <>
            Are you sure you want to permanently delete expense voucher{' '}
            <strong className="font-mono text-foreground">{expense?.expenseNumber}</strong>?
            This will remove the transaction from the petty cash ledger and cannot be undone.
          </>
        }
        error={deleteError}
        isDeleting={isDeleting}
        confirmText="Delete Voucher"
        loadingText="Deleting…"
        onClose={() => {
          if (!isDeleting) {
            setShowConfirmDelete(false);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </main>
  );
}
