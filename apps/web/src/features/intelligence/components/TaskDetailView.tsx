'use client';

import React, { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { showToast } from '../../../components/toast-store';
import { intelligenceApi } from '../api';
import { useIntelligenceMutation, useTask } from '../hooks';
import { dateTime, impactValue } from './format';

export function TaskDetailView({ id }: { id: string }) {
  const query = useTask(id);
  const [comment, setComment] = useState('');
  const [realizedValue, setRealizedValue] = useState('');

  const update = useIntelligenceMutation((status: string) =>
    intelligenceApi.updateTask(id, { status, comment: comment || `Status updated to ${status}` })
  );
  const complete = useIntelligenceMutation((_: void) =>
    intelligenceApi.completeTask(id, {
      comment,
      evidence: { recordedThrough: 'Decision Center' },
      ...(realizedValue && query.data
        ? {
            outcome: {
              metricKey: query.data.expectedImpact.metricKey,
              expectedValue: query.data.expectedImpact.base,
              realizedValue: Number(realizedValue),
              unit: query.data.expectedImpact.unit,
              currency: query.data.expectedImpact.currency,
              attributionMethod: 'MANAGER_ESTIMATE',
              observedAt: new Date().toISOString(),
              notes: comment,
            },
          }
        : {}),
    })
  );

  if (query.isLoading) return <LoadingState message="Loading task execution cockpit..." />;
  if (query.error || !query.data) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const task = query.data;
  const terminal = task.status === 'COMPLETED' || task.status === 'CANCELLED';

  const doUpdate = async (status: string) => {
    try {
      await update.mutateAsync(status);
      setComment('');
      showToast({ kind: 'success', title: `Task status updated to ${status}` });
      query.refetch();
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Could not update task',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const doComplete = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await complete.mutateAsync();
      showToast({
        kind: 'success',
        title: 'Task completed successfully',
        message: realizedValue ? 'Realized business outcome recorded for finance review.' : 'Task completed.',
      });
      query.refetch();
    } catch (error) {
      showToast({
        kind: 'error',
        title: 'Could not complete task',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/intelligence/tasks"
          className="inline-flex items-center gap-2 text-xs font-semibold text-ink-secondary hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Tasks</span>
        </Link>
        <span className="font-mono text-xs text-ink-placeholder">Task ID: {task.id}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left Column: Task Overview */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg border border-accent-brand bg-accent-brand-soft px-2.5 py-1 text-xs font-bold text-link">
                {task.module} Task
              </span>
              <span className="inline-flex items-center rounded-lg border border-border bg-muted px-2.5 py-1 text-xs font-bold text-ink">
                {task.priority} Priority
              </span>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${
                  task.status === 'COMPLETED'
                    ? 'border-tone-green-solid/25 bg-tone-green-bg text-tone-green-text'
                    : task.status === 'BLOCKED'
                    ? 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text'
                    : 'border-tone-blue-solid/25 bg-tone-blue-bg text-link'
                }`}
              >
                {task.status}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-ink">{task.title}</h2>
              <p className="mt-2 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                {task.description}
              </p>
            </div>

            {/* Structured Meta Grid */}
            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Assigned Owner</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-ink">
                  {task.owner?.name ?? task.owner?.email ?? 'Unassigned'}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Target Due Date</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-ink">
                  {dateTime(task.dueAt)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-3.5">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Target Base Impact</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-link">
                  {impactValue(task.expectedImpact)}
                </p>
              </div>
            </div>
          </div>

          {/* Operational Execution Boundary */}
          <div className="rounded-2xl border border-border/90 bg-surface p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-link" />
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                Operational ERP Execution Rule
              </h3>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              This task is an accountable operational directive. Execution of purchase orders, stock transfers, pricing updates, production schedules, or ledger changes must still be performed and approved through their respective Plinth module.
            </p>
          </div>
        </div>

        {/* Right Column: Update & Complete Cockpit */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-ink border-b border-border pb-3">
              Task Execution & Sign-off
            </h3>

            {!terminal ? (
              <form onSubmit={doComplete} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-ink-secondary">
                    Progress Note or Resolution Details <span className="text-tone-red-text">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Document actions taken, PO numbers referenced, or roadblocks encountered..."
                    className="mt-1.5 w-full rounded-xl border border-border bg-surface p-3 text-xs font-medium text-ink focus:border-accent-brand focus:outline-none focus:ring-2 focus:ring-accent-brand"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-secondary">
                    Realized Financial Impact (Optional INR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={realizedValue}
                    onChange={(e) => setRealizedValue(e.target.value)}
                    placeholder="Leave blank unless reconciled with accounting"
                    className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-accent-brand focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-ink-placeholder">
                    Entered value is recorded as a verified manager outcome for executive ROI reporting.
                  </p>
                </div>

                {/* State Transition Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={update.isPending || !comment}
                    onClick={() => void doUpdate('IN_PROGRESS')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted hover:bg-muted py-2.5 text-xs font-bold text-ink disabled:opacity-50"
                  >
                    <PlayCircle className="h-3.5 w-3.5 text-tone-amber-text" />
                    <span>In Progress</span>
                  </button>

                  <button
                    type="button"
                    disabled={update.isPending || !comment}
                    onClick={() => void doUpdate('BLOCKED')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-tone-red-solid/25 bg-tone-red-bg hover:bg-tone-red-bg py-2.5 text-xs font-bold text-tone-red-text disabled:opacity-50"
                  >
                    <PauseCircle className="h-3.5 w-3.5 text-tone-red-text" />
                    <span>Mark Blocked</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={complete.isPending || comment.trim().length < 3}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-tone-green-solid hover:bg-tone-green-solid py-2.5 text-xs font-bold text-inverse shadow-xs transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{complete.isPending ? 'Completing Task...' : 'Sign Off & Complete Task'}</span>
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-tone-green-solid/25 bg-tone-green-bg p-4 text-xs text-tone-green-text space-y-1">
                <p className="font-bold">Task Completed</p>
                <p className="text-[11px] text-tone-green-text">
                  Completed on {task.completedAt ? dateTime(task.completedAt) : 'Recently'}. Outcome recorded for audit reporting.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
