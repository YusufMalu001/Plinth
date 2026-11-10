"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Search
} from 'lucide-react';
import { Button, Card, Input, PageHeader } from '@synergy/ui';
import { useProductionSchedules } from '@/features/production/execution-hooks';
import type { ProductionScheduleSummary } from '@/features/production/types';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';

type AssemblyFilter = 'all' | 'ready' | 'active' | 'completed';

function isAssemblySchedule(schedule: ProductionScheduleSummary) {
  return Boolean(
    schedule.route?.assemblyDepartmentId ||
    (schedule.route as any)?.assemblyDepartment ||
    (schedule.assemblyIntakeRequirements && schedule.assemblyIntakeRequirements.length > 0) ||
    (schedule.assemblyBatches && schedule.assemblyBatches.length > 0)
  );
}

function AssemblyScheduleCard({ schedule }: { schedule: ProductionScheduleSummary }) {
  const plannedOutput = Number(schedule.quantity || 0);
  const assembledOutput = Number(schedule.assembledQuantity || 0);
  const progress = plannedOutput > 0 ? Math.min(100, Math.round((assembledOutput / plannedOutput) * 100)) : 0;
  const buildableKits = Number(schedule.buildableQuantity || 0);
  const uomSymbol = schedule.quantityUom?.symbol || schedule.quantityUom?.name || 'units';

  const pendingTransfers = useMemo(() => {
    return (schedule.assemblyIntakeRequirements || []).reduce((count, item) => {
      const pending = (item.handovers || []).filter((h) => h.status === 'PROPOSED').length;
      return count + pending;
    }, 0);
  }, [schedule.assemblyIntakeRequirements]);

  const activeRunsCount = schedule.assemblyBatches?.length || 0;

  return (
    <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-none hover:border-primary/50 transition-all hover:shadow-xs">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-primary">{schedule.planNumber}</span>
            <StatusBadge status={schedule.status} />
            {buildableKits > 0 && (
              <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                {buildableKits.toLocaleString()} kits ready to assemble
              </span>
            )}
            {pendingTransfers > 0 && (
              <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{pendingTransfers} transfer{pendingTransfers > 1 ? 's' : ''} pending</span>
              </span>
            )}
            {activeRunsCount > 0 && (
              <span className="rounded-lg border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {activeRunsCount} active run{activeRunsCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div>
            <h2 className="truncate text-base font-bold text-foreground">{schedule.product?.name || 'Production item'}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {schedule.scheduleDate ? new Date(schedule.scheduleDate).toLocaleDateString() : 'Date not set'} · {String(schedule.shift || 'Shift not set').replaceAll('_', ' ')}
              </span>
              <span className="font-semibold text-foreground">
                {plannedOutput.toLocaleString()} {uomSymbol} scheduled
              </span>
              {schedule.product?.sku && <span className="font-mono">SKU: {schedule.product.sku}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 inline-flex items-center gap-1 font-semibold text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              Intake Parts:
            </span>
            {schedule.assemblyIntakeRequirements.slice(0, 4).map((item) => {
              const isFulfilled = Number(item.acceptedQty) >= Number(item.requiredQty);
              return (
                <span
                  key={item.id}
                  className={`rounded-md border px-2 py-0.5 font-medium ${
                    isFulfilled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'border-border/70 bg-muted/40 text-foreground'
                  }`}
                >
                  {item.itemName}: {Number(item.acceptedQty).toLocaleString()} / {Number(item.requiredQty).toLocaleString()} {item.unitName}
                </span>
              );
            })}
            {schedule.assemblyIntakeRequirements.length > 4 && (
              <span className="text-muted-foreground font-semibold">+{schedule.assemblyIntakeRequirements.length - 4} more</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-3 lg:w-72 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Assembly Output</span>
            <span className="font-mono font-bold text-foreground">
              {assembledOutput.toLocaleString()} / {plannedOutput.toLocaleString()} ({progress}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{activeRunsCount} active run{activeRunsCount > 1 ? 's' : ''}</span>
            {buildableKits > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ready to Assemble</span>
              </span>
            ) : (
              <span>Waiting for parts</span>
            )}
          </div>

          <div className="pt-1">
            <Link href={`/production/assembly/${schedule.id}`} className="block">
              <Button size="sm" className="w-full gap-1.5 font-bold shadow-none">
                <span>Open Assembly Station</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AssemblyQueuePage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AssemblyFilter>('all');
  const { data: schedules = [], isLoading, isError, error, refetch, isFetching } = useProductionSchedules(search || undefined);

  const assemblySchedules = useMemo(() => {
    const relevant = schedules.filter(isAssemblySchedule);
    return relevant.filter((schedule) => {
      if (filter === 'ready') return Number(schedule.buildableQuantity || 0) > 0;
      if (filter === 'active') return schedule.assemblyBatches?.some((batch) => ['ALLOCATED', 'IN_ASSEMBLY', 'PARTIAL', 'QC_PENDING'].includes(batch.status));
      if (filter === 'completed') return schedule.assemblyBatches?.length > 0 && schedule.assemblyBatches.every((batch) => ['PASSED_TO_FG', 'COMPLETE'].includes(batch.status));
      return true;
    });
  }, [schedules, filter]);

  const counts = useMemo(() => ({
    all: schedules.filter(isAssemblySchedule).length,
    ready: schedules.filter((schedule) => isAssemblySchedule(schedule) && Number(schedule.buildableQuantity || 0) > 0).length,
    active: schedules.filter((schedule) => isAssemblySchedule(schedule) && schedule.assemblyBatches?.some((batch) => ['ALLOCATED', 'IN_ASSEMBLY', 'PARTIAL', 'QC_PENDING'].includes(batch.status))).length,
    completed: schedules.filter((schedule) => isAssemblySchedule(schedule) && Boolean(schedule.assemblyBatches?.length) && schedule.assemblyBatches!.every((batch) => ['PASSED_TO_FG', 'COMPLETE'].includes(batch.status))).length,
  }), [schedules]);

  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          title="Assembly & Convergence"
          description="Production schedules routed to Assembly. Select a schedule to view component intake, accept department handovers, assign workstation operators, and complete finished goods."
          actions={(
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
          )}
        />

        <Card className="border-border/80 bg-card p-4 shadow-none rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {([
              ['all', 'All schedules'],
              ['ready', 'Ready for assembly'],
              ['active', 'In assembly'],
              ['completed', 'Completed'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  filter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                <span className="ml-2 font-mono">{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Input
              icon={Search}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search schedule, product, SKU..."
              className="h-9 w-full rounded-xl"
            />
          </div>
        </Card>

        {isLoading ? (
          <LoadingState message="Loading production schedules routed to Assembly..." />
        ) : isError ? (
          <ErrorState title="Could not load Assembly schedules" description={(error as Error)?.message || 'Failed to load production schedules.'} retry={() => refetch()} />
        ) : assemblySchedules.length === 0 ? (
          <Card className="rounded-2xl border-border/80 bg-card p-12 text-center shadow-none">
            <Boxes className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-base font-bold text-foreground">No Assembly schedules found</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Schedules appear here automatically when their production route sends department output or direct materials to Assembly.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {assemblySchedules.map((schedule) => <AssemblyScheduleCard key={schedule.id} schedule={schedule} />)}
          </div>
        )}
      </div>
    </div>
  );
}
