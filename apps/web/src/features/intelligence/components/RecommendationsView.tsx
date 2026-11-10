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
import { EmptyState } from '@synergy/ui';
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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search recommendations by title, SKU, domain, or situation keywords…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#004a80] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
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
            </div>

            {/* Status Filter Segmented Control */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
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
                        ? 'bg-white text-[#004a80] shadow-xs dark:bg-slate-900 dark:text-blue-300'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
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
                    ? 'border-[#004a80] bg-[#004a80] text-white shadow-xs dark:border-blue-500 dark:bg-blue-600'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <ModIcon className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
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
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-900 dark:text-slate-100">{paginatedItems.length}</strong> of{' '}
              <strong className="text-slate-900 dark:text-slate-100">{filteredItems.length}</strong> recommendations
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
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">Recommendation</th>
                      <th className="py-3 px-4">Expected Impact</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedItems.map((rec) => {
                      const prioBadge =
                        rec.priority === 'CRITICAL'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900'
                          : rec.priority === 'HIGH'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900'
                          : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900';

                      const impactVal = rec.expectedImpact
                        ? rec.expectedImpact.currency
                          ? money(rec.expectedImpact.base, rec.expectedImpact.currency)
                          : `${rec.expectedImpact.base} ${rec.expectedImpact.unit || ''}`
                        : '—';

                      return (
                        <tr
                          key={rec.id}
                          className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${prioBadge}`}>
                              {rec.priority}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-700 dark:text-slate-300">
                            {rec.module}
                          </td>
                          <td className="py-3.5 px-4 min-w-[280px]">
                            <Link
                              href={`/intelligence/recommendations/${rec.id}`}
                              className="font-bold text-slate-900 hover:text-[#004a80] dark:text-white dark:hover:text-blue-400"
                            >
                              {rec.title}
                            </Link>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {rec.situation}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold text-emerald-700 dark:text-emerald-400">
                            {impactVal}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-600 dark:text-slate-400">
                            {percent(Number(rec.confidence) || 0)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {rec.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <Link
                              href={`/intelligence/recommendations/${rec.id}`}
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
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
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
        <EmptyState
          className="min-h-[220px] rounded-2xl border border-slate-200/90 bg-white p-10 dark:border-slate-800 dark:bg-slate-900"
          title="No recommendations match your filters"
          description="Try selecting a different domain or clearing search criteria. Only recommendations that pass certified ERP evidence validation are presented."
        />
      )}
    </div>
  );
}
