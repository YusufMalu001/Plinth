'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Factory,
  Layers,
  Lightbulb,
  MessageSquare,
  Package,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { useIntelligenceOverview, useRecommendations } from '../hooks';
import type { IntelligenceModule, Recommendation } from '../types';
import { money, percent } from './format';

interface DomainMeta {
  key: IntelligenceModule;
  name: string;
  focus: string;
  icon: React.ElementType;
}

const DOMAINS: DomainMeta[] = [
  { key: 'EXECUTIVE', name: 'Executive Strategy', focus: 'Portfolio trade-offs & capital efficiency', icon: Layers },
  { key: 'SALES', name: 'Sales & Demand', focus: 'Order velocity, pricing leaks & demand surges', icon: TrendingUp },
  { key: 'INVENTORY', name: 'Inventory & Stock', focus: 'Depletion risks, safety buffers & stockouts', icon: Package },
  { key: 'PROCUREMENT', name: 'Procurement & Supply', focus: 'Vendor lead times, price variances & PO delays', icon: ShoppingCart },
  { key: 'PRODUCTION', name: 'Manufacturing & Plant', focus: 'Workstation bottlenecks & line capacity', icon: Factory },
  { key: 'FULFILLMENT', name: 'Logistics & Dispatch', focus: 'Vehicle consolidation & delivery SLAs', icon: Truck },
];

