'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  className = '',
}: MetricCardProps) {
  const getIconStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-muted text-foreground border-border';
      case 'success':
        return 'bg-muted text-foreground border-border';
      case 'warning':
        return 'bg-muted text-foreground border-border';
      case 'danger':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return 'bg-muted/80 text-foreground border-border/60';
    }
  };

  return (
    <div className={`rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </span>
        <span className={`rounded-lg p-1.5 border shrink-0 ${getIconStyles()}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
        {value}
      </div>
      {(subtitle || trend) && (
        <div className="mt-0.5 flex items-center justify-between gap-1.5 text-[11px]">
          {subtitle && <p className="text-muted-foreground truncate">{subtitle}</p>}
          {trend && (
            <span
              className={`font-semibold shrink-0 ${
                trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {trend.value} {trend.label && <span className="font-normal text-muted-foreground">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
