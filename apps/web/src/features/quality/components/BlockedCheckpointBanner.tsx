import React from 'react';
import { Sliders, PlusCircle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

interface BlockedCheckpointBannerProps {
  checkpointName?: string;
  missingReason?: string | null;
  ruleCode?: string | null;
  onConfigureClick?: () => void;
  compact?: boolean;
}

export function BlockedCheckpointBanner({
  checkpointName = 'This checkpoint',
  missingReason,
  onConfigureClick,
  compact = false
}: BlockedCheckpointBannerProps) {
  const displayReason =
    missingReason ||
    `Inspection criteria not yet defined for ${checkpointName} (V-009). Standard operating procedure requires approved criteria before inspection can proceed.`;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted text-foreground border border-border text-xs font-semibold shadow-2xs">
        <ShieldAlert className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>Criteria Unconfigured (V-009)</span>
      </div>
    );
  }

  return (
    <div
      data-testid="blocked-checkpoint-banner"
      className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
    >
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 mt-0.5 sm:mt-0 shrink-0">
          <Sliders className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            Inspection Blocked: Missing QC Criteria
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono font-bold border border-border">
              V-009 Gate
            </span>
          </h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
            {displayReason}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
        {onConfigureClick ? (
          <button
            type="button"
            onClick={onConfigureClick}
            className="inline-flex items-center gap-2 h-9.5 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs hover:shadow transition-all cursor-pointer active:scale-[0.99]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Configure Criteria</span>
          </button>
        ) : (
          <Link
            href="/quality/rules"
            className="inline-flex items-center gap-2 h-9.5 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs hover:shadow transition-all cursor-pointer active:scale-[0.99]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Configure Criteria</span>
          </Link>
        )}
      </div>
    </div>
  );
}
