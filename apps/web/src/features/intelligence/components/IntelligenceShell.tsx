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
    <div className="flex-1 w-full overflow-y-auto bg-gradient-to-b from-slate-50 via-slate-50/70 to-slate-100/60 p-4 sm:p-6 lg:p-8 dark:from-[#090d16] dark:via-[#0c121e] dark:to-[#070a10]">
      <div className="mx-auto w-full max-w-[1700px] space-y-6">
        
        {/* Executive Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-900/80">
          {/* Subtle Ambient Background Gradient */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-[#004a80]/15 via-blue-500/10 to-indigo-500/5 blur-3xl dark:from-blue-600/20 dark:via-indigo-600/15 dark:to-transparent" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-gradient-to-tr from-cyan-500/10 via-teal-500/5 to-transparent blur-3xl dark:from-cyan-600/15 dark:to-transparent" />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#004a80]/10 border border-[#004a80]/20 px-3 py-0.5 text-[11px] font-black tracking-wider uppercase text-[#004a80] dark:bg-blue-950/70 dark:border-blue-800 dark:text-blue-300">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  Plinth Intelligence
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-800 dark:border-emerald-900/80 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 -ml-3.5" />
                  {healthQuery.isLoading ? 'Verifying Telemetry…' : healthQuery.isError ? 'Engine Offline' : `Engine ${healthQuery.data?.status ?? 'Online'}`}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Zero Mutation Guarantee
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white font-sans">
                {title}
              </h1>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300/90 leading-relaxed font-medium">
                {description}
              </p>
            </div>

            {/* Quick Action / Status Slot */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {actionSlot}
              <Link
                href="/intelligence/advisor"
                className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#003860] active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500"
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
