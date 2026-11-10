'use client';

import React, { useState } from 'react';
import {
  useIntegrationJobItems,
  useReconciliationRecords,
  useReconcileItem,
} from '@/features/finance/hooks';
import { Card, Button, Badge } from '@synergy/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import { StatusBadge } from '@/components/StatusBadge';
import {
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  FileCheck,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

export default function FinanceReconciliationPage() {
  const [reconItemId, setReconItemId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('Internal state consistency and uniqueness verified');
  const [reconError, setReconError] = useState<string | null>(null);

  const { data: ackItemsData, isLoading: isLoadingAck, refetch: refetchAck } = useIntegrationJobItems({
    status: 'ACKNOWLEDGED',
  });
  const { data: reconRecords, isLoading: isLoadingRecords, refetch: refetchRecords } = useReconciliationRecords();

  const reconcileMutation = useReconcileItem();

  const handleReconcile = async (itemId: string) => {
    setReconError(null);
    try {
      await reconcileMutation.mutateAsync({
        itemId,
        data: {
          resolutionNotes,
        },
      });
      setReconItemId(null);
      refetchAck();
      refetchRecords();
    } catch (err: unknown) {
      setReconError(err instanceof Error ? err.message : 'Reconciliation check failed');
    }
  };

  const ackItems = ackItemsData?.items || [];
  const records = reconRecords || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-md">
              Internal Self-Consistency
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Not External Tally API Matching
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-manrope">
            Internal Reconciliation Workspace
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Verifies that every queued transaction reached a terminal state exactly once with no silent drops or duplicate fingerprints. (Does NOT compare against live Tally database records).
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            refetchAck();
            refetchRecords();
          }}
          className="gap-2 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Records
        </Button>
      </div>

      <FinanceNavigationTabs />

      {/* Internal Labeling Notice Callout */}
      <div className="p-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 flex items-start gap-3">
        <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-bold text-foreground block">
            Scope Definition: Internal Self-Consistency Audit
          </span>
          <p className="text-muted-foreground leading-relaxed">
            Reconciliation in this pass audits ERP internal lifecycle consistency. It confirms every exported item has an acknowledged state and a unique payload fingerprint. Since no live bidirectional Tally connector exists, external response verification is null.
          </p>
        </div>
      </div>

      {/* Two Column Layout: Acknowledged Items Pending Recon & Completed Records */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Acknowledged Items Ready for Recon */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Acknowledged Items Ready for Consistency Check ({ackItems.length})
            </h3>
          </div>

          <Card className="p-0 rounded-2xl border overflow-hidden shadow-xs">
            {isLoadingAck ? (
              <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
                Scanning acknowledged items...
              </div>
            ) : ackItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/60 mx-auto mb-2" />
                No acknowledged items currently pending internal reconciliation.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {ackItems.map((item) => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {item.sourceId}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Amount: <strong className="text-foreground font-mono">{item.currency} {Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </span>
                      {item.externalReference && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          Tally Ref: {item.externalReference}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setReconItemId(item.id)}
                        className="text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Run Check
                      </Button>
                      <Link
                        href={`/procurement/purchase-orders/${item.sourceId}`}
                        className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1"
                      >
                        <span>PO</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Reconciled Records Log */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Internal Consistency Records Log ({records.length})
            </h3>
          </div>

          <Card className="p-0 rounded-2xl border overflow-hidden shadow-xs">
            {isLoadingRecords ? (
              <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
                Loading reconciliation records...
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <FileCheck className="h-6 w-6 text-muted-foreground/60 mx-auto mb-2" />
                No internal reconciliation checks executed yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {records.map((rec) => (
                  <div key={rec.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          Item ID: {rec.jobItemId.substring(0, 8)}...
                        </span>
                        <StatusBadge status={rec.status} />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(rec.createdAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Internal Amount</span>
                        <span className="font-mono font-bold text-foreground">
                          INR {Number(rec.internalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">External Tally Amount</span>
                        <span className="font-mono text-muted-foreground">
                          {rec.externalAmount ? `INR ${rec.externalAmount}` : 'Null (No live API)'}
                        </span>
                      </div>
                    </div>

                    {rec.resolutionNotes && (
                      <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/40">
                        {rec.resolutionNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Run Reconcile Modal */}
      {reconItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg p-6 rounded-2xl shadow-xl border space-y-4 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground font-manrope">
                  Execute Internal Consistency Audit
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  Job Item ID: {reconItemId}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setReconItemId(null)}>
                Close
              </Button>
            </div>

            {reconError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold">
                {reconError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-muted border border-border/60 text-xs text-muted-foreground leading-relaxed">
              This routine verifies payload fingerprint uniqueness across all active jobs, checks state-machine terminal validity, and records an internal audit entry.
            </div>

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Audit / Resolution Notes *
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={() => setReconItemId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleReconcile(reconItemId)}
                disabled={reconcileMutation.isPending}
                className="font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {reconcileMutation.isPending ? 'Verifying...' : 'Confirm Internal Consistency'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
