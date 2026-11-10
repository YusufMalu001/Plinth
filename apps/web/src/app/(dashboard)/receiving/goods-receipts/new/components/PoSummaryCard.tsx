'use client';

import React, { useState } from 'react';
import type { PO } from '@/features/purchases/api';
import {
  Building2,
  Calendar,
  Check,
  Copy,
  Layers,
  ShieldCheck,
  Tag,
  ReceiptText,
} from 'lucide-react';

interface PoSummaryCardProps {
  po: PO;
}

export function PoSummaryCard({ po }: PoSummaryCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyPoNumber = () => {
    if (po.poNumber) {
      navigator.clipboard.writeText(po.poNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedTotal =
    po.totalAmount !== undefined && po.totalAmount !== null
      ? `${po.currency || 'INR'} ${Number(po.totalAmount).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null;

  const isOutsourcedPo = Boolean(
    ('natureOfProcessing' in po && Boolean((po as { natureOfProcessing?: unknown }).natureOfProcessing)) ||
    ('notes' in po && typeof (po as { notes?: unknown }).notes === 'string' && /outsource|job.?work/i.test((po as { notes?: string }).notes || '')) ||
    ('jobWorkOrders' in po && Array.isArray((po as { jobWorkOrders?: unknown[] }).jobWorkOrders) && ((po as { jobWorkOrders?: unknown[] }).jobWorkOrders?.length || 0) > 0)
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-5 shadow-xs transition-all duration-200">
      {/* Ambient Gradient Header Mesh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/[0.06] to-transparent" />

      {/* Top Header */}
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Contract Baseline
            </span>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {po.status.replaceAll('_', ' ')}
            </span>
            {isOutsourcedPo ? (
              <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-black text-purple-700 dark:text-purple-300 border border-purple-500/30">
                Type: Outsourced
              </span>
            ) : (
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Type: Standard Procurement
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <h3 className="font-mono text-xl font-bold tracking-tight text-foreground">
              {po.poNumber}
            </h3>
            <button
              type="button"
              onClick={handleCopyPoNumber}
              title="Copy PO Number"
              className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground cursor-pointer"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="font-semibold text-foreground">{po.vendor?.name || 'Vendor pending'}</span>
            {po.vendor?.code && (
              <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] font-medium text-muted-foreground border border-border/60">
                {po.vendor.code}
              </span>
            )}
          </div>
        </div>

        {/* Total Value Pill */}
        {formattedTotal && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3.5 py-2 backdrop-blur-xs shadow-2xs">
            <ReceiptText className="h-4 w-4 text-primary" />
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Committed Value
              </span>
              <span className="font-mono text-sm font-bold text-foreground">
                {formattedTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grid Meta Details */}
      <div className="relative mt-4 grid grid-cols-2 gap-3 border-t border-border/70 pt-4 sm:grid-cols-4 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground/70 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold text-muted-foreground">
              Contract Lines
            </span>
            <span className="font-semibold text-foreground">
              <span>{po.lines?.length || 0}</span> {po.lines?.length === 1 ? 'line item' : 'line items'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground/70 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold text-muted-foreground">
              Created On
            </span>
            <span className="font-semibold text-foreground">
              {po.createdAt
                ? new Date(po.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground/70 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold text-muted-foreground">
              Approval Authority
            </span>
            <span className="font-semibold text-foreground">
              {po.status === 'APPROVED' || po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED' || po.status === 'FULLY_RECEIVED' ? 'Approved' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground/70 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold text-muted-foreground">
              Revision
            </span>
            <span className="font-semibold text-foreground">
              Rev {po.revisionNumber ?? 1}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
