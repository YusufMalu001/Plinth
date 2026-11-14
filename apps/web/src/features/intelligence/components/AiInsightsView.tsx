'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw, Sparkles } from 'lucide-react';
import { intelligenceApi } from '../api';
import { intelligenceKeys, useDailyInsight, useDailyInsightHistory } from '../hooks';
import type { DailyInsightBriefing, DailyInsightPriority, DailyInsightRun, Evidence } from '../types';
import { dateTime } from './format';
import { showToast } from '../../../components/toast-store';

type BriefItem = {
  id: string;
  kind: 'UPDATE' | 'RISK' | 'FOCUS';
  title: string;
  detail: string;
  rationale: string;
  priority?: DailyInsightPriority;
  evidenceMetricKeys: string[];
};

const priorityClass: Record<DailyInsightPriority, string> = {
  CRITICAL: 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text',
  HIGH: 'border-tone-orange-solid/25 bg-tone-orange-bg text-tone-orange-text',
  MEDIUM: 'border-tone-amber-solid/25 bg-tone-amber-bg text-tone-amber-text',
  LOW: 'border-border bg-muted text-ink-secondary',
};

const statusMeta: Record<DailyInsightBriefing['overallStatus'], { label: string; className: string }> = {
  GREEN: { label: 'Stable on available evidence', className: 'border-tone-green-solid/25 bg-tone-green-bg text-tone-green-text' },
  AMBER: { label: 'Attention recommended', className: 'border-tone-amber-solid/25 bg-tone-amber-bg text-tone-amber-text' },
  RED: { label: 'Critical issue identified', className: 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text' },
  INSUFFICIENT_EVIDENCE: { label: 'Insufficient evidence', className: 'border-border bg-muted text-ink-secondary' },
};

function formatEvidenceValue(evidence: Evidence) {
  if (evidence.currency) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: evidence.currency, maximumFractionDigits: 2 }).format(evidence.value);
    } catch { /* fall through to the source unit */ }
  }
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(evidence.value)} ${evidence.unit}`;
}

function briefingItems(briefing: DailyInsightBriefing): BriefItem[] {
  return [
    ...briefing.keyUpdates.map((item, index): BriefItem => ({ id: `update-${index}`, kind: 'UPDATE', title: item.title, detail: item.detail, rationale: item.whyItMatters, priority: item.priority, evidenceMetricKeys: item.evidenceMetricKeys })),
    ...briefing.risks.map((item, index): BriefItem => ({ id: `risk-${index}`, kind: 'RISK', title: item.title, detail: item.detail, rationale: 'Risk identified in the certified daily snapshot.', priority: 'HIGH', evidenceMetricKeys: item.evidenceMetricKeys })),
    ...briefing.recommendedFocus.map((item, index): BriefItem => ({ id: `focus-${index}`, kind: 'FOCUS', title: item.action, detail: item.rationale, rationale: 'Suggested review focus. This does not indicate that an ERP action has been taken.', evidenceMetricKeys: item.evidenceMetricKeys })),
  ];
}

function briefAvailability(run: DailyInsightRun) {
  if (run.status === 'QUEUED' || run.status === 'RUNNING') return 'Preparing';
  if (run.status === 'COMPLETED') {
    const briefing = run.structuredOutput?.dailyBriefing;
    if (!briefing) return 'Incomplete';
    if (briefing.overallStatus === 'INSUFFICIENT_EVIDENCE') return 'Source unavailable';
    return briefing.dataCaveats.length || run.structuredOutput?.limitations.length ? 'Partial' : 'Ready';
  }
  if (run.errorCode === 'PROVIDER_DISABLED' || ['PROVIDER_BUDGET_EXCEEDED', 'RATE_LIMIT', 'MODEL_UNAVAILABLE', 'RUNTIME_UNAVAILABLE', 'TIMEOUT'].includes(run.errorCode ?? '')) return 'Provider unavailable';
  return 'Failed';
}

export function AiInsightsView() {
  const client = useQueryClient();
  const query = useDailyInsight();
  const [historyPage, setHistoryPage] = useState(1);
  const history = useDailyInsightHistory(historyPage);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const notifiedRunState = useRef('');
  const generate = useMutation({
    mutationFn: (refresh: boolean) => intelligenceApi.generateDailyInsight(refresh),
    onSuccess: (result) => {
      setSelectedRunId('');
      client.setQueryData(intelligenceKeys.dailyInsight, result);
      void client.invalidateQueries({ queryKey: ['intelligence', 'daily-insight-history'] });
      showToast({ kind: 'success', title: 'Daily brief requested', message: 'The brief will appear here when Advisor processing finishes.' });
    },
  });

  const todayRun = query.data?.run;
  const run = history.data?.items.find((item) => item.id === selectedRunId) ?? todayRun;
  const briefing = run?.structuredOutput?.dailyBriefing;
  const items = useMemo(() => briefing ? briefingItems(briefing) : [], [briefing]);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const evidence = run?.structuredOutput?.evidence ?? [];
  const isWorking = ['QUEUED', 'RUNNING'].includes(todayRun?.status ?? '');
  const status = briefing ? statusMeta[briefing.overallStatus] : null;
  const canRefresh = Boolean(todayRun && ['COMPLETED', 'FAILED', 'REJECTED'].includes(todayRun.status));

  useEffect(() => {
    if (!todayRun || !['FAILED', 'REJECTED'].includes(todayRun.status)) return;
    const key = `${todayRun.id}:${todayRun.status}`;
    if (notifiedRunState.current === key) return;
    notifiedRunState.current = key;
    showToast({ kind: 'error', title: 'Daily brief did not complete', message: todayRun.errorMessage || 'Review Advisor history for details, then retry.', action: { label: 'View Advisor history', href: '/intelligence/history' } });
  }, [todayRun]);

  useEffect(() => {
    if (!todayRun || todayRun.status !== 'COMPLETED' || todayRun.structuredOutput?.dailyBriefing) return;
    const key = `${todayRun.id}:INCOMPLETE`;
    if (notifiedRunState.current === key) return;
    notifiedRunState.current = key;
    showToast({ kind: 'warning', title: 'Daily brief is incomplete', message: 'The run returned no valid structured brief. Refresh to request a new validated result.' });
  }, [todayRun]);

  if (query.isLoading) return <div className="rounded-xl border border-border bg-surface p-8 text-sm text-ink-muted">Loading today&apos;s saved AI brief…</div>;
  if (query.isError) return <div className="rounded-xl border border-border bg-surface p-5 text-sm text-ink-secondary">Daily brief is temporarily unavailable. <button onClick={() => void query.refetch()} className="ml-2 font-semibold text-primary underline">Retry</button></div>;

  return (
    <div className="space-y-5 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-link" /> Daily executive brief</div>
          <p className="mt-1 text-xs text-ink-muted">Business date {query.data?.businessDate} · Generated from a certified one-day ERP snapshot.</p>
          <p className="mt-1 text-xs text-ink-muted">{query.data?.automaticScheduleEnabled ? 'Automatic brief scheduled for 08:00 IST; you can refresh it during the day.' : 'Automatic briefs are paused in Intelligence controls. You can generate one on demand.'}</p>
        </div>
        <button
          type="button"
          onClick={() => generate.mutate(Boolean(canRefresh))}
          disabled={generate.isPending || isWorking}
          className="inline-flex items-center gap-2 rounded-lg bg-action px-3.5 py-2 text-xs font-semibold text-inverse hover:bg-[color:var(--action-primary-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generate.isPending || isWorking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          {isWorking ? 'Preparing brief…' : canRefresh ? 'Refresh today’s brief' : 'Generate today’s brief'}
        </button>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold text-ink">Saved daily briefs</h2><p className="mt-0.5 text-xs text-ink-muted">Select a brief to review its saved evidence and insights.</p></div>
          {selectedRunId && <button type="button" onClick={() => { setSelectedRunId(''); setSelectedId(''); }} className="text-xs font-semibold text-link hover:underline">View today</button>}
        </div>
        {history.data?.items.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wide text-ink-muted"><tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Brief</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Generated</th></tr></thead><tbody className="divide-y divide-border">{history.data.items.map((item) => <tr key={item.id} className={run?.id === item.id ? 'bg-tone-blue-bg' : 'hover:bg-muted'}><td className="px-2 py-2.5 font-medium text-ink-secondary">{item.businessDate ?? '—'}</td><td className="px-2 py-2.5"><button type="button" onClick={() => { setSelectedRunId(item.id); setSelectedId(''); }} className="max-w-[360px] truncate text-left font-semibold text-link hover:underline">{item.structuredOutput?.dailyBriefing?.headline ?? 'Daily brief'}</button></td><td className="px-2 py-2.5 text-ink-secondary">{briefAvailability(item)}</td><td className="px-2 py-2.5 whitespace-nowrap text-ink-muted">{dateTime(item.createdAt)}</td></tr>)}</tbody></table></div> : !history.isError && <p className="mt-3 text-xs text-ink-muted">No saved daily briefs yet.</p>}
        {(history.data?.totalPages ?? 0) > 1 && <div className="mt-3 flex items-center justify-end gap-3 text-xs text-ink-muted"><button type="button" disabled={historyPage <= 1} onClick={() => { setHistoryPage((page) => page - 1); setSelectedRunId(''); }} className="font-semibold text-link disabled:opacity-40">Previous</button><span>Page {historyPage} of {history.data?.totalPages}</span><button type="button" disabled={historyPage >= (history.data?.totalPages ?? 1)} onClick={() => { setHistoryPage((page) => page + 1); setSelectedRunId(''); }} className="font-semibold text-link disabled:opacity-40">Next</button></div>}
      </section>

      {!run && <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center"><Sparkles className="mx-auto h-7 w-7 text-ink-placeholder" /><h2 className="mt-3 font-semibold text-ink">No brief has been generated today</h2><p className="mt-1 text-sm text-ink-muted">Generate a one-day, evidence-backed summary when you are ready. This makes an AI request and saves its run for today.</p></div>}

      {run && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5 font-semibold"><Clock3 className="h-3.5 w-3.5" /> {briefAvailability(run)}</span>
        <span>Business date {run.businessDate ?? query.data?.businessDate}</span>
        <span>{run.source === 'SCHEDULE' ? 'Scheduled brief' : 'Requested brief'}</span>
        <span>Requested {dateTime(run.createdAt)}</span>
        {run.completedAt && <span>Completed {dateTime(run.completedAt)}</span>}
        {run.snapshotId && <span className="font-mono">Snapshot {run.snapshotId.slice(0, 8)}</span>}
        {run.errorCode && <span className="text-tone-red-text">{run.errorCode}</span>}
      </div>}

      {['QUEUED', 'RUNNING'].includes(run?.status ?? '') && <p className="text-xs text-ink-muted"><RefreshCw className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Advisor is preparing this brief. This view refreshes while the run is active.</p>}

      {briefing && <>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <section className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold leading-snug text-ink">{briefing.headline}</h2>
                {status && <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>}
              </div>
              <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-muted">Executive summary</h3>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{briefing.executiveSummary}</p>
              {selected && <div className="mt-5 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-ink-secondary">{selected.kind === 'UPDATE' ? 'KEY UPDATE' : selected.kind === 'RISK' ? 'RISK' : 'TODAY’S FOCUS'}</span>
                  {selected.priority && <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${priorityClass[selected.priority]}`}>{selected.priority}</span>}
                </div>
                <h3 className="mt-3 text-base font-semibold text-ink">{selected.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{selected.detail}</p>
                <div className="mt-3 rounded-lg bg-muted p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Why this matters</p><p className="mt-1 text-sm leading-5 text-ink-secondary">{selected.rationale}</p></div>
                <div className="mt-3 flex flex-wrap gap-2">{selected.evidenceMetricKeys.map((key) => <a key={key} href={`#metric-${encodeURIComponent(key)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-link hover:bg-muted">{key}<ArrowRight className="h-3 w-3" /></a>)}{!selected.evidenceMetricKeys.length && <span className="text-xs text-ink-muted">No metric citation was attached to this item.</span>}</div>
              </div>}
            </div>

            <section className="rounded-xl border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-link" /> Recommended focus for today</h3>
              {briefing.recommendedFocus.length ? <ol className="mt-3 space-y-3">{briefing.recommendedFocus.map((item, index) => <li key={`${item.action}-${index}`} className="rounded-lg border border-border p-3"><p className="text-sm font-semibold text-ink">{index + 1}. {item.action}</p><p className="mt-1 text-xs leading-5 text-ink-secondary">{item.rationale}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.evidenceMetricKeys.map((key) => <a key={key} href={`#metric-${encodeURIComponent(key)}`} className="text-[10px] text-link hover:underline">{key}</a>)}</div></li>)}</ol> : <p className="mt-3 text-sm text-ink-muted">No specific focus was supported by today&apos;s evidence.</p>}
            </section>

            <section className="rounded-xl border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 font-semibold text-ink"><AlertTriangle className="h-4 w-4 text-tone-amber-text" /> Risks to watch</h3>
              {briefing.risks.length ? <ul className="mt-3 space-y-3">{briefing.risks.map((item, index) => <li key={`${item.title}-${index}`} className="rounded-lg border border-border p-3"><p className="text-sm font-semibold text-ink">{item.title}</p><p className="mt-1 text-xs leading-5 text-ink-secondary">{item.detail}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.evidenceMetricKeys.map((key) => <a key={key} href={`#metric-${encodeURIComponent(key)}`} className="text-[10px] text-link hover:underline">{key}</a>)}</div></li>)}</ul> : <p className="mt-3 text-sm text-ink-muted">No material risks were identified in the available evidence.</p>}
            </section>
          </section>

          <aside className="space-y-4 lg:col-span-5">
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border p-4"><h3 className="text-sm font-semibold text-ink">Today&apos;s insight feed</h3><p className="mt-1 text-xs text-ink-muted">Select an item to review its explanation and certified metric references.</p></div>
              {items.length ? <div className="max-h-[560px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-muted text-[10px] uppercase text-ink-muted"><tr><th className="px-3 py-2.5">Insight</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Priority</th></tr></thead><tbody className="divide-y divide-border">{items.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer ${selected?.id === item.id ? 'bg-tone-blue-bg' : 'hover:bg-muted'}`}><td className="px-3 py-3"><p className="font-semibold text-ink">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-ink-muted">{item.detail}</p></td><td className="whitespace-nowrap px-3 py-3 text-ink-secondary">{item.kind === 'UPDATE' ? 'Update' : item.kind === 'RISK' ? 'Risk' : 'Focus'}</td><td className="px-3 py-3">{item.priority ? <span className={`rounded-md border px-1.5 py-1 text-[9px] font-bold ${priorityClass[item.priority]}`}>{item.priority}</span> : <span className="text-ink-placeholder">—</span>}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-ink-muted">No updates, risks, or focus items were returned by this brief.</p>}
            </div>

            <div id="certified-evidence" className="rounded-xl border border-border bg-surface p-4"><h3 className="text-sm font-semibold text-ink">Certified evidence cited</h3><p className="mt-1 text-xs text-ink-muted">Values below come from the immutable snapshot used for this run.</p>
              {evidence.length ? <div className="mt-3 max-h-72 space-y-2 overflow-auto">{evidence.map((item) => <div id={`metric-${encodeURIComponent(item.metricKey)}`} key={item.metricKey} className="scroll-mt-24 rounded-lg border border-border p-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="break-all text-[11px] font-medium text-ink-secondary">{item.metricKey}</span><strong className="text-xs text-ink">{formatEvidenceValue(item)}</strong></div><p className="mt-1 text-[10px] text-ink-muted">Source: {item.sourceResource} · Period: {dateTime(item.periodStart)} – {dateTime(item.periodEnd)}</p></div>)}</div> : <p className="mt-3 text-sm text-ink-muted">No certified evidence was available.</p>}
            </div>

            {(briefing.dataCaveats.length > 0 || (run.structuredOutput?.limitations.length ?? 0) > 0) && <details className="rounded-xl border border-border bg-muted/30 p-4"><summary className="cursor-pointer text-sm font-semibold text-foreground">Data limitations ({briefing.dataCaveats.length + (run.structuredOutput?.limitations.length ?? 0)})</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{[...briefing.dataCaveats, ...(run.structuredOutput?.limitations ?? [])].map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></details>}
          </aside>
        </div>
      </>}
    </div>
  );
}
