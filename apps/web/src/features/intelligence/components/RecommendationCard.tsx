'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Clock3,
  Factory,
  Layers,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  UserCheck,
} from 'lucide-react';
import type { IntelligenceModule, Recommendation } from '../types';
import { dateTime, impactValue, percent } from './format';

const moduleMeta: Record<
  IntelligenceModule,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string; glow: string }
> = {
  EXECUTIVE: { label: 'Executive', icon: Layers, color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-50/90 dark:bg-indigo-950/50', border: 'border-indigo-200/80 dark:border-indigo-800/60', glow: 'from-indigo-500/20' },
  SALES: { label: 'Sales', icon: TrendingUp, color: 'text-[#004a80] dark:text-blue-300', bg: 'bg-blue-50/90 dark:bg-blue-950/50', border: 'border-blue-200/80 dark:border-blue-800/60', glow: 'from-blue-500/20' },
  INVENTORY: { label: 'Inventory', icon: Package, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50/90 dark:bg-amber-950/50', border: 'border-amber-200/80 dark:border-amber-800/60', glow: 'from-amber-500/20' },
  PROCUREMENT: { label: 'Procurement', icon: ShoppingCart, color: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-50/90 dark:bg-sky-950/50', border: 'border-sky-200/80 dark:border-sky-800/60', glow: 'from-sky-500/20' },
  PRODUCTION: { label: 'Production', icon: Factory, color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50/90 dark:bg-purple-950/50', border: 'border-purple-200/80 dark:border-purple-800/60', glow: 'from-purple-500/20' },
  FULFILLMENT: { label: 'Fulfillment', icon: Truck, color: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-50/90 dark:bg-teal-950/50', border: 'border-teal-200/80 dark:border-teal-800/60', glow: 'from-teal-500/20' },
  QUALITY: { label: 'Quality', icon: ShieldCheck, color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50/90 dark:bg-rose-950/50', border: 'border-rose-200/80 dark:border-rose-800/60', glow: 'from-rose-500/20' },
  FINANCE: { label: 'Finance', icon: TrendingUp, color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50/90 dark:bg-emerald-950/50', border: 'border-emerald-200/80 dark:border-emerald-800/60', glow: 'from-emerald-500/20' },
  SYSTEM: { label: 'System', icon: Bot, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700', glow: 'from-slate-500/20' },
};

const priorityStyles: Record<
  Recommendation['priority'],
  { label: string; bg: string; text: string; border: string; stripe: string; icon: React.ElementType }
> = {
  CRITICAL: { label: 'Critical Action', bg: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', stripe: 'bg-rose-500', icon: ShieldAlert },
  HIGH: { label: 'High Priority', bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', stripe: 'bg-amber-500', icon: AlertCircle },
  MEDIUM: { label: 'Moderate', bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', stripe: 'bg-blue-500', icon: Sparkles },
  LOW: { label: 'Routine', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', stripe: 'bg-slate-400', icon: Bot },
};

const statusStyles: Record<Recommendation['status'], { label: string; badge: string }> = {
  OPEN: { label: 'Ready for Review', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' },
  ACCEPTED: { label: 'Accepted & Dispatched', badge: 'bg-blue-50 text-[#004a80] border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800' },
  DEFERRED: { label: 'Deferred', badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' },
  DISMISSED: { label: 'Dismissed', badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
  EXPIRED: { label: 'Expired', badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
  SUPERSEDED: { label: 'Superseded', badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const mod = moduleMeta[recommendation.module] || moduleMeta.EXECUTIVE;
  const ModIcon = mod.icon;
  const prio = priorityStyles[recommendation.priority] || priorityStyles.MEDIUM;
  const PrioIcon = prio.icon;
  const stat = statusStyles[recommendation.status] || statusStyles.OPEN;
  const confValue = Math.min(Math.max(Number(recommendation.confidence) || 0, 0), 1);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#004a80]/50 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      {/* Priority Accent Stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${prio.stripe}`} />

      <div className="p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

          {/* Main Info Column */}
          <div className="flex-1 space-y-3 min-w-0">
            {/* Meta Tags Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${mod.bg} ${mod.color} ${mod.border}`}>
                <ModIcon className="h-3.5 w-3.5" />
                <span>{mod.label}</span>
              </span>

              <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${prio.bg} ${prio.text} ${prio.border}`}>
                <PrioIcon className="h-3 w-3" />
                <span>{prio.label}</span>
              </span>

              <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold ${stat.badge}`}>
                {stat.label}
              </span>

              {recommendation.category && (
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  · {recommendation.category}
                </span>
              )}
            </div>

            {/* Title & Situation */}
            <div>
              <Link
                href={`/intelligence/recommendations/${recommendation.id}`}
                className="text-base sm:text-lg font-black tracking-tight text-slate-900 hover:text-[#004a80] transition-colors dark:text-slate-100 dark:hover:text-blue-400"
              >
                {recommendation.title}
              </Link>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300/90 leading-relaxed line-clamp-2">
                {recommendation.situation}
              </p>
            </div>

            {/* Context & Metadata Footer */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
              {recommendation.suggestedOwnerRole && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                  Target Role: <strong className="text-slate-800 dark:text-slate-200">{recommendation.suggestedOwnerRole}</strong>
                </span>
              )}

              {recommendation.expiresAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                  Expires {dateTime(recommendation.expiresAt)}
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400">
                Action Code: <strong>{recommendation.proposedActionCode}</strong>
              </span>
            </div>
          </div>

          {/* Right Action & Financial Impact Station */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
            <div className="text-left lg:text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Projected Impact
              </p>
              <p className="text-lg sm:text-xl font-black text-[#004a80] dark:text-blue-400">
                {impactValue(recommendation.expectedImpact)}
              </p>

              <div className="mt-1.5 flex items-center gap-2 justify-start lg:justify-end">
                <span className="text-[11px] text-slate-500 font-semibold">
                  Confidence: <strong className="text-slate-900 dark:text-slate-100">{percent(recommendation.confidence)}</strong>
                </span>
                <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    style={{ width: `${confValue * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <Link
              href={`/intelligence/recommendations/${recommendation.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#004a80] to-blue-700 hover:brightness-110 px-4 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-95"
            >
              <span>Review Evidence</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
