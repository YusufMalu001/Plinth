'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, FileWarning, X } from 'lucide-react';
import { Button } from '@synergy/ui';
import { AcceptedGrnDetail } from '../types';
import { formatCurrency } from '../utils';

interface CreateGrnDebitNoteModalProps {
  isOpen: boolean;
  grn: AcceptedGrnDetail;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  isSaving?: boolean;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function CreateGrnDebitNoteModal({ isOpen, grn, onClose, onSubmit, isSaving = false }: CreateGrnDebitNoteModalProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const discrepantLines = useMemo(() => grn.lines.map((line) => {
    const claimQuantity = Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const taxRate = Number(line.taxRate || 0);
    const taxableAmount = money(claimQuantity * unitPrice);
    const taxAmount = money(taxableAmount * taxRate / 100);
    return { ...line, claimQuantity, unitPrice, taxRate, taxableAmount, taxAmount, totalAmount: taxableAmount + taxAmount };
  }).filter((line) => line.claimQuantity > 0), [grn.lines]);
  const totals = discrepantLines.reduce((sum, line) => ({
    units: sum.units + line.claimQuantity,
    taxable: sum.taxable + line.taxableAmount,
    tax: sum.tax + line.taxAmount,
    total: sum.total + line.totalAmount,
  }), { units: 0, taxable: 0, tax: 0, total: 0 });

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Enter at least 5 characters describing the supplier discrepancy.');
      return;
    }
    setError('');
    try {
      await onSubmit(reason.trim());
      setReason('');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the debit note claim.');
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-200 sm:p-5"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="create-grn-debit-title" className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
              <FileWarning className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="create-grn-debit-title" className="text-base font-bold text-foreground sm:text-lg">Create supplier debit note claim</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{grn.grnNumber} · PO {grn.po.poNumber} · {grn.vendor.legalName || grn.vendor.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <section aria-label="Claim summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Affected items</p>
                <p className="mt-1 font-mono text-lg font-bold text-foreground">{discrepantLines.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Claim quantity</p>
                <p className="mt-1 font-mono text-lg font-bold text-destructive">{totals.units.toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Taxable amount</p>
                <p className="mt-1 font-mono text-lg font-bold text-foreground">{formatCurrency(totals.taxable)}</p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Estimated claim total</p>
                <p className="mt-1 font-mono text-lg font-black text-foreground">{formatCurrency(totals.total)}</p>
                <p className="text-[10px] text-muted-foreground">Includes estimated GST of {formatCurrency(totals.tax)}</p>
              </div>
            </section>

            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

            <section className="overflow-hidden rounded-xl border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Claim line details</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Quantities and rates are drawn from the verified GRN and linked purchase order.</p>
                </div>
                <span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{discrepantLines.length} {discrepantLines.length === 1 ? 'line' : 'lines'}</span>
              </div>
              {discrepantLines.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-xs">
                    <thead className="bg-primary text-primary-foreground">
                      <tr className="text-[10px] uppercase tracking-wider">
                        <th className="px-3 py-3 text-left font-bold">Item</th>
                        <th className="px-3 py-3 text-right font-bold">PO / Rec&apos;d / Accepted</th>
                        <th className="px-3 py-3 text-right font-bold">Short</th>
                        <th className="px-3 py-3 text-right font-bold">Rejected</th>
                        <th className="px-3 py-3 text-right font-bold">Damaged</th>
                        <th className="px-3 py-3 text-right font-bold">Claim qty</th>
                        <th className="px-3 py-3 text-right font-bold">Unit rate</th>
                        <th className="px-3 py-3 text-right font-bold">GST</th>
                        <th className="px-3 py-3 text-right font-bold">Taxable</th>
                        <th className="px-3 py-3 text-right font-bold">Tax</th>
                        <th className="px-3 py-3 text-right font-bold">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {discrepantLines.map((line, index) => (
                        <tr key={line.id} className="align-top hover:bg-muted/20">
                          <td className="max-w-[260px] px-3 py-3">
                            <p className="font-semibold text-foreground">{line.description}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{line.sku || `GRN line ${index + 1}`} · {line.uom}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">
                            <span>{Number(line.expectedQuantity || 0).toLocaleString('en-IN')}</span>
                            <span className="px-1 text-muted-foreground">/</span>
                            <span>{Number(line.receivedQuantity || 0).toLocaleString('en-IN')}</span>
                            <span className="px-1 text-muted-foreground">/</span>
                            <span className="font-bold">{Number(line.acceptedQuantity || 0).toLocaleString('en-IN')}</span>
                            <span className="ml-1 text-[9px] text-muted-foreground">{line.uom}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{Number(line.shortQuantity || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{Number(line.rejectedQuantity || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{Number(line.damagedQuantity || 0).toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-destructive">{line.claimQuantity.toLocaleString('en-IN')} {line.uom}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(line.unitPrice)}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{line.taxRate.toLocaleString('en-IN')}%</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(line.taxableAmount)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(line.taxAmount)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums">{formatCurrency(line.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Claim totals</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-destructive">{totals.units.toLocaleString('en-IN')}</td>
                        <td colSpan={2} />
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(totals.taxable)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(totals.tax)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm tabular-nums">{formatCurrency(totals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">No shortage, rejected, or damaged quantities are recorded on this GRN.</p>
              )}
            </section>

            <div className="space-y-1.5">
              <label htmlFor="debit-claim-reason" className="text-xs font-semibold text-foreground">Reason for supplier claim <span className="text-destructive">*</span></label>
              <textarea id="debit-claim-reason" required minLength={5} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe the shortage, rejected goods, or damage and what you are requesting from the supplier." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-[11px] text-muted-foreground">The claim starts as a draft. Accounts must submit it for approval before it is treated as approved.</p>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>This claim is linked to the GRN and PO. It does not automatically reduce the payable or record a supplier payment.</span></div>
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving || reason.trim().length < 5 || !discrepantLines.length} className="gap-2 bg-primary text-white hover:bg-primary">
              <FileWarning className="h-4 w-4" />{isSaving ? 'Creating claim…' : 'Create debit note claim'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );

  return createPortal(modalContent, document.body);
}
