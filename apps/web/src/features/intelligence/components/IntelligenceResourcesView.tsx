'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Factory,
  FileWarning,
  GitCompareArrows,
  Layers,
  LayoutGrid,
  Loader2,
  Package,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Table as Table2,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
} from 'lucide-react';
import { EmptyState } from '@plinth/ui';
import { intelligenceApi } from '../api';
import type { IntelligenceModule } from '../types';
import { money } from './format';
import { showToast } from '../../../components/toast-store';

/* =========================================================================
   1. CASE INVESTIGATIONS VIEW
   ========================================================================= */

const severityStyles: Record<string, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  CRITICAL: { bg: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: ShieldAlert },
  HIGH: { bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: AlertTriangle },
  MEDIUM: { bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', icon: Sparkles },
  LOW: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', icon: Bot },
};

export function IntelligenceCasesView() {
  const client = useQueryClient();
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  const query = useQuery({ queryKey: ['intelligence', 'cases'], queryFn: () => intelligenceApi.cases(1, 100), refetchInterval: 30_000 });
  const scenario = useMutation({
    mutationFn: (caseId: string) => intelligenceApi.createScenario(caseId, `scenario:${caseId}:${crypto.randomUUID()}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['intelligence', 'scenarios'] });
      showToast({ kind: 'success', title: 'Scenario simulation generated from case evidence' });
    },
    onError: (err) => {
      showToast({ kind: 'error', title: 'Failed to create scenario range', message: err instanceof Error ? err.message : 'Please check permissions.' });
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#004a80] dark:text-blue-400" />
          Scanning ERP anomaly cases…
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <span>Case data is temporarily unavailable. See the alert toast for details.</span>
        <button type="button" onClick={() => void query.refetch()} className="shrink-0 font-semibold text-primary underline">Retry</button>
      </div>
    );
  }

  const items = query.data?.items ?? [];

  if (!items.length) {
    return (
      <EmptyState
        className="min-h-[260px] rounded-3xl border border-slate-200/90 bg-white p-12 dark:border-slate-800 dark:bg-slate-900"
        title="Zero Active Anomaly Cases"
        description="No case records were returned by the Intelligence case service."
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-4 font-manrope">
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <div>
          Active Case Files: <strong className="text-slate-900 dark:text-slate-100">{items.length}</strong>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            title="Table View"
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
              viewMode === 'table'
                ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            title="Cards View"
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
              viewMode === 'cards'
                ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>

      {/* VIEW: Table */}
      {viewMode === 'table' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Domain</th>
                  <th className="py-3 px-4">Anomaly / Situation</th>
                  <th className="py-3 px-4">Detected</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedItems.map((item: any) => {
                  const sev = severityStyles[item.severity] || severityStyles.MEDIUM;
                  const SevIcon = sev.icon;

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${sev.bg} ${sev.text} ${sev.border}`}>
                          <SevIcon className="h-3 w-3" />
                          <span>{item.severity}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">
                        {item.module}
                      </td>
                      <td className="py-3.5 px-4 min-w-[280px]">
                        <p className="font-bold text-slate-900 dark:text-white">
                          <Link href={`/intelligence/cases/${item.id}`} className="hover:text-[#004a80] hover:underline">{item.detectorKey.replaceAll('_', ' ')}</Link>
                        </p>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {item.evidence?.situation ?? 'No situation summary was recorded.'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                        {new Date(item.lastDetectedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => scenario.mutate(item.id)}
                          disabled={scenario.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#004a80] px-3 py-1 text-xs font-bold text-white hover:bg-[#003860] active:scale-98 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          {scenario.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompareArrows className="h-3 w-3" />}
                          <span>Simulate</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Cards */}
      {viewMode === 'cards' && (
        <div className="grid gap-4">
          {paginatedItems.map((item: any) => {
            const sev = severityStyles[item.severity] || severityStyles.MEDIUM;
            const SevIcon = sev.icon;

            return (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-[#004a80]/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${sev.bg} ${sev.text} ${sev.border}`}>
                        <SevIcon className="h-3 w-3" />
                        <span>{item.severity} SEVERITY</span>
                      </span>

                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {item.module}
                      </span>

                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Status: {item.status}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      <Link href={`/intelligence/cases/${item.id}`} className="hover:text-[#004a80] hover:underline">{item.detectorKey.replaceAll('_', ' ')}</Link>
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.evidence?.situation ?? 'No situation summary was recorded.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[11px] text-slate-400">
                      <span>Observed: <strong>{new Date(item.lastDetectedAt).toLocaleString()}</strong></span>
                      <span>Snapshot ID: <strong className="font-mono">{item.snapshotId ? String(item.snapshotId).slice(0, 8) : 'N/A'}</strong></span>
                      <span>Rule Ver: <strong className="font-mono">v{item.detectorVersion}</strong></span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0">
                    <button
                      onClick={() => scenario.mutate(item.id)}
                      disabled={scenario.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#003860] active:scale-95 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      {scenario.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
                      <span>Simulate Next Steps</span>
                    </button>

                    <span className="text-[10px] text-slate-400 text-right">
                      Zero Autonomous Mutation
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 text-xs">
          <span className="text-slate-500">
            Page <strong className="text-slate-900 dark:text-white">{currentPage}</strong> of{' '}
            <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   2. STRATEGIC SCENARIO SIMULATOR VIEW
   ========================================================================= */

function formatCaseVal(val: unknown) {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v}`)
      .join(' · ');
  }
  return String(val);
}

export function IntelligenceScenariosView() {
  const query = useQuery({ queryKey: ['intelligence', 'scenarios'], queryFn: () => intelligenceApi.scenarios() });

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#004a80] dark:text-blue-400" />
          Loading simulation ranges…
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <span>Scenario data is temporarily unavailable. See the alert toast for details.</span>
        <button type="button" onClick={() => void query.refetch()} className="shrink-0 font-semibold text-primary underline">Retry</button>
      </div>
    );
  }

  const items = query.data?.items ?? [];

  if (!items.length) {
    return (
      <div className="space-y-6">
        <EmptyState
          className="min-h-[260px] rounded-3xl border border-slate-200/90 bg-white p-12 dark:border-slate-800 dark:bg-slate-900"
          title="No Scenarios Recorded"
          description="Generate simulation ranges from active case investigations or consult the AI Advisor to project what-if outcomes."
        />
        <div className="text-center">
          <Link
            href="/intelligence/cases"
            className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#003860]"
          >
            <FileWarning className="h-4 w-4" />
            <span>Go to Case Investigations</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <span>
          Recorded Scenario Projections: <strong className="text-slate-900 dark:text-slate-100">{items.length}</strong>
        </span>
        <span className="text-[11px]">Ranges represent opportunity boundaries, not guaranteed profit</span>
      </div>

      <div className="grid gap-6">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-[#004a80] dark:bg-blue-950/80 dark:text-blue-300">
                  <GitCompareArrows className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    {item.scenarioType ? item.scenarioType.replaceAll('_', ' ') : 'STRATEGIC STRESS TEST'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Provenance: <strong className="text-slate-600 dark:text-slate-300">{item.provenance}</strong>
                  </p>
                </div>
              </div>

              {item.missingInputs?.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  Missing Variables: {item.missingInputs.join(', ')}
                </span>
              )}
            </div>

            {/* 3 Pillar Range Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Low / Conservative Case */}
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Conservative (Low Case)
                </span>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">
                  {formatCaseVal(item.lowCase)}
                </p>
              </div>

              {/* Base / Expected Case */}
              <div className="rounded-2xl border border-blue-200/90 bg-blue-50/40 p-4 dark:border-blue-950 dark:bg-blue-950/30 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#004a80] dark:text-blue-400">
                  Expected (Base Case)
                </span>
                <p className="text-sm font-black text-[#004a80] dark:text-blue-300 leading-snug">
                  {formatCaseVal(item.baseCase)}
                </p>
              </div>

              {/* High / Optimistic Case */}
              <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-4 dark:border-emerald-950 dark:bg-emerald-950/30 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Optimistic (High Case)
                </span>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 leading-snug">
                  {formatCaseVal(item.highCase)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   3. ROI & VERIFIED OUTCOMES VIEW
   ========================================================================= */

const outcomeStatusStyles: Record<string, { label: string; bg: string; text: string }> = {
  VERIFIED: { label: 'Verified Realized', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-300' },
  UNKNOWN: { label: 'Pending Attribution', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/60 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-300' },
  FAILED: { label: 'Unrealized', bg: 'bg-rose-50 border-rose-200 dark:bg-rose-950/60 dark:border-rose-800', text: 'text-rose-800 dark:text-rose-300' },
};

export function IntelligenceOutcomesView() {
  const query = useQuery({ queryKey: ['intelligence', 'outcomes'], queryFn: () => intelligenceApi.outcomes() });

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#004a80] dark:text-blue-400" />
          Loading economic impact ledger…
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <span>Outcome data is temporarily unavailable. See the alert toast for details.</span>
        <button type="button" onClick={() => void query.refetch()} className="shrink-0 font-semibold text-primary underline">Retry</button>
      </div>
    );
  }

  const items = query.data?.items ?? [];

  if (!items.length) {
    return (
      <EmptyState
        className="min-h-[260px] rounded-3xl border border-slate-200/90 bg-white p-12 dark:border-slate-800 dark:bg-slate-900"
        title="No Outcomes Recorded Yet"
        description="Completed tasks undergo transactional reconciliation against ERP ledgers before economic value is certified."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <span>
          Attributed Outcomes: <strong className="text-slate-900 dark:text-slate-100">{items.length}</strong>
        </span>
        <span className="text-[11px]">Attribution requires verified post-execution invoice & inventory receipts</span>
      </div>

      <div className="grid gap-4">
        {items.map((item: any) => {
          const stat = outcomeStatusStyles[item.outcomeStatus] || outcomeStatusStyles.UNKNOWN;
          const varianceNum = Number(item.variance) || 0;
          const isFavorable = varianceNum >= 0;

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold ${stat.bg} ${stat.text}`}>
                      {stat.label}
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Attribution: {item.attributionMethod}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Quality: {item.quality}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    {item.recommendation?.title ?? item.metricKey}
                  </h3>

                  <p className="text-xs text-slate-400">
                    Observed on {new Date(item.observedAt).toLocaleString()} · Provenance: {item.provenance}
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Projected</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {item.expectedValue !== undefined ? money(item.expectedValue, item.currency) : 'UNKNOWN'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Realized</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {item.realizedValue !== undefined ? money(item.realizedValue, item.currency) : 'UNKNOWN'}
                    </p>
                  </div>

                  <div className="text-right pl-4 border-l border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Variance</p>
                    <div className="flex items-center gap-1">
                      {isFavorable ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                      <span className={`text-base font-black ${isFavorable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {item.variance !== undefined ? money(item.variance, item.currency) : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   4. ASK HERMES BUSINESS COPILOT VIEW
   ========================================================================= */

const copilotAdvisors = [
  { key: 'EXECUTIVE' as const, name: 'Executive Super Agent', role: 'Strategic Health & Enterprise Tradeoffs', icon: Layers, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/60' },
  { key: 'SALES' as const, name: 'Sales & Growth Advisor', role: 'Demand Forecasting & Margin Leakage', icon: TrendingUp, color: 'text-[#004a80] dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/60' },
  { key: 'INVENTORY' as const, name: 'Inventory & Stock Advisor', role: 'Depletion Risks & Reorder Signals', icon: Package, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/60' },
  { key: 'PROCUREMENT' as const, name: 'Procurement Advisor', role: 'Supplier Scorecards & Price Variance', icon: ShoppingCart, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/60' },
  { key: 'PRODUCTION' as const, name: 'Production Plant Advisor', role: 'Workstation Capacity & Assembly Lines', icon: Factory, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/60' },
  { key: 'FULFILLMENT' as const, name: 'Fulfillment & Logistics', role: 'Dispatch Vehicle Consolidation & SLAs', icon: Truck, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/60' },
];

const samplePrompts: Partial<Record<IntelligenceModule, string[]>> = {
  EXECUTIVE: [
    'What is our enterprise health score and highest margin risk?',
    'Summarize our working capital allocation across open POs and WIP.',
  ],
  SALES: [
    'Analyze contribution margin leakage across top 10 finished goods.',
    'Which dealer orders are currently queued under credit hold?',
  ],
  INVENTORY: [
    'Which raw materials are below safety buffer thresholds?',
    'Simulate inventory holding cost if we execute bulk purchasing.',
  ],
  PROCUREMENT: [
    'Show vendor on-time fulfillment rates for active purchase orders.',
    'Compare current purchase prices against historical GRN averages.',
  ],
  PRODUCTION: [
    'Identify workstation bottlenecks in Assembly Department Line 1.',
    'Check schedule attainment across active production work orders.',
  ],
  FULFILLMENT: [
    'Which pending dispatches can be consolidated into shared freight?',
    'Show on-time delivery rate (OTD) trend for the past 30 days.',
  ],
};

export function IntelligenceConversationsView() {
  const client = useQueryClient();
  const [selectedModule, setSelectedModule] = useState<IntelligenceModule>('EXECUTIVE');
  const [selectedId, setSelectedId] = useState('');
  const [content, setContent] = useState('');

  const list = useQuery({ queryKey: ['intelligence', 'conversations'], queryFn: () => intelligenceApi.conversations() });
  const detail = useQuery({
    queryKey: ['intelligence', 'conversation', selectedId],
    queryFn: () => intelligenceApi.conversation(selectedId),
    enabled: Boolean(selectedId),
    refetchInterval: 3000,
  });

  const create = useMutation({
    mutationFn: () => intelligenceApi.createConversation(selectedModule, `${selectedModule} Strategic Consultation`),
    onSuccess: async (row) => {
      setSelectedId(row.id);
      await client.invalidateQueries({ queryKey: ['intelligence', 'conversations'] });
      showToast({ kind: 'success', title: 'Consultation session established' });
    },
    onError: (err) => {
      showToast({ kind: 'error', title: 'Could not create conversation', message: err instanceof Error ? err.message : 'Please check permissions.' });
    },
  });

  const send = useMutation({
    mutationFn: () => intelligenceApi.sendConversationMessage(selectedId, content),
    onSuccess: async () => {
      setContent('');
      await client.invalidateQueries({ queryKey: ['intelligence', 'conversation', selectedId] });
    },
    onError: (err) => {
      showToast({ kind: 'error', title: 'Message delivery failed', message: err instanceof Error ? err.message : 'Please try again.' });
    },
  });

  const activeAdvisor = copilotAdvisors.find((a) => a.key === selectedModule) || copilotAdvisors[0];
  const ActiveIcon = activeAdvisor.icon;
  const conversationItems = list.data?.items ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-12 min-h-[720px]">
      {/* Left Column: Domain Advisors & Session History (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        {/* Domain Advisor Selector Card */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Select Domain Advisor
            </span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {copilotAdvisors.map((adv) => {
              const Icon = adv.icon;
              const isSelected = selectedModule === adv.key;
              return (
                <button
                  key={adv.key}
                  type="button"
                  onClick={() => setSelectedModule(adv.key)}
                  className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                    isSelected
                      ? 'border-[#004a80] bg-[#004a80]/10 text-[#004a80] shadow-xs dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                      : 'border-slate-200/80 bg-slate-50/60 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mb-1.5" />
                  <span className="text-xs font-bold leading-tight truncate w-full">{adv.name}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#004a80] to-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:brightness-110 active:scale-98 disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Start New Consultation</span>
          </button>
        </div>

        {/* Saved Session History List */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Consultation Sessions ({conversationItems.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-[320px] overflow-y-auto no-scrollbar">
            {conversationItems.map((item: any) => {
              const isSelected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#004a80] text-white shadow-xs dark:bg-blue-600 font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">
                      {item.title || `${item.module} Consultation`}
                    </p>
                    <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                      {item.module} · {new Date(item.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                </button>
              );
            })}
            {!conversationItems.length && (
              <p className="py-6 text-center text-xs text-slate-400">
                No past consultations yet. Click above to begin.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Interactive Copilot Chat Canvas (8 cols) */}
      <div className="lg:col-span-8 flex flex-col rounded-3xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Header Bar of Active Session */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${activeAdvisor.bg} ${activeAdvisor.color}`}>
              <ActiveIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {activeAdvisor.name}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {activeAdvisor.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              <ShieldCheck className="h-3 w-3" />
              Certified Read-Only Context
            </span>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[500px]">
          {!selectedId ? (
            <div className="py-12 text-center space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-[#004a80] dark:bg-blue-950/60 dark:text-blue-300">
                <Sparkles className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  Begin Consulting {activeAdvisor.name}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ask targeted business queries, demand forecasts, margin analysis, and inventory optimization recommendations.
                </p>
              </div>

              {/* Sample Prompts */}
              <div className="max-w-lg mx-auto space-y-2 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-left">
                  Suggested Prompts for {selectedModule}:
                </p>
                {samplePrompts[selectedModule]?.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setContent(prompt);
                      if (!selectedId) create.mutate();
                    }}
                    className="w-full p-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100 text-left text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800 transition-all flex items-center justify-between"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {(detail.data?.messages?.items ?? []).map((message: any) => {
                const isUser = message.role === 'user';
                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${
                        isUser
                          ? 'bg-[#004a80] text-white'
                          : 'bg-blue-100 text-[#004a80] dark:bg-blue-950 dark:text-blue-300'
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    <div
                      className={`max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#004a80] text-white rounded-tr-none'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span className={`text-[10px] font-bold ${isUser ? 'text-blue-200' : 'text-slate-400'}`}>
                          {isUser ? 'You' : `${activeAdvisor.name}`}
                        </span>
                        {message.runId && (
                          <span className="font-mono text-[9px] text-slate-400">
                            Run: {String(message.runId).slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                );
              })}

              {send.isPending && (
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-100 text-[#004a80] dark:bg-blue-950 dark:text-blue-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-3 text-xs">
                    The AI Advisor is evaluating current ERP evidence…
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-850/30">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (content.trim()) {
                if (!selectedId) {
                  create.mutate();
                } else {
                  send.mutate();
                }
              }
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Ask ${activeAdvisor.name} anything about ${selectedModule.toLowerCase()}…`}
              maxLength={4000}
              className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#004a80] focus:outline-none focus:ring-2 focus:ring-[#004a80]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={send.isPending || create.isPending || !content.trim()}
              className="h-11 inline-flex items-center gap-2 rounded-2xl bg-[#004a80] px-5 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#003860] active:scale-95 disabled:opacity-50"
            >
              <span>Send</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
