'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { showToast } from '../../../components/toast-store';
import { intelligenceApi } from '../api';
import { useAssignees, useIntelligenceMutation, useRecommendation } from '../hooks';
import { dateTime, impactValue, money, percent } from './format';

function localDateInput(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function renderEvidenceList(evidence: unknown) {
  if (!evidence) return <p className="text-xs text-slate-400">No certified evidence records attached.</p>;
  if (Array.isArray(evidence)) {
    if (!evidence.length) return <p className="text-xs text-slate-400">No certified evidence records attached.</p>;
    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-50/40 dark:bg-slate-850/40">
        {evidence.map((item, idx) => {
          const metricKey = item.metricKey ?? `Evidence Record #${idx + 1}`;
          return (
            <div key={`${metricKey}-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#004a80] dark:text-blue-400 shrink-0" />
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{metricKey}</span>
                </div>
                {item.sourceResource && (
                  <p className="text-[11px] text-slate-500">
                    Source Resource: <strong className="text-slate-700 dark:text-slate-300">{item.sourceResource}</strong>{' '}
                    {item.metricVersion ? `· v${item.metricVersion}` : ''}
                  </p>
                )}
                {item.dataTimestamp && (
                  <p className="text-[10px] text-slate-400">
                    Captured from ERP snapshot: {dateTime(item.dataTimestamp)}
                  </p>
                )}
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {item.currency
                    ? money(item.value, item.currency)
                    : item.unit === 'PERCENT'
                    ? percent(item.value)
                    : item.value !== undefined
                    ? `${item.value} ${item.unit ? item.unit.toLowerCase() : ''}`
                    : typeof item === 'object'
                    ? JSON.stringify(item)
                    : String(item)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <p className="text-xs text-slate-400">{String(evidence)}</p>;
}

function normalizeList(items: unknown): string[] {
  if (!items) return [];
  if (Array.isArray(items)) return items.map((i) => (typeof i === 'string' ? i : JSON.stringify(i)));
  if (typeof items === 'string') return [items];
  if (typeof items === 'object') return Object.entries(items as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`);
  return [String(items)];
}

export function RecommendationDetailView({ id }: { id: string }) {
  const router = useRouter();
  const query = useRecommendation(id);
  const recommendation = query.data;
  const assignees = useAssignees(recommendation?.module);

  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [deferredUntil, setDeferredUntil] = useState('');
  const [activeTab, setActiveTab] = useState<'accept' | 'defer' | 'dismiss'>('accept');

  useEffect(() => {
    if (recommendation && !dueAt) setDueAt(localDateInput(recommendation.recommendedDueAt));
  }, [recommendation, dueAt]);

  const accept = useIntelligenceMutation((_: void) =>
    intelligenceApi.accept(id, { assigneeId, dueAt: new Date(dueAt).toISOString(), managerNotes: notes || undefined })
  );
  const dismiss = useIntelligenceMutation((_: void) => intelligenceApi.dismiss(id, decisionReason));
  const defer = useIntelligenceMutation((_: void) =>
    intelligenceApi.defer(id, decisionReason, new Date(deferredUntil).toISOString())
  );

  if (query.isLoading) return <LoadingState message="Loading recommendation evidence dossier…" />;
  if (query.error || !recommendation) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const actionable = ['OPEN', 'DEFERRED'].includes(recommendation.status) && new Date(recommendation.expiresAt) > new Date();
  const impact = recommendation.expectedImpact;
  const risks = normalizeList(recommendation.risks);
  const assumptions = normalizeList(recommendation.assumptions);

  const submitAccept = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const task = await accept.mutateAsync();
      showToast({ kind: 'success', title: 'Recommendation accepted & work task assigned' });
      router.push(`/intelligence/tasks/${(task as { id: string }).id}`);
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Could not accept recommendation',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const submitDismiss = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await dismiss.mutateAsync();
      showToast({ kind: 'success', title: 'Recommendation dismissed' });
      router.push('/intelligence/recommendations');
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Could not dismiss',
        message: error instanceof Error ? error.message : 'Please check reason requirements.',
      });
    }
  };

  const submitDefer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await defer.mutateAsync();
      showToast({ kind: 'success', title: 'Recommendation deferred' });
      router.push('/intelligence/recommendations');
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Could not defer',
        message: error instanceof Error ? error.message : 'Please check deferred date.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/intelligence/recommendations"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Recommendations</span>
        </Link>
        <span className="font-mono text-xs text-slate-400">ID: {recommendation.id}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left Dossier Column */}
        <div className="space-y-6">
          {/* Main Title & Situation Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg border border-[#004a80]/30 bg-[#004a80]/10 px-2.5 py-1 text-xs font-bold text-[#004a80] dark:text-blue-300">
                {recommendation.module} Advisor
              </span>
              <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                {recommendation.priority} Priority
              </span>
              <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                {recommendation.status}
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                {recommendation.title}
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {recommendation.situation}
              </p>
            </div>

            {/* Strategic Rationale */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Strategic Rationale
              </h4>
              <p className="mt-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {recommendation.rationale}
              </p>
            </div>

            {/* Financial Impact Spectrum */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Projected Impact Spectrum ({impact?.horizonDays || 60} Days)
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Conservative (Low)</p>
                  <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {impact?.currency ? money(impact.low, impact.currency) : impact?.low ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border-2 border-[#004a80] bg-[#004a80]/5 p-3.5 text-center dark:border-blue-500 dark:bg-blue-950/40">
                  <p className="text-[10px] font-bold uppercase text-[#004a80] dark:text-blue-400">Base Projection</p>
                  <p className="mt-1 text-base font-bold text-[#004a80] dark:text-blue-300">
                    {impact ? impactValue(impact) : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-center dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Optimistic (High)</p>
                  <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {impact?.currency ? money(impact.high, impact.currency) : impact?.high ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Trust and Quality Metrics */}
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
              <span>Confidence: <strong className="text-slate-800 dark:text-slate-200">{percent(recommendation.confidence)}</strong></span>
              <span>Data Quality: <strong className="text-slate-800 dark:text-slate-200">{percent(recommendation.dataQualityScore)}</strong></span>
              <span>Cost Coverage: <strong className="text-slate-800 dark:text-slate-200">{percent(recommendation.costCoverageScore)}</strong></span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                Expires {dateTime(recommendation.expiresAt)}
              </span>
            </div>
          </div>

          {/* Certified Evidence Table */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#004a80] dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Certified Supporting Evidence
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Immutable ERP Snapshots
              </span>
            </div>
            {renderEvidenceList(recommendation.evidence)}
          </div>

          {/* Risks & Assumptions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Identified Risks</h4>
              </div>
              {risks.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                  {risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No specific operational risks identified.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <FileCheck2 className="h-4 w-4" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Operational Assumptions</h4>
              </div>
              {assumptions.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                  {assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">Standard operational baseline assumptions apply.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Action & Work Assignment Cockpit */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5 sticky top-24">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Executive Action Cockpit
              </h3>
              <span className="text-[10px] font-bold uppercase text-slate-400">Human in the Loop</span>
            </div>

            {/* Action Segmented Switcher */}
            {actionable && (
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('accept')}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
                    activeTab === 'accept'
                      ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  Accept & Assign
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('defer')}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
                    activeTab === 'defer'
                      ? 'bg-white text-amber-700 shadow-xs dark:bg-slate-900 dark:text-amber-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  Defer Review
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('dismiss')}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
                    activeTab === 'dismiss'
                      ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-900 dark:text-rose-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Form Mode 1: Accept and Assign Work Task */}
            {activeTab === 'accept' && actionable && (
              <form onSubmit={submitAccept} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assign Task Owner <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none focus:ring-2 focus:ring-[#004a80]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Select authorized employee for {recommendation.module}...</option>
                    {assignees.data?.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name ?? user.email} {user.department ? `· ${user.department}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Target Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none focus:ring-2 focus:ring-[#004a80]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Management Directives & Instructions
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Specific execution notes or approvals required..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none focus:ring-2 focus:ring-[#004a80]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={accept.isPending || !assigneeId || !dueAt}
                  className="w-full rounded-xl bg-[#004a80] hover:bg-[#003964] py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {accept.isPending ? 'Assigning Task...' : 'Confirm & Create Work Task'}
                </button>
              </form>
            )}

            {/* Form Mode 2: Defer */}
            {activeTab === 'defer' && actionable && (
              <form onSubmit={submitDefer} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Defer Decision Until <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                    value={deferredUntil}
                    onChange={(e) => setDeferredUntil(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Reason for Deferral <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="Why is this review being postponed? (e.g. awaiting vendor revised quote)..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={defer.isPending || !deferredUntil || !decisionReason}
                  className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {defer.isPending ? 'Deferring...' : 'Defer Recommendation'}
                </button>
              </form>
            )}

            {/* Form Mode 3: Dismiss */}
            {activeTab === 'dismiss' && actionable && (
              <form onSubmit={submitDismiss} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Dismissal Justification <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="Document why this recommendation is not applicable..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={dismiss.isPending || !decisionReason}
                  className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {dismiss.isPending ? 'Dismissing...' : 'Confirm Dismissal'}
                </button>
              </form>
            )}

            {!actionable && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800">
                This recommendation is in status <strong>{recommendation.status}</strong> and cannot receive new triage actions.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
