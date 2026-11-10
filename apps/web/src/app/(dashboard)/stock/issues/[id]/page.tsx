"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  useStockIssue,
  useReverseStockIssue,
} from '@/features/inventory/hooks';
import { extractErrorMessage } from '@/features/inventory/errors';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ForbiddenState } from '@/components/ForbiddenState';
import {
  PageHeader,
  Card,
  Button,
} from '@synergy/ui';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  RefreshCw,
  Undo2,
  RotateCcw,
  User,
  XCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react';

interface PageProps {
  params: { id: string };
}

export default function StockIssueDetailPage({ params }: PageProps) {
  const { id } = params;
  const { data: issue, isLoading, error, refetch, isRefetching } = useStockIssue(id);
  const reverseIssue = useReverseStockIssue();

  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <LoadingState message="Loading stock issue details..." />;
  if (error || !issue) {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={(error as Error) ?? new Error('Stock issue not found')} retry={refetch} />;
  }

  const isProduct = Boolean(issue.product);
  const itemCode = isProduct ? issue.product?.sku : issue.material?.code || '—';
  const variantName = issue.reason?.match(/\[Variant:\s*([^\]]+)\]/i)?.[1];
  const itemName = variantName || (isProduct ? issue.product?.name : issue.material?.name) || 'Item';
  const itemCategory = isProduct
    ? issue.product?.category?.name
    : issue.material?.category?.name;
  const isReversed = issue.status === 'REVERSED';
  const timestamp = issue.issuedAt;
  const reversedAt = issue.reversedAt;
  const locationName = issue.location?.name || issue.location?.code || issue.locationId || 'Central Warehouse';
  const uomCode = issue.uom?.code || issue.uom?.symbol || 'Units';
  const actorName = issue.issuedByActor?.name || issue.issuedByActor?.email || 'Authorized Officer';

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!reverseReason || reverseReason.trim().length < 3) {
      setActionError('A valid reason (min 3 characters) is required to authorize reversal.');
      return;
    }
    try {
      await reverseIssue.mutateAsync({ id, reason: reverseReason.trim() });
      setShowReverseModal(false);
      setReverseReason('');
      await refetch();
    } catch (err) {
      setActionError(extractErrorMessage(err).message);
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full min-h-[calc(100vh-64px)]">
      <div className="w-full space-y-6">
        
        {/* Page Header */}
        <PageHeader
          title={`Stock Issue: ${issue.issueNumber}`}
          description="Detailed material disbursement journal record, ledger tracking, and shop floor consumption audit."
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
              <Link href="/stock/issues">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full shadow-xs font-semibold"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Stock Issues</span>
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

        {/* Status & Banner Summary */}
        <Card className="p-6 shadow-xs border border-border/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                  {issue.issueNumber}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                    isReversed
                      ? 'bg-muted text-muted-foreground border-border'
                      : 'bg-primary/10 text-primary border-primary/20'
                  }`}
                >
                  {issue.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Issued on {timestamp ? new Date(timestamp).toLocaleString('en-IN') : '—'}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Disbursed Quantity
                </div>
                <div className={`font-mono text-2xl font-bold ${
                  isReversed ? 'line-through text-muted-foreground' : 'text-primary'
                }`}>
                  {Number(issue.quantity).toLocaleString()} {uomCode}
                </div>
              </div>

              {!isReversed ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionError(null);
                    setShowReverseModal(true);
                  }}
                  className="rounded-full shadow-xs gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/40 font-semibold"
                >
                  <Undo2 className="h-4 w-4" />
                  <span>Reverse Issue</span>
                </Button>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border cursor-not-allowed select-none"
                  title="This stock issue has already been reversed"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  <span>Reverted</span>
                </span>
              )}
            </div>
          </div>

          {/* 4 Informative Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" />
                Item Reference
              </span>
              <p className="font-mono font-bold text-foreground text-sm truncate" title={itemCode}>
                {itemCode}
              </p>
              <p className="text-xs text-muted-foreground truncate" title={itemName}>
                <StockItemName name={itemName} item={issue.product || issue.material} context={issue.reason} />
              </p>
              {itemCategory && (
                <span className="inline-block mt-1 text-[10px] font-medium bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {itemCategory}
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Source Location
              </span>
              <p className="font-semibold text-foreground text-sm mt-1">
                {locationName}
              </p>
              <p className="text-xs text-muted-foreground">
                Ownership: {issue.ownership || 'COMPANY'}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Authorized By
              </span>
              <p className="font-semibold text-foreground text-sm mt-1 truncate" title={actorName}>
                {actorName}
              </p>
              <p className="text-xs text-muted-foreground">
                Storekeeper / Production Floor Supervisor
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/70 bg-card space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Ledger Status
              </span>
              <p className="font-mono font-bold text-foreground text-sm mt-1">
                {isReversed ? 'RETURN COMPLETED' : 'LEDGER POSTED'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isReversed ? 'Stock credited back to inventory' : 'Deducted from available balance'}
              </p>
            </div>
          </div>

          {/* Purpose & Justification */}
          <div className="p-5 rounded-xl bg-card border border-border/80 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>Production Purpose &amp; Justification</span>
            </h3>
            <p className="text-sm text-foreground/90 font-medium whitespace-pre-wrap leading-relaxed">
              {issue.reason || 'Direct Shop Floor Stock Issue'}
            </p>
          </div>

          {/* Reversal Audit Box (if reversed) */}
          {isReversed && (
            <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  Reversal Audit Log
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                This stock issue was reversed. The units were restored back into available warehouse inventory.
              </p>
              <div className="pt-2 text-xs space-y-1">
                <div>
                  <span className="font-semibold text-foreground">Reversal Timestamp: </span>
                  <span className="text-muted-foreground font-mono">
                    {reversedAt ? new Date(reversedAt).toLocaleString('en-IN') : '—'}
                  </span>
                </div>
                {issue.reversalReason && (
                  <div>
                    <span className="font-semibold text-foreground">Reversal Reason: </span>
                    <span className="text-muted-foreground font-medium">{issue.reversalReason}</span>
                  </div>
                )}
                {issue.reversedByActor && (
                  <div>
                    <span className="font-semibold text-foreground">Reversed By: </span>
                    <span className="text-muted-foreground">{issue.reversedByActor.name || issue.reversedByActor.email}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Navigation Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/70 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <Link href="/stock/ledger" className="hover:text-primary transition-colors inline-flex items-center gap-1 font-semibold">
                <span>View Inventory Ledger</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
              <Link href="/inventory" className="hover:text-primary transition-colors inline-flex items-center gap-1 font-semibold">
                <span>Stores &amp; Stock Balances</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div>
              <span className="font-mono text-[11px]">System ID: {issue.id}</span>
            </div>
          </div>
        </Card>

        {/* Modal for Authorizing Reversal */}
        {showReverseModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <Card className="w-full max-w-lg p-6 bg-card border border-border shadow-xl space-y-5 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2 text-rose-600">
                  <Undo2 className="h-5 w-5" />
                  <h3 className="text-base font-bold text-foreground">
                    Reverse Stock Issue ({issue.issueNumber})
                  </h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReverseModal(false)}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  ✕
                </Button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Reversing this issue will immediately credit{' '}
                <strong className="text-foreground">{Number(issue.quantity).toLocaleString()} {uomCode}</strong> of{' '}
                <strong className="text-foreground">{itemCode}</strong> back into the live available inventory. This transaction is immutable and audited.
              </p>

              <form onSubmit={handleReverseSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    Reversal Reason / Justification <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    placeholder="E.g., Wrong material issued, job canceled by supervisor, excess quantity returned..."
                    className="w-full text-xs bg-background border border-border rounded-lg p-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReverseModal(false)}
                    disabled={reverseIssue.isPending}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={reverseIssue.isPending}
                    className="bg-rose-600 hover:bg-rose-700 text-white rounded-full font-semibold"
                  >
                    {reverseIssue.isPending ? 'Reversing...' : 'Authorize Reversal'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
