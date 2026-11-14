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
  OPEN: { label: 'Open', bg: 'bg-tone-blue-bg', text: 'text-link', border: 'border-tone-blue-solid/25', icon: Clock3 },
  IN_PROGRESS: { label: 'In Progress', bg: 'bg-tone-amber-bg', text: 'text-tone-amber-text', border: 'border-tone-amber-solid/25', icon: PlayCircle },
  BLOCKED: { label: 'Blocked', bg: 'bg-tone-red-bg', text: 'text-tone-red-text', border: 'border-tone-red-solid/25', icon: PauseCircle },
  COMPLETED: { label: 'Completed', bg: 'bg-tone-green-bg', text: 'text-tone-green-text', border: 'border-tone-green-solid/25', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', bg: 'bg-muted', text: 'text-ink-secondary', border: 'border-border', icon: AlertCircle },
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
    <div className="space-y-5 font-sans">
      <div className="flex justify-end">
        <Link href="/intelligence/cases" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary hover:border-accent-brand hover:text-link-hover">
          View case investigations <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* Top Metrics Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/90 bg-surface p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-ink-placeholder">Total Workflows & Cases</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{counts.total}</p>
        </div>
        <div className="rounded-2xl border border-tone-blue-solid/25 bg-tone-blue-bg p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-link">Active Work (Open/Progress)</p>
          <p className="mt-1 text-2xl font-extrabold text-link">{counts.open + counts.inProgress}</p>
        </div>
        <div className="rounded-2xl border border-tone-red-solid/25 bg-tone-red-bg p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-tone-red-text">Blocked Tasks</p>
          <p className="mt-1 text-2xl font-extrabold text-tone-red-text">{counts.blocked}</p>
        </div>
        <div className="rounded-2xl border border-tone-green-solid/25 bg-tone-green-bg p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase text-tone-green-text">Successfully Completed</p>
          <p className="mt-1 text-2xl font-extrabold text-tone-green-text">{counts.completed}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-border/90 bg-surface p-4 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-placeholder" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search tasks & cases by title, owner, or module..."
            className="h-10 w-full rounded-xl border border-border bg-muted pl-10 pr-10 text-xs font-semibold text-ink placeholder:text-ink-placeholder focus:border-accent-brand focus:bg-surface focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-placeholder hover:text-ink-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-border bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-surface text-link shadow-xs'
                  : 'text-ink-secondary hover:text-ink'
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
                  ? 'bg-surface text-link shadow-xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
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
                      ? 'bg-surface text-link shadow-xs'
                      : 'text-ink-secondary hover:text-ink'
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
          <div className="flex items-center justify-between px-1 text-xs text-ink-muted">
            <span>
              Showing <strong className="text-ink">{paginatedItems.length}</strong> of{' '}
              <strong className="text-ink">{filtered.length}</strong> workflows
            </span>
            <span className="text-[11px] font-medium">Click any item to open detail page & execute next steps</span>
          </div>

          {/* VIEW: Table */}
          {viewMode === 'table' && (
            <div className="overflow-hidden rounded-2xl border border-border/90 bg-surface shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/80 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">Task / Case File</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Target Impact</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedItems.map((task) => {
                      const stat = statusStyles[task.status] || statusStyles.OPEN;
                      const StatIcon = stat.icon;

                      return (
                        <tr
                          key={task.id}
                          className="transition-colors hover:bg-muted/80"
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${stat.bg} ${stat.text} ${stat.border}`}>
                              <StatIcon className="h-3 w-3" />
                              <span>{stat.label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-ink-secondary">
                            {task.module}
                          </td>
                          <td className="py-3.5 px-4 min-w-[280px]">
                            <Link
                              href={`/intelligence/tasks/${task.id}`}
                              className="font-bold text-ink hover:text-link-hover"
                            >
                              {task.title}
                            </Link>
                            <p className="text-[11px] text-ink-muted line-clamp-1 mt-0.5">
                              {task.description}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-ink-secondary">
                            {task.owner?.name ?? task.owner?.email ?? 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-ink-secondary">
                            {dateTime(task.dueAt)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-link">
                            {task.expectedImpact ? impactValue(task.expectedImpact) : '—'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <Link
                              href={`/intelligence/tasks/${task.id}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-action px-3 py-1 text-xs font-bold text-inverse hover:bg-[color:var(--action-primary-bg-hover)] active:scale-98"
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
                    className="group rounded-2xl border border-border/90 bg-surface p-5 shadow-xs transition-all duration-200 hover:border-accent-brand"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${stat.bg} ${stat.text} ${stat.border}`}>
                            <StatIcon className="h-3.5 w-3.5" />
                            <span>{stat.label}</span>
                          </span>

                          <span className="inline-flex items-center rounded-lg border border-border bg-muted px-2 py-0.5 text-xs font-bold text-ink-secondary">
                            {task.module}
                          </span>

                          <span className="inline-flex items-center rounded-lg border border-border bg-muted px-2 py-0.5 text-xs font-medium text-ink-secondary">
                            {task.priority}
                          </span>
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-ink group-hover:text-link-hover transition-colors">
                          <Link href={`/intelligence/tasks/${task.id}`}>
                            {task.title}
                          </Link>
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <UserRound className="h-3.5 w-3.5 text-ink-placeholder" />
                            Owner: <strong className="text-ink">{task.owner?.name ?? task.owner?.email ?? 'Unassigned'}</strong>
                          </span>

                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <CalendarClock className="h-3.5 w-3.5 text-ink-placeholder" />
                            Due: <strong className="text-ink">{dateTime(task.dueAt)}</strong>
                          </span>

                          {task.expectedImpact && (
                            <span>
                              Target Impact: <strong className="text-link font-bold">{impactValue(task.expectedImpact)}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <Link
                          href={`/intelligence/tasks/${task.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-action px-4 py-2 text-xs font-bold text-inverse shadow-xs transition-all hover:bg-[color:var(--action-primary-bg-hover)] active:scale-98"
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
            <div className="flex items-center justify-between rounded-xl border border-border/90 bg-surface p-3.5 shadow-2xs text-xs">
              <span className="text-ink-muted">
                Page <strong className="text-ink">{currentPage}</strong> of{' '}
                <strong className="text-ink">{totalPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 font-bold text-ink-secondary disabled:opacity-40 hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 font-bold text-ink-secondary disabled:opacity-40 hover:bg-muted"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/90 bg-surface p-12 text-center shadow-xs">
          <ListTodo className="mx-auto h-8 w-8 text-ink-placeholder" />
          <h3 className="mt-3 text-sm font-bold text-ink">No tasks match your filters</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Accepting an AI recommendation or dispatching an anomaly mitigation creates an execution workflow here.
          </p>
        </div>
      )}
    </div>
  );
}
