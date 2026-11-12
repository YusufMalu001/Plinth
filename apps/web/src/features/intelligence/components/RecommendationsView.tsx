'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Factory,
  Filter,
  Layers,
  LayoutGrid,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Table as TableIcon,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import { EmptyState } from '@plinth/ui';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { useRecommendations } from '../hooks';
import type { IntelligenceModule } from '../types';
import { RecommendationCard } from './RecommendationCard';
import { money, percent } from './format';

const moduleFilterOptions: { key: IntelligenceModule | ''; label: string; icon: React.ElementType }[] = [
  { key: '', label: 'All Domains', icon: Layers },
  { key: 'EXECUTIVE', label: 'Executive', icon: Sparkles },
  { key: 'SALES', label: 'Sales', icon: TrendingUp },
  { key: 'INVENTORY', label: 'Inventory', icon: Package },
  { key: 'PROCUREMENT', label: 'Procurement', icon: ShoppingCart },
  { key: 'PRODUCTION', label: 'Production', icon: Factory },
  { key: 'FULFILLMENT', label: 'Fulfillment', icon: Truck },
];

const statusFilterOptions = [
  { key: 'OPEN', label: 'Needs Review' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DEFERRED', label: 'Deferred' },
  { key: 'DISMISSED', label: 'Dismissed' },
  { key: '', label: 'All Records' },
];

export function RecommendationsView() {
  const [selectedModule, setSelectedModule] = useState<IntelligenceModule | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('OPEN');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  const params = {
    module: selectedModule || undefined,
    status: selectedStatus || undefined,
    limit: 100,
  };
  const query = useRecommendations(params);

  const filteredItems = useMemo(() => {
    const items = query.data?.items ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.situation.toLowerCase().includes(q) ||
        item.proposedActionCode.toLowerCase().includes(q) ||
        item.module.toLowerCase().includes(q)
    );
  }, [query.data?.items, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  return (
    <div className="space-y-6 font-manrope">
      {/* Filter & View Deck */}
      <div className="rounded-2xl border border-border/90 bg-surface p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-placeholder" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search recommendations by title, SKU, domain, or situation keywords…"
              className="h-10 w-full rounded-xl border border-border bg-muted pl-10 pr-10 text-xs font-semibold text-ink placeholder:text-ink-placeholder focus:border-accent-brand focus:bg-surface focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
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
            </div>

            {/* Status Filter Segmented Control */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-muted">
              {statusFilterOptions.map((st) => {
                const active = selectedStatus === st.key;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => {
                      setSelectedStatus(st.key);
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      active
                        ? 'bg-surface text-link shadow-xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Module Chips Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-border">
          <span className="text-[11px] font-bold text-ink-placeholder uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Domain:
          </span>
          {moduleFilterOptions.map((mod) => {
            const active = selectedModule === mod.key;
            const ModIcon = mod.icon;
            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => {
                  setSelectedModule(mod.key);
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? 'border-accent-brand bg-action text-inverse shadow-xs'
                    : 'border-border bg-muted text-ink-secondary hover:border-border-strong hover:bg-surface'
                }`}
              >
                <ModIcon className={`h-3.5 w-3.5 ${active ? 'text-inverse' : 'text-ink-placeholder'}`} />
                <span>{mod.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Rendering Viewport */}
      {query.isLoading ? (
        <LoadingState message="Loading certified recommendations…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : filteredItems.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs text-ink-muted">
            <span>
              Showing <strong className="text-ink">{paginatedItems.length}</strong> of{' '}
              <strong className="text-ink">{filteredItems.length}</strong> recommendations
            </span>
            <span className="text-[11px] font-medium">Click any recommendation to inspect details & take next steps</span>
          </div>

          {/* VIEW: Cards */}
          {viewMode === 'cards' && (
            <div className="space-y-3">
              {paginatedItems.map((item) => (
                <RecommendationCard key={item.id} recommendation={item} />
              ))}
            </div>
          )}

          {/* VIEW: Table */}
          {viewMode === 'table' && (
            <div className="overflow-hidden rounded-2xl border border-border/90 bg-surface shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/80 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">Recommendation</th>
                      <th className="py-3 px-4">Expected Impact</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedItems.map((rec) => {
                      const prioBadge =
                        rec.priority === 'CRITICAL'
                          ? 'bg-tone-red-bg text-tone-red-text border-tone-red-solid/25'
                          : rec.priority === 'HIGH'
                          ? 'bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25'
                          : 'bg-tone-blue-bg text-link border-tone-blue-solid/25';

                      const impactVal = rec.expectedImpact
                        ? rec.expectedImpact.currency
                          ? money(rec.expectedImpact.base, rec.expectedImpact.currency)
                          : `${rec.expectedImpact.base} ${rec.expectedImpact.unit || ''}`
                        : '—';

                      return (
                        <tr
                          key={rec.id}
                          className="transition-colors hover:bg-muted/80"
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${prioBadge}`}>
                              {rec.priority}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-ink-secondary">
                            {rec.module}
                          </td>
                          <td className="py-3.5 px-4 min-w-[280px]">
                            <Link
                              href={`/intelligence/recommendations/${rec.id}`}
                              className="font-bold text-ink hover:text-link-hover"
                            >
                              {rec.title}
                            </Link>
                            <p className="text-[11px] text-ink-muted line-clamp-1 mt-0.5">
                              {rec.situation}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-tone-green-text">
                            {impactVal}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-ink-secondary">
                            {percent(Number(rec.confidence) || 0)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-ink-secondary">
                              {rec.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <Link
                              href={`/intelligence/recommendations/${rec.id}`}
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
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 font-bold text-ink-secondary disabled:opacity-40 hover:bg-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
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
        <EmptyState
          className="min-h-[220px] rounded-2xl border border-border/90 bg-surface p-10"
          title="No recommendations match your filters"
          description="Try selecting a different domain or clearing search criteria. Only recommendations that pass certified ERP evidence validation are presented."
        />
      )}
    </div>
  );
}
