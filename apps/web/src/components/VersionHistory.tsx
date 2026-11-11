'use client';

import React from 'react';
import { Card } from '@plinth/ui';
import { StatusBadge, AnyStatus } from './StatusBadge';
import { format } from 'date-fns';
import { Clock, History, User } from 'lucide-react';

export interface VersionInfo {
  id?: string;
  version?: number;
  status?: AnyStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  // Audit log fallbacks
  timestamp?: string | Date;
  actor?: string;
  action?: string;
  summary?: string;
  entityId?: string;
}

function formatDateSafe(rawDate?: string | Date | null): string {
  if (!rawDate) return 'Recently';
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return 'Recently';
  try {
    return format(d, 'MMM d, yyyy · HH:mm');
  } catch {
    return 'Recently';
  }
}

export function VersionHistory({ versions }: { versions: VersionInfo[] }) {
  if (!versions || versions.length === 0) {
    return (
      <Card className="rounded-2xl border border-border/80 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-[#004a80]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Version & Audit History
          </h3>
        </div>
        <p className="text-muted-foreground text-xs">
          Initial revision active. No previous version modifications recorded.
        </p>
      </Card>
    );
  }

  // Sort versions descending (by version or date)
  const sorted = [...versions].sort((a, b) => {
    if (a.version && b.version) return b.version - a.version;
    const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
    const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
    return timeB - timeA;
  });

  return (
    <Card className="rounded-2xl border border-border/80 shadow-xs overflow-hidden">
      <div className="border-b border-border/60 bg-muted/40 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#004a80]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Version & Audit History
          </h3>
        </div>
        <span className="font-mono text-[11px] font-bold text-[#004a80] dark:text-blue-300 bg-[#004a80]/10 px-2.5 py-0.5 rounded-md border border-[#004a80]/20">
          {sorted.length} {sorted.length === 1 ? 'Revision' : 'Revisions'}
        </span>
      </div>

      <div className="p-5">
        <div className="relative border-l-2 border-[#004a80]/30 pl-4 ml-1 space-y-4">
          {sorted.map((v, index) => {
            const dateLabel = formatDateSafe(v.createdAt || v.timestamp || v.updatedAt);
            const author = v.createdBy || v.actor || 'System';
            const title =
              v.version != null
                ? `v${v.version}.0 Revision`
                : v.action || v.summary || `Revision #${sorted.length - index}`;
            const isLatest = index === 0;

            return (
              <div key={v.id || index} className="relative space-y-1">
                {/* Timeline dot */}
                <span
                  className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ${
                    isLatest
                      ? 'bg-[#004a80] ring-[#004a80]/20'
                      : 'bg-muted-foreground/50 ring-border'
                  }`}
                />
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground">{title}</span>
                    {v.status && (
                      <StatusBadge status={v.status} className="scale-75 origin-left" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {dateLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="w-3 h-3 text-muted-foreground/70" />
                  <span>
                    Authored by <span className="font-semibold text-foreground/80">{author}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
