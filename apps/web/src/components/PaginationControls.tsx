'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationControls({ page, pageSize = 100, total, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize?: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const first = (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, total);

  const pages = pageCount <= 7
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])).filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);

  const pageSizeOptions = Array.from(new Set([pageSize, 10, 20, 50, 100]))
    .filter(Boolean)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-1.5" aria-label="Pagination">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((value, index) => {
            const previous = pages[index - 1];
            return (
              <React.Fragment key={value}>
                {previous && value - previous > 1 && <span className="px-1 text-muted-foreground/60">…</span>}
                <button
                  type="button"
                  aria-label={`Page ${value}`}
                  aria-current={value === currentPage ? 'page' : undefined}
                  onClick={() => onPageChange(value)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold transition ${
                    value === currentPage
                      ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                      : 'border-border bg-background hover:border-primary hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  {value}
                </button>
              </React.Fragment>
            );
          })}
          <button
            type="button"
            aria-label="Next page"
            onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center justify-center gap-3 text-xs">
        <span>Showing {first}–{last} of {total}</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span>Rows</span>
            <select
              value={pageSize}
              aria-label="Rows per page"
              onChange={(event) => {
                const nextPageSize = Number(event.target.value);
                if (nextPageSize > 0) onPageSizeChange(nextPageSize);
              }}
              className="h-8 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer transition-colors shadow-2xs"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
