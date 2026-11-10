'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  ListTodo,
  PauseCircle,
  PlayCircle,
  Search,
  Table as TableIcon,
  UserRound,
  X,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { useTasks } from '../hooks';
import type { BusinessTask } from '../types';
import { dateTime, impactValue } from './format';

const statusTabs = [
  { key: '', label: 'All Tasks & Cases' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'COMPLETED', label: 'Completed' },
];

const statusStyles: Record<
  BusinessTask['status'],
  { label: string; bg: string; text: string; border: string; icon: React.ElementType }
> = {
  OPEN: { label: 'Open', bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-[#004a80] dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', icon: Clock3 },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: PlayCircle },
  BLOCKED: { label: 'Blocked', bg: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: PauseCircle },
  COMPLETED: { label: 'Completed', bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-700', icon: AlertCircle },
};

export function TasksView() {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  const query = useTasks({
    status: (selectedStatus as BusinessTask['status']) || undefined,
    limit: 100,
  });

  const items = query.data?.items ?? [];
  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.module.toLowerCase().includes(q) ||
        (t.owner?.name && t.owner.name.toLowerCase().includes(q))
      );
    });
  }, [items, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  if (query.isLoading) return <LoadingState message="Loading business tasks & cases..." />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const counts = {
    total: items.length,
    open: items.filter((i) => i.status === 'OPEN').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    blocked: items.filter((i) => i.status === 'BLOCKED').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-5 font-manrope">
      <div className="flex justify-end">
        <Link href="/intelligence/cases" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#004a80] hover:text-[#004a80] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          View case investigations <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* Top Metrics Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase text-slate-400">Total Workflows & Cases</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{counts.total}</p>
        </div>
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 shadow-xs dark:border-blue-950 dark:bg-blue-950/20">
          <p className="text-[10px] font-bold uppercase text-[#004a80] dark:text-blue-400">Active Work (Open/Progress)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#004a80] dark:text-blue-300">{counts.open + counts.inProgress}</p>
        </div>
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-xs dark:border-rose-950 dark:bg-rose-950/20">
          <p className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">Blocked Tasks</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700 dark:text-rose-300">{counts.blocked}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-xs dark:border-emerald-950 dark:bg-emerald-950/20">
          <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Successfully Completed</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{counts.completed}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search tasks & cases by title, owner, or module..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#004a80] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Cards View"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {statusTabs.map((tab) => {
              const active = selectedStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    active
                      ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Task List / Table Rendering */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-900 dark:text-slate-100">{paginatedItems.length}</strong> of{' '}
              <strong className="text-slate-900 dark:text-slate-100">{filtered.length}</strong> workflows
            </span>
            <span className="text-[11px] font-medium">Click any item to open detail page & execute next steps</span>
          </div>

          {/* VIEW: Table */}
          {viewMode === 'table' && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">Task / Case File</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Target Impact</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedItems.map((task) => {
                      const stat = statusStyles[task.status] || statusStyles.OPEN;
                      const StatIcon = stat.icon;

                      return (
                        <tr
                          key={task.id}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${stat.bg} ${stat.text} ${stat.border}`}>
                              <StatIcon className="h-3 w-3" />
                              <span>{stat.label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">
                            {task.module}
                          </td>
                          <td className="py-3.5 px-4 min-w-[280px]">
                            <Link
                              href={`/intelligence/tasks/${task.id}`}
                              className="font-bold text-slate-900 hover:text-[#004a80] dark:text-white dark:hover:text-blue-400"
                            >
                              {task.title}
                            </Link>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {task.description}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {task.owner?.name ?? task.owner?.email ?? 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                            {dateTime(task.dueAt)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-[#004a80] dark:text-blue-400">
                            {task.expectedImpact ? impactValue(task.expectedImpact) : '—'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <Link
                              href={`/intelligence/tasks/${task.id}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#004a80] px-3 py-1 text-xs font-bold text-white hover:bg-[#003860] active:scale-98 dark:bg-blue-600 dark:hover:bg-blue-500"
                            >
                              <span>Next Steps</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: Cards */}
          {viewMode === 'cards' && (
            <div className="space-y-3">
              {paginatedItems.map((task) => {
                const stat = statusStyles[task.status] || statusStyles.OPEN;
                const StatIcon = stat.icon;

                return (
                  <div
                    key={task.id}
                    className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:border-[#004a80]/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${stat.bg} ${stat.text} ${stat.border}`}>
                            <StatIcon className="h-3.5 w-3.5" />
                            <span>{stat.label}</span>
                          </span>

                          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {task.module}
                          </span>

                          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                            {task.priority}
                          </span>
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#004a80] dark:group-hover:text-blue-400 transition-colors">
                          <Link href={`/intelligence/tasks/${task.id}`}>
                            {task.title}
                          </Link>
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <UserRound className="h-3.5 w-3.5 text-slate-400" />
                            Owner: <strong className="text-slate-800 dark:text-slate-200">{task.owner?.name ?? task.owner?.email ?? 'Unassigned'}</strong>
                          </span>

                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                            Due: <strong className="text-slate-800 dark:text-slate-200">{dateTime(task.dueAt)}</strong>
                          </span>

                          {task.expectedImpact && (
                            <span>
                              Target Impact: <strong className="text-[#004a80] dark:text-blue-400 font-bold">{impactValue(task.expectedImpact)}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <Link
                          href={`/intelligence/tasks/${task.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a80] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#003860] active:scale-98 dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          <span>Execute Next Steps</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 text-xs">
              <span className="text-slate-500">
                Page <strong className="text-slate-900 dark:text-white">{currentPage}</strong> of{' '}
                <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <ListTodo className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">No tasks match your filters</h3>
          <p className="mt-1 text-xs text-slate-500">
            Accepting an AI recommendation or dispatching an anomaly mitigation creates an execution workflow here.
          </p>
        </div>
      )}
    </div>
  );
}
