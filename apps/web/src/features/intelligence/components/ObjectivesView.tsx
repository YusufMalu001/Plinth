'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Lock,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { intelligenceApi } from '../api';
import { dateTime, percent } from './format';

type Policy = {
  version: string;
  effectiveFrom: string;
  weights: Record<string, number>;
  guardrails: Record<string, unknown>;
};

export function ObjectivesView() {
  const query = useQuery({ queryKey: ['intelligence', 'objectives'], queryFn: intelligenceApi.objectives });

  if (query.isLoading) return <LoadingState message="Loading policy objectives..." />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const policy = query.data?.active as Policy | null;
  if (!policy) {
    return (
      <ErrorState
        title="No active business objective policy found"
        description="Activate an approved effective-dated policy before recommendation processing."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-2xl border border-border/90 bg-surface p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink">
              Active Strategy & Objective Policy
            </h3>
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-ink-secondary">
              v{policy.version}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Effective From: {dateTime(policy.effectiveFrom)} · Deterministic policy scoring applied before recommendation persistence
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-tone-green-solid/25 bg-tone-green-bg px-3 py-1 text-xs font-bold text-tone-green-text">
          <ShieldCheck className="h-3.5 w-3.5" />
          Enforced by Control Plane
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Objective Weights Distribution */}
        <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
            <Scale className="h-4 w-4 text-link" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-ink">
                Profitable Growth Priority Weights
              </h4>
              <p className="text-[11px] text-ink-muted">
                Strategic weightings assigned to operational trade-offs
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(policy.weights).map(([key, value]) => {
              const valNum = Number(value) || 0;
              const formattedName = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (str) => str.toUpperCase());

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">
                      {formattedName}
                    </span>
                    <span className="font-mono font-bold text-link">
                      {percent(valNum)}
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-brand transition-all"
                      style={{ width: `${Math.min(valNum * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hard Guardrails Matrix */}
        <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
            <Lock className="h-4 w-4 text-tone-amber-text" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-ink">
                Hard Boundary Guardrails
              </h4>
              <p className="text-[11px] text-ink-muted">
                Non-negotiable constraints that override advisor recommendations
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {Object.entries(policy.guardrails).map(([key, value]) => {
              const formattedName = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (str) => str.toUpperCase());

              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/60 p-3 text-xs"
                >
                  <span className="font-medium text-ink-secondary">
                    {formattedName}
                  </span>
                  <span className="font-mono font-bold text-ink text-right">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
