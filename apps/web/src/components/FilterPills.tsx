'use client';

import React from 'react';

export interface FilterPillOption<T extends string = string> {
  label: string;
  value: T;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
}

export interface FilterPillsProps<T extends string = string> {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * FilterPills Component
 *
 * Implements single-click upfront filtering as depicted in ERP UX.
 * Active state: solid primary brand color (var(--accent-blue)) with white text and subtle shadow.
 * Inactive state: white/card button with border, subtle hover state, and clear text.
 */
export function FilterPills<T extends string = string>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: FilterPillsProps<T>) {
  return (
    <div className={`flex min-w-0 max-w-full items-center gap-1.5 flex-wrap ${className}`}>
      {(label || Icon) && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0 flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          {label && <span>{label}</span>}
        </span>
      )}
      <div className="flex min-w-0 max-w-full items-center gap-1.5 flex-wrap">
        {options.map((option) => {
          const isActive = value === option.value;
          const OptionIcon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isActive}
              title={option.label}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-lg transition-all font-semibold cursor-pointer select-none whitespace-nowrap ${
                size === 'sm'
                  ? 'px-2.5 py-1 text-xs'
                  : 'px-3 py-1.5 text-xs'
              } ${
                isActive
                  ? 'bg-action text-inverse border border-border-strong shadow-2xs font-bold'
                  : 'bg-white  border border-border/80 text-foreground/80  hover:bg-muted/70 hover:text-foreground hover:border-border'
              }`}
            >
              {OptionIcon && (
                <OptionIcon
                  className={`h-3.5 w-3.5 ${
                    isActive ? 'text-inverse' : 'text-muted-foreground'
                  }`}
                />
              )}
              <span className="min-w-0 truncate">{option.label}</span>
              {typeof option.count === 'number' && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    isActive
                      ? 'bg-white/20 text-inverse'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
