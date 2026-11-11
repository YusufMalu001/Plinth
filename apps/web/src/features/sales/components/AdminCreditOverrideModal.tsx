'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  FileText,
  X,
} from 'lucide-react';
import { SalesOrder, Customer } from '../types';
import { useCreditOverrideOrder } from '../hooks';
import { Button } from '@plinth/ui';

const formatCurrency = (val: number | string, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

interface AdminCreditOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder;
  customer?: Customer | null;
  creditExposure?: {
    creditLimit: number;
    creditUtilized: number;
    availableCredit: number;
  } | null;
  onSuccess?: () => void;
}

export function AdminCreditOverrideModal({
  isOpen,
  onClose,
  order,
  customer,
  creditExposure,
  onSuccess,
}: AdminCreditOverrideModalProps) {
  const creditOverrideMutation = useCreditOverrideOrder();

  const creditLimit = creditExposure?.creditLimit ?? Number(customer?.creditLimit || 0);
  const creditUtilized = creditExposure?.creditUtilized ?? 0;
  const orderTotal = Number(order.grandTotal || 0);
  const projectedExposure = creditUtilized + orderTotal;
  const exceededBy = Math.max(0, projectedExposure - creditLimit);

  // Recommended new credit limit rounded to nearest ₹5,000 or exact sum
  const recommendedLimit = Math.max(
    creditLimit + 10000,
    Math.ceil(projectedExposure / 5000) * 5000
  );

  const [overrideType, setOverrideType] = useState<'ONE_TIME_WAIVER' | 'INCREASE_LIMIT'>('INCREASE_LIMIT');
  const [newCreditLimit, setNewCreditLimit] = useState<number>(recommendedLimit);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewCreditLimit(recommendedLimit);
      setNotes('');
      setError(null);
    }
  }, [isOpen, recommendedLimit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (overrideType === 'INCREASE_LIMIT') {
      if (!newCreditLimit || newCreditLimit <= 0) {
        setError('Please provide a valid new credit limit.');
        return;
      }
      if (newCreditLimit < projectedExposure) {
        setError(
          `New credit limit must be at least ${formatCurrency(projectedExposure)} to cover active dues and this order.`
        );
        return;
      }
    }

    try {
      await creditOverrideMutation.mutateAsync({
        id: order.id,
        overrideType,
        newCreditLimit: overrideType === 'INCREASE_LIMIT' ? newCreditLimit : undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to override credit limit and confirm order.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-muted border border-border text-foreground">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                Executive Credit Override & Confirmation
              </h2>
              <p className="text-xs text-muted-foreground">
                Order <strong className="font-mono text-foreground">{order.orderNumber}</strong> &bull; Customer{' '}
                <strong className="text-foreground">{customer?.name || order.customerId || 'Dealer'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Credit Risk Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
              <span className="text-[11px] text-muted-foreground block font-medium">Approved Limit</span>
              <span className="text-base font-bold font-mono text-foreground">
                {formatCurrency(creditLimit)}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
              <span className="text-[11px] text-muted-foreground block font-medium">Active Dues</span>
              <span className="text-base font-bold font-mono text-foreground">
                {formatCurrency(creditUtilized)}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
              <span className="text-[11px] text-muted-foreground block font-medium">This Order</span>
              <span className="text-base font-bold font-mono text-primary">
                {formatCurrency(orderTotal)}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
              <span className="text-[11px] text-muted-foreground block font-medium">Limit Breached By</span>
              <span className="text-base font-bold font-mono text-foreground">
                +{formatCurrency(exceededBy)}
              </span>
            </div>
          </div>

          {/* Exposure Comparison Bar */}
          <div className="p-3.5 bg-muted/30 border border-border/80 rounded-xl space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>Projected Total Exposure</span>
              <span className="text-foreground font-mono font-bold">
                {formatCurrency(projectedExposure)} / {formatCurrency(creditLimit)}
              </span>
            </div>
            <div className="w-full bg-border rounded-full h-2 overflow-hidden flex">
              <div
                className="h-full bg-foreground/70"
                style={{ width: `${Math.min(100, (creditUtilized / (creditLimit || 1)) * 100)}%` }}
              />
              <div
                className="h-full bg-foreground"
                style={{ width: `${Math.min(100, (orderTotal / (creditLimit || 1)) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              Order exceeds the customer approved credit threshold by{' '}
              <strong className="text-foreground font-mono">{formatCurrency(exceededBy)}</strong>.
            </p>
          </div>

          {/* Override Mode Selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
              Choose Approval & Resolution Action
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Permanently Increase Credit Limit */}
              <div
                onClick={() => setOverrideType('INCREASE_LIMIT')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  overrideType === 'INCREASE_LIMIT'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border/80 hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg ${overrideType === 'INCREASE_LIMIT' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">Increase Credit Limit</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Permanently raises customer master credit limit to accommodate this and future orders.
                </p>
              </div>

              {/* Option B: One-Time Executive Waiver */}
              <div
                onClick={() => setOverrideType('ONE_TIME_WAIVER')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  overrideType === 'ONE_TIME_WAIVER'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border/80 hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg ${overrideType === 'ONE_TIME_WAIVER' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="font-bold text-sm text-foreground">One-Time Waiver</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Keeps the credit limit unchanged, but grants a one-time executive exception for this order.
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Settings depending on Mode */}
          {overrideType === 'INCREASE_LIMIT' && (
            <div className="p-4 bg-muted/40 border border-primary/20 rounded-xl space-y-3">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>New Approved Credit Limit (₹)</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Min recommended: <strong className="font-mono text-primary">{formatCurrency(projectedExposure)}</strong>
                </span>
              </label>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                <input
                  type="number"
                  min={projectedExposure}
                  // The minimum may contain paise. A fixed step based on that
                  // decimal minimum makes valid whole-rupee values such as
                  // ₹135,000 fail native browser validation.
                  step="any"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(Number(e.target.value))}
                  className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-mono font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="font-mono text-muted-foreground line-through">{formatCurrency(creditLimit)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(newCreditLimit)} (+{formatCurrency(Math.max(0, newCreditLimit - creditLimit))})
                </span>
              </div>
            </div>
          )}

          {/* Executive Notes / Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Executive Approval Notes & Audit Justification
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Approved due to festive demand and high dealer repayment track record."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={creditOverrideMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creditOverrideMutation.isPending}
              icon={CheckCircle2}
              className="font-bold shadow-md shadow-primary/20"
            >
              Approve & Confirm Order
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
