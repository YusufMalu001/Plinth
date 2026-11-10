import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type ReceivingSummaryMetric = {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  valueClassName?: string;
  iconClassName?: string;
};

export function ReceivingSummaryCards({ metrics }: { metrics: ReceivingSummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
              <Icon className={`h-4 w-4 shrink-0 ${metric.iconClassName ?? 'text-muted-foreground'}`} />
            </div>
            <p className={`mt-2 text-2xl font-bold text-foreground ${metric.valueClassName ?? ''}`}>{metric.value}</p>
          </div>
        );
      })}
    </div>
  );
}
