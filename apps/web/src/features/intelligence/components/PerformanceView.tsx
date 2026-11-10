'use client';

import React from 'react';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  Factory,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { EmptyState } from '@synergy/ui';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { useIntelligenceOverview } from '../hooks';
import type { Metric, SnapshotSummary } from '../types';
import { dateTime, metricValue, percent } from './format';

const keyMetricCards: Array<{
  module: SnapshotSummary['module'];
  key: string;
  label: string;
  icon: React.ElementType;
}> = [
  { module: 'SALES', key: 'sales.known_contribution_margin', label: 'Known Contribution Margin', icon: Banknote },
  { module: 'SALES', key: 'sales.cost_coverage_score', label: 'Sales Cost Coverage', icon: PackageCheck },
  { module: 'INVENTORY', key: 'inventory.value_at_average_cost', label: 'Calculated Inventory Value', icon: Boxes },
  { module: 'PRODUCTION', key: 'production.schedule_attainment', label: 'Production Schedule Attainment', icon: Factory },
  { module: 'FULFILLMENT', key: 'fulfillment.on_time_delivery_rate', label: 'On-Time Delivery Rate (OTD)', icon: Truck },
];

export function PerformanceView() {
  const query = useIntelligenceOverview();
  if (query.isLoading) return <LoadingState message="Loading certified business metrics..." />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const snapshots = query.data?.latestSnapshots ?? [];
  if (!snapshots.length) {
    return (
      <EmptyState
        title="No certified snapshots captured yet"
        description="The intelligence worker captures immutable snapshots across sales, inventory, and operations during normal ERP activity."
      />
    );
  }

  const findMetric = (
    module: SnapshotSummary['module'],
    key: string
  ): [Metric | undefined, SnapshotSummary | undefined] => {
    const snapshot = snapshots.find((item) => item.module === module);
    return [snapshot?.metrics.find((item) => item.key === key), snapshot];
  };

  return (
    <div className="space-y-6">
      {/* Top Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {keyMetricCards.map(({ module, key, label, icon: Icon }) => {
          const [value, snapshot] = findMetric(module, key);
          const freshness = snapshot ? Number(snapshot.freshnessScore) : 0;
          const coverage = snapshot ? Number(snapshot.costCoverageScore) : 0;

          return (
            <div
              key={key}
              className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate pr-2">
                  {label}
                </p>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#004a80]/10 text-[#004a80] dark:bg-blue-950/60 dark:text-blue-300">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {metricValue(value)}
                </div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Provenance: {value?.provenance ?? 'UNKNOWN'} · {value?.freshnessStatus ?? 'UNKNOWN'}</p>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Data Freshness:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{percent(freshness)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cost Coverage:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{percent(coverage)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metric Certification Matrix Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Metric Provenance and Snapshot Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Point-in-time source snapshots; individual metrics may be estimated, stale, or unavailable.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {snapshots.length} Snapshots Captured
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {snapshots.map((snapshot) => {
            const isQualityAtRisk =
              Number(snapshot.freshnessScore) < 0.75 || Number(snapshot.costCoverageScore) < 0.8;

            return (
              <div
                key={snapshot.id}
                className="grid gap-4 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {snapshot.module}
                    </span>
                    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.2 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      v{snapshot.metricVersion}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Captured: {dateTime(snapshot.capturedAt)} · Period: {dateTime(snapshot.periodStart)} – {dateTime(snapshot.periodEnd)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Data Freshness</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {percent(snapshot.freshnessScore)}
                    </span>
                    <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#004a80] dark:bg-blue-500 rounded-full"
                        style={{ width: percent(snapshot.freshnessScore) }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Cost Coverage</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {percent(snapshot.costCoverageScore)}
                    </span>
                    <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: percent(snapshot.costCoverageScore) }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {isQualityAtRisk ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Data Quality Check
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Snapshot Captured
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Terminology Guardrail Notice */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 text-xs text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-slate-300 leading-relaxed">
        <strong>Financial Standards Notice:</strong> Shipped net revenue is operational, not accounting-recognized revenue. Known contribution margin is shown only with complete eligible COGS coverage; it subtracts recorded outbound freight but excludes unrecorded labor, overhead, marketplace fees, commissions, and other costs. It is not net profit.
      </div>
    </div>
  );
}
