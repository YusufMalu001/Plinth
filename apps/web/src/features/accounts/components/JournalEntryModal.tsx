'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { LedgerAccount, AccountingPeriod, VoucherKind } from '../types';
import { cents, fromCents, localToday } from '../utils';

interface JournalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  periods: AccountingPeriod[];
  chart: LedgerAccount[];
  onSubmit: (journalData: any) => Promise<void>;
}

export function JournalEntryModal({
  isOpen,
  onClose,
  entityId,
  periods,
  chart,
  onSubmit,
}: JournalEntryModalProps) {
  const [accountingDate, setAccountingDate] = useState(localToday());
  const [periodId, setPeriodId] = useState('');
  const [kind, setKind] = useState<VoucherKind>('JOURNAL');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Array<{ accountId: string; debit: string; credit: string; memo: string }>>([
    { accountId: '', debit: '', credit: '', memo: '' },
    { accountId: '', debit: '', credit: '', memo: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const previousNarrationRef = useRef<string>('');


  const openPeriods = periods.filter((p) => p.status === 'OPEN');
  const activePeriod =
    periodId ||
    openPeriods.find(
      (p) => accountingDate >= p.startsOn.slice(0, 10) && accountingDate <= p.endsOn.slice(0, 10)
    )?.id ||
    openPeriods[0]?.id ||
    '';

  const updateLine = (index: number, patch: any) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        // If debit entered, clear credit and vice versa
        if (patch.debit && parseFloat(patch.debit) > 0) {
          updated.credit = '';
        } else if (patch.credit && parseFloat(patch.credit) > 0) {
          updated.debit = '';
        }
        return updated;
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, { accountId: '', debit: '', credit: '', memo: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const totalDebitCents = lines.reduce((sum, l) => sum + cents(l.debit || '0'), 0n);
  const totalCreditCents = lines.reduce((sum, l) => sum + cents(l.credit || '0'), 0n);
  const isBalanced = totalDebitCents > 0n && totalDebitCents === totalCreditCents;
  const differenceCents = totalDebitCents > totalCreditCents ? totalDebitCents - totalCreditCents : totalCreditCents - totalDebitCents;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isBalanced || !description || !activePeriod || isSubmitting) return;
    setIsSubmitting(true);
    try {
      previousNarrationRef.current = description;
      await onSubmit({
        entityId,
        periodId: activePeriod,
        accountingDate,
        kind,
        description,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit || '0').toFixed(2),
          credit: parseFloat(l.credit || '0').toFixed(2),
          memo: l.memo || undefined,
        })),
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + A: Save / Submit voucher
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      // Esc: Close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Alt + A: Add entry line
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        addLine();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isBalanced, description, activePeriod, isSubmitting, lines]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">New Journal Voucher</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a balanced double entry financial voucher. All entries are validated in real-time.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Header Controls */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-foreground">Accounting Date</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                value={accountingDate}
                onChange={(e) => setAccountingDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Accounting Period</label>
              <select
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={activePeriod}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                <option value="">Select Open Period</option>
                {openPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} ({p.fiscalYear})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Voucher Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={kind}
                onChange={(e) => setKind(e.target.value as VoucherKind)}
              >
                <option value="JOURNAL">Standard Journal (GL)</option>
                <option value="OPENING">Opening Balance Journal</option>
                <option value="CONTRA">Contra Voucher (Cash/Bank Transfer)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Narration / Description</label>
              <span className="text-[10px] text-muted-foreground font-mono">Repeat previous: Ctrl+R</span>
            </div>
            <textarea
              required
              rows={2}
              placeholder="Detailed business purpose, supporting reference, and authorization details..."
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
                  e.preventDefault();
                  if (previousNarrationRef.current) {
                    setDescription(previousNarrationRef.current);
                  }
                }
              }}
            />
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Voucher Debits & Credits
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">Alt+D delete row</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground "
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Entry Line <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-mono">Alt+A</kbd>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold w-1/3">Ledger Account</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Memo / Line Note</TableHead>
                    <TableHead className="p-3 text-right font-semibold w-32">Debit (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold w-32">Credit (₹)</TableHead>
                    <TableHead className="p-3 text-center w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="p-2.5">
                        <select
                          required
                          data-row={idx}
                          data-col="account"
                          className="w-full rounded-xl border border-border bg-background p-2 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                          value={line.accountId}
                          onChange={(e) => updateLine(idx, { accountId: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                              e.preventDefault();
                              removeLine(idx);
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="memo"]`);
                              nextInput?.focus();
                            }
                          }}
                        >
                          <option value="">Select Ledger Account</option>
                          {chart
                            .filter((a) => a.status === 'ACTIVE' && !a.isControl)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code} - {a.name} ({a.type})
                              </option>
                            ))}
                        </select>
                      </TableCell>
                      <TableCell className="p-2.5">
                        <input
                          placeholder="Optional memo..."
                          data-row={idx}
                          data-col="memo"
                          className="w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                          value={line.memo}
                          onChange={(e) => updateLine(idx, { memo: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                              e.preventDefault();
                              removeLine(idx);
                              return;
                            }
                            if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
                              e.preventDefault();
                              if (idx > 0 && lines[idx - 1]?.memo) {
                                updateLine(idx, { memo: lines[idx - 1].memo });
                              } else if (description) {
                                updateLine(idx, { memo: description });
                              }
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="debit"]`);
                              nextInput?.focus();
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          data-row={idx}
                          data-col="debit"
                          className="w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground/60"
                          value={line.debit}
                          onChange={(e) => updateLine(idx, { debit: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                              e.preventDefault();
                              removeLine(idx);
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (parseFloat(line.debit || '0') > 0) {
                                if (idx === lines.length - 1) {
                                  addLine();
                                  window.setTimeout(() => {
                                    const nextRowAccount = formRef.current?.querySelector<HTMLSelectElement>(`select[data-row="${idx + 1}"][data-col="account"]`);
                                    nextRowAccount?.focus();
                                  }, 50);
                                } else {
                                  const nextRowAccount = formRef.current?.querySelector<HTMLSelectElement>(`select[data-row="${idx + 1}"][data-col="account"]`);
                                  nextRowAccount?.focus();
                                }
                              } else {
                                const creditInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="credit"]`);
                                creditInput?.focus();
                              }
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          data-row={idx}
                          data-col="credit"
                          className="w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground/60"
                          value={line.credit}
                          onChange={(e) => updateLine(idx, { credit: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                              e.preventDefault();
                              removeLine(idx);
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (idx === lines.length - 1) {
                                addLine();
                                window.setTimeout(() => {
                                  const nextRowAccount = formRef.current?.querySelector<HTMLSelectElement>(`select[data-row="${idx + 1}"][data-col="account"]`);
                                  nextRowAccount?.focus();
                                }, 50);
                              } else {
                                const nextRowAccount = formRef.current?.querySelector<HTMLSelectElement>(`select[data-row="${idx + 1}"][data-col="account"]`);
                                nextRowAccount?.focus();
                              }
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="p-2.5 text-center">
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="rounded-lg p-1 text-destructive hover:bg-destructive/100/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Balance Status Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border p-4 bg-muted/30">
            <div className="flex items-center gap-2.5">
              <div
                className={`rounded-xl p-2 ${
                  isBalanced
                    ? 'bg-primary/10 text-primary '
                    : 'bg-destructive/100/10 text-destructive '
                }`}
              >
                {isBalanced ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isBalanced ? 'Entry is Perfectly Balanced' : 'Unbalanced Journal Voucher'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isBalanced
                    ? 'Ready for maker submission and checker approval.'
                    : `Difference: ₹${fromCents(differenceCents)} (Debits must equal Credits)`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 font-mono text-xs">
              <div>
                <span className="text-muted-foreground">Total Debits: </span>
                <span className="font-bold text-foreground">₹{fromCents(totalDebitCents)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Credits: </span>
                <span className="font-bold text-foreground">₹{fromCents(totalCreditCents)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
              disabled={isSubmitting || !isBalanced || !description || !activePeriod}
            >
              {isSubmitting ? 'Saving Journal…' : 'Save Draft Journal'}
              <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
