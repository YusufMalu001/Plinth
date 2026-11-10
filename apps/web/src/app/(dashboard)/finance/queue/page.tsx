'use client';

import React, { useState } from 'react';
import {
  useSourceEligibility,
  useQueueTransactions,
  useIntegrationReadiness,
} from '@/features/finance/hooks';
import { Card, Button, Badge } from '@synergy/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import { BlockedSourceState } from '@/features/finance/components/BlockedSourceState';
import {
  ListOrdered,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { TransactionSourceType } from '@synergy/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const SOURCE_TYPES: Array<{ key: TransactionSourceType; label: string }> = [
  { key: 'PURCHASE_ORDER', label: 'Purchase Orders' },
  { key: 'SALES_INVOICE', label: 'Sales Invoices' },
  { key: 'DEBIT_NOTE', label: 'Debit Notes' },
  { key: 'JOB_WORK', label: 'Job Work' },
  { key: 'RETURN', label: 'Returns & Refunds' },
  { key: 'INVENTORY_COGS', label: 'Inventory COGS' },
];

export default function FinanceQueuePage() {
  const router = useRouter();
  const [selectedSource, setSelectedSource] = useState<TransactionSourceType>('PURCHASE_ORDER');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);

  const { data: readiness } = useIntegrationReadiness();
  const { data: eligibility, isLoading, refetch, isFetching } = useSourceEligibility(selectedSource);
  const queueMutation = useQueueTransactions();

  const selectedReadiness = readiness?.find((r) => r.sourceType === selectedSource);
  const isSupported = selectedReadiness?.isSupported ?? (selectedSource === 'PURCHASE_ORDER');

  const items = eligibility?.items || [];
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((it) => it.sourceId));
    }
  };

  const toggleSelectItem = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((it) => it !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleQueueSelected = async () => {
    if (selectedIds.length === 0) return;
    setQueueError(null);
    try {
      const job = await queueMutation.mutateAsync({
        sourceType: selectedSource,
        sourceIds: selectedIds,
      });
      router.push(`/finance/exports?jobId=${job.id}`);
    } catch (err: unknown) {
      setQueueError(err instanceof Error ? err.message : 'Failed to queue transactions for batch export');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-md">
              Transaction Staging
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Duplicate Prevention (SHA-256)
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-manrope">
            Eligible Transaction Queue
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Live evaluation of ERP transactions ready for financial staging and batch export. Idempotency fingerprints ensure a transaction cannot be queued or exported twice.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh Queue
          </Button>

          {isSupported && (
            <Button
              size="sm"
              disabled={selectedIds.length === 0 || queueMutation.isPending}
              onClick={handleQueueSelected}
              className="gap-2 text-xs font-semibold"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Queue Selected ({selectedIds.length})
            </Button>
          )}
        </div>
      </div>

      <FinanceNavigationTabs />

      {/* Source Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
        {SOURCE_TYPES.map((st) => {
          const isSelected = selectedSource === st.key;
          const rd = readiness?.find((r) => r.sourceType === st.key);
          const active = rd?.isSupported && rd?.status === 'ACTIVE';

          return (
            <button
              key={st.key}
              type="button"
              onClick={() => {
                setSelectedSource(st.key);
                setSelectedIds([]);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold font-manrope whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{st.label}</span>
              {active ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-500/80" />
              )}
            </button>
          );
        })}
      </div>

      {queueError && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{queueError}</span>
        </div>
      )}

      {/* Main Queue View */}
      {!isSupported ? (
        <BlockedSourceState
          sourceType={selectedSource}
          displayName={selectedReadiness?.displayName}
          blockedReason={selectedReadiness?.blockedReason || undefined}
          dependentModules={selectedReadiness?.dependentModules || []}
          validationItems={selectedReadiness?.validationItems || []}
        />
      ) : (
        <div className="space-y-4">
          <Card className="p-0 rounded-2xl border overflow-hidden shadow-xs">
            <div className="border-b border-border/60 bg-muted/40 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={items.length === 0}
                  className="flex items-center gap-2 text-xs font-bold text-foreground disabled:opacity-50"
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>Select All Eligible ({items.length})</span>
                </button>
              </div>

              <span className="font-mono text-xs text-muted-foreground">
                Total Available: <strong className="text-foreground">{items.length} records</strong>
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                Scanning purchase order ledger for finalized unexported transactions...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
                <ShieldCheck className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                <h4 className="text-sm font-bold text-foreground">No unexported Purchase Orders pending</h4>
                <p className="max-w-md mx-auto">
                  All finalized Purchase Orders have either already been queued for batch export or no new orders are in an approved/sent state.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {items.map((item) => {
                  const isChecked = selectedIds.includes(item.sourceId);

                  return (
                    <div
                      key={item.sourceId}
                      onClick={() => toggleSelectItem(item.sourceId)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 text-primary">
                          {isChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {item.referenceNumber}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              APPROVED PO
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            Date: {new Date(item.date).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 sm:text-right">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                            Amount
                          </span>
                          <span className="font-mono text-sm font-bold text-foreground">
                            {item.currency} {Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <Link
                          href={`/procurement/purchase-orders/${item.sourceId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                        >
                          <span>Drill-down</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