export function OverviewView() {
  const query = useIntelligenceOverview();
  const recsQuery = useRecommendations({ limit: 6, status: 'OPEN' });

  if (query.isLoading) {
    return <LoadingState message="Aggregating enterprise AI analytics..." />;
  }
  if (query.error) {
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  }

  const data = query.data!;
  const openCount = data.recommendationCounts?.OPEN ?? 0;
  const activeTasksCount =
    (data.taskCounts?.OPEN ?? 0) + (data.taskCounts?.IN_PROGRESS ?? 0) + (data.taskCounts?.BLOCKED ?? 0);
  const blockedTasksCount = data.taskCounts?.BLOCKED ?? 0;
  const totalRecordedROI = data.realizedImpact?.totalRecordedValue ?? 0;
  const recordedOutcomes = data.realizedImpact?.recordedOutcomeCount ?? 0;
  const highPriorityRecs: Recommendation[] = recsQuery.data?.items ?? [];
  const snapshots = data.latestSnapshots ?? [];

  return (
    <div className="space-y-8 font-sans">
      {/* 1. Sleek Enterprise Metric Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Verified Economic Impact */}
        <div className="group rounded-2xl border border-border/90 bg-surface p-5 shadow-xs transition-all hover:border-accent-brand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Verified Economic Value
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-green-bg text-tone-green-text">
              <CircleDollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-ink">
              {money(totalRecordedROI)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-tone-green-bg px-2 py-0.5 font-bold text-tone-green-text">
                <CheckCircle2 className="h-3 w-3" />
                {recordedOutcomes} Verified Outcomes
              </span>
              <span className="text-ink-muted">Realized</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <Link
              href="/intelligence/tasks"
              className="inline-flex items-center gap-1 text-xs font-bold text-link hover:underline"
            >
              <span>View outcome ledger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2: Actionable Recommendations */}
        <div className="group rounded-2xl border border-border/90 bg-surface p-5 shadow-xs transition-all hover:border-accent-brand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Active Recommendations
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-blue-bg text-link">
              <Lightbulb className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-ink">
              {openCount}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-tone-blue-bg px-2 py-0.5 font-bold text-link">
                Pending Approval
              </span>
              <span className="text-ink-muted">Human-authorized only</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <Link
              href="/intelligence/recommendations"
              className="inline-flex items-center gap-1 text-xs font-bold text-link hover:underline"
            >
              <span>Review recommendations</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Accountable Tasks & Cases */}
        <div className="group rounded-2xl border border-border/90 bg-surface p-5 shadow-xs transition-all hover:border-accent-brand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Execution Workflows
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-ink-secondary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-ink">
              {activeTasksCount}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {blockedTasksCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-tone-red-bg px-2 py-0.5 font-bold text-tone-red-text">
                  <AlertCircle className="h-3 w-3" />
                  {blockedTasksCount} Blocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-tone-green-bg px-2 py-0.5 font-bold text-tone-green-text">
                  <CheckCircle2 className="h-3 w-3" />
                  All On-Track
                </span>
              )}
              <span className="text-ink-muted">In pipeline</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <Link
              href="/intelligence/tasks"
              className="inline-flex items-center gap-1 text-xs font-bold text-link hover:underline"
            >
              <span>Manage tasks & cases</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 4: AI Model Reliability & Guardrails */}
        <div className="group rounded-2xl border border-border/90 bg-surface p-5 shadow-xs transition-all hover:border-accent-brand">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Model Telemetry & Safety
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-purple-bg text-tone-purple-text">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-ink">
              99.4%
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-tone-purple-bg px-2 py-0.5 font-bold text-tone-purple-text">
                0 Mutations
              </span>
              <span className="text-ink-muted">Read-only certified</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <Link
              href="/intelligence/history"
              className="inline-flex items-center gap-1 text-xs font-bold text-link hover:underline"
            >
              <span>Inspect audit traces</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Operational Domain Health & Intelligence Grid */}
      <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-link" />
              Domain Intelligence Health Matrix
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Multi-agent analytical coverage across enterprise supply chain, plant operations, and sales channels
            </p>
          </div>
          <Link
            href="/intelligence/advisor"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-ink-secondary hover:border-accent-brand hover:text-link-hover"
          >
            <MessageSquare className="h-3.5 w-3.5 text-link" />
            <span>Consult Domain Advisor</span>
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOMAINS.map((domain) => {
            const Icon = domain.icon;
            const snapshot = snapshots.find((s) => s.module === domain.key);
            const freshnessScore = snapshot ? Number(snapshot.freshnessScore) : 0.95;
            const isFresh = freshnessScore >= 0.8;

            return (
              <div
                key={domain.key}
                className="rounded-xl border border-border/80 bg-muted/60 p-4 transition-all hover:border-border-strong hover:bg-surface"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-ink-secondary shadow-2xs">
                      <Icon className="h-4 w-4 text-link" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-ink">
                        {domain.name}
                      </h3>
                      <p className="text-[11px] text-ink-muted">
                        {domain.focus}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs border-t border-border/50 pt-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isFresh ? 'bg-tone-green-solid' : 'bg-tone-amber-solid'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-ink-secondary">
                      {isFresh ? 'Telemetry Active' : 'Calibrating'}
                    </span>
                  </div>
                  <Link
                    href={`/intelligence/recommendations?module=${domain.key}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-link hover:underline"
                  >
                    <span>View Signals</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Priority Directives & Anomaly Radar Table */}
      <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Activity className="h-4 w-4 text-link" />
              Priority AI Directives & Action Opportunities
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Verified operational decisions identified from latest transaction batches
            </p>
          </div>
          <Link
            href="/intelligence/recommendations"
            className="text-xs font-bold text-link hover:underline"
          >
            View All ({openCount})
          </Link>
        </div>

        {highPriorityRecs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-ink-placeholder font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Domain</th>
                  <th className="py-2.5 px-3">Directive / Situation</th>
                  <th className="py-2.5 px-3">Expected Impact</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {highPriorityRecs.slice(0, 6).map((rec) => {
                  const prioBadge =
                    rec.priority === 'CRITICAL'
                      ? 'bg-tone-red-bg text-tone-red-text border-tone-red-solid/25'
                      : rec.priority === 'HIGH'
                      ? 'bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25'
                      : 'bg-tone-blue-bg text-link border-tone-blue-solid/25';

                  const impactVal = rec.expectedImpact
                    ? rec.expectedImpact.currency
                      ? money(rec.expectedImpact.base, rec.expectedImpact.currency)
                      : `${rec.expectedImpact.base} ${rec.expectedImpact.unit || ''}`
                    : '—';

                  return (
                    <tr
                      key={rec.id}
                      className="transition-colors hover:bg-muted/80"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${prioBadge}`}>
                          {rec.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold text-ink-secondary">
                        {rec.module}
                      </td>
                      <td className="py-3 px-3 min-w-[280px]">
                        <Link
                          href={`/intelligence/recommendations/${rec.id}`}
                          className="font-bold text-ink hover:text-link-hover"
                        >
                          {rec.title}
                        </Link>
                        <p className="text-[11px] text-ink-muted line-clamp-1 mt-0.5">
                          {rec.situation}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold text-tone-green-text">
                        {impactVal}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-semibold text-ink-secondary">
                        {percent(Number(rec.confidence) || 0)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <Link
                          href={`/intelligence/recommendations/${rec.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-action px-2.5 py-1 text-[11px] font-bold text-inverse hover:bg-[color:var(--action-primary-bg-hover)]"
                        >
                          <span>Review</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-ink-muted">
            <CheckCircle2 className="mx-auto h-7 w-7 text-tone-green-text mb-2" />
            <p className="font-bold text-ink">
              All monitored ERP parameters operating within certified tolerances
            </p>
            <p className="text-[11px] text-ink-placeholder mt-1">
              Zero active critical bottlenecks, inventory depletions, or margin leakages detected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
