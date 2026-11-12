'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Check,
  Package,
  Building2,
  Layers,
  AlertCircle,
  X,
  ChevronRight,
  ReceiptText,
  Factory,
  ShoppingBag
} from 'lucide-react';

export interface PoOption {
  id: string;
  number: string;
  vendor: string;
  vendorCode?: string;
  status?: string;
  lineCount?: number;
  currency?: string;
  totalAmount?: number;
  createdAt?: string;
  isOutsourced?: boolean;
  orderType?: 'PO' | 'JOB_WORK';
  jobWorkOrderId?: string;
  natureOfProcessing?: string;
}

interface PoSearchSelectorProps {
  options: PoOption[];
  selectedPoId: string;
  onSelect: (poId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  listClassName?: string;
}

export function PoSearchSelector({
  options,
  selectedPoId,
  onSelect,
  disabled = false,
  isLoading = false,
  className,
  listClassName,
}: PoSearchSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'PO' | 'JOB_WORK'>('ALL');

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === selectedPoId) || null,
    [options, selectedPoId]
  );

  const poCount = useMemo(
    () => options.filter((o) => !o.isOutsourced && o.orderType !== 'JOB_WORK').length,
    [options]
  );
  const jwCount = useMemo(
    () => options.filter((o) => o.isOutsourced || o.orderType === 'JOB_WORK').length,
    [options]
  );

  const filteredOptions = useMemo(() => {
    let list = options;
    if (filterType === 'PO') {
      list = list.filter((opt) => !opt.isOutsourced && opt.orderType !== 'JOB_WORK');
    } else if (filterType === 'JOB_WORK') {
      list = list.filter((opt) => opt.isOutsourced || opt.orderType === 'JOB_WORK');
    }

    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter(
      (opt) =>
        opt.number.toLowerCase().includes(query) ||
        opt.vendor.toLowerCase().includes(query) ||
        (opt.vendorCode && opt.vendorCode.toLowerCase().includes(query)) ||
        (opt.currency && opt.currency.toLowerCase().includes(query)) ||
        (opt.status && opt.status.toLowerCase().includes(query)) ||
        (opt.natureOfProcessing && opt.natureOfProcessing.toLowerCase().includes(query))
    );
  }, [options, searchQuery, filterType]);

  const handleSelectOption = (poId: string) => {
    if (disabled) return;
    onSelect(poId);
  };

  return (
    <div className={`space-y-3 flex flex-col ${className || ''}`}>
      {/* Order Type Toggle Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/50 border border-border">
        <button
          type="button"
          onClick={() => setFilterType('ALL')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            filterType === 'ALL'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>All Orders</span>
          <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
            {options.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilterType('PO')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            filterType === 'PO'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5 text-tone-blue-text" />
          <span>Purchase Orders</span>
          <span className="rounded-full bg-tone-blue-bg text-tone-blue-text px-1.5 py-0.2 text-[10px] font-mono">
            {poCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFilterType('JOB_WORK')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            filterType === 'JOB_WORK'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Factory className="h-3.5 w-3.5 text-tone-purple-text" />
          <span>Job Work</span>
          <span className="rounded-full bg-tone-purple-bg text-tone-purple-text px-1.5 py-0.2 text-[10px] font-mono">
            {jwCount}
          </span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground/70" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search by PO number (e.g. PO-2026-001), JWO #, vendor name, or nature of processing…"
          className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-9 text-xs font-semibold text-foreground placeholder:text-muted-foreground/60 outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-muted/40 disabled:opacity-60 shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search input"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Orders Count & Toggle Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="font-semibold text-foreground">
            {isLoading
              ? 'Loading receivable orders…'
              : `${filteredOptions.length} receivable ${filteredOptions.length === 1 ? 'order' : 'orders'} available`}
          </span>
        </div>
        {selectedOption && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="font-semibold text-primary hover:underline transition-colors cursor-pointer"
          >
            {isExpanded ? 'Collapse list' : 'Browse other orders'}
          </button>
        )}
      </div>

      {/* Interactive Orders List View */}
      {isExpanded && (
        <div className={`space-y-2.5 overflow-y-auto pr-1 flex-1 ${listClassName || 'min-h-[380px] max-h-[720px]'}`}>
          {isLoading ? (
            <div className="space-y-2 py-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl border border-border/60 bg-muted/30 p-4"
                />
              ))}
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-border border-dashed border-border/80 bg-muted/20 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border text-muted-foreground">
                <AlertCircle className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-bold text-foreground">
                {searchQuery ? 'No orders match your search' : 'No receivable orders found'}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Clear search filters
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground max-w-xs">
                  Approved orders with open quantities will appear here once issued.
                </p>
              )}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.id === selectedPoId;
              const isJw = opt.isOutsourced || opt.orderType === 'JOB_WORK';

              return (
                <div
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectOption(opt.id);
                    }
                  }}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-all duration-150 ${
                    disabled
                      ? 'cursor-not-allowed opacity-60'
                      : isSelected
                        ? 'border-primary/60 bg-primary/[0.04] shadow-xs ring-2 ring-primary/20'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : isJw
                            ? 'bg-tone-purple-bg text-tone-purple-text border border-tone-purple-solid/25 group-hover:bg-tone-purple-bg'
                            : 'bg-muted/70 text-muted-foreground border border-border group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/20'
                      }`}
                    >
                      {isJw ? <Factory className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {opt.number}
                        </span>
                        {opt.status && (
                          <span className="rounded-md bg-tone-green-bg px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-tone-green-text border border-tone-green-solid/25">
                            {opt.status.replaceAll('_', ' ')}
                          </span>
                        )}
                        {isJw && (
                          <span className="rounded-md bg-tone-purple-bg px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-tone-purple-text border border-tone-purple-solid/25">
                            Job Work
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-semibold text-foreground truncate max-w-[200px]">
                          <Building2 className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                          <span className="truncate">{opt.vendor}</span>
                        </span>
                        {opt.vendorCode && (
                          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground border border-border/50">
                            {opt.vendorCode}
                          </span>
                        )}
                        {opt.natureOfProcessing && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px] font-medium">
                            · {opt.natureOfProcessing}
                          </span>
                        )}
                        {opt.lineCount !== undefined && (
                          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                            <Layers className="h-3 w-3 text-muted-foreground/70" />
                            {opt.lineCount} {opt.lineCount === 1 ? 'line' : 'lines'}
                          </span>
                        )}
                        {opt.totalAmount !== undefined && (
                          <span className="font-mono font-bold text-foreground flex items-center gap-0.5">
                            <ReceiptText className="h-3 w-3 text-muted-foreground/70" />
                            {opt.currency || 'INR'} {Number(opt.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center pl-2">
                    {isSelected ? (
                      <span className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-xs">
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Selected</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground transition group-hover:border-primary/40 group-hover:text-primary">
                        <span>Select</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
