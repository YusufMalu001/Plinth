'use client';

import { Filter, Search, ArrowUpDown } from 'lucide-react';
import { Input } from '@plinth/ui';
import { FilterPills } from './FilterPills';

export interface ToolbarOption { label: string; value: string }

export function TableToolbar({ search, onSearch, searchPlaceholder = 'Search…', sort, onSort, sortOptions = [], filter, onFilter, filterOptions = [] }: {
  search?: string; onSearch?: (value: string) => void; searchPlaceholder?: string;
  sort?: string; onSort?: (value: string) => void; sortOptions?: ToolbarOption[];
  filter?: string; onFilter?: (value: string) => void; filterOptions?: ToolbarOption[];
}) {
  const allFilterOptions = filterOptions.length > 0 ? [{ label: 'All', value: '' }, ...filterOptions] : [];

  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
    {onSearch && (
      <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
        <Input
          icon={Search}
          aria-label={searchPlaceholder}
          value={search || ''}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-xl border-border/80 bg-background shadow-2xs focus-visible:ring-primary/20 text-xs"
        />
      </div>
    )}
    {onFilter && filterOptions.length > 0 && (
      <FilterPills
        icon={Filter}
        label="Filter:"
        options={allFilterOptions}
        value={filter || ''}
        onChange={onFilter}
        size="sm"
      />
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
  </div>;
}
