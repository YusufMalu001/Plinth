'use client';

import React from 'react';
import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Zap,
} from 'lucide-react';
import { EmptyState } from '@plinth/ui';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { intelligenceApi } from '../api';
import { useIntelligenceMutation, useRun, useRuns } from '../hooks';
import type { IntelligenceModule } from '../types';
import { dateTime, money } from './format';
import { showToast } from '../../../components/toast-store';

const runnableModules: IntelligenceModule[] = ['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT'];

function RunTrace({ id }: { id: string }) {
  const query = useRun(id);
  if (query.isLoading) return <p className="text-xs text-ink-muted">Loading trace…</p>;
  if (query.error || !query.data) return <p className="text-xs text-muted-foreground">Trace unavailable.</p>;
  const run = query.data;
  return <div className="rounded-lg border border-border p-3 text-xs space-y-2">
    <p>Request ID: <code>{run.correlationId ?? 'NOT VERIFIED'}</code> · Run ID: <code>{run.id}</code></p>
    <p>Stages: {run.toolAudit?.map((stage) => `${stage.stage.replaceAll('HERMES', 'ADVISOR')}${stage.reason ? `: ${stage.reason}` : ''}`).join(' → ') || 'NOT VERIFIED'}</p>
    {(run.providerAttempts ?? []).map((attempt) => <div key={attempt.id} className="border-t border-border pt-2">
      <p>{attempt.operation.replaceAll('HERMES', 'ADVISOR')} · {attempt.status} · {attempt.errorCategory ?? 'No error recorded'}</p>
      <p>Requested: {attempt.requestedModel ?? 'NOT VERIFIED'} · Runtime reported: {attempt.resolvedModel ?? 'NOT VERIFIED'} · Provider: {attempt.provider ?? 'NOT VERIFIED'}</p>
      <p>HTTP: {attempt.httpStatus ?? 'NOT VERIFIED'} · Generation: {attempt.generationId ?? 'NOT VERIFIED'} · Provider request: {attempt.providerRequestId ?? 'NOT VERIFIED'}</p>
      <p>Tokens: {attempt.inputTokens ?? 'NOT VERIFIED'} / {attempt.outputTokens ?? 'NOT VERIFIED'} / {attempt.totalTokens ?? 'NOT VERIFIED'} · Latency: {attempt.latencyMs ?? 'NOT VERIFIED'} ms</p>
      <p>Budget charge estimate: {attempt.costUsd === null || attempt.costUsd === undefined ? 'NOT VERIFIED' : money(attempt.costUsd, 'USD')}</p>
    </div>)}
    {!run.providerAttempts?.length && <p>Plinth Advisor → AI Provider metadata: NOT VERIFIED</p>}
  </div>;
}

function RunNowPanel() {
  const [module, setModule] = useState<IntelligenceModule>('EXECUTIVE');
  const run = useIntelligenceMutation<IntelligenceModule>(intelligenceApi.runModule);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="manual-intelligence-module" className="sr-only">Module to analyze</label>
      <select id="manual-intelligence-module" value={module} onChange={(event) => setModule(event.target.value as IntelligenceModule)} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary">
        {runnableModules.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" disabled={run.isPending} onClick={() => run.mutate(module, { onSuccess: () => showToast({ kind: 'success', title: 'Advisor analysis queued', message: `${module} results will appear after the worker finishes.` }) })} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
        {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Run recommendation analysis
      </button>
    </div>
  );
}

export function RunHistoryView() {
  const query = useRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  if (query.isLoading) return <LoadingState message="Loading intelligence audit trail..." />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const items = query.data?.items ?? [];
  if (!items.length) {
    return (
      <div className="space-y-5">
        <RunNowPanel />
        <EmptyState
          title="No analysis runs recorded yet"
          description="Queue a module analysis above or create supported ERP activity. Results appear after the worker finishes."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Overview Card */}
      <div className="rounded-2xl border border-border/90 bg-surface p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">
            Intelligence Audit & Observability Ledger
          </h3>
          <p className="text-xs text-ink-muted">
            Immutable log of all advisor runs, model routing, token economics, and policy validation results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunNowPanel />
          <span className="rounded-xl border border-border bg-muted px-3 py-1 text-xs font-bold text-ink-secondary">
            {items.length} Evaluated Runs
          </span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl border border-border/90 bg-surface shadow-xs overflow-hidden">
        <div className="divide-y divide-border">
          {items.map((run) => {
            const isSuccess = run.status === 'COMPLETED';
            const isFailed = run.status === 'FAILED' || run.status === 'REJECTED';

            return (
              <div
                key={run.id}
                className="p-5 space-y-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-ink">
                        {run.module} Advisor
                      </span>

                      <span className="inline-flex items-center rounded-lg border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
                        {run.trigger} Trigger
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${
                          isSuccess
                            ? 'border-tone-green-solid/25 bg-tone-green-bg text-tone-green-text'
                            : isFailed
                            ? 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text'
                            : 'border-tone-blue-solid/25 bg-tone-blue-bg text-link'
                        }`}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : isFailed ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        <span>{run.status}</span>
                      </span>
                    </div>

                    <p className="font-mono text-[11px] text-ink-placeholder">
                      Run UUID: {run.id}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted shrink-0">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-bold uppercase text-ink-placeholder">Model Route</p>
                      <p className="font-semibold text-ink">
                        {run.modelProvider ?? 'NOT VERIFIED'} / {run.modelId ?? 'NOT VERIFIED'}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-bold uppercase text-ink-placeholder">Inference Cost</p>
                      <p className="font-semibold text-ink font-mono">
                        {money(run.costUsd ?? 0, 'USD')}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-bold uppercase text-ink-placeholder">Timestamp</p>
                      <p className="font-medium text-ink-secondary">
                        {dateTime(run.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {run.errorCode && (
                  <div className="rounded-xl bg-tone-red-bg border border-tone-red-solid/25 p-3 text-xs text-tone-red-text">
                    <strong>Safe Failure Code:</strong> {run.errorCode}
                  </div>
                )}
                <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}>
                  {selectedRunId === run.id ? 'Hide trace' : 'Show trace'}
                </button>
                {selectedRunId === run.id && <RunTrace id={run.id} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
