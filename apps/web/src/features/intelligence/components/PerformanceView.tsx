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
import { EmptyState } from '@plinth/ui';
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
              className="rounded-2xl border border-border/90 bg-surface p-4 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-placeholder truncate pr-2">
                  {label}
                </p>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-brand-soft text-link">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

                <div className="text-xl font-bold text-ink">
                  {metricValue(value)}
                </div>
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">Provenance: {value?.provenance ?? 'UNKNOWN'} · {value?.freshnessStatus ?? 'UNKNOWN'}</p>

              <div className="pt-2 border-t border-border text-[11px] text-ink-muted space-y-1">
                <div className="flex justify-between">
                  <span>Data Freshness:</span>
                  <strong className="text-ink-secondary">{percent(freshness)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cost Coverage:</span>
                  <strong className="text-ink-secondary">{percent(coverage)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metric Certification Matrix Table */}
      <div className="rounded-2xl border border-border/90 bg-surface shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border p-5">
          <div>
            <h3 className="text-sm font-bold text-ink">
              Metric Provenance and Snapshot Matrix
            </h3>
            <p className="text-xs text-ink-muted">
              Point-in-time source snapshots; individual metrics may be estimated, stale, or unavailable.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-tone-green-text">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {snapshots.length} Snapshots Captured
          </span>
        </div>

        <div className="divide-y divide-border">
          {snapshots.map((snapshot) => {
            const isQualityAtRisk =
              Number(snapshot.freshnessScore) < 0.75 || Number(snapshot.costCoverageScore) < 0.8;

            return (
              <div
                key={snapshot.id}
                className="grid gap-4 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center hover:bg-muted/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-ink">
                      {snapshot.module}
                    </span>
                    <span className="rounded border border-border bg-muted px-1.5 py-0.2 font-mono text-[10px] text-ink-secondary">
                      v{snapshot.metricVersion}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-placeholder">
                    Captured: {dateTime(snapshot.capturedAt)} · Period: {dateTime(snapshot.periodStart)} – {dateTime(snapshot.periodEnd)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase text-ink-placeholder">Data Freshness</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">
                      {percent(snapshot.freshnessScore)}
                    </span>
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-accent-brand rounded-full"
                        style={{ width: percent(snapshot.freshnessScore) }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase text-ink-placeholder">Cost Coverage</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">
                      {percent(snapshot.costCoverageScore)}
                    </span>
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-tone-green-solid rounded-full"
                        style={{ width: percent(snapshot.costCoverageScore) }}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {isQualityAtRisk ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-tone-amber-solid/25 bg-tone-amber-bg px-2.5 py-1 text-xs font-bold text-tone-amber-text">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Data Quality Check
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-tone-green-solid/25 bg-tone-green-bg px-2.5 py-1 text-xs font-bold text-tone-green-text">
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
      <div className="rounded-2xl border border-tone-blue-solid/25 bg-tone-blue-bg p-4 text-xs text-ink-secondary leading-relaxed">
        <strong>Financial Standards Notice:</strong> Shipped net revenue is operational, not accounting-recognized revenue. Known contribution margin is shown only with complete eligible COGS coverage; it subtracts recorded outbound freight but excludes unrecorded labor, overhead, marketplace fees, commissions, and other costs. It is not net profit.
      </div>
    </div>
  );
}
