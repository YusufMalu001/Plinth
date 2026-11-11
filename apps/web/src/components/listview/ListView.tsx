'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw, MoreHorizontal, Plus, Heart, ChevronDown,
  MessageSquare, X, ArrowUp, ArrowDown, Trash2, Download,
  UserPlus, Tag, Menu, Search, Filter,
} from 'lucide-react';
import { Checkbox } from '@plinth/ui';
import { cn } from '@plinth/ui';
import { EmptyState } from '../EmptyState';
import { LoadingState } from '../LoadingState';
import { ErrorState } from '../ErrorState';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ListViewColumnAlign = 'left' | 'right' | 'center';

export interface ListViewColumn<T> {
  /** Rendered as a text input in the standard filter row when `filterable` is true. */
  key: string;
  label: string;
  align?: ListViewColumnAlign;
  /** Money column: right-aligned + tabular numerals. */
  money?: boolean;
  /** 0..1 fraction — renders the 6px green progress bar. */
  percent?: (row: T) => number | null;
  cell: (row: T) => React.ReactNode;
  /** Raw string used for the filter input comparison & sorting. */
  raw?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  truncatable?: boolean;
}

export interface ListViewFilterConfig {
  key: string;
  label: string;
  type: 'text' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ListViewSavedFilter {
  id: string;
  name: string;
  state: string;
}

export interface ListViewMeta<T> {
  /** Relative "time since last seen" label, e.g. "8 M" / "1 y". */
  updated: (row: T) => string;
  comments: (row: T) => number;
  liked?: (row: T) => boolean;
  onToggleLike?: (row: T) => void;
}

export interface ListViewProps<T extends { id: string }> {
  title: string;
  /** e.g. "Purchase Order" — used by the view switcher and "+ Add" button. */
  documentName: string;
  columns: ListViewColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onKeyDownRow?: (row: T, event: React.KeyboardEvent) => void;
  onRowClick?: (row: T) => void;
  /** Enable row selection + bulk actions bar. */
  selectable?: boolean;
  // Server-side filter state passthroughs
  filters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  filterConfigs?: ListViewFilterConfig[];
  /** Bulk clear handler shown next to the Filter button. */
  activeFilterCount?: number;
  onClearFilters?: () => void;
  sort?: { field: string; direction: 'asc' | 'desc' };
  onSortChange?: (field: string, direction: 'asc' | 'desc') => void;
  // Toolbar
  onRefresh?: () => void;
  onAdd?: () => void;
  onViewChange?: (view: string) => void;
  viewOptions?: string[];
  bulkActions?: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    danger?: boolean;
    onRun: (selectedRows: T[]) => void | Promise<void>;
  }[];
  savedFilterStorageKey?: string;
  meta?: ListViewMeta<T>;
  // Pagination (server-driven)
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  // row delete/edit affordances
  rowActions?: (row: T) => React.ReactNode;
  /** Escape hatch for page-level dialogs (e.g. delete confirmation). */
  children?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const VIEW_DEFAULTS = ['List View', 'Report'];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function ListView<T extends { id: string }>({
  title,
  documentName,
  columns,
  rows,
  loading,
  error,
  onRetry,
  onRowClick,
  onKeyDownRow,
  selectable = true,
  filters = {},
  onFilterChange,
  filterConfigs = [],
  activeFilterCount = 0,
  onClearFilters,
  sort,
  onSortChange,
  onRefresh,
  onAdd,
  onViewChange,
  viewOptions = VIEW_DEFAULTS,
  bulkActions,
  savedFilterStorageKey,
  meta,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  onPageSizeChange,
  rowActions,
  children,
}: ListViewProps<T>) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [currentView, setCurrentView] = useState('List View');

  // Saved filters (localStorage-backed; addendum #9 applies to renamed keys)
  const [savedFilters, setSavedFilters] = useState<ListViewSavedFilter[]>([]);
  const [savedHidden, setSavedHidden] = useState(false);
  const [filterNameDraft, setFilterNameDraft] = useState('');

