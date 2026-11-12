'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useIntelligenceHealth } from '../hooks';

export function IntelligenceShell({
  children,
  title = 'AI Analytics',
  description = 'Deterministic operational priorities, accountable execution workflows, and certified financial outcomes.',
  actionSlot,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actionSlot?: React.ReactNode;
}) {
  const healthQuery = useIntelligenceHealth();

  return (
    <div className="flex-1 w-full overflow-y-auto bg-page p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1700px] space-y-6">
        
        {/* Executive Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface/90 p-6 shadow-sm backdrop-blur-md">
          {/* Subtle Ambient Background Gradient */}

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-brand-soft border border-accent-brand px-3 py-0.5 text-[11px] font-black tracking-wider uppercase text-link">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  Plinth Intelligence
                </span>
                <span className="text-ink-placeholder">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-tone-green-solid/25 bg-tone-green-bg px-2.5 py-0.5 text-[10.5px] font-bold text-tone-green-text">
                  <span className="h-2 w-2 rounded-full bg-tone-green-solid animate-ping" />
                  <span className="h-1.5 w-1.5 rounded-full bg-tone-green-solid -ml-3.5" />
                  {healthQuery.isLoading ? 'Verifying Telemetry…' : healthQuery.isError ? 'Engine Offline' : `Engine ${healthQuery.data?.status ?? 'Online'}`}
                </span>
                <span className="text-ink-placeholder">·</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-link" />
                  Zero Mutation Guarantee
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-ink font-sans">
                {title}
              </h1>

              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed font-medium">
                {description}
              </p>
            </div>

            {/* Quick Action / Status Slot */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {actionSlot}
              <Link
                href="/intelligence/advisor"
                className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-xs font-bold text-inverse shadow-xs transition-all hover:bg-[color:var(--action-primary-bg-hover)] active:scale-[0.98]"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Open AI Advisor</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Page Content Viewport */}
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
