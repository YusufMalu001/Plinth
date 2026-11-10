'use client';

import React, { useEffect, useState } from 'react';
import { X, Calendar, CreditCard, Hash, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@synergy/ui';
import { SalesInvoice, PaymentMode } from '../types';
import { formatCurrency, localToday } from '../utils';

interface RecordCustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice;
  onSubmit: (input: {
    paymentDate: string;
    amount: string;
    paymentMode: PaymentMode;
    reference: string;
    notes?: string;
  }) => Promise<void>;
  isSaving?: boolean;
}

export function RecordCustomerPaymentModal({
  isOpen,
  onClose,
  invoice,
  onSubmit,
  isSaving = false,
}: RecordCustomerPaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalAmountNumber = Number(invoice.totalAmount || 0);
  const paidNumber = Number(invoice.paidAmount || 0);
  const balanceNumber = Math.max(0, Number(invoice.outstandingAmount ?? (totalAmountNumber - paidNumber)));

  useEffect(() => {
    if (isOpen && balanceNumber > 0) {
      setAmount(balanceNumber.toFixed(2));
      setError('');
    }
  }, [isOpen, balanceNumber]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleFillFullBalance();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, amount, reference, notes, paymentDate, paymentMode, balanceNumber, isSaving]);
  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const currentAmountNum = parseFloat(amount || '0');
  const remainingAfterPayment = Math.max(0, balanceNumber - (isNaN(currentAmountNum) ? 0 : currentAmountNum));
  const willBeFullyPaid = remainingAfterPayment <= 0.009 && currentAmountNum > 0;

  const handleFillFullBalance = () => {
    setAmount(balanceNumber.toFixed(2));
    setError('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (parsedAmount > balanceNumber + 0.009) {
      setError(`Payment amount cannot exceed the open receivable balance of ${formatCurrency(balanceNumber)}.`);
      return;
    }

    if (!reference.trim()) {
      setError('Please provide a bank reference, UTR, or transaction receipt number.');
      return;
    }

    try {
      await onSubmit({
        paymentDate,
        amount: parsedAmount.toFixed(2),
        paymentMode,
        reference: reference.trim(),
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Could not record customer payment.';
      setError(errMessage);
    }
  };


  return (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="presentation"
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-card border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary border border-border">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Record Customer Order Payment</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invoice.invoiceNumber} {invoice.salesOrderNumber ? `· Order ${invoice.salesOrderNumber}` : ''} · {invoice.customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Invoice Balance Overview */}
        <div className="bg-muted/30 border-b border-border/70 px-6 py-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-card p-3 border border-border/60">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Invoiced Bill Total</span>
              <p className="mt-1 text-sm font-bold font-mono text-foreground">{formatCurrency(totalAmountNumber)}</p>
            </div>
            <div className="rounded-xl bg-card p-3 border border-border/60">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Already Collected</span>
              <p className="mt-1 text-sm font-bold font-mono text-emerald-600">{formatCurrency(paidNumber)}</p>
            </div>
            <div className="rounded-xl bg-card p-3 border border-border bg-synergy-500/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-foreground">Balance Receivable</span>
                {balanceNumber > 0 && (
                  <button
                    type="button"
                    onClick={handleFillFullBalance}
                    className="text-[10px] font-semibold text-foreground underline hover:text-foreground"
                  >
                    Pay Full
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm font-bold font-mono text-foreground dark:text-synergy-300">
                {formatCurrency(balanceNumber)}
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 p-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Date */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Receipt Date *
              </label>
              <input
                type="date"
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            {/* Payment Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Collected Amount (₹) *
                </label>
                {balanceNumber > 0 && (
                  <button
                    type="button"
                    onClick={handleFillFullBalance}
                    className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    Quick Full Balance <kbd className="rounded border border-border bg-muted px-1 text-[9px] font-mono">Alt+F</kbd>
                  </button>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payment Mode */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                Payment Mode *
              </label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              >
                <option value="BANK_TRANSFER">Bank Transfer (Direct / Wire)</option>
                <option value="NEFT_RTGS">NEFT / RTGS</option>
                <option value="IMPS">IMPS</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="CHEQUE">Cheque / Demand Draft</option>
                <option value="CASH">Cash Collection</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="MARKETPLACE">Marketplace Payout Clearing</option>
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                UTR / Cheque / Bank Ref *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. UTR1289472390 or CHQ#49201"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Collection Notes / Remarks (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Cleared via HDFC Bank AR collection account, client acknowledged receipt..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Dynamic Status Indicator */}
          {currentAmountNum > 0 && (
            <div className={`rounded-xl p-3 border text-xs flex items-center justify-between ${
              willBeFullyPaid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {willBeFullyPaid
                    ? 'This receipt settles the entire remaining balance of this invoice.'
                    : `Partial collection. Remaining balance after payment: ${formatCurrency(remainingAfterPayment)}`}
                </span>
              </div>
              <span className="font-mono font-bold text-[11px] uppercase tracking-wider">
                {willBeFullyPaid ? 'Full Settlement' : 'Partial'}
              </span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl text-xs"
            >
              Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs gap-1.5 shadow-sm"
            >
              {isSaving ? 'Recording Receipt...' : 'Record Customer Payment'}
              <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
