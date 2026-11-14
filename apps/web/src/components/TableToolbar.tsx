'use client';

import { Filter, Search, ArrowUpDown } from 'lucide-react';
import { Input } from '@plinth/ui';
import { FilterPills } from './FilterPills';

export interface ToolbarOption { label: string; value: string }

export function TableToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  sort,
  onSort,
  sortOptions = [],
  filter,
  onFilter,
  filterOptions = [],
  filterVariant = 'pills',
  filterLabel = 'Filter:',
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  sort?: string;
  onSort?: (value: string) => void;
  sortOptions?: ToolbarOption[];
  filter?: string;
  onFilter?: (value: string) => void;
  filterOptions?: ToolbarOption[];
  filterVariant?: 'pills' | 'dropdown';
  filterLabel?: string;
}) {
  const allFilterOptions = filterOptions.length > 0 ? [{ label: 'All', value: '' }, ...filterOptions] : [];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      {onSearch && (
        <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Input
            icon={Search}
            aria-label={searchPlaceholder}
            value={search || ''}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border-border/80 bg-background text-xs text-foreground focus-visible:ring-1 focus-visible:ring-primary shadow-none"
          />
        </div>
      )}
      {onFilter && filterOptions.length > 0 && (
        filterVariant === 'dropdown' ? (
          <div className="relative inline-flex items-center">
            <select
              aria-label={filterLabel}
              value={filter || ''}
              onChange={(e) => onFilter(e.target.value)}
              className="h-9 rounded-lg border border-border/80 bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-none"
            >
              {allFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label === 'All' ? 'All Statuses' : opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <FilterPills
            icon={Filter}
            label={filterLabel}
            options={allFilterOptions}
            value={filter || ''}
            onChange={onFilter}
            size="sm"
          />
        )
      )}
      {onSort && sortOptions.length > 0 && (
        <FilterPills
          icon={ArrowUpDown}
          label="Sort:"
          options={sortOptions}
          value={sort || ''}
          onChange={onSort}
          size="sm"
        />
      )}
    </div>
  );
}
