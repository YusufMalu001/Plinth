'use client';

import React from 'react';
import { twMerge } from 'tailwind-merge';
import { statusTone, statusLabel } from './statusTones';

/**
 * StatusPill — the ONE status presentation component (PLINTH_REFACTOR.md Phase 5).
 * Soft tint background, coloured text, 12px medium, padding 2px 8px, fully
 * rounded. No borders, no icons. All statuses resolve through statusTones.ts.
 */
export interface StatusPillProps {
  status?: string | null;
  /** Optional label override (defaults to a readable rendering of the raw status). */
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  const classes = twMerge(
    'inline-flex items-center justify-center whitespace-nowrap rounded-pill px-2 py-[2px] text-xs font-medium',
    className
  );
  return (
    <span
      className={classes}
      style={{ backgroundColor: `var(--tone-${statusTone(status)}-bg)`, color: `var(--tone-${statusTone(status)}-text)` }}
      data-status={status ?? undefined}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}
