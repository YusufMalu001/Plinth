'use client';

import React from 'react';
import { LossEventDto } from '@plinth/types';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Search,
  ShieldCheck,
  RefreshCw,
  FileCheck2
} from 'lucide-react';
import { format } from 'date-fns';

export interface LossTimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  actorName?: string | null;
  actorId?: string | null;
  status?: string;
  description?: string | null;
  notes?: string | null;
  icon: React.ReactNode;
  iconBg: string;
}

function formatDateSafe(rawDate?: string | null): string {
  if (!rawDate) return 'Pending / Not Recorded';
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return 'Recently';
  try {
    return format(d, 'MMM d, yyyy · HH:mm');
  } catch {
    return 'Recently';
  }
}

export function LossEventTimeline({ event }: { event: LossEventDto }) {
  const timelineEvents: LossTimelineEvent[] = [];

  // 1. Reported
  timelineEvents.push({
    id: `${event.id}-reported`,
    timestamp: event.reportedAt,
    title: 'Loss Event Reported',
    actorName: event.reportedByActorName || event.reportedByActorId,
    actorId: event.reportedByActorId,
    status: 'REPORTED',
    description: `Reported ${event.quantity} ${event.uomCode || 'units'} under reason: "${event.reason}"`,
    notes: null,
    icon: <Clock className="w-4 h-4 text-tone-blue-text" />,
    iconBg: 'bg-tone-sky-bg/10 border-tone-blue-solid/30',
  });

  // 2. Classified (if applicable)
  if (event.classification) {
    const isAbnormal = event.classification === 'ABNORMAL';
    timelineEvents.push({
      id: `${event.id}-classified`,
      timestamp: event.updatedAt,
      title: isAbnormal ? 'Abnormal Variance Flagged' : 'Tolerance Standard Matched',
      actorName: 'Tolerance Engine',
      status: event.classification,
      description: `Evaluated against WastageRule ${event.appliedWastageRuleCode || 'standard'} (v${event.appliedWastageRuleVersion || 1}). Variance: ${event.varianceFromExpected ?? 0}%`,
      notes: null,
      icon: <ShieldCheck className={`w-4 h-4 ${isAbnormal ? 'text-tone-red-text' : 'text-tone-green-text'}`} />,
      iconBg: isAbnormal ? 'bg-tone-rose-bg/10 border-tone-red-solid/30' : 'bg-tone-emerald-bg/10 border-tone-green-solid/30',
    });
  }

  // 3. Reviewed
  if (event.reviewedAt) {
    timelineEvents.push({
      id: `${event.id}-reviewed`,
      timestamp: event.reviewedAt,
      title: 'Loss Event Reviewed',
      actorName: event.reviewedByActorName || event.reviewedByActorId,
      actorId: event.reviewedByActorId,
      status: 'REVIEWED',
      description: 'Technical and operational review completed.',
      notes: event.reviewNotes,
      icon: <CheckCircle2 className="w-4 h-4 text-tone-purple-text" />,
      iconBg: 'bg-tone-indigo-bg/10 border-tone-purple-solid/30',
    });
  }

  // 4. Investigated
  if (event.investigatedAt) {
    timelineEvents.push({
      id: `${event.id}-investigated`,
      timestamp: event.investigatedAt,
      title: 'Root Cause Investigation Recorded',
      actorName: event.investigatedByActorName || event.investigatedByActorId,
      actorId: event.investigatedByActorId,
      status: 'INVESTIGATED',
      description: 'Formal abnormal variance investigation conducted.',
      notes: event.investigationNotes,
      icon: <Search className="w-4 h-4 text-primary" />,
      iconBg: 'bg-primary/10 border-primary/30',
    });
  }

  // 5. Approved
  if (event.approvedAt) {
    timelineEvents.push({
      id: `${event.id}-approved`,
      timestamp: event.approvedAt,
      title: 'Loss Event Approved',
      actorName: event.approvedByActorName || event.approvedByActorId,
      actorId: event.approvedByActorId,
      status: 'APPROVED',
      description: 'Loss write-off and disposition authorization granted.',
      notes: null,
      icon: <CheckCircle2 className="w-4 h-4 text-tone-green-text" />,
      iconBg: 'bg-tone-emerald-bg/10 border-tone-green-solid/30',
    });
  }

  // 6. Rejected
  if (event.rejectedAt) {
    timelineEvents.push({
      id: `${event.id}-rejected`,
      timestamp: event.rejectedAt,
      title: 'Loss Event Rejected',
      actorName: event.rejectedByActorName || event.rejectedByActorId,
      actorId: event.rejectedByActorId,
      status: 'REJECTED',
      description: 'Loss event was rejected by governance authority.',
      notes: event.rejectionReason,
      icon: <XCircle className="w-4 h-4 text-tone-red-text" />,
      iconBg: 'bg-tone-rose-bg/10 border-tone-red-solid/30',
    });
  }

  // 7. Stock Effect Posted
  if (event.stockEffectRef) {
    timelineEvents.push({
      id: `${event.id}-posted`,
      timestamp: event.updatedAt,
      title: 'Inventory Stock Effect Posted',
      actorName: 'Stock Engine',
      status: 'POSTED',
      description: `Atomic StockAdjustment Ledger posted: ${event.stockEffectRef}`,
      notes: null,
      icon: <FileCheck2 className="w-4 h-4 text-tone-green-text" />,
      iconBg: 'bg-tone-emerald-bg/10 border-tone-green-solid/30',
    });
  }

  // 8. Replacement Challan Issued
  if (event.replacementChallanRef) {
    timelineEvents.push({
      id: `${event.id}-replaced`,
      timestamp: event.updatedAt,
      title: 'Replacement Challan Issued',
      actorName: 'Dispatch Authority',
      status: 'REPLACED',
      description: `Replacement Challan ${event.replacementChallanRef} issued to balance shopfloor production.`,
      notes: null,
      icon: <RefreshCw className="w-4 h-4 text-tone-purple-text" />,
      iconBg: 'bg-tone-violet-bg/10 border-tone-purple-solid/30',
    });
  }

  return (
    <div className="space-y-6 relative before:absolute before:inset-0 before:left-4 sm:before:left-6 before:w-0.5 before:bg-border/70 py-2">
      {timelineEvents.map((t) => (
        <div key={t.id} className="relative pl-10 sm:pl-14 group">
          {/* Timeline Dot Icon */}
          <div
            className={`absolute left-2 sm:left-4 -translate-x-1/2 top-1.5 p-2 rounded-full border shadow-xs flex items-center justify-center transition-transform group-hover:scale-110 ${t.iconBg}`}
          >
            {t.icon}
          </div>

          {/* Content Card */}
          <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2.5 transition-all hover:border-primary/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-border/40 pb-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-foreground">{t.title}</span>
                {t.status && <StatusBadge status={t.status as any} className="scale-90 origin-left" />}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/80" />
                <span>{formatDateSafe(t.timestamp)}</span>
              </div>
            </div>

            {t.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
            )}

            {t.notes && (
              <div className="text-xs bg-muted/40 p-2.5 rounded-lg border border-border/60">
                <span className="font-semibold text-foreground block text-[11px] mb-0.5">Notes:</span>
                <p className="text-muted-foreground whitespace-pre-wrap">{t.notes}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
              <User className="w-3 h-3 text-primary" />
              <span>Actor / Authority: <strong className="text-foreground">{t.actorName || 'System'}</strong></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
