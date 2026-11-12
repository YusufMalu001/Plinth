'use client';

import React, { useState } from 'react';
import {
  useIntegrationJobItems,
  useInvestigateAndRetry,
} from '@/features/finance/hooks';
import { Card, Button, Badge } from '@plinth/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import { StatusBadge } from '@/components/StatusBadge';
import {
  AlertOctagon,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

export default function FinanceErrorsPage() {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [investigationReason, setInvestigationReason] = useState('Reviewed mapping error; transaction payload verified');
  const [actionType, setActionType] = useState<'RETRY' | 'REJECT' | 'HOLD'>('RETRY');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: failedItemsData, isLoading: isLoadingFailed, refetch: refetchFailed } = useIntegrationJobItems({
    status: 'FAILED',
  });
  const { data: investigatedItemsData, isLoading: isLoadingInvestigated, refetch: refetchInvestigated } = useIntegrationJobItems({
    status: 'INVESTIGATED',
  });

  const retryMutation = useInvestigateAndRetry();

  const handleAction = async (itemId: string) => {
    setActionError(null);
    try {
      await retryMutation.mutateAsync({
        itemId,
        data: {
          action: actionType,
          reason: investigationReason,
        },
      });
      setSelectedItemId(null);
      refetchFailed();
      refetchInvestigated();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const failedItems = failedItemsData?.items || [];
  const investigatedItems = investigatedItemsData?.items || [];
  const allExceptionItems = [...failedItems, ...investigatedItems];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-destructive/10 text-destructive px-2.5 py-0.5 rounded-md">
              Exception Management
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Audited Retry Workflow
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-manrope">
            Error & Retry Queue
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Controlled investigation and safe re-queueing of failed batch exports. Retries increment retry counts and are recorded in the system audit log.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            refetchFailed();
            refetchInvestigated();
          }}
          className="gap-2 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Exceptions
        </Button>
      </div>

      <FinanceNavigationTabs />

      {/* Main List */}
      <div className="space-y-4">
        {isLoadingFailed || isLoadingInvestigated ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Card key={i} className="p-6 rounded-2xl animate-pulse bg-muted/40 h-28" />
            ))}
          </div>
        ) : allExceptionItems.length === 0 ? (
          <Card className="p-12 text-center rounded-2xl border-dashed">
            <CheckCircle2 className="h-8 w-8 text-tone-green-text mx-auto mb-2" />
            <h3 className="text-sm font-bold text-foreground">Zero Export Exceptions</h3>
            <p className="text-xs text-muted-foreground mt-1">
              All financial integration items have processed successfully with no failed or held records.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {allExceptionItems.map((item) => (
              <Card key={item.id} className="p-5 rounded-2xl border shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-border-strong border-border/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <AlertOctagon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {item.sourceId}
                        </span>
                        <StatusBadge status={item.status} />
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                          Retries: {item.retryCount}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Source: <strong className="text-foreground">{item.sourceType}</strong> · Amount: <strong className="text-foreground font-mono">{item.currency} {Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setActionType('RETRY');
                      }}
                      className="gap-1.5 text-xs font-semibold bg-primary"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Investigate & Action
                    </Button>

                    <Link
                      href={`/procurement/purchase-orders/${item.sourceId}`}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 ml-2"
                    >
                      <span>PO</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* Error details */}
                <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 text-xs">
                  <span className="font-bold text-destructive block mb-0.5">
                    Failure Cause / Diagnostic Detail:
                  </span>
                  <p className="font-mono text-[11px] text-foreground/80">
                    {item.errorDetail ? JSON.stringify(item.errorDetail) : 'Adapter error during file batch generation.'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Investigate & Retry Modal */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg p-6 rounded-2xl shadow-popover border space-y-4 bg-card">
            <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground font-manrope">
                  Controlled Retry & Resolution
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  Item ID: {selectedItemId}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedItemId(null)}>
                Close
              </Button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold">
                {actionError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Resolution Action *
                </label>
                <select
                  value={actionType}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setActionType(e.target.value as 'RETRY' | 'REJECT' | 'HOLD')}
                  className="w-full h-9 px-3 rounded-xl border border-input bg-background text-xs font-semibold"
                >
                  <option value="RETRY">RETRY — Reset Item into QUEUED State for Export</option>
                  <option value="HOLD">HOLD — Pause Export Pending Business Review</option>
                  <option value="REJECT">REJECT — Mark Item Rejected (Terminal State)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Investigation & Audit Reason *
                </label>
                <textarea
                  rows={3}
                  value={investigationReason}
                  onChange={(e) => setInvestigationReason(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary outline-hidden"
                  placeholder="State the root cause and why this retry or disposition is safe..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={() => setSelectedItemId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction(selectedItemId)}
                disabled={retryMutation.isPending}
                className="font-semibold text-xs bg-primary text-inverse"
              >
                {retryMutation.isPending ? 'Executing...' : 'Submit Disposition'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
