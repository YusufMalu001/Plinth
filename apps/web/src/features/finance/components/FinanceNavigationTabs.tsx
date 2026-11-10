'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Layers,
  ListOrdered,
  UploadCloud,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react';

export function FinanceNavigationTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: 'Readiness Matrix', href: '/finance', icon: Activity },
    { label: 'Mapping Rules', href: '/finance/mappings', icon: Layers },
    { label: 'Eligible Queue', href: '/finance/queue', icon: ListOrdered },
    { label: 'Export Runs', href: '/finance/exports', icon: UploadCloud },
    { label: 'Error & Retries', href: '/finance/errors', icon: AlertOctagon },
    { label: 'Internal Reconciliation', href: '/finance/reconciliation', icon: CheckCircle2 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-3 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.href === '/finance'
            ? pathname === '/finance'
            : pathname.startsWith(tab.href);

        return (
          <Link key={tab.href} href={tab.href}>
            <button
              type="button"
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold font-manrope transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          </Link>
        );
      })}
    </div>
  );
}
