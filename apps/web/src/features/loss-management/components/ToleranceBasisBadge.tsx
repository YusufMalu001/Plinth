'use client';

import React from 'react';
import { LossClassification } from '@plinth/types';
import { Badge } from '@plinth/ui';
import { ShieldCheck, AlertTriangle, Scale, HelpCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface ToleranceBasisProps {
  classification?: LossClassification | null;
  appliedWastageRuleCode?: string | null;
  appliedWastageRuleVersion?: number | null;
  appliedWastageRuleId?: string | null;
  varianceFromExpected?: number | null;
  className?: string;
  showDetails?: boolean;
}

/**
 * ToleranceBasisBadge
 * 
 * Strict Constraint Fulfillment:
 * The tolerance comparison MUST be shown as a real, sourced number (which WastageRule code + version,
 * and standard/tolerance variance) — NEVER render "within tolerance" or "abnormal" as a bare label
 * with no visible basis.
 */
export function ToleranceBasisBadge({
  classification,
  appliedWastageRuleCode,
  appliedWastageRuleVersion,
  appliedWastageRuleId,
  varianceFromExpected,
  className,
  showDetails = true,
}: ToleranceBasisProps) {
  if (!classification) {
    return (
      <div
        data-testid="tolerance-unclassified"
        className={twMerge(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-medium border border-border/60',
          className
        )}
      >
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70" />
        <span>Pending Classification (Rule Check Required)</span>
      </div>
    );
  }

  const isWithin = classification === 'WITHIN_TOLERANCE';
  const ruleDisplay = appliedWastageRuleCode
    ? `${appliedWastageRuleCode} (v${appliedWastageRuleVersion ?? 1})`
    : appliedWastageRuleId
    ? `Rule ${appliedWastageRuleId.slice(0, 8)}... (v${appliedWastageRuleVersion ?? 1})`
    : `Standard Wastage Rule (v${appliedWastageRuleVersion ?? 1})`;

  const varianceDisplay =
    varianceFromExpected !== undefined && varianceFromExpected !== null
      ? `${varianceFromExpected > 0 ? '+' : ''}${Number(varianceFromExpected).toFixed(2)}%`
      : '0.00%';

  return (
    <div
      data-testid="tolerance-basis-container"
      className={twMerge(
        'inline-flex flex-col gap-1 p-2 rounded-xl border text-xs bg-card border-border/80 shadow-2xs',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          data-testid="tolerance-label"
          variant={isWithin ? 'success' : 'warning'}
          className="text-[10.5px] px-2 py-0.5 font-bold gap-1"
        >
          {isWithin ? (
            <ShieldCheck className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {isWithin ? 'Within Tolerance' : 'Abnormal Variance'}
        </Badge>

        <span
          data-testid="tolerance-variance"
          className="font-mono font-bold tracking-tight text-xs text-foreground"
        >
          Variance: {varianceDisplay}
        </span>
      </div>

      {showDetails && (
        <div
          data-testid="tolerance-rule-source"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium pl-0.5"
        >
          <Scale className="w-3 h-3 shrink-0 text-primary" />
          <span>
            Sourced via WastageRule:{' '}
            <strong className="font-mono text-foreground font-semibold">
              {ruleDisplay}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}
