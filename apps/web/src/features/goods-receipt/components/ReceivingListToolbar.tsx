'use client';

import React, { useState } from 'react';
import { Calendar, ChevronDown, Clock, Filter, Layers, Search, AlertTriangle, RotateCcw } from 'lucide-react';

export type ReceivingTab = 'all' | 'expected-invoices' | 'discrepancies';
export type ReceivingFilterOption = { label: string; value: string };

export function ReceivingTabs({
  activeTab,
  total,
  discrepancyCount,
  onSelect,
}: {
  activeTab: ReceivingTab;
  total: number;
  discrepancyCount: number;
  onSelect: (tab: ReceivingTab) => void;
}) {
  const tabClass = (active: boolean, danger = false) =>
    `flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors ${
      active
        ? danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto 2xl:shrink-0">
      <button type="button" onClick={() => onSelect('all')} className={tabClass(activeTab === 'all')}>
        <Layers className="h-3.5 w-3.5" />
        <span>All Goods Receipts</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === 'all' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{total}</span>
      </button>
      <button type="button" onClick={() => onSelect('expected-invoices')} className={tabClass(activeTab === 'expected-invoices')}>
        <Clock className="h-3.5 w-3.5" />
        <span>Expected Invoices</span>
      </button>
      <button type="button" onClick={() => onSelect('discrepancies')} className={tabClass(activeTab === 'discrepancies', true)}>
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Discrepancy Hub</span>
        {discrepancyCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeTab === 'discrepancies' ? 'bg-destructive-foreground/20 text-destructive-foreground' : 'bg-destructive/15 text-destructive'}`}>{discrepancyCount}</span>}
      </button>
    </div>
  );
}

export function ReceivingListToolbar({
  navigation,
  search,
  onSearchChange,
  searchPlaceholder,
  filterValue,
  filterOptions,
  onFilterChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  dateFieldLabel,
  onReset,
}: {
  navigation: React.ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filterValue: string;
  filterOptions: ReceivingFilterOption[];
  onFilterChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  dateFieldLabel: string;
  onReset: () => void;
}) {
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const hasFilters = Boolean(search || filterValue || dateFrom || dateTo);

  return (
    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
      {navigation}
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center 2xl:w-auto 2xl:justify-end">
        <div className="relative w-full sm:w-[min(17rem,30vw)]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-xl border border-border/80 bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <div className="relative w-full sm:w-56">
          <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            className="h-10 w-full appearance-none rounded-xl border border-border/80 bg-background py-2 pl-10 pr-10 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/10"
          >
            {filterOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative w-full sm:w-40">
          <button
            type="button"
            onClick={() => setDateFilterOpen((open) => !open)}
            className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${dateFrom || dateTo ? 'border-primary bg-primary/5 text-primary' : 'border-border/80 bg-background text-foreground hover:border-primary/50'}`}
            aria-expanded={dateFilterOpen}
            aria-haspopup="dialog"
          >
            <Calendar className="h-4 w-4" />
            <span className="truncate">{dateFrom || dateTo ? `${dateFrom || 'Any'} – ${dateTo || 'Any'}` : 'Date Filter'}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          {dateFilterOpen && (
            <div role="dialog" aria-label={`Filter by ${dateFieldLabel}`} className="absolute right-0 z-40 mt-2 grid w-72 gap-3 rounded-xl border border-border bg-popover p-4 shadow-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Calendar className="h-4 w-4 text-primary" />{dateFieldLabel}</div>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => onDateFromChange(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground" /></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => onDateToChange(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground" /></label>
              {(dateFrom || dateTo) && <button type="button" onClick={() => { onDateFromChange(''); onDateToChange(''); }} className="text-left text-xs font-semibold text-primary hover:underline">Clear date range</button>}
            </div>
          )}
        </div>

        {hasFilters && <button type="button" onClick={onReset} className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"><RotateCcw className="h-3.5 w-3.5" />Reset</button>}
      </div>
    </div>
  );
}
