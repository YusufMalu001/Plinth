'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grn } from '@/features/goods-receipt/api';
import {
  X,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { showToast } from '@/components/toast-store';

interface PhysicalVerificationModalProps {
  grn: Grn;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    lines: Array<{
      lineId: string;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity?: number;
      damagedQuantity?: number;
      invoiceUnitPrice?: number;
      notes?: string;
    }>;
    overallNotes?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

type VerificationLineState = {
  receivedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  damagedQuantity: string;
  invoiceUnitPrice: string;
  notes: string;
};

const numericValue = (value: string | number | null | undefined) => {
  if (value === '' || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function PhysicalVerificationModal({
  grn,
  isOpen,
  onClose,
  onSave,
  isSubmitting = false,
}: PhysicalVerificationModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize line verification state
  const [lineStates, setLineStates] = useState<Record<string, VerificationLineState>>(() => {
    const initial: Record<string, VerificationLineState> = {};

    grn.lines.forEach((l) => {
      const rec = l.receivedQuantity > 0 ? l.receivedQuantity : (l.expectedQuantity ?? 0);
      const acc = l.acceptedQuantity > 0 ? l.acceptedQuantity : rec;
      const rej = (l.rejectedQuantity || 0) + (l.damagedQuantity || 0);
      const dam = 0;
      initial[l.id] = {
        receivedQuantity: String(rec),
        acceptedQuantity: String(acc),
        rejectedQuantity: String(rej),
        damagedQuantity: String(dam),
        invoiceUnitPrice: String(Number(l.invoiceUnitPrice ?? l.poLine?.unitPrice ?? 0)),
        notes: '',
      };
    });
    return initial;
  });

  const [overallNotes, setOverallNotes] = useState('');

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const updateLine = (lineId: string, patch: Partial<(typeof lineStates)[string]>) => {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] || {
          receivedQuantity: '0',
          acceptedQuantity: '0',
          rejectedQuantity: '0',
          damagedQuantity: '0',
          invoiceUnitPrice: '0',
          notes: '',
        }),
        ...patch,
      },
    }));
  };


  const handleReset = () => {
    const resetState: typeof lineStates = {};
    grn.lines.forEach((l) => {
      const exp = l.expectedQuantity ?? 0;
      resetState[l.id] = {
        receivedQuantity: String(exp),
        acceptedQuantity: String(exp),
        rejectedQuantity: '0',
        damagedQuantity: '0',
        invoiceUnitPrice: String(Number(l.invoiceUnitPrice ?? l.poLine?.unitPrice ?? 0)),
        notes: '',
      };
    });
    setLineStates(resetState);
  };

  // Aggregated totals
  const totals = grn.lines.reduce(
    (acc, line) => {
      const st = lineStates[line.id];
      const exp = line.expectedQuantity ?? 0;
      const rec = numericValue(st?.receivedQuantity);
      const accepted = numericValue(st?.acceptedQuantity);
      const rej = numericValue(st?.rejectedQuantity);
      const dam = numericValue(st?.damagedQuantity);
      const eqDiff = Math.abs(rec - (accepted + rej));

      return {
        expected: acc.expected + exp,
        received: acc.received + rec,
        accepted: acc.accepted + accepted,
        rejected: acc.rejected + rej,
        damaged: acc.damaged + dam,
        hasInvalidEquations: acc.hasInvalidEquations || eqDiff > 1e-6,
      };
    },
    { expected: 0, received: 0, accepted: 0, rejected: 0, damaged: 0, hasInvalidEquations: false }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totals.hasInvalidEquations) {
      showToast({
        title: 'Equation Mismatch',
        message: 'Every line must satisfy: Received = Accepted + Rejected / Damage.',
        kind: 'error',
      });
      return;
    }

    const payload = {
      lines: grn.lines.map((l) => {
        const st = lineStates[l.id];
        return {
          lineId: l.id,
          receivedQuantity: numericValue(st?.receivedQuantity),
          acceptedQuantity: numericValue(st?.acceptedQuantity),
          rejectedQuantity: numericValue(st?.rejectedQuantity),
          damagedQuantity: numericValue(st?.damagedQuantity),
          invoiceUnitPrice: numericValue(st?.invoiceUnitPrice),
          notes: st?.notes?.trim() || undefined,
        };
      }),
      overallNotes: overallNotes.trim() || undefined,
    };

    try {
      await onSave(payload);
      showToast({
        title: 'Verification Completed',
        message: `Physical verification recorded successfully for ${grn.grnNumber}.`,
        kind: 'success',
      });
      onClose();
    } catch (err: unknown) {
      showToast({
        title: 'Verification Failed',
        message: err instanceof Error ? err.message : 'Could not complete physical verification.',
        kind: 'error',
      });
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  Physical Verification &amp; Inspection Layer
                </h3>
                <span className="rounded-md bg-card border border-border px-2 py-0.5 text-xs font-mono font-bold text-foreground">
                  {grn.grnNumber}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action & Metric Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-3 border-b border-border/70 bg-card">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">PO Lines</span>
              <span className="font-mono font-bold text-foreground">{grn.lines.length} items</span>
            </div>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Physically Received</span>
              <span className="font-mono font-bold text-foreground">{totals.received} units</span>
            </div>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Accepted to Stock</span>
              <span className="font-mono font-bold text-foreground">{totals.accepted} units</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Lines Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Item / Specification</th>
                    <th className="px-3 py-3 text-center w-24">PO Expected</th>
                    <th className="px-3 py-3 text-center w-28">Delivered (Rec)</th>
                    <th className="px-3 py-3 text-center w-28">Accepted (Stock)</th>
                    <th className="px-3 py-3 text-center w-24">Rejected / Damage</th>
                    <th className="px-3 py-3 text-center w-28">Quantity Short</th>
                    <th className="px-3 py-3 text-center w-28">Invoice Rate</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {grn.lines.map((line, idx) => {
                    const st = lineStates[line.id] || {
                      receivedQuantity: '0',
                      acceptedQuantity: '0',
                      rejectedQuantity: '0',
                      damagedQuantity: '0',
                      invoiceUnitPrice: String(Number(line.invoiceUnitPrice ?? line.poLine?.unitPrice ?? 0)),
                      notes: '',
                    };
                    const item = line.product || line.material;
                    const code = item ? ('sku' in item ? item.sku : item.code) : `Line ${idx + 1}`;
                    const unit = line.uom?.symbol || line.uom?.code || 'units';
                    const exp = line.expectedQuantity ?? 0;
                    const rec = numericValue(st.receivedQuantity);
                    const acc = numericValue(st.acceptedQuantity);
                    const rej = numericValue(st.rejectedQuantity);
                    const isEquationValid = Math.abs(rec - (acc + rej)) <= 1e-6;

                    return (
                      <tr key={line.id} className={`hover:bg-muted/20 transition-colors ${!isEquationValid ? 'bg-muted/30' : ''}`}>
                        {/* Item Details */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-xs text-foreground leading-snug">
                            {item?.name || 'Unnamed line item'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-mono">{code}</span>
                            <span>·</span>
                            <span className="uppercase font-medium">{unit}</span>
                          </div>
                          {!isEquationValid && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground mt-1">
                              <AlertTriangle size={11} className="text-primary" /> Equation mismatch ({rec} ≠ {acc + rej})
                            </span>
                          )}
                        </td>

                        {/* PO Expected */}
                        <td className="px-3 py-3 text-center font-mono text-xs font-semibold text-muted-foreground">
                          {exp}
                        </td>

                        {/* Physically Delivered */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            required
                            value={st.receivedQuantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const newRec = numericValue(raw);
                              const autoAcc = Math.max(0, newRec - rej);
                              updateLine(line.id, {
                                receivedQuantity: raw,
                                acceptedQuantity: String(autoAcc),
                              });
                            }}
                            className="w-24 rounded-lg border border-border bg-background p-1.5 text-center font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-hidden"
                          />
                        </td>

                        {/* Accepted (Stock) */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            required
                            value={st.acceptedQuantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const newAcc = numericValue(raw);
                              // Varying accepted adjusts the combined rejected / damaged quantity.
                              const remaining = Math.max(0, rec - newAcc);
                              updateLine(line.id, {
                                acceptedQuantity: raw,
                                rejectedQuantity: String(remaining),
                              });
                            }}
                            className="w-24 rounded-lg border border-border bg-background p-1.5 text-center font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-hidden"
                          />
                        </td>

                        {/* Rejected */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={st.rejectedQuantity}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const newRej = numericValue(raw);
                              // Varying rejected adjusts accepted accordingly
                              const newAcc = Math.max(0, rec - newRej);
                              updateLine(line.id, {
                                rejectedQuantity: raw,
                                acceptedQuantity: String(newAcc),
                              });
                            }}
                            className="w-20 rounded-lg border border-border bg-background p-1.5 text-center font-mono text-xs font-semibold text-foreground focus:border-primary focus:outline-hidden"
                          />
                        </td>

                        {/* Quantity Short (Editable & Dynamically Interrelated) */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={exp}
                            value={String(Math.max(0, exp - rec))}
                            onChange={(e) => {
                              const newShort = numericValue(e.target.value);
                              // Shortage directly determines delivered: rec = exp - short
                              const newRec = Math.max(0, exp - newShort);
                              const newAcc = Math.max(0, newRec - rej);
                              updateLine(line.id, {
                                receivedQuantity: String(newRec),
                                acceptedQuantity: String(newAcc),
                              });
                            }}
                            className="w-20 rounded-lg border border-border bg-background p-1.5 text-center font-mono text-xs font-bold text-tone-amber-text  focus:border-primary focus:outline-hidden"
                          />
                        </td>

                        {/* Invoice Rate */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            aria-label={`Invoice rate for ${item?.name || 'line item'}`}
                            value={st.invoiceUnitPrice}
                            onChange={(e) => updateLine(line.id, { invoiceUnitPrice: e.target.value })}
                            className="w-28 rounded-lg border border-border bg-background p-1.5 text-center font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-hidden"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">PO: {Number(line.poLine?.unitPrice ?? 0).toFixed(2)}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall Receiving Verification Notes */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Physical Verification Summary &amp; Dock Inspection Remarks
            </label>
            <textarea
              rows={2}
              value={overallNotes}
              onChange={(e) => setOverallNotes(e.target.value)}
              placeholder="Record overall vehicle condition, driver note, temperature/container seal status, or batch verification summary…"
              className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground focus:border-primary focus:outline-hidden leading-relaxed"
            />
          </div>

          {/* Sticky Modal Footer */}
          <div className="flex items-center justify-end pt-4 border-t border-border/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || totals.hasInvalidEquations}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 px-5 py-2 text-xs font-bold text-primary-foreground shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving Verification…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Complete Physical Verification</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
