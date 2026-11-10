'use client';

import React, { useState } from 'react';
import {
  useIntegrationJobs,
  useIntegrationJob,
  useExportBatch,
  useManualAcknowledgeItem,
} from '@/features/finance/hooks';
import { Card, Button, Badge, Input } from '@synergy/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import { StatusBadge } from '@/components/StatusBadge';
import {
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function FinanceExportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedJobId = searchParams.get('jobId');

  const [ackItemId, setAckItemId] = useState<string | null>(null);
  const [extRef, setExtRef] = useState('');
  const [ackNotes, setAckNotes] = useState('Manually confirmed voucher entry posted in Tally ERP');
  const [ackError, setAckError] = useState<string | null>(null);

  const { data: jobsData, isLoading: isLoadingJobs, refetch: refetchJobs, isFetching } = useIntegrationJobs();
  const { data: activeJob, refetch: refetchActiveJob } = useIntegrationJob(
    selectedJobId || (jobsData?.jobs[0]?.id ?? '')
  );

  const exportMutation = useExportBatch();
  const ackMutation = useManualAcknowledgeItem();

  const handleExport = async (jobId: string) => {
    try {
      await exportMutation.mutateAsync(jobId);
      refetchActiveJob();
      refetchJobs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleManualAcknowledge = async (itemId: string) => {
    setAckError(null);
    try {
      await ackMutation.mutateAsync({
        itemId,
        data: {
          externalReference: extRef.trim() || undefined,
          notes: ackNotes.trim() || undefined,
        },
      });
      setAckItemId(null);
      setExtRef('');
      refetchActiveJob();
      refetchJobs();
    } catch (err: unknown) {
      setAckError(err instanceof Error ? err.message : 'Acknowledgement failed');
    }
  };

  const jobs = jobsData?.jobs || [];
  const currentJob = activeJob || jobs[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-md">
              Batch Sync Execution
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Manual Finance Acknowledgement Required
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-manrope">
            Export Runs & Batch Synchronization
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Trigger structured batch file generation via the Tally Export adapter. Acknowledgement requires explicit finance confirmation upon applying the batch in Tally.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            refetchJobs();
            refetchActiveJob();
          }}
          disabled={isFetching}
          className="gap-2 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh Runs
        </Button>
      </div>

      <FinanceNavigationTabs />

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Job Batches List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Batch Export History
          </h3>

          {isLoadingJobs ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4 rounded-xl animate-pulse bg-muted/40 h-20" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <Card className="p-6 text-center rounded-xl border-dashed">
              <UploadCloud className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No export runs generated yet.</p>
              <Link href="/finance/queue" className="mt-2 inline-block">
                <Button size="sm" variant="outline" className="text-xs mt-2">
                  Stage Transactions
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => {
                const isSelected = currentJob?.id === j.id;

                return (
                  <Card
                    key={j.id}
                    onClick={() => router.push(`/finance/exports?jobId=${j.id}`)}
                    className={`p-4 rounded-xl cursor-pointer border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-xs'
                        : 'border-border/60 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {j.batchNumber}
                      </span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{j.totalItems} items ({j.sourceType})</span>
                      <span>{new Date(j.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected Batch Details & Items */}
        <div className="lg:col-span-2 space-y-6">
          {!currentJob ? (
            <Card className="p-12 text-center rounded-2xl border-dashed">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <h3 className="text-sm font-bold text-foreground">Select an export run to inspect details</h3>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Batch Summary Card */}
              <Card className="p-6 rounded-2xl border shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-foreground font-mono">
                        {currentJob.batchNumber}
                      </h2>
                      <StatusBadge status={currentJob.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Created on {new Date(currentJob.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {currentJob.status === 'QUEUED' && (
                    <Button
                      size="sm"
                      onClick={() => handleExport(currentJob.id)}
                      disabled={exportMutation.isPending}
                      className="gap-2 text-xs font-semibold bg-primary"
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      {exportMutation.isPending ? 'Generating Batch File...' : 'Trigger Batch Export'}
                    </Button>
                  )}
                </div>

                {/* Batch File Reference Callout */}
                {currentJob.batchFileRef && (
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-start gap-3">
                    <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Export File Generated (Stub Adapter)
                      </span>
                      <p className="font-mono text-xs text-foreground font-semibold break-all">
                        {currentJob.batchFileRef}
                      </p>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        File written to server export storage. Finance accountant must apply this file in Tally and manually acknowledge each item below.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Items</span>
                    <span className="font-mono font-bold text-foreground text-sm">{currentJob.totalItems}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Source Type</span>
                    <span className="font-mono font-bold text-foreground">{currentJob.sourceType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Export Status</span>
                    <span className="font-mono font-bold text-foreground">{currentJob.status}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Created By</span>
                    <span className="font-mono text-muted-foreground truncate block">{currentJob.createdById}</span>
                  </div>
                </div>
              </Card>

              {/* Items Table */}
              <Card className="p-0 rounded-2xl border overflow-hidden shadow-xs">
                <div className="border-b border-border/60 bg-muted/40 px-5 py-3.5 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Batch Items ({currentJob.items?.length || currentJob.totalItems})
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Items transition to SENT on export, then ACKNOWLEDGED via finance sign-off
                  </span>
                </div>

                <div className="divide-y divide-border/60">
                  {currentJob.items?.map((item) => {
                    const isSent = item.status === 'SENT' || item.status === 'EXPORTED';
                    const isAck = item.status === 'ACKNOWLEDGED' || item.status === 'RECONCILED';

                    return (
                      <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {item.sourceId}
                            </span>
                            <StatusBadge status={item.status} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Amount: <strong className="text-foreground font-mono">{item.currency} {Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
                            {item.externalReference && (
                              <span>· Tally Ref: <strong className="text-foreground font-mono">{item.externalReference}</strong></span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            Fingerprint: {item.payloadFingerprint.substring(0, 16)}...
                          </div>
                        </div>

                        {/* Action column */}
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          {isSent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAckItemId(item.id)}
                              className="text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Manual Finance Confirm
                            </Button>
                          )}

                          {isAck && (
                            <Link href="/finance/reconciliation">
                              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground gap-1">
                                <span>Reconciliation</span>
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}

                          <Link
                            href={`/procurement/purchase-orders/${item.sourceId}`}
                            className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 ml-2"
                          >
                            <span>PO</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Manual Acknowledgement Modal */}
      {ackItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg p-6 rounded-2xl shadow-xl border space-y-4 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground font-manrope">
                  Manual Finance Acknowledgement
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  Item ID: {ackItemId}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAckItemId(null)}>
                Close
              </Button>
            </div>

            {ackError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold">
                {ackError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
              <strong>Human Confirmation Step:</strong> This action certifies that the batch voucher entry has been manually posted and verified in Tally ERP. The system will NOT auto-acknowledge.
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Tally Voucher / Reference Number (Optional)
                </label>
                <Input
                  type="text"
                  value={extRef}
                  onChange={(e) => setExtRef(e.target.value)}
                  placeholder="e.g. VCH-PUR-2026-0042"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Confirmation Notes *
                </label>
                <textarea
                  rows={3}
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={() => setAckItemId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleManualAcknowledge(ackItemId)}
                disabled={ackMutation.isPending}
                className="font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {ackMutation.isPending ? 'Confirming...' : 'I Confirm Entry in Tally'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
