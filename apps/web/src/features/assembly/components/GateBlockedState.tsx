import React from 'react';
import { Card } from '@plinth/ui';
import { ShieldAlert, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@plinth/ui';
import Link from 'next/link';

export interface GateBlockedStateProps {
  gate: 'V-002' | 'V-003' | 'V-009' | 'CONSERVATION';
  title?: string;
  message: string;
  missingDetails?: Array<{ label: string; value: string | number }>;
  resolutionHref?: string;
  resolutionLabel?: string;
  onResolutionClick?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function GateBlockedState({
  gate,
  title,
  message,
  missingDetails,
  resolutionHref,
  resolutionLabel = 'Resolve Requirement',
  onResolutionClick,
  onRetry,
  className
}: GateBlockedStateProps) {
  const gateTitle =
    title ||
    (gate === 'V-002'
      ? 'BOM & Component Ratios Gate Blocked (V-002)'
      : gate === 'V-003'
      ? 'Assembly Route Stage Gate Blocked (V-003)'
      : gate === 'V-009'
      ? 'Assembly QC Criteria Gate Blocked (V-009)'
      : 'Quantity Conservation Violation');

  return (
    <Card className={`rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 p-6 shadow-sm ${className || ''}`}>
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20 shrink-0">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-3 flex-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                GATE {gate}
              </span>
              <h3 className="text-base font-bold text-foreground">{gateTitle}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {message}
            </p>
          </div>

          {missingDetails && missingDetails.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-background/80 p-3.5 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Missing Required Prerequisites:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {missingDetails.map((detail, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40">
                    <span className="text-muted-foreground">{detail.label}:</span>
                    <span className="font-mono font-semibold text-foreground">{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {onResolutionClick ? (
              <Button size="sm" onClick={onResolutionClick} className="gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{resolutionLabel}</span>
              </Button>
            ) : resolutionHref ? (
              <Link href={resolutionHref}>
                <Button size="sm" className="gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{resolutionLabel}</span>
                </Button>
              </Link>
            ) : null}
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 font-semibold">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-check Gate</span>
              </Button>
            )}

            <Link href="/production/assembly">
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Assembly Queue</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
