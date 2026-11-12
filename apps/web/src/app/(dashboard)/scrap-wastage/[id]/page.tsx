"use client";

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useLossEvent,
  useClassifyLossEvent,
  useReviewLossEvent,
  useApproveLossEvent,
  useRejectLossEvent,
  useInvestigateLossEvent,
  usePostLossStockEffect,
  useIssueReplacementChallan
} from '@/features/loss-management/hooks';
import { useCurrentUser } from '@/features/auth/hooks';
import { useProcurementSelectors } from '@/features/purchases/hooks';
import { Card, Button } from '@plinth/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ToleranceBasisBadge } from '@/features/loss-management/components/ToleranceBasisBadge';
import { EvidenceAttachmentField } from '@/features/loss-management/components/EvidenceAttachmentField';
import { LossEventTimeline } from '@/features/loss-management/components/LossEventTimeline';
import { LossDispositionPanel } from '@/features/loss-management/components/LossDispositionPanel';
import { ReplacementChallanModal } from '@/features/loss-management/components/ReplacementChallanModal';
import { showToast } from '@/components/toast-store';
import {
  ArrowLeft,
  Trash2,
  Package,
  Warehouse,
  History,
  FileCheck2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
export default function LossEventDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: user } = useCurrentUser();
  const { data: selectors } = useProcurementSelectors();

  const { data: event, isLoading, error, refetch } = useLossEvent(id);

  const classifyMutation = useClassifyLossEvent();
  const reviewMutation = useReviewLossEvent();
  const approveMutation = useApproveLossEvent();
  const rejectMutation = useRejectLossEvent();
  const investigateMutation = useInvestigateLossEvent();
  const postStockMutation = usePostLossStockEffect();
  const replacementMutation = useIssueReplacementChallan();

  const [activeTab, setActiveTab] = useState<'DISPOSITION' | 'TIMELINE'>('DISPOSITION');
  const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-xs text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-primary" />
        Loading loss event details...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <h3 className="text-sm font-bold text-foreground">Loss Event Not Found</h3>
        <p className="text-xs text-muted-foreground">
          The requested scrap/loss event does not exist or you do not have permission to view it.
        </p>
        <Link href="/scrap-wastage">
          <Button variant="outline" className="h-9 text-xs">
            Return to Scrap & Wastage Hub
          </Button>
        </Link>
      </div>
    );
  }

  const isMutating =
    classifyMutation.isPending ||
    reviewMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    investigateMutation.isPending ||
    postStockMutation.isPending ||
    replacementMutation.isPending;

  return (
    <div className="flex-1 w-full bg-muted/20 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="w-full space-y-5">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/scrap-wastage"
              className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-xl font-bold text-foreground">
                  {event.lossNumber}
                </span>
                <StatusBadge status={event.status} />
                <StatusBadge status={event.sourceType} className="scale-90 origin-left" />
                {(() => {
                  const r = (event.reason || '').toLowerCase();
                  let badgeText = 'Scenario 4: Customer / Trader RMA';
                  if (event.materialId || event.sourceType === 'GRN_DISCREPANCY' || r.includes('raw material') || r.includes('incoming') || r.includes('dock') || r.includes('supplier')) {
                    badgeText = 'Scenario 1: Inward Raw Material QC Failure';
                  } else if (event.sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION' || r.includes('semi-finished') || r.includes('wip') || r.includes('machine') || r.includes('cnc') || r.includes('welding') || r.includes('shopfloor')) {
                    badgeText = 'Scenario 2: In-Process Semi-Finished WIP Defect';
                  } else if (r.includes('final') || r.includes('assembly') || r.includes('qa') || r.includes('cosmetic') || r.includes('testing') || event.sourceType === 'QC_REJECTION_NO_BATCH') {
                    badgeText = 'Scenario 3: Final Goods Assembly QC Defect';
                  }
                  return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border border-border bg-muted/50 text-foreground font-mono">
                      {badgeText}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reported on {format(new Date(event.reportedAt), 'MMMM d, yyyy · HH:mm')} by{' '}
                <strong className="text-foreground">
                  {event.reportedByActorName || event.reportedByActorId}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="h-9 px-3 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {actionError && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Main Content Layout: 2-Column Responsive Workspace */}
        {/* Main Content Layout: Balanced 2-Column Full-Width Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (4 Cols): Item Specs, Origin, Sourced Tolerance & Observation Details */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
              <div className="flex items-center justify-between border-border-strong border-border pb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Material &amp; Loss Details
                  </span>
                </div>
                <span className="font-mono text-base font-bold text-foreground">
                  {event.quantity} {event.uomCode || 'units'}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Material / Item</span>
                  <div className="font-bold text-sm text-foreground">
                    {event.materialName || event.productName || 'Material Item'}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {event.itemCode || 'Code: —'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Originating Dept</span>
                    <div className="font-semibold text-foreground">
                      {event.departmentName || 'Plant-wide'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Location</span>
                    <div className="font-semibold text-foreground flex items-center gap-1">
                      <Warehouse className="w-3 h-3 text-muted-foreground" />
                      <span>{event.locationName || 'General Shopfloor'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50 space-y-1.5">
                  <span className="text-muted-foreground block text-[11px]">WastageRule Sourced Basis</span>
                  <ToleranceBasisBadge
                    classification={event.classification}
                    appliedWastageRuleCode={event.appliedWastageRuleCode}
                    appliedWastageRuleVersion={event.appliedWastageRuleVersion}
                    appliedWastageRuleId={event.appliedWastageRuleId}
                    varianceFromExpected={event.varianceFromExpected}
                    showDetails={true}
                    className="w-full"
                  />
                </div>

                {event.stockEffectRef && (
                  <div className="pt-2 border-t border-border/50 text-[11px] text-tone-green-text font-mono font-medium flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Ledger Posted: {event.stockEffectRef}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Observation Reason & Evidence Card */}
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-border-strong border-border pb-2.5">
                <Trash2 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Observation Reason &amp; Evidence
                </h3>
              </div>

              <p className="text-xs text-foreground leading-relaxed bg-muted/30 p-3 rounded-xl border border-border/60 whitespace-pre-wrap">
                {event.reason || 'No description provided.'}
              </p>

              <EvidenceAttachmentField
                evidenceUrls={(event as any).evidenceUrls || (event as any).evidenceAttachmentUrls || []}
                readOnly={true}
              />
            </Card>
          </div>

          {/* Right Column (8 Cols): Tabbed Governance Workspace & Timeline */}
          <div className="lg:col-span-8 space-y-4">
            {/* Tab Selector */}
            <div className="flex items-center gap-2 border-border-strong border-border pb-2">
              <button
                onClick={() => setActiveTab('DISPOSITION')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'DISPOSITION'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                Disposition &amp; Governance
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('TIMELINE')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === 'TIMELINE'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Audit &amp; Timeline History
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'DISPOSITION' ? (
              <LossDispositionPanel
                event={event}
                currentUser={user}
                isLoading={isMutating}
                onClassify={async (basisQuantity) => {
                  setActionError(null);
                  try {
                    await classifyMutation.mutateAsync({
                      id: event.id,
                      payload: { basisQuantity },
                    });
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to classify loss event.');
                  }
                }}
                onReview={async (reviewNotes) => {
                  setActionError(null);
                  try {
                    await reviewMutation.mutateAsync({
                      id: event.id,
                      payload: { reviewNotes },
                    });
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to review loss event.');
                  }
                }}
                onApprove={async () => {
                  setActionError(null);
                  try {
                    await approveMutation.mutateAsync(event.id);
                    showToast({
                      kind: 'success',
                      title: 'Scrap Proposal Approved',
                      message: `Loss event ${event.lossNumber} approved. You can now issue replacement material or post stock adjustment.`,
                    });
                    refetch();
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to approve loss event.');
                  }
                }}
                onReject={async (rejectionReason) => {
                  setActionError(null);
                  try {
                    await rejectMutation.mutateAsync({
                      id: event.id,
                      payload: { rejectionReason },
                    });
                    showToast({
                      kind: 'success',
                      title: 'Scrap Reverted to Department',
                      message: `Scrap rejected and ${event.quantity} units returned to department queue. Floor execution unpaused.`,
                    });
                    refetch();
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to reject loss event.');
                  }
                }}
                onInvestigate={async (investigationNotes) => {
                  setActionError(null);
                  try {
                    await investigateMutation.mutateAsync({
                      id: event.id,
                      payload: { investigationNotes },
                    });
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to submit investigation.');
                  }
                }}
                onPostStock={async () => {
                  setActionError(null);
                  try {
                    await postStockMutation.mutateAsync(event.id);
                  } catch (e: any) {
                    setActionError(e?.message || 'Failed to post inventory stock effect.');
                  }
                }}
                onOpenReplacementModal={() => setIsReplacementModalOpen(true)}
              />
            ) : (
              <Card className="p-6 rounded-2xl border border-border bg-card shadow-xs">
                <LossEventTimeline event={event} />
              </Card>
            )}
          </div>
        </div>

        {/* Replacement Challan Issuance Modal */}
        <ReplacementChallanModal
          event={event}
          isOpen={isReplacementModalOpen}
          onClose={() => setIsReplacementModalOpen(false)}
          isLoading={replacementMutation.isPending}
          locations={selectors?.locations?.items ?? []}
          departments={selectors?.departments?.items ?? []}
          onSubmit={async (payload) => {
            await replacementMutation.mutateAsync({
              id: event.id,
              payload,
            });
            showToast({
              kind: 'success',
              title: 'Replacement Material Dispatched',
              message: `Replacement challan issued and stock dispatched to department. Floor execution refilled and unpaused.`,
            });
            refetch();
          }}
        />
      </div>
    </div>
  );
}