  useEffect(() => {
    if (!savedFilterStorageKey) return;
    try {
      const raw = window.localStorage.getItem(savedFilterStorageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedFilters(parsed as ListViewSavedFilter[]);
      }
    } catch {
      // storage unavailable — saved filters start empty
    }
  }, [savedFilterStorageKey]);

  const persistSaved = (next: ListViewSavedFilter[]) => {
    setSavedFilters(next);
    if (!savedFilterStorageKey) return;
    try {
      window.localStorage.setItem(savedFilterStorageKey, JSON.stringify(next));
    } catch {
      // keep in-memory only
    }
  };

  const saveCurrentFilter = () => {
    const name = filterNameDraft.trim();
    if (!name) return;
    persistSaved([
      ...savedFilters,
      { id: `${Date.now()}`, name, state: JSON.stringify({ filters, sort }) },
    ]);
    setFilterNameDraft('');
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);

  const visibleRows = rows;
  const displayTotal = total !== undefined ? total : rows.length;
  const firstIndex = (page - 1) * pageSize;
  const lastIndex = Math.min(firstIndex + rows.length, displayTotal);
  const pageCount = Math.max(1, Math.ceil((displayTotal || 1) / pageSize));

  const toggleRow = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const tableRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleKeyDown = (event: React.KeyboardEvent, row: T) => {
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      const list = visibleRows;
      const currentIndex = list.findIndex((candidate) => candidate.id === row.id);
      const targetIndex = event.key === 'j' ? currentIndex + 1 : currentIndex - 1;
      const target = list[targetIndex];
      if (target) rowRefs.current[target.id]?.focus();
    } else if (event.key === ' ' && selectable) {
      event.preventDefault();
      toggleRow(row.id);
    }
    onKeyDownRow?.(row, event);
  };

  const idColumn = columns[0];

  return (
    <div className="flex-1 w-full bg-page text-ink">
      {/* ---------------------------------------------------------------- */}
      {/* Page header                                                       */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="Toggle filter sidebar"
              onClick={() => setSidebarOpen((open) => !open)}
              className="h-9 w-9 rounded-control border border-border inline-flex items-center justify-center hover:bg-surface-muted"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink truncate">{title}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View switcher */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={viewOpen}
              onClick={() => setViewOpen((open) => !open)}
              className="h-9 rounded-control bg-surface-muted px-3 text-sm font-medium text-ink inline-flex items-center gap-1.5 hover:bg-hover"
            >
              <span>{currentView}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {viewOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-40 rounded-card border border-border bg-page py-1 shadow-popover z-50"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {viewOptions.map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCurrentView(view);
                      setViewOpen(false);
                      onViewChange?.(view);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-hover"
                  >
                    {view}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Refresh list"
            onClick={onRefresh}
            className="h-9 w-9 rounded-control bg-surface-muted inline-flex items-center justify-center hover:bg-hover"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Overflow menu */}
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((open) => !open)}
              className="h-9 w-9 rounded-control bg-surface-muted inline-flex items-center justify-center hover:bg-hover"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-44 rounded-card border border-border bg-page py-1 shadow-popover z-50"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-hover"
                  onClick={() => setOverflowOpen(false)}
                >
                  Import
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-hover"
                  onClick={() => setOverflowOpen(false)}
                >
                  Export
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-hover"
                  onClick={() => setOverflowOpen(false)}
                >
                  Column settings
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onAdd}
            className="h-9 rounded-control px-3.5 text-sm font-semibold text-white inline-flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--action-primary-bg)' }}
            onMouseOver={(event) => (event.currentTarget.style.backgroundColor = 'var(--action-primary-bg-hover)')}
            onMouseOut={(event) => (event.currentTarget.style.backgroundColor = 'var(--action-primary-bg)')}
          >
            <Plus className="h-4 w-4" />
            <span>+ Add {documentName}</span>
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Body: filter sidebar + card                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-stretch gap-4 px-4 sm:px-6 lg:px-8 pb-6">
        {/* Filter sidebar */}
        <aside
          className={cn(
            'w-60 shrink-0 border-r border-border pr-4 py-2 space-y-6',
            sidebarOpen ? 'hidden lg:block' : 'hidden',
            'max-lg:absolute max-lg:left-0 max-lg:top-16 max-lg:bottom-0 max-lg:z-30 max-lg:bg-page max-lg:border-r-0',
            sidebarOpen && 'max-lg:block'
          )}
          aria-label="Filters"
        >
          <section>
            <h2 className="text-sm font-semibold text-ink mb-3">Filter By</h2>
            <div className="space-y-2.5">
              {filterConfigs.map((config) => (
                <div key={config.key}>
                  <label htmlFor={`filter-${config.key}`} className="text-xs text-ink-secondary block mb-1">
                    {config.label}
                  </label>
                  {config.type === 'select' ? (
                    <select
                      id={`filter-${config.key}`}
                      value={filters[config.key] ?? ''}
                      onChange={(event) => onFilterChange?.(config.key, event.target.value)}
                      className="h-9 w-full rounded-control bg-surface-muted px-2.5 text-sm text-ink outline-none cursor-pointer"
                    >
                      <option value="">All</option>
                      {config.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`filter-${config.key}`}
                      type="text"
                      placeholder={config.placeholder}
                      value={filters[config.key] ?? ''}
                      onChange={(event) => onFilterChange?.(config.key, event.target.value)}
                      className="h-9 w-full rounded-control bg-surface-muted px-2.5 text-sm text-ink outline-none"
                    />
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="mt-3 text-xs font-medium text-ink-secondary hover:text-ink">
              Edit Filters
            </button>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink mb-2">Save Filter</h2>
            <input
              type="text"
              placeholder="Filter Name"
              value={filterNameDraft}
              onChange={(event) => setFilterNameDraft(event.target.value)}
              className="h-9 w-full rounded-control bg-surface-muted px-2.5 text-sm text-ink outline-none"
            />
            <button
              type="button"
              onClick={saveCurrentFilter}
              disabled={!filterNameDraft.trim()}
              className="mt-2 h-8 w-full rounded-control bg-action text-white text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--action-primary-bg)' }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSavedHidden((hidden) => !hidden)}
              className="mt-3 text-xs font-medium text-ink-secondary hover:text-ink"
            >
              {savedHidden ? 'Show Saved' : 'Hide Saved'}
            </button>
            {!savedHidden && (
              <div className="mt-2 space-y-1.5">
                {savedFilters.map((saved) => (
                  <span
                    key={saved.id}
                    className="inline-flex items-center gap-1 rounded-pill bg-surface-muted px-2 py-0.5 text-xs text-ink"
                  >
                    <button
                      type="button"
                      onClick={() => setFiltersFromString(saved.state, onFilterChange)}
                      className="hover:text-ink max-w-24 truncate"
                    >
                      {saved.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove saved filter ${saved.name}`}
                      onClick={() => persistSaved(savedFilters.filter((candidate) => candidate.id !== saved.id))}
                      className="text-ink-muted hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* Main content card */}
        <div className="flex-1 min-w-0">
          <div className="rounded-card border border-border bg-page overflow-hidden">
            {/* Standard filter row */}
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
              <div className="relative flex-1 min-w-40 max-w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
                <input
                  type="text"
                  aria-label={`Search ${documentName}`}
                  value={filters[columns[0]?.key ?? 'id'] ?? ''}
                  onChange={(event) => onFilterChange?.(idColumn?.key ?? 'id', event.target.value)}
                  placeholder={idColumn?.label ?? 'ID'}
                  className="h-9 w-full rounded-control bg-surface-muted pl-8 pr-7 text-sm text-ink outline-none"
                />
                {(filters[idColumn?.key ?? 'id'] ?? '') !== '' && (
                  <button
                    type="button"
                    aria-label="Clear ID filter"
                    onClick={() => onFilterChange?.(idColumn?.key ?? 'id', '')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {columns
                .filter((column) => column.key !== (idColumn?.key ?? 'id'))
                .slice(0, 4)
                .map((column) => (
                  <input
                    key={column.key}
                    type="text"
                    aria-label={`Filter by ${column.label}`}
                    placeholder={column.label}
                    value={filters[column.key] ?? ''}
                    onChange={(event) => onFilterChange?.(column.key, event.target.value)}
                    className="h-9 w-28 min-w-24 rounded-control bg-surface-muted px-2.5 text-sm text-ink outline-none"
                  />
                ))}

              {/* Status select (fixed slot per spec) */}
              <select
                aria-label="Filter by status"
                value={filters.status ?? ''}
                onChange={(event) => onFilterChange?.('status', event.target.value)}
                className="h-9 rounded-control bg-surface-muted px-2.5 text-sm text-ink outline-none cursor-pointer"
              >
                <option value="">Status</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <div className="ml-auto flex items-center gap-2">
                <FilterButton count={activeFilterCount} onClear={onClearFilters} />
                {/* Sort control */}
                <div className="flex items-center rounded-control bg-surface-muted" aria-label="Sort">
                  <button
                    type="button"
                    aria-label={`Toggle sort direction (currently ${sort?.direction ?? 'desc'})`}
                    onClick={() =>
                      onSortChange?.(sort?.field ?? 'updatedAt', sort?.direction === 'asc' ? 'desc' : 'asc')
                    }
                    className="h-9 px-2.5 inline-flex items-center text-ink hover:bg-hover rounded-l-control"
                  >
                    {sort?.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                  </button>
                  <select
                    aria-label="Sort field"
                    value={sort?.field ?? 'updatedAt'}
                    onChange={(event) => {
                      onSortChange?.(event.target.value, sort?.direction ?? 'desc');
                    }}
                    className="h-9 min-w-36 rounded-r-control bg-surface-muted px-2 text-sm text-ink outline-none cursor-pointer"
                  >
                    <option value="updatedAt">Last Updated On</option>
                    {columns.filter((column) => column.sortable !== false).map((column) => (
                      <option key={column.key} value={column.key}>{column.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk action bar replaces the filter row while rows are selected */}
            {selectable && selectedRows.length > 0 && bulkActions && bulkActions.length > 0 && (
              <div className="flex items-center gap-2 border-b border-border p-3" role="toolbar" aria-label="Bulk actions">
                <ActionButton
                  icon={UserPlus}
                  label="Assign To"
                  onClick={() => bulkActions.find((action) => action.label === 'Assign To')?.onRun(selectedRows)}
                />
                <ActionButton
                  icon={Tag}
                  label="Add Tags"
                  onClick={() => bulkActions.find((action) => action.label === 'Add Tags')?.onRun(selectedRows)}
                />
                <ActionButton
                  icon={Download}
                  label="Export"
                  onClick={() => bulkActions.find((action) => action.label === 'Export')?.onRun(selectedRows)}
                />
                <ActionButton
                  icon={Trash2}
                  label="Delete"
                  danger
                  onClick={() => bulkActions.find((action) => action.label === 'Delete')?.onRun(selectedRows)}
                />
                <button
                  type="button"
                  className="ml-auto text-sm text-ink-secondary hover:text-ink"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear ({selectedRows.length})
                </button>
              </div>
            )}

            {/* Table */}
            <div ref={tableRef} className="overflow-x-auto">
              {loading ? (
                <LoadingState message={`Loading ${documentName.toLowerCase()}s…`} />
              ) : error ? (
                <ErrorState error={error as Error} retry={onRetry} />
              ) : (
                <>
                  {/* Rounded grey header bar */}
                  <div className="m-2 mb-0 flex items-center gap-3 rounded-control bg-surface-muted px-3 h-10">
                    {selectable && (
                      <Checkbox
                        aria-label="Select all"
                        checked={allSelected}
                        onChange={(event) => setSelectedIds(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
                      />
                    )}
                    {columns.map((column, index) => (
                      <span
                        key={column.key}
                        className={cn(
                          'text-xs font-medium text-ink-secondary truncate',
                          index === 0 && 'flex-1 min-w-0',
                          index !== 0 && 'w-40 shrink-0',
                          column.money && 'w-36 text-right',
                          column.percent && 'w-44',
                          column.align === 'center' && 'text-center'
                        )}
                      >
                        {column.label}
                      </span>
                    ))}
                    {meta && (
                      <span className="w-28 shrink-0 text-right text-xs text-ink-secondary">Last Updated</span>
                    )}
                    {rowActions && <span className="w-20 shrink-0" />}
                    <span className="ml-auto text-xs text-ink-secondary whitespace-nowrap">
                      {rows.length} of {displayTotal}
                    </span>
                    <button type="button" aria-label="Favourite filter" className="text-ink-muted hover:text-ink">
                      <Heart className="h-4 w-4" />
                    </button>
                  </div>

                  {visibleRows.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        title={`No ${documentName}s Found`}
                        description={activeFilterCount > 0 ? 'Try adjusting or clearing your filters.' : undefined}
                      />
                    </div>
                  ) : (
                    <ul role="list" className="px-2 pb-2">
                      {visibleRows.map((row) => (
                        <li key={row.id}>
                          <div
                            ref={(node) => { rowRefs.current[row.id] = node as HTMLElement | null; }}
                            role={onRowClick ? 'link' : 'listitem'}
                            tabIndex={onRowClick ? 0 : undefined}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            onKeyDown={onRowClick ? (event) => {
                              const target = event.target as HTMLElement;
                              if (['INPUT', 'SELECT', 'BUTTON', 'A'].includes(target.tagName) && event.key === 'Enter') return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onRowClick(row);
                              }
                              handleKeyDown(event, row);
                            } : undefined}
                            className="group flex items-center gap-3 border-b border-border hover:bg-hover focus-visible:bg-hover focus-visible:outline-none cursor-pointer px-3"
                            style={{ height: 'var(--row-height)' }}
                          >
                            {selectable && (
                              <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  aria-label={`Select row ${row.id}`}
                                  checked={selectedIds.has(row.id)}
                                  onChange={() => toggleRow(row.id)}
                                />
                              </span>
                            )}
                            {columns.map((column, index) => (
                              <span
                                key={column.key}
                                className={cn(
                                  'text-[13px] text-ink min-w-0 truncate',
                                  index === 0 && 'flex-1 font-semibold',
                                  index !== 0 && 'w-40 shrink-0',
                                  column.money && 'w-36 text-right font-mono tabular-nums',
                                  column.percent && 'w-44',
                                  column.align === 'center' && 'text-center'
                                )}
                              >
                                {column.percent ? (
                                  <PercentBar value={column.percent(row)} />
                                ) : (
                                  column.cell(row)
                                )}
                              </span>
                            ))}
                            {meta && (
                              <span className="w-28 shrink-0 flex items-center justify-end gap-2 text-xs text-ink-muted whitespace-nowrap">
                                <span title="Last updated">{meta.updated(row)}</span>
                                <span className="inline-flex items-center gap-0.5" aria-label="Comments">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  {meta.comments(row)}
                                </span>
                                <button
                                  type="button"
                                  aria-label="Like"
                                  aria-pressed={meta.liked?.(row) ?? false}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    meta.onToggleLike?.(row);
                                  }}
                                  className="text-ink-muted hover:text-ink"
                                >
                                  <Heart
                                    className={cn('h-4 w-4', meta.liked?.(row) && 'fill-current')}
                                    style={meta.liked?.(row) ? { color: 'var(--tone-red-solid)' } : undefined}
                                  />
                                </button>
                              </span>
                            )}
                            {rowActions && (
                              <span className="w-20 shrink-0 flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
                                {rowActions(row)}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Footer: load more / page size */}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <span aria-live="polite">
                  {displayTotal > 0 ? `${firstIndex + 1}–${lastIndex}` : '0'} of {displayTotal}
                </span>
                <button
                  type="button"
                  className="h-8 rounded-control border border-border px-2.5 text-xs text-ink hover:bg-surface-muted disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => onPageChange?.(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="h-8 rounded-control border border-border px-2.5 text-xs text-ink hover:bg-surface-muted disabled:opacity-40"
                  disabled={page >= pageCount}
                  onClick={() => onPageChange?.(page + 1)}
                >
                  Load more
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <label htmlFor="listview-page-size">Page size</label>
                <select
                  id="listview-page-size"
                  value={pageSize}
                  onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
                  className="h-8 rounded-control bg-surface-muted px-2 text-xs text-ink outline-none cursor-pointer"
                >
                  {[20, 100, 500].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global search overlay hook (Ctrl/Cmd+K wired app-wide elsewhere) */}
      {searchOverlayOpen && (
        <SearchOverlay open onClose={() => setSearchOverlayOpen(false)} />
      )}

      {children}
    </div>
  );

  function setFiltersFromString(state: string, apply: ((key: string, value: string) => void) | undefined) {
    try {
      const parsed = JSON.parse(state) as { filters?: Record<string, string> };
      Object.entries(parsed.filters ?? {}).forEach(([key, value]) => apply?.(key, value));
    } catch {
      // ignore malformed saved state
    }
  }
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

/** "Filter" button with active-filter count and inline clear (x). */
function FilterButton({ count, onClear }: { count: number; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-9 rounded-control bg-surface-muted px-3 text-sm font-medium text-ink inline-flex items-center gap-1.5 hover:bg-hover"
      >
        <Filter className="h-4 w-4" />
        <span>Filter</span>
        {count > 0 && (
          <span className="rounded-pill px-1.5 text-xs font-semibold" style={{ backgroundColor: 'var(--tone-blue-bg)', color: 'var(--tone-blue-text)' }}>
            {count}
          </span>
        )}
        {count > 0 && (
          <button
            type="button"
            aria-label="Clear all filters"
            onClick={(event) => {
              event.stopPropagation();
              onClear?.();
            }}
            className="text-ink-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filter options"
          className="absolute right-0 mt-1.5 w-64 rounded-card border border-border bg-page p-3 shadow-popover z-50"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Filter options</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-secondary">
            {count} active filter{count === 1 ? '' : 's'} — use the sidebar and row filters to narrow this list.
          </p>
          {count > 0 && onClear && (
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="mt-3 h-8 w-full rounded-control border border-border text-sm text-ink hover:bg-surface-muted"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Thin 6px rounded progress bar: track muted, fill green solid. */
function PercentBar({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) return <span className="text-ink-muted">—</span>;
  const clamped = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <span className="flex items-center gap-2" title={`${clamped}%`}>
      <span className="h-[6px] w-16 rounded-pill bg-surface-muted overflow-hidden inline-block">
        <span
          className="block h-full rounded-pill"
          style={{ width: `${clamped}%`, backgroundColor: 'var(--tone-green-solid)' }}
        />
      </span>
      <span className="tabular-nums text-xs text-ink-secondary">{clamped}%</span>
    </span>
  );
}

function ActionButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 rounded-control bg-surface-muted px-3 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-hover',
        danger && 'text-ink'
      )}
      style={danger ? { color: 'var(--tone-red-text)' } : undefined}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-24"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-card border border-border bg-page p-3 shadow-popover"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-ink-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search documents…"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
    </div>
  );
}
