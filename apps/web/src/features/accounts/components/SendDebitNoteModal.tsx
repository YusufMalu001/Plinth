'use client';

import React, { useState } from 'react';
import { X, Mail, Send, AlertCircle } from 'lucide-react';
import { Button } from '@plinth/ui';
import { showToast } from '@/components/toast-store';
import { accountsApi } from '../api';

interface SendDebitNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  debitNote: {
    id: string;
    debitNoteNumber: string;
    totalAmount?: string | number;
    reason?: string;
  };
  vendor?: {
    name?: string;
    contactEmail?: string | null;
  } | null;
  onSent?: () => void;
}

export function SendDebitNoteModal({
  isOpen,
  onClose,
  debitNote,
  vendor,
  onSent,
}: SendDebitNoteModalProps) {
  const [email, setEmail] = useState(vendor?.contactEmail || 'vendor@example.com');
  const [notes, setNotes] = useState(
    `Dear ${vendor?.name || 'Supplier'},\n\nPlease find attached Debit Note Voucher ${debitNote.debitNoteNumber} for your review regarding received goods discrepancy. The claim amount will be deducted from pending bill disbursements.\n\nRegards,\nAccounts Payable Team`
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid vendor email address.');
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await accountsApi.sendDebitNoteToVendor(debitNote.id, {
        email: email.trim(),
        notes: notes.trim() || undefined,
      });
      showToast({
        kind: 'success',
        title: 'Debit Note Sent to Vendor',
        message: `Debit Note ${debitNote.debitNoteNumber} has been dispatched to ${email.trim()}.`,
      });
      if (onSent) onSent();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to transmit debit note to vendor.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-foreground border border-border">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Send Debit Note to Vendor</h2>
              <p className="text-xs text-muted-foreground font-mono">{debitNote.debitNoteNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive   ">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSend} className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Vendor:</span>
              <span className="font-bold text-foreground">{vendor?.name || 'Vendor'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Claim Value:</span>
              <span className="font-mono font-bold text-destructive">
                ₹{Number(debitNote.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {debitNote.reason && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">Reason:</span>
                <span className="text-foreground truncate max-w-[240px]">{debitNote.reason}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Vendor Destination Email *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendor@company.com"
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Cover Message / Notes to Vendor
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:ring-2 focus:ring-ring focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSending}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-1.5 shadow-sm px-4"
            >
              {isSending ? (
                <>Sending…</>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send to Vendor
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
