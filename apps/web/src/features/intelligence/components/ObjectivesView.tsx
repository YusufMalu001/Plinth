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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Active Strategy & Objective Policy
            </h3>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              v{policy.version}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Effective From: {dateTime(policy.effectiveFrom)} · Deterministic policy scoring applied before recommendation persistence
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Enforced by Control Plane
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Objective Weights Distribution */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <Scale className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                Profitable Growth Priority Weights
              </h4>
              <p className="text-[11px] text-slate-500">
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
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formattedName}
                    </span>
                    <span className="font-mono font-bold text-[#004a80] dark:text-blue-400">
                      {percent(valNum)}
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#004a80] dark:bg-blue-500 transition-all"
                      style={{ width: `${Math.min(valNum * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hard Guardrails Matrix */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                Hard Boundary Guardrails
              </h4>
              <p className="text-[11px] text-slate-500">
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
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {formattedName}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-right">
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
