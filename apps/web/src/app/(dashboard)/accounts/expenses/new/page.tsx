'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  CheckCircle2,
  Building,
  CreditCard,
  Tag,
  Paperclip,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { Card, Button } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { showToast } from '@/components/toast-store';
import { ExpenseCategory, ExpensePaymentMode, ExpensePaymentStatus } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';

export default function NewMiscellaneousExpensePage() {
  const router = useRouter();

  const [category, setCategory] = useState<ExpenseCategory>('ELECTRICIAN_MAINTENANCE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [payeeName, setPayeeName] = useState('');
  const [payeeContact, setPayeeContact] = useState('');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [paymentStatus, setPaymentStatus] = useState<ExpensePaymentStatus>('PAID');
  const [paymentMode, setPaymentMode] = useState<ExpensePaymentMode>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paidThroughAccountId, setPaidThroughAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [notes, setNotes] = useState('');

  // Bill attachment state
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptFileType, setReceiptFileType] = useState<string | null>(null);
  const [receiptFileSize, setReceiptFileSize] = useState<number | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = entities.data?.[0]?.id || '';

  const chart = useQuery({
    queryKey: ['accounts', 'chart', entityId],
    queryFn: () => accountsApi.chart(entityId),
    enabled: Boolean(entityId),
  });

  const accounts = chart.data || [];
  // Asset / Bank / Cash accounts
  const paymentAccounts = accounts.filter(
    (a) => a.type === 'ASSET' || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank')
  );
  // Expense accounts
  const expenseAccounts = accounts.filter(
    (a) => a.type === 'EXPENSE' || a.name.toLowerCase().includes('expense') || a.name.toLowerCase().includes('repair')
  );

  const baseNum = parseFloat(amount || '0') || 0;
  const taxNum = parseFloat(taxAmount || '0') || 0;
  const totalNum = baseNum + taxNum;

  const selectedPaidAccount = paymentAccounts.find((a) => a.id === paidThroughAccountId);
  const selectedExpenseAccount = expenseAccounts.find((a) => a.id === expenseAccountId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      showToast({
        kind: 'error',
        title: 'File too large',
        message: 'Receipt attachment must be smaller than 15 MB.',
      });
      return;
    }

    setIsUploadingFile(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptUrl(reader.result as string);
      setReceiptFileName(file.name);
      setReceiptFileType(file.type);
      setReceiptFileSize(file.size);
      setIsUploadingFile(false);
      showToast({
        kind: 'success',
        title: 'Bill Attached',
        message: `${file.name} attached successfully.`,
      });
    };
    reader.onerror = () => {
      setIsUploadingFile(false);
      showToast({
        kind: 'error',
        title: 'Upload Failed',
        message: 'Could not read the selected file.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setReceiptUrl(null);
    setReceiptFileName(null);
    setReceiptFileType(null);
    setReceiptFileSize(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!entityId) {
      showToast({ kind: 'error', title: 'Error', message: 'No accounting entity found.' });
      return;
    }
    if (!title.trim()) {
      showToast({ kind: 'error', title: 'Validation Error', message: 'Please enter an expense title / purpose.' });
      return;
    }
    if (!payeeName.trim()) {
      showToast({ kind: 'error', title: 'Validation Error', message: 'Please enter payee / contractor name.' });
      return;
    }
    if (baseNum <= 0) {
      showToast({ kind: 'error', title: 'Validation Error', message: 'Expense amount must be greater than zero.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await accountsApi.createExpense({
        entityId,
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        expenseDate,
        payeeName: payeeName.trim(),
        payeeContact: payeeContact.trim() || undefined,
        amount: baseNum.toFixed(2),
        taxAmount: taxNum.toFixed(2),
        paymentStatus,
        paymentMode,
        referenceNumber: referenceNumber.trim() || undefined,
        paidThroughAccountId: paidThroughAccountId || undefined,
        expenseAccountId: expenseAccountId || undefined,
        receiptUrl: receiptUrl || undefined,
        receiptFileName: receiptFileName || undefined,
        receiptFileType: receiptFileType || undefined,
        receiptFileSize: receiptFileSize || undefined,
        notes: notes.trim() || undefined,
      });

      showToast({
        kind: 'success',
        title: 'Expense Recorded',
        message: `Expense voucher ${created.expenseNumber} for ${formatCurrency(created.totalAmount)} recorded successfully.`,
      });

      router.push('/accounts/expenses');
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Failed to Record Expense',
        message: err?.message || 'Failed to record expense. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 space-y-5 p-5 md:p-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-border/60">
        <div>
          <Link
            href="/accounts/expenses"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Miscellaneous Expenses
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Record Miscellaneous Expense &amp; Petty Disbursement
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log warehouse maintenance, electrician repairs, tempo freight, labour wages, and petty disbursements with receipts and ledger posting.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/accounts/expenses">
            <Button type="button" variant="outline" className="rounded-xl text-xs h-9 px-4">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            form="expense-form"
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs h-9 px-4 shadow-sm gap-1.5"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Recording…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Record &amp; Post Expense
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Grid: Left Column for Primary Data & Attachments, Right Column for Amounts, GL, and Posting */}
      <form id="expense-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols on large screens) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-5">
          {/* Card 1: Expense Purpose & Classification */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Expense Purpose &amp; Classification</h2>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                General Info
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Expense Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                >
                  <option value="ELECTRICIAN_MAINTENANCE">Electrician &amp; Maintenance</option>
                  <option value="TRANSPORTATION">Transportation / Tempo Hire</option>
                  <option value="LABOUR_WAGES">Labour &amp; Daily Wages</option>
                  <option value="WAREHOUSE_OPERATIONS">Warehouse Operations</option>
                  <option value="UTILITIES_ELECTRICITY">Utilities &amp; Power</option>
                  <option value="OFFICE_SUPPLIES">Office Supplies &amp; Stationery</option>
                  <option value="FUEL_CONVEYANCE">Fuel &amp; Conveyance</option>
                  <option value="TEA_REFRESHMENTS">Tea &amp; Staff Refreshments</option>
                  <option value="FREIGHT_COURIER">Freight &amp; Courier</option>
                  <option value="PROFESSIONAL_LEGAL">Professional / Legal</option>
                  <option value="MISCELLANEOUS">Miscellaneous / Petty Expense</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Expense Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Expense Title / Purpose <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warehouse High-Bay Lighting & MCB Replacement"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Work / Job Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Replaced 4 bay lights and main breaker switch in aisle 3. Includes wire cable and clamp materials."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition resize-y"
                />
              </div>
            </div>
          </Card>

          {/* Card 2: Payee / Contractor Details */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Payee / Service Provider</h2>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                Vendor / Recipient
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Payee / Contractor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Electrician / City Tempo Services"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Payee Contact / Phone Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={payeeContact}
                  onChange={(e) => setPayeeContact(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Additional Audit Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved by warehouse supervisor for urgent electrical repair"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                />
              </div>
            </div>
          </Card>

          {/* Card 3: Supporting Document / Receipt Attachment */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Attach Bill / Physical Receipt (Image or PDF)</h2>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                Verification Proof
              </span>
            </div>

            <div>
              {!receiptUrl ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border/80 hover:border-primary bg-muted/10 hover:bg-muted/30 rounded-xl p-6 cursor-pointer transition-all text-center group">
                  <div className="h-10 w-10 rounded-full bg-muted text-primary flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <Upload className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Click to upload or drag &amp; drop physical bill / voucher
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Supports JPG, PNG, WebP image or PDF format (up to 15 MB)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploadingFile}
                  />
                </label>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {receiptFileType?.startsWith('image/') ? (
                      <img
                        src={receiptUrl}
                        alt="Receipt Preview"
                        className="h-14 w-14 object-cover rounded-lg border border-border shadow-xs"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-muted border border-border flex flex-col items-center justify-center text-foreground">
                        <FileText className="h-5 w-5" />
                        <span className="text-[9px] font-bold uppercase mt-1">PDF</span>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold text-foreground truncate max-w-xs sm:max-w-md">
                        {receiptFileName}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {receiptFileSize ? `${(receiptFileSize / 1024).toFixed(1)} KB` : 'Attached'} ·{' '}
                        {receiptFileType || 'document'}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold mt-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Attached &amp; ready to store
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                    >
                      View
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleRemoveFile}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs gap-1 h-8 px-2.5"
                    >
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Financials, GL Accounting & Submit Actions (4-5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
          {/* Card 1: Disbursement & Amounts */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Disbursement &amp; Amounts</h2>
              </div>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  paymentStatus === 'PAID'
                    ? 'bg-muted text-foreground border-border'
                    : 'bg-muted text-foreground border-border'
                }`}
              >
                {paymentStatus}
              </span>
            </div>

            {/* Total Highlight Banner */}
            <div className="rounded-xl border border-border bg-n-500/5 dark:bg-n-950/30 p-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Total Net Expense
              </span>
              <div className="text-2xl font-bold font-mono tracking-tight text-primary mt-0.5">
                {formatCurrency(totalNum)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40 font-mono">
                <span>Base: {formatCurrency(baseNum)}</span>
                <span>Tax: {formatCurrency(taxNum)}</span>
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Base Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    GST / Tax Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Payment Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as ExpensePaymentStatus)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                  >
                    <option value="PAID">Paid / Disbursed</option>
                    <option value="PENDING">Pending Payout</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Payment Mode <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as ExpensePaymentMode)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="PETTY_CASH">Petty Cash</option>
                    <option value="UPI">UPI (GPay/PhonePe)</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Reference / Transaction #
                </label>
                <input
                  type="text"
                  placeholder="UPI Ref ID, Cheque No, or Cash Slip #"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                />
              </div>
            </div>
          </Card>

          {/* Card 2: General Ledger Accounts */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">General Ledger Posting</h2>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Paid Through Account (Credit)
                </label>
                <select
                  value={paidThroughAccountId}
                  onChange={(e) => setPaidThroughAccountId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                >
                  <option value="">Default Cash / Bank Account</option>
                  {paymentAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  Source asset account for disbursement.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Expense Ledger Head (Debit)
                </label>
                <select
                  value={expenseAccountId}
                  onChange={(e) => setExpenseAccountId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                >
                  <option value="">Direct Expense / Miscellaneous Account</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  P&amp;L expense head for accounting entry.
                </span>
              </div>

              {/* Live Accounting Preview */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 font-mono text-[11px]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Double-Entry Ledger Impact:
                </div>
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <span>DR: {selectedExpenseAccount ? selectedExpenseAccount.name : 'Miscellaneous Expenses'}</span>
                  <span>{formatCurrency(totalNum)}</span>
                </div>
                <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
                  <span>CR: {selectedPaidAccount ? selectedPaidAccount.name : 'Cash in Hand / Bank'}</span>
                  <span>{formatCurrency(totalNum)}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 3: Action Buttons */}
          <Card className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-2.5">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs py-2.5 shadow-sm gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Recording &amp; Posting Expense…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Record &amp; Post Expense
                </>
              )}
            </Button>

            <Link href="/accounts/expenses" className="block w-full">
              <Button type="button" variant="outline" className="w-full rounded-xl text-xs">
                Cancel &amp; Return
              </Button>
            </Link>

            <p className="text-[10px] text-center text-muted-foreground pt-1">
              Posts an auto-numbered voucher (EXP-FY2026-27-XXXXX) directly to the accounts ledger.
            </p>
          </Card>
        </div>
      </form>
    </main>
  );
}
