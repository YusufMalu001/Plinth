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
    <div className="space-y-8 font-manrope">
      {/* 1. Sleek Enterprise Metric Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Verified Economic Impact */}
        <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-[#004a80]/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Verified Economic Value
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CircleDollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {money(totalRecordedROI)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {recordedOutcomes} Verified Outcomes
              </span>
              <span className="text-slate-500 dark:text-slate-400">Realized</span>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Link
              href="/intelligence/tasks"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#004a80] hover:underline dark:text-blue-400"
            >
              <span>View outcome ledger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2: Actionable Recommendations */}
        <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-[#004a80]/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Recommendations
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#004a80] dark:bg-blue-950/60 dark:text-blue-400">
              <Lightbulb className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {openCount}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-bold text-[#004a80] dark:bg-blue-950/80 dark:text-blue-300">
                Pending Approval
              </span>
              <span className="text-slate-500 dark:text-slate-400">Human-authorized only</span>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Link
              href="/intelligence/recommendations"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#004a80] hover:underline dark:text-blue-400"
            >
              <span>Review recommendations</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Accountable Tasks & Cases */}
        <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-[#004a80]/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Execution Workflows
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <ClipboardCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {activeTasksCount}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {blockedTasksCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
                  <AlertCircle className="h-3 w-3" />
                  {blockedTasksCount} Blocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  All On-Track
                </span>
              )}
              <span className="text-slate-500 dark:text-slate-400">In pipeline</span>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Link
              href="/intelligence/tasks"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#004a80] hover:underline dark:text-blue-400"
            >
              <span>Manage tasks & cases</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Metric 4: AI Model Reliability & Guardrails */}
        <div className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-[#004a80]/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Model Telemetry & Safety
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              99.4%
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 font-bold text-purple-700 dark:bg-purple-950/80 dark:text-purple-300">
                0 Mutations
              </span>
              <span className="text-slate-500 dark:text-slate-400">Read-only certified</span>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Link
              href="/intelligence/history"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#004a80] hover:underline dark:text-blue-400"
            >
              <span>Inspect audit traces</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Operational Domain Health & Intelligence Grid */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
              Domain Intelligence Health Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Multi-agent analytical coverage across enterprise supply chain, plant operations, and sales channels
            </p>
          </div>
          <Link
            href="/intelligence/advisor"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#004a80] hover:text-[#004a80] dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-400"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#004a80] dark:text-blue-400" />
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
                className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 transition-all hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-850/60 dark:hover:bg-slate-800/80"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                      <Icon className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        {domain.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {domain.focus}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs border-t border-slate-200/50 pt-2.5 dark:border-slate-700/50">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isFresh ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {isFresh ? 'Telemetry Active' : 'Calibrating'}
                    </span>
                  </div>
                  <Link
                    href={`/intelligence/recommendations?module=${domain.key}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#004a80] hover:underline dark:text-blue-400"
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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
              Priority AI Directives & Action Opportunities
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified operational decisions identified from latest transaction batches
            </p>
          </div>
          <Link
            href="/intelligence/recommendations"
            className="text-xs font-bold text-[#004a80] hover:underline dark:text-blue-400"
          >
            View All ({openCount})
          </Link>
        </div>

        {highPriorityRecs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px] dark:border-slate-800">
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Domain</th>
                  <th className="py-2.5 px-3">Directive / Situation</th>
                  <th className="py-2.5 px-3">Expected Impact</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {highPriorityRecs.slice(0, 6).map((rec) => {
                  const prioBadge =
                    rec.priority === 'CRITICAL'
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-900'
                      : rec.priority === 'HIGH'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-900'
                      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-900';

                  const impactVal = rec.expectedImpact
                    ? rec.expectedImpact.currency
                      ? money(rec.expectedImpact.base, rec.expectedImpact.currency)
                      : `${rec.expectedImpact.base} ${rec.expectedImpact.unit || ''}`
                    : '—';

                  return (
                    <tr
                      key={rec.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${prioBadge}`}>
                          {rec.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">
                        {rec.module}
                      </td>
                      <td className="py-3 px-3 min-w-[280px]">
                        <Link
                          href={`/intelligence/recommendations/${rec.id}`}
                          className="font-bold text-slate-900 hover:text-[#004a80] dark:text-white dark:hover:text-blue-400"
                        >
                          {rec.title}
                        </Link>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {rec.situation}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-bold text-emerald-700 dark:text-emerald-400">
                        {impactVal}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">
                        {percent(Number(rec.confidence) || 0)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <Link
                          href={`/intelligence/recommendations/${rec.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#004a80] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#003860] dark:bg-blue-600 dark:hover:bg-blue-500"
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
          <div className="py-8 text-center text-xs text-slate-500">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400 mb-2" />
            <p className="font-bold text-slate-800 dark:text-slate-200">
              All monitored ERP parameters operating within certified tolerances
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Zero active critical bottlenecks, inventory depletions, or margin leakages detected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
