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
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Tasks</span>
        </Link>
        <span className="font-mono text-xs text-slate-400">Task ID: {task.id}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left Column: Task Overview */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg border border-[#004a80]/30 bg-[#004a80]/10 px-2.5 py-1 text-xs font-bold text-[#004a80] dark:text-blue-300">
                {task.module} Task
              </span>
              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {task.priority} Priority
              </span>
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${
                  task.status === 'COMPLETED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : task.status === 'BLOCKED'
                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300'
                    : 'border-blue-200 bg-blue-50 text-[#004a80] dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300'
                }`}
              >
                {task.status}
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{task.title}</h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {task.description}
              </p>
            </div>

            {/* Structured Meta Grid */}
            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-[10px] font-bold uppercase text-slate-400">Assigned Owner</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {task.owner?.name ?? task.owner?.email ?? 'Unassigned'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-[10px] font-bold uppercase text-slate-400">Target Due Date</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {dateTime(task.dueAt)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-[10px] font-bold uppercase text-slate-400">Target Base Impact</p>
                <p className="mt-1 text-xs sm:text-sm font-bold text-[#004a80] dark:text-blue-400">
                  {impactValue(task.expectedImpact)}
                </p>
              </div>
            </div>
          </div>

          {/* Operational Execution Boundary */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Operational ERP Execution Rule
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              This task is an accountable operational directive. Execution of purchase orders, stock transfers, pricing updates, production schedules, or ledger changes must still be performed and approved through their respective Plinth module.
            </p>
          </div>
        </div>

        {/* Right Column: Update & Complete Cockpit */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 pb-3 dark:border-slate-800">
              Task Execution & Sign-off
            </h3>

            {!terminal ? (
              <form onSubmit={doComplete} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Progress Note or Resolution Details <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Document actions taken, PO numbers referenced, or roadblocks encountered..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none focus:ring-2 focus:ring-[#004a80]/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Realized Financial Impact (Optional INR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={realizedValue}
                    onChange={(e) => setRealizedValue(e.target.value)}
                    placeholder="Leave blank unless reconciled with accounting"
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Entered value is recorded as a verified manager outcome for executive ROI reporting.
                  </p>
                </div>

                {/* State Transition Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={update.isPending || !comment}
                    onClick={() => void doUpdate('IN_PROGRESS')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 py-2.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50"
                  >
                    <PlayCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>In Progress</span>
                  </button>

                  <button
                    type="button"
                    disabled={update.isPending || !comment}
                    onClick={() => void doUpdate('BLOCKED')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 py-2.5 text-xs font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300 disabled:opacity-50"
                  >
                    <PauseCircle className="h-3.5 w-3.5 text-rose-600" />
                    <span>Mark Blocked</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={complete.isPending || comment.trim().length < 3}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-bold text-white shadow-xs transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{complete.isPending ? 'Completing Task...' : 'Sign Off & Complete Task'}</span>
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 space-y-1">
                <p className="font-bold">Task Completed</p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
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
