'use client';

import React from 'react';
import { Card } from '@synergy/ui';
import { Check } from 'lucide-react';
import { StatusBadge, AnyStatus } from './StatusBadge';
import { format } from 'date-fns';
import type { Grn } from '../features/goods-receipt/api';

export interface GrnHistoryEntry {
  id: string;
  timestamp: string;
  label: string;
  detail?: string;
  actorId?: string | null;
  status?: AnyStatus;
}

/**
 * Assembles a flat, reverse-chronological event list from a GRN's nested
 * measurements/discrepancies/label print events + header status timestamps.
 * Mirrors VersionHistory.tsx's visual conventions (Card, flat list, reduced-scale
 * StatusBadge, date-fns formatting) but GRN history is a sequence of receiving
 * events, not document "versions", so it uses its own shape rather than reusing
 * VersionHistory's VersionInfo interface.
 */
export function buildGrnHistory(grn: Grn): GrnHistoryEntry[] {
  const entries: GrnHistoryEntry[] = [];

  entries.push({
    id: `${grn.id}-received`,
    timestamp: grn.receivedAt,
    label: 'Received',
    detail: grn.isUnreferenced ? 'Unreferenced shipment' : grn.po ? `Against PO ${grn.po.poNumber}` : undefined,
    actorId: grn.receivedByActorId,
    status: 'ARRIVED',
  });

  for (const line of grn.lines) {
    for (const m of line.measurements) {
      entries.push({
        id: `measurement-${m.id}`,
        timestamp: m.recordedAt,
        label: `Measurement recorded (${m.type})`,
        detail: `${m.value} ${m.unitLabel}${m.note ? ` — ${m.note}` : ''}`,
        actorId: m.measuredByActorId,
      });
    }
    for (const d of line.discrepancies) {
      entries.push({
        id: `discrepancy-${d.id}`,
        timestamp: d.createdAt,
        label: `Discrepancy raised (${d.type})`,
        detail: `Quantity: ${d.quantity}`,
        status: d.status,
      });
      if (d.resolvedAt) {
        entries.push({
          id: `discrepancy-resolved-${d.id}`,
          timestamp: d.resolvedAt,
          label: `Discrepancy resolved — ${d.resolutionType === 'RETURN_TO_VENDOR' ? 'Returned to vendor' : 'Accepted into stock'}`,
          detail: d.acceptanceJustification || d.returnReference || undefined,
          actorId: d.resolvedByActorId,
          status: d.status,
        });
      }
    }
    if (line.label) {
      entries.push({
        id: `label-${line.label.id}`,
        timestamp: line.label.generatedAt,
        label: `Label issued: ${line.label.labelCode}`,
      });
      for (const p of line.label.printEvents) {
        entries.push({
          id: `print-${p.id}`,
          timestamp: p.printedAt,
          label: 'Label printed',
          detail: p.reason || undefined,
          actorId: p.printedByActorId,
        });
      }
    }
  }

  if (grn.verifiedAt) {
    entries.push({ id: `${grn.id}-verified`, timestamp: grn.verifiedAt, label: 'Verified', actorId: grn.verifiedByActorId, status: 'VERIFIED' });
  }
  if (grn.signedOffAt) {
    entries.push({ id: `${grn.id}-signed-off`, timestamp: grn.signedOffAt, label: 'Signed off', actorId: grn.signedOffByActorId, status: 'SIGNED_OFF' });
  }
  if (grn.finalizedAt) {
    entries.push({ id: `${grn.id}-finalized`, timestamp: grn.finalizedAt, label: 'Finalized', actorId: grn.finalizedByActorId, status: 'FINALIZED' });
  }

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function GrnHistoryTimeline({ grn }: { grn: Grn }) {
  const entries = buildGrnHistory(grn);

  if (entries.length === 0) {
    return <div className="text-gray-500 text-sm">No history available.</div>;
  }

  return (
    <Card className="p-5">
      <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Audit trail</p><h3 className="mt-1 text-lg font-semibold text-foreground">Receipt history</h3><p className="mt-1 text-xs text-muted-foreground">Every receiving event in chronological order.</p></div>
      <div className="relative ml-1 space-y-0">
        <div className="absolute bottom-4 left-[11px] top-4 w-px bg-border" aria-hidden="true" />
        {entries.map((e, index) => (
          <div key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${index === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/40 bg-card text-primary'}`}><Check size={12} /></span>
            <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-foreground">{e.label}</span>{e.status && <StatusBadge status={e.status} className="scale-90 origin-left" />}</div>
              {e.detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{e.detail}</p>}
              <div className="mt-2 text-[11px] text-muted-foreground">
                {(() => {
                  try {
                    const d = new Date(e.timestamp);
                    return isNaN(d.getTime()) ? 'Recently' : format(d, 'MMM d, yyyy · HH:mm');
                  } catch {
                    return 'Recently';
                  }
                })()}{e.actorId && ` · ${e.actorId}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
