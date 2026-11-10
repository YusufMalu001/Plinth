'use client';

import React, { useState } from 'react';
import { Check, Loader2, FileSpreadsheet, Send, ChevronDown } from 'lucide-react';

interface DebitNoteFormProps {
  onSubmit: (reason: string, reasonCategory: string) => Promise<void>;
  isSubmitting: boolean;
  isCreated: boolean;
  error?: string | null;
  vendorName?: string;
  poNumber?: string;
  isAccountant?: boolean;
}

export function DebitNoteForm({
  onSubmit,
  isSubmitting,
  isCreated,
  error,
  vendorName,
  poNumber,
  isAccountant = false,
}: DebitNoteFormProps) {
  const [reason, setReason] = useState('');
  const [reasonCategory, setReasonCategory] = useState('SHORTAGE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || isSubmitting) return;
    await onSubmit(reason.trim(), reasonCategory);
  };

  if (isCreated) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4.5 text-xs text-emerald-950 dark:text-emerald-100 shadow-xs">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
          <Check size={18} className="stroke-[2.5]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-foreground">
            {isAccountant ? 'Debit Note Draft Created' : 'Accountant Notified Successfully'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAccountant
              ? 'A financial recovery claim voucher has been drafted and linked to this goods receipt.'
              : 'The discrepancy report has been dispatched to the Finance team to prepare the Debit Note.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      data-keyboard-submit="off"
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <FileSpreadsheet size={16} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              {isAccountant ? 'Draft Vendor Debit Note' : 'Notify Accountant for Debit Note'}
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAccountant
                ? 'Create a finance recovery claim voucher for vendor shortages, damaged goods, or price variance.'
                : 'Notify the Finance/Accounts department to review verified discrepancies and generate the Debit Note.'}
            </p>
          </div>
        </div>

        {reason && (
          <button
            type="button"
            onClick={() => setReason('')}
            className="text-xs text-muted-foreground hover:text-foreground font-semibold hover:underline self-start sm:self-auto cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Context info chips if vendor / po available */}
      {(vendorName || poNumber) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {vendorName && (
            <span className="rounded-lg bg-muted px-2.5 py-1 text-muted-foreground border border-border/60">
              Vendor: <strong className="text-foreground">{vendorName}</strong>
            </span>
          )}
          {poNumber && (
            <span className="rounded-lg bg-muted px-2.5 py-1 text-muted-foreground border border-border/60">
              PO Ref: <strong className="font-mono text-foreground">{poNumber}</strong>
            </span>
          )}
        </div>
      )}

      {/* Reason Input */}
      <div>
        <label className="block text-xs font-bold text-foreground mb-1.5">Discrepancy category</label>
        <div className="relative mb-3">
          <select
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value)}
            disabled={isSubmitting}
            className="w-full appearance-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 shadow-2xs cursor-pointer"
          >
            <option value="SHORTAGE">Shortage / missing delivered quantity</option>
            <option value="DAMAGE">Damaged / broken in transit</option>
            <option value="REJECTION">Quality defect rejection</option>
            <option value="PRICE_VARIANCE">Price / rate mismatch</option>
            <option value="OTHER">Other vendor discrepancy</option>
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        <label className="block text-xs font-bold text-foreground mb-1.5">
          Claim Justification &amp; Discrepancy Details
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Provide clear justification for this debit note claim…"
          className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 shadow-2xs leading-relaxed"
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <p className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-muted-foreground">
          {isAccountant
            ? 'Debit note will be created in DRAFT state for finance sign-off.'
            : 'Discrepancy summary will be dispatched to the Finance team.'}
        </span>

        <button
          type="submit"
          disabled={!reason.trim() || isSubmitting}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>{isAccountant ? 'Drafting debit note…' : 'Notifying accountant…'}</span>
            </>
          ) : (
            <>
              <Send size={13} />
              <span>{isAccountant ? 'Create Debit Note Draft' : 'Notify Accountant'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
