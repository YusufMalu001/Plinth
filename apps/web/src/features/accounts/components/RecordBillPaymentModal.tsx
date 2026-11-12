'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, CreditCard, Hash, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@plinth/ui';
import { PurchaseBill, PaymentMode } from '../types';
import { formatCurrency, localToday } from '../utils';

interface RecordBillPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: PurchaseBill;
  onSubmit: (input: {
    paymentDate: string;
    amount: string;
    paymentMode: PaymentMode;
    reference: string;
    notes?: string;
  }) => Promise<void>;
  isSaving?: boolean;
}

export function RecordBillPaymentModal({
  isOpen,
  onClose,
  bill,
  onSubmit,
  isSaving = false,
}: RecordBillPaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('NEFT_RTGS');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalAmountNumber = Number(bill.totalAmount || 0);
  const paidNumber = Number(bill.paidAmount || 0);
  const balanceNumber = Math.max(0, Number(bill.balanceAmount ?? (totalAmountNumber - paidNumber)));

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
      setError(`Payment amount cannot exceed the remaining bill balance of ${formatCurrency(balanceNumber)}.`);
      return;
    }

    if (!reference.trim()) {
      setError('Please provide a bank reference, UTR, or cheque number.');
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
      const errMessage = err instanceof Error ? err.message : 'Could not record payment.';
      setError(errMessage);
    }
  };


  const modalContent = (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="presentation"
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-card border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-5 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted  text-muted-foreground border border-border ">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Record Supplier Bill Payment</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bill.supplierInvoiceNumber} · {bill.vendorNameSnapshot}
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

        {/* Bill Balance Overview */}
        <div className="bg-muted/30 border-b border-border/70 px-6 py-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-xl bg-card p-3 border border-border/60">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Invoiced Total</span>
              <p className="mt-1 text-sm font-bold font-mono text-foreground">{formatCurrency(totalAmountNumber)}</p>
            </div>
            <div className="rounded-xl bg-card p-3 border border-border/60">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Already Paid</span>
              <p className="mt-1 text-sm font-bold font-mono text-primary">{formatCurrency(paidNumber)}</p>
            </div>
            <div className="rounded-xl bg-card p-3 border border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-foreground ">Balance Due</span>
                {balanceNumber > 0 && (
                  <button
                    type="button"
                    onClick={handleFillFullBalance}
                    className="text-[10px] font-semibold text-foreground underline hover:text-foreground flex items-center gap-1"
                  >
                    Pay Full <kbd className="rounded border border-border bg-muted px-1 text-[9px] font-mono">Alt+F</kbd>
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm font-bold font-mono text-foreground ">
                {formatCurrency(balanceNumber)}
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10  p-3 text-xs text-destructive ">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Payment Amount (INR) <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balanceNumber}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-input bg-background pl-8 pr-3 py-2 text-sm font-mono focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>
            </div>

            {/* Payment Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Payment Date <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Payment Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Payment Mode <span className="text-destructive">*</span>
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="NEFT_RTGS">NEFT / RTGS / IMPS</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque / Demand Draft</option>
                <option value="CASH">Cash Voucher</option>
                <option value="INTERNAL_TRANSFER">Internal Bank Transfer</option>
              </select>
            </div>

            {/* Reference / UTR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                Bank Reference / UTR <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UTR, Cheque #, or Txn ID"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-border focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Notes / Audit Remarks <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Paid via HDFC Current Account ending in 4102"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Settlement Preview */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">Settlement Outcome:</span>
              {willBeFullyPaid ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary  font-bold px-2 py-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Fully Settled (PAID)
                </span>
              ) : currentAmountNum > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground  font-bold px-2 py-0.5">
                  Partially Paid
                </span>
              ) : (
                <span className="text-muted-foreground">Enter an amount</span>
              )}
            </div>
            {currentAmountNum > 0 && (
              <div className="flex items-center gap-1 font-mono text-muted-foreground">
                <span>Remaining:</span>
                <span className="font-bold text-foreground">{formatCurrency(remainingAfterPayment)}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || balanceNumber <= 0}
              className="bg-primary hover:bg-primary/90 text-white gap-2 font-semibold"
            >
              <CreditCard className="h-4 w-4" />
              {isSaving ? 'Recording Payment…' : `Confirm Payment of ${formatCurrency(amount || '0')}`}
              <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
