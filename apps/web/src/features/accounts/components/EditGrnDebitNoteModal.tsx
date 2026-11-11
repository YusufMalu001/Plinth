'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { fetchApi } from '@/features/api/client';
import { showToast } from '@/components/toast-store';
import { formatCurrency } from '@/features/accounts/utils';

interface DebitLine {
  id: string;
  description: string;
  shortQuantity?: number | string;
  rejectedQuantity?: number | string;
  damagedQuantity?: number | string;
  unitPrice: number | string;
  taxRate?: number | string;
  reason?: string | null;
}

interface DebitNote {
  id: string;
  debitNoteNumber: string;
  status: string;
  reason: string;
  lines: DebitLine[];
}

interface EditGrnDebitNoteModalProps {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditGrnDebitNoteModal({ id, onClose, onSaved }: EditGrnDebitNoteModalProps) {
  const [note, setNote] = useState<DebitNote | null>(null);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Array<DebitLine & { unitPrice: string; taxRate: string; reason: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchApi<DebitNote>(`/debit-notes/${id}`).then((data) => {
      if (!active) return;
      setNote(data);
      setReason(data.reason || '');
      setLines((data.lines || []).map((line) => ({
        ...line,
        unitPrice: String(line.unitPrice ?? ''),
        taxRate: String(line.taxRate ?? 0),
        reason: line.reason || '',
      })));
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load debit note details.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const total = useMemo(() => lines.reduce((sum, line) => {
    const qty = Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
    const taxable = qty * (Number(line.unitPrice) || 0);
    return sum + taxable + taxable * (Number(line.taxRate) || 0) / 100;
  }, 0), [lines]);

  const updateLine = (lineId: string, field: 'unitPrice' | 'taxRate' | 'reason', value: string) => {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, [field]: value } : line));
  };

  const save = async () => {
    if (!lines.length || lines.some((line) => line.unitPrice.trim() === '' || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0 || !Number.isFinite(Number(line.taxRate)) || Number(line.taxRate) < 0 || Number(line.taxRate) > 100)) {
      setError('Enter a valid unit rate and tax percentage for every line.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await accountsApi.updateGrnDebitNote(id, {
        reason,
        lines: lines.map((line) => ({ id: line.id, unitPrice: Number(line.unitPrice), taxRate: Number(line.taxRate), reason: line.reason })),
      });
      showToast({ kind: 'success', title: 'Debit Note Updated', message: 'Claim values and totals have been recalculated.' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this debit note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-grn-debit-title" className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="edit-grn-debit-title" className="text-base font-bold text-foreground">Edit GRN Debit Note</h2>
            <p className="mt-1 text-xs text-muted-foreground">{note?.debitNoteNumber || 'Loading…'} · update claim rates before Accounts submits the note.</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>

        {loading ? <div className="p-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading debit note…</div> : (
          <>
            <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
              {note && !['DRAFT', 'RECORDED'].includes(note.status) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This debit note has moved forward in approval and is read-only.</p>}
              <label className="block space-y-1.5 text-xs font-semibold text-foreground">
                Claim reason
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </label>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Discrepancy line</th><th className="p-3 text-right">Claim qty</th><th className="p-3">Unit rate (₹)</th><th className="p-3">GST %</th><th className="p-3 text-right">Line claim</th></tr></thead>
                  <tbody>
                    {lines.map((line) => {
                      const quantity = Number(line.shortQuantity || 0) + Number(line.rejectedQuantity || 0) + Number(line.damagedQuantity || 0);
                      const taxable = quantity * (Number(line.unitPrice) || 0);
                      const lineTotal = taxable * (1 + (Number(line.taxRate) || 0) / 100);
                      return <tr key={line.id} className="border-t border-border align-top">
                        <td className="p-3"><div className="font-semibold text-foreground">{line.description}</div><input aria-label={`Reason for ${line.description}`} value={line.reason} onChange={(event) => updateLine(line.id, 'reason', event.target.value)} placeholder="Line reason (optional)" className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-normal" /></td>
                        <td className="p-3 text-right font-mono font-semibold">{quantity}</td>
                        <td className="p-3"><input aria-label={`Unit rate for ${line.description}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, 'unitPrice', event.target.value)} className="w-28 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono" /></td>
                        <td className="p-3"><input aria-label={`Tax rate for ${line.description}`} type="number" min="0" max="100" step="0.01" value={line.taxRate} onChange={(event) => updateLine(line.id, 'taxRate', event.target.value)} className="w-20 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono" /></td>
                        <td className="p-3 text-right font-mono font-bold">{formatCurrency(lineTotal)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end rounded-xl bg-muted/40 px-4 py-3 text-sm"><span className="mr-4 text-muted-foreground">Recalculated claim total</span><strong className="font-mono">{formatCurrency(total)}</strong></div>
              {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving || loading || Boolean(note && !['DRAFT', 'RECORDED'].includes(note.status))} className="gap-2 bg-primary text-white hover:bg-primary/90"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Changes'}</Button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
