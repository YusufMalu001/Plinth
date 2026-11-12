'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Check, RotateCcw, Sparkles } from 'lucide-react';

export interface DiscrepancyLineData {
  lineId: string;
  itemName: string;
  itemCode: string;
  uom: string;
  expectedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  damagedQuantity: number;
  reason: string;
}

interface DiscrepancyActionModalProps {
  data: DiscrepancyLineData;
  onSave: (updated: {
    acceptedQuantity: number;
    rejectedQuantity: number;
    damagedQuantity: number;
    reason: string;
  }) => void;
  onClose: () => void;
}

const REASON_PRESETS = [
  'Packaging torn and contents damaged in transit',
  'Delivered quantity less than invoice/PO specification (shortage)',
  'Non-conforming dimensions or surface defects',
  'Wrong material grade delivered by supplier',
  'Expired or compromised manufacturer seals',
];

export function DiscrepancyActionModal({ data, onSave, onClose }: DiscrepancyActionModalProps) {
  const [mounted, setMounted] = useState(false);
  const totalDelivered = data.receivedQuantity;
  const [accepted, setAccepted] = useState<number>(data.acceptedQuantity);
  const [rejected, setRejected] = useState<number>(data.rejectedQuantity);
  const [damaged, setDamaged] = useState<number>(data.damagedQuantity);
  const [reason, setReason] = useState<string>(data.reason || '');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  const currentAllocated = accepted + rejected + damaged;
  const unallocated = totalDelivered - currentAllocated;

  // Auto-balance accepted quantity when rejected quantity is entered
  const handleRejectedChange = (valStr: string) => {
    const val = valStr === '' ? 0 : Math.max(0, Number(valStr));
    setRejected(val);
    const autoAccepted = Math.max(0, totalDelivered - val - damaged);
    setAccepted(autoAccepted);
  };

  // Auto-balance accepted quantity when damaged quantity is entered
  const handleDamagedChange = (valStr: string) => {
    const val = valStr === '' ? 0 : Math.max(0, Number(valStr));
    setDamaged(val);
    const autoAccepted = Math.max(0, totalDelivered - rejected - val);
    setAccepted(autoAccepted);
  };

  // Direct edit of accepted quantity
  const handleAcceptedChange = (valStr: string) => {
    const val = valStr === '' ? 0 : Math.max(0, Number(valStr));
    setAccepted(val);
  };

  // Quick reset to clean full receipt
  const handleReset = () => {
    setAccepted(totalDelivered);
    setRejected(0);
    setDamaged(0);
    setReason('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      acceptedQuantity: Math.max(0, accepted),
      rejectedQuantity: Math.max(0, rejected),
      damagedQuantity: Math.max(0, damaged),
      reason: reason.trim(),
    });
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border/80 bg-card shadow-modal animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-border-strong border-border/70 px-6 py-4.5 bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25 shadow-2xs">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Record Line Discrepancy</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Specify physical damage, rejections, and claim notes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form data-keyboard-submit="off" onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Item Telemetry Banner */}
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-sm text-foreground leading-snug">{data.itemName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono bg-card px-2 py-0.5 rounded-md border border-border/60 font-semibold text-[11px] text-foreground">
                    {data.itemCode}
                  </span>
                  <span>·</span>
                  <span className="font-bold uppercase text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border/40">
                    {data.uom}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">PO Contract</span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {data.expectedQuantity} {data.uom}
                </span>
              </div>
            </div>

            {/* Allocation Metric Counters */}
            <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-border/60 text-center">
              <div className="rounded-xl bg-card border border-border/70 p-2.5 shadow-2xs">
                <span className="block text-[10px] uppercase font-bold text-muted-foreground">Physical Received</span>
                <span className="font-mono text-sm font-extrabold text-foreground mt-0.5 block">{totalDelivered}</span>
              </div>
              <div className="rounded-xl bg-card border border-border/70 p-2.5 shadow-2xs">
                <span className="block text-[10px] uppercase font-bold text-muted-foreground">Allocated</span>
                <span className="font-mono text-sm font-extrabold text-foreground mt-0.5 block">
                  {currentAllocated}
                </span>
              </div>
              <div className="rounded-xl bg-card border border-border/70 p-2.5 shadow-2xs">
                <span className="block text-[10px] uppercase font-bold text-muted-foreground">Balance Status</span>
                {unallocated === 0 ? (
                  <span className="font-mono text-xs font-bold text-primary mt-1 flex items-center justify-center gap-1">
                    <Check size={12} className="stroke-[3]" /> Balanced
                  </span>
                ) : (
                  <span className="font-mono text-xs font-bold text-foreground mt-1 block">
                    {unallocated > 0 ? `${unallocated} unallocated` : `${Math.abs(unallocated)} excess`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quantities Distribution with Auto-Balance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-foreground">Quantity Breakdown &amp; Allocation</span>
              <span className="text-[11px] text-muted-foreground">Auto-balances against physical intake</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Accepted Stock */}
              <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <CheckCircle2 size={13} className="text-primary" />
                  <span>Accepted (Stock)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalDelivered}
                  value={accepted}
                  onChange={(e) => handleAcceptedChange(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-extrabold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden shadow-2xs"
                />
              </div>

              {/* Rejected */}
              <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <XCircle size={13} className="text-muted-foreground" />
                  <span>Rejected (RTV)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalDelivered}
                  value={rejected}
                  onChange={(e) => handleRejectedChange(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-extrabold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden shadow-2xs"
                />
              </div>

              {/* Damaged */}
              <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1.5 shadow-2xs">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <AlertTriangle size={13} className="text-muted-foreground" />
                  <span>Damaged Goods</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalDelivered}
                  value={damaged}
                  onChange={(e) => handleDamagedChange(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-extrabold text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden shadow-2xs"
                />
              </div>
            </div>

            {/* Auto-balance status banner */}
            {unallocated !== 0 && (
              <div className="mt-2.5 flex items-center justify-between text-xs text-tone-amber-text bg-tone-amber-bg border border-tone-amber-solid/25 px-3.5 py-2 rounded-xl">
                <span>
                  {unallocated > 0
                    ? `Remaining ${unallocated} ${data.uom} not yet allocated.`
                    : `Excess of ${Math.abs(unallocated)} ${data.uom} over physical intake.`}
                </span>
                <button
                  type="button"
                  onClick={() => setAccepted(Math.max(0, totalDelivered - rejected - damaged))}
                  className="font-bold underline hover:text-tone-amber-text cursor-pointer text-[11px]"
                >
                  Auto-balance Accepted
                </button>
              </div>
            )}
          </div>

          {/* Reason Justification */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">
              Discrepancy Justification &amp; Findings
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why goods were rejected, damaged, or shorted…"
              className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-hidden leading-relaxed shadow-2xs"
            />
          </div>

          {/* Quick Presets */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <Sparkles size={12} className="text-primary" />
              <span>Quick Suggestions</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="rounded-xl border border-border/80 bg-muted/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-all cursor-pointer text-left"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Modal Footer Actions - Generous button padding and clean layout */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/70">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer self-start sm:self-center"
            >
              <RotateCcw size={13} />
              <span>Reset to Full Receipt</span>
            </button>

            <div className="flex items-center gap-2.5 self-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 text-xs font-bold shadow-sm hover:shadow-none transition-all ring-1 ring-primary/20 cursor-pointer"
              >
                <Check size={14} className="stroke-[2.5]" />
                <span>Apply Discrepancy</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

