"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  useStockAdjustment,
  useReviewStockAdjustment,
  useApproveStockAdjustment,
  useRejectStockAdjustment,
  usePostStockAdjustment,
} from '../../../../../features/inventory/hooks';
import { extractErrorMessage } from '../../../../../features/inventory/errors';
import { LoadingState } from '../../../../../components/LoadingState';
import { ErrorState } from '../../../../../components/ErrorState';
import { ForbiddenState } from '../../../../../components/ForbiddenState';
import {
  PageHeader,
  Card,
  Button,
} from '@plinth/ui';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface PageProps {
  params: { id: string };
}

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: React.ElementType }> = {
  PROPOSED: { label: 'Proposed', badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', icon: Clock },
  UNDER_REVIEW: { label: 'Under Review', badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20', icon: Clock },
  APPROVED: { label: 'Approved', badgeClass: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle2 },
  POSTED: { label: 'Posted to Ledger', badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20', icon: XCircle },
};

export default function StockAdjustmentDetailPage({ params }: PageProps) {
  const { id } = params;
  const { data: adjustment, isLoading, error, refetch, isRefetching } = useStockAdjustment(id);
  const reviewAdjustment = useReviewStockAdjustment();
  const approveAdjustment = useApproveStockAdjustment();
  const rejectAdjustment = useRejectStockAdjustment();
  const postAdjustment = usePostStockAdjustment();

  const [reviewNote, setReviewNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading adjustment details..." />;
  if (error || !adjustment) {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={(error as Error) ?? new Error('Adjustment not found')} retry={refetch} />;
  }

  const isProduct = Boolean(adjustment.product);
  const code = isProduct ? adjustment.product?.sku : adjustment.material?.code || '—';
  const variantName = adjustment.reason?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
  const name = variantName || (isProduct ? adjustment.product?.name : adjustment.material?.name) || 'Item';
  const isIncrease = adjustment.direction === 'INCREASE';
  const statusConfig = STATUS_CONFIG[adjustment.status] || STATUS_CONFIG.PROPOSED;

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      setActionError(extractErrorMessage(err).message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-6">
        
        {/* Page Header */}
        <PageHeader
          title={`Adjustment Order: ${adjustment.adjustmentNumber}`}
          description="Governed discrepancy reconciliation, approval workflow, and live ledger posting."
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2 rounded-full shadow-xs"
              >
                <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
              <Link href="/stock/adjustments">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full shadow-xs"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Adjustments</span>
                </Button>
              </Link>
            </div>
          }
        />

        {actionError && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300">Action Failed</h4>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">{actionError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Header Summary Card */}
        <Card className="p-6 shadow-xs border border-border/80 space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-foreground">
                  {adjustment.adjustmentNumber}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${statusConfig.badgeClass}`}>
                  {adjustment.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Proposed on {adjustment.proposedAt ? new Date(adjustment.proposedAt).toLocaleString('en-IN') : '—'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                isIncrease
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
              }`}>
                {isIncrease ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                <span>{isIncrease ? `+${Number(adjustment.quantity)} ${adjustment.uom?.code || 'Units'}` : `−${Number(adjustment.quantity)} ${adjustment.uom?.code || 'Units'}`}</span>
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-xl border border-border/70 bg-card">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Target Item</span>
              <p className="font-mono font-bold text-foreground mt-1">{code}</p>
              <p className="text-muted-foreground truncate"><StockItemName name={name} item={adjustment.product || adjustment.material} context={adjustment.reason} /></p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/70 bg-card">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Direction &amp; Quantity</span>
              <p className={`font-mono font-bold mt-1 ${isIncrease ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {isIncrease ? `+${adjustment.quantity}` : `−${adjustment.quantity}`} {adjustment.uom?.code || 'Units'}
              </p>
              <p className="text-muted-foreground">{isIncrease ? 'Surplus Addition' : 'Scrap / Discrepancy Write-down'}</p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/70 bg-card">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Workflow State</span>
              <p className="font-mono font-bold text-foreground mt-1">{adjustment.status}</p>
              <p className="text-muted-foreground">
                {adjustment.status === 'POSTED' ? 'Balance updated' : 'Pending posting'}
              </p>
            </div>
          </div>

          {/* Reason / Notes */}
          <div className="p-4 rounded-xl bg-muted/40 border border-border/70 space-y-2 text-xs">
            <div>
              <span className="font-semibold text-foreground">Justification Reason: </span>
              <span className="text-muted-foreground">{adjustment.reason}</span>
            </div>
            {adjustment.reviewNote && (
              <div>
                <span className="font-semibold text-primary">Review Note: </span>
                <span className="text-muted-foreground">{adjustment.reviewNote}</span>
              </div>
            )}
          </div>

          {/* Action Workflow Execution Box */}
          {adjustment.status === 'PROPOSED' && (
            <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Step 1: Supervisor Audit &amp; Review
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Acknowledge this adjustment proposal and add any supervisor audit notes before approving.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Supervisor review note (optional)..."
                  className="flex-1 text-sm bg-background border border-border rounded-lg p-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => runAction(() => reviewAdjustment.mutateAsync({ id, note: reviewNote || undefined }))}
                  disabled={reviewAdjustment.isPending}
                  className="rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold"
                >
                  {reviewAdjustment.isPending ? 'Saving...' : 'Set to Under Review'}
                </Button>
              </div>
            </div>
          )}

          {(adjustment.status === 'PROPOSED' || adjustment.status === 'UNDER_REVIEW') && (
            <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Step 2: Sign-Off &amp; Approval
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReject(!showReject)}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 rounded-full"
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => runAction(() => approveAdjustment.mutateAsync(id))}
                    disabled={approveAdjustment.isPending}
                    className="gap-1.5 rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{approveAdjustment.isPending ? 'Approving...' : 'Approve Adjustment'}</span>
                  </Button>
                </div>
              </div>

              {showReject && (
                <div className="pt-3 border-t border-rose-500/20 space-y-3">
                  <label className="block text-xs font-semibold uppercase text-rose-600">
                    Mandatory Rejection Reason
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Why is this adjustment rejected?"
                      className="flex-1 text-sm bg-background border border-border rounded-lg p-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-muted-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => runAction(() => rejectAdjustment.mutateAsync({ id, reason: rejectReason }))}
                      disabled={rejectAdjustment.isPending || rejectReason.length < 3}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-full font-semibold"
                    >
                      Confirm Rejection
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {adjustment.status === 'APPROVED' && (
            <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Step 3: Final Atomic Posting to Perpetual Ledger
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Posting will update the unified inventory balance and append an immutable ledger journal entry.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => runAction(() => postAdjustment.mutateAsync(id))}
                  disabled={postAdjustment.isPending}
                  className="gap-2 rounded-full shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold whitespace-nowrap"
                >
                  <Send className="h-4 w-4" />
                  <span>{postAdjustment.isPending ? 'Posting...' : 'Post to Live Ledger'}</span>
                </Button>
              </div>
            </div>
          )}

          {adjustment.status === 'POSTED' && (
            <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Adjustment Successfully Posted to Perpetual Ledger
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Physical stock balance and weighted-average valuation have been reconciled.
                  </p>
                </div>
              </div>
              <Link href="/stock/ledger">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-emerald-700 dark:text-emerald-400 border-emerald-300 hover:bg-emerald-50 gap-1.5"
                >
                  <span>View in Ledger</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          )}

        </Card>

      </div>
    </div>
  );
}
