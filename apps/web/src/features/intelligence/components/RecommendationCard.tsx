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
  EXECUTIVE: { label: 'Executive', icon: Layers, color: 'text-tone-purple-text', bg: 'bg-tone-purple-bg', border: 'border-tone-purple-solid/25', glow: 'from-tone-purple-solid/20' },
  SALES: { label: 'Sales', icon: TrendingUp, color: 'text-link', bg: 'bg-tone-blue-bg', border: 'border-tone-blue-solid/25', glow: 'from-tone-blue-solid/20' },
  INVENTORY: { label: 'Inventory', icon: Package, color: 'text-tone-amber-text', bg: 'bg-tone-amber-bg', border: 'border-tone-amber-solid/25', glow: 'from-tone-amber-solid/20' },
  PROCUREMENT: { label: 'Procurement', icon: ShoppingCart, color: 'text-tone-blue-text', bg: 'bg-tone-blue-bg', border: 'border-tone-blue-solid/25', glow: 'from-tone-blue-solid/20' },
  PRODUCTION: { label: 'Production', icon: Factory, color: 'text-tone-purple-text', bg: 'bg-tone-purple-bg', border: 'border-tone-purple-solid/25', glow: 'from-tone-purple-solid/20' },
  FULFILLMENT: { label: 'Fulfillment', icon: Truck, color: 'text-tone-teal-text', bg: 'bg-tone-teal-bg', border: 'border-tone-teal-solid/25', glow: 'from-tone-teal-solid/20' },
  QUALITY: { label: 'Quality', icon: ShieldCheck, color: 'text-tone-red-text', bg: 'bg-tone-red-bg', border: 'border-tone-red-solid/25', glow: 'from-tone-red-solid/20' },
  FINANCE: { label: 'Finance', icon: TrendingUp, color: 'text-tone-green-text', bg: 'bg-tone-green-bg', border: 'border-tone-green-solid/25', glow: 'from-tone-green-solid/20' },
  SYSTEM: { label: 'System', icon: Bot, color: 'text-ink-secondary', bg: 'bg-muted', border: 'border-border', glow: 'from-tone-grey-solid' },
};

const priorityStyles: Record<
  Recommendation['priority'],
  { label: string; bg: string; text: string; border: string; stripe: string; icon: React.ElementType }
> = {
  CRITICAL: { label: 'Critical Action', bg: 'bg-tone-red-bg', text: 'text-tone-red-text', border: 'border-tone-red-solid/25', stripe: 'bg-tone-red-solid', icon: ShieldAlert },
  HIGH: { label: 'High Priority', bg: 'bg-tone-amber-bg', text: 'text-tone-amber-text', border: 'border-tone-amber-solid/25', stripe: 'bg-tone-amber-solid', icon: AlertCircle },
  MEDIUM: { label: 'Moderate', bg: 'bg-tone-blue-bg', text: 'text-link', border: 'border-tone-blue-solid/25', stripe: 'bg-tone-blue-solid', icon: Sparkles },
  LOW: { label: 'Routine', bg: 'bg-muted', text: 'text-ink-secondary', border: 'border-border', stripe: 'bg-active', icon: Bot },
};

const statusStyles: Record<Recommendation['status'], { label: string; badge: string }> = {
  OPEN: { label: 'Ready for Review', badge: 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25' },
  ACCEPTED: { label: 'Accepted & Dispatched', badge: 'bg-tone-blue-bg text-link border-tone-blue-solid/25' },
  DEFERRED: { label: 'Deferred', badge: 'bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25' },
  DISMISSED: { label: 'Dismissed', badge: 'bg-muted text-ink-secondary border-border' },
  EXPIRED: { label: 'Expired', badge: 'bg-muted text-ink-muted border-border' },
  SUPERSEDED: { label: 'Superseded', badge: 'bg-muted text-ink-muted border-border' },
};

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const mod = moduleMeta[recommendation.module] || moduleMeta.EXECUTIVE;
  const ModIcon = mod.icon;
  const prio = priorityStyles[recommendation.priority] || priorityStyles.MEDIUM;
  const PrioIcon = prio.icon;
  const stat = statusStyles[recommendation.status] || statusStyles.OPEN;
  const confValue = Math.min(Math.max(Number(recommendation.confidence) || 0, 0), 1);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/90 bg-surface shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-brand/50">
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
                <span className="text-[11px] font-semibold text-ink-muted">
                  · {recommendation.category}
                </span>
              )}
            </div>

            {/* Title & Situation */}
            <div>
              <Link
                href={`/intelligence/recommendations/${recommendation.id}`}
                className="text-base sm:text-lg font-black tracking-tight text-ink hover:text-link-hover transition-colors"
              >
                {recommendation.title}
              </Link>
              <p className="mt-1.5 text-xs sm:text-sm text-ink-secondary leading-relaxed line-clamp-2">
                {recommendation.situation}
              </p>
            </div>

            {/* Context & Metadata Footer */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-ink-muted">
              {recommendation.suggestedOwnerRole && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <UserCheck className="h-3.5 w-3.5 text-ink-placeholder" />
                  Target Role: <strong className="text-ink">{recommendation.suggestedOwnerRole}</strong>
                </span>
              )}

              {recommendation.expiresAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-ink-placeholder" />
                  Expires {dateTime(recommendation.expiresAt)}
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-ink-placeholder">
                Action Code: <strong>{recommendation.proposedActionCode}</strong>
              </span>
            </div>
          </div>

          {/* Right Action & Financial Impact Station */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-border">
            <div className="text-left lg:text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink-placeholder">
                Projected Impact
              </p>
              <p className="text-lg sm:text-xl font-black text-link">
                {impactValue(recommendation.expectedImpact)}
              </p>

              <div className="mt-1.5 flex items-center gap-2 justify-start lg:justify-end">
                <span className="text-[11px] text-ink-muted font-semibold">
                  Confidence: <strong className="text-ink">{percent(recommendation.confidence)}</strong>
                </span>
                <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-tone-green-solid"
                    style={{ width: `${confValue * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <Link
              href={`/intelligence/recommendations/${recommendation.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-action hover:brightness-110 px-4 py-2 text-xs font-bold text-inverse shadow-xs transition-all active:scale-95"
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
