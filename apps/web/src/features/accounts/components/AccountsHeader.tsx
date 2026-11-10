'use client';

import React from 'react';
import { CalendarDays, X } from 'lucide-react';
import { AccountingEntity } from '../types';

interface AccountsHeaderProps {
  title: string;
  description?: string;
  entities?: AccountingEntity[];
  selectedEntityId?: string;
  onSelectEntity?: (id: string) => void;
  activePeriod?: string;
  hideCompany?: boolean;
  dateFilter?: string;
  onDateChange?: (date: string) => void;
  actionButton?: React.ReactNode;
}

export function AccountsHeader({
  title,
  description,
  dateFilter,
  onDateChange,
  actionButton,
}: AccountsHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Main Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interactive Calendar Date Picker Filter */}
          {onDateChange && (
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card px-3 py-1.5 shadow-sm text-xs transition-all hover:border-primary/60 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <input
                type="date"
                value={dateFilter || ''}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-transparent font-mono font-bold text-foreground focus:outline-none cursor-pointer text-xs"
                title="Filter by date"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => onDateChange('')}
                  title="Clear date filter"
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Action button if provided */}
          {actionButton}
        </div>
      </div>

    </div>
  );
}
