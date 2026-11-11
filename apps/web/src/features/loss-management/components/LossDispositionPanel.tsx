'use client';

import React, { useState } from 'react';
import { LossEventDto, SafeUser } from '@plinth/types';
import {
  Card,
  Button
} from '@plinth/ui';
import {
  CheckCircle2,
  XCircle,
  Search,
  FileCheck2,
  RefreshCw,
  Scale,
  Lock
} from 'lucide-react';

export interface LossDispositionPanelProps {
  event: LossEventDto;
  currentUser?: SafeUser | null;
  onClassify: (basisQuantity?: number) => Promise<void>;
  onReview: (reviewNotes?: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onReject: (rejectionReason: string) => Promise<void>;
  onInvestigate: (investigationNotes: string) => Promise<void>;
  onPostStock: () => Promise<void>;
  onOpenReplacementModal: () => void;
  isLoading?: boolean;
}

export function LossDispositionPanel({
  event,
  currentUser,
  onClassify,
  onReview,
  onApprove,
  onReject,
  onInvestigate,
  onPostStock,
  onOpenReplacementModal,
  isLoading = false,
}: LossDispositionPanelProps) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [basisQuantity, setBasisQuantity] = useState<string>('');
  const [activeModal, setActiveModal] = useState<
    'NONE' | 'REVIEW' | 'REJECT' | 'INVESTIGATE' | 'CLASSIFY'
  >('NONE');

  // Separation of Duties check: A reporter cannot approve their own loss event.
  const isReporter = currentUser?.id === event.reportedByActorId;
  const canApprove =
    event.status === 'REPORTED' ||
    event.status === 'REVIEWED' ||
    (event.status === 'INVESTIGATED' && event.classification === 'ABNORMAL');
  const canPostStock = event.status === 'APPROVED' && !event.stockEffectRef;
  const canReplace =
    event.status !== 'POSTED' &&
    event.status !== 'REJECTED' &&
    event.status !== 'REPLACED' &&
    !event.replacementChallanRef &&
    !isReporter;

  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-5">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Disposition &amp; Approval Governance
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Execute required review gatekeeping, root-cause investigation, and multi-tier store approval.
        </p>
      </div>
      {/* Separation of Duties Warning */}
      {isReporter && (
        <div
          data-testid="separation-of-duties-banner"
          className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/40 border border-border text-foreground text-xs"
        >
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <div>
            <span className="font-semibold block">Separation of Duties Enforced</span>
            <span>
              You reported this loss event (<strong className="font-mono">{event.lossNumber}</strong>).
              Per ERP governance rules, you cannot review or approve your own submission. Another authorized reviewer/manager must act on this event.
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. Classify Action */}
        {event.status === 'REPORTED' && (
          <button
            type="button"
            disabled={isLoading || isReporter}
            onClick={() => setActiveModal('CLASSIFY')}
            className="h-auto py-3 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl border border-border bg-background shadow-xs hover:border-primary/50 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
            data-testid="action-classify-btn"
          >
            <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
              <Scale className="w-4 h-4 text-primary" />
              <span>Evaluate Wastage Rule</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-normal whitespace-normal">
              Compare loss against approved WastageRule version & threshold.
            </span>
          </button>
        )}

        {/* 2. Review Action */}
        {event.status === 'REPORTED' && event.classification && (
          <button
            type="button"
            disabled={isLoading || isReporter}
            onClick={() => setActiveModal('REVIEW')}
            className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl border border-border bg-card shadow-2xs hover:border-primary/50 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
            data-testid="action-review-btn"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>Complete Technical Review</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-normal whitespace-normal">
              Verify operational context and move to review state.
            </span>
          </button>
        )}

        {/* 3. Investigate Action (Abnormal Loss Events) */}
        {event.classification === 'ABNORMAL' &&
          (event.status === 'REPORTED' || event.status === 'REVIEWED') && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setActiveModal('INVESTIGATE')}
              className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/40 shadow-2xs disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
              data-testid="action-investigate-btn"
            >
              <div className="flex items-center gap-2 font-bold text-xs text-foreground">
                <Search className="w-4 h-4 text-primary" />
                <span>Conduct Root Cause Investigation</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-normal whitespace-normal">
                Mandatory for abnormal variance before approval.
              </span>
            </button>
          )}

        {/* Scenario 1: Accept Scrap & Issue Replacement Stock */}
        {canReplace && (
          <button
            type="button"
            disabled={isLoading}
            onClick={onOpenReplacementModal}
            className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
            data-testid="action-issue-replacement-btn"
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <RefreshCw className="w-4 h-4" />
              <span>Accept Scrap &amp; Issue Replacement Stock</span>
            </div>
            <span className="text-[11px] text-primary-foreground/80 font-normal whitespace-normal">
              Accept scrap, auto-fetch store inventory, dispatch replacement stock to department &amp; unpause execution.
            </span>
          </button>
        )}

        {/* 4. Approve Action without Replacement */}
        {!isReporter && canApprove && (
          <button
            type="button"
            disabled={isLoading}
            onClick={onApprove}
            className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/40 shadow-2xs disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
            data-testid="action-approve-btn"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>Approve as Scrap (Without Replacement)</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-normal whitespace-normal">
              Store Manager approval to validate scrap write-off without issuing store stock.
            </span>
          </button>
        )}

        {/* Scenario 2: Reject Scrap & Revert Material to Department */}
        {event.status !== 'POSTED' &&
          event.status !== 'REJECTED' &&
          event.status !== 'REPLACED' &&
          !isReporter && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setActiveModal('REJECT')}
              className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl border border-border bg-card hover:border-destructive/40 hover:bg-destructive/5 text-foreground shadow-2xs disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
              data-testid="action-reject-btn"
            >
              <div className="flex items-center gap-2 font-bold text-xs text-destructive">
                <XCircle className="w-4 h-4" />
                <span>Reject &amp; Revert to Department</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-normal whitespace-normal">
                Material is workable. Revert full stock back to department queue &amp; unpause production execution.
              </span>
            </button>
          )}

        {/* 6. Post Stock Effect Action */}
        {canPostStock && (
          <button
            type="button"
            disabled={isLoading}
            onClick={onPostStock}
            className="h-auto py-3.5 px-4 justify-start flex flex-col items-start gap-1 text-left rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs disabled:pointer-events-none disabled:opacity-50 transition-all cursor-pointer"
            data-testid="action-post-stock-btn"
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <FileCheck2 className="w-4 h-4" />
              <span>Post Stock Ledger Effect</span>
            </div>
            <span className="text-[11px] text-primary-foreground/80 font-normal whitespace-normal">
              Post atomic StockAdjustment to update physical balances.
            </span>
          </button>
        )}
      </div>

      {/* Classify Modal Dialog */}
      {activeModal === 'CLASSIFY' && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground">
              Classify Loss against WastageRule
            </h4>
            <button
              type="button"
              onClick={() => setActiveModal('NONE')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Evaluate this event against the approved WastageRule version for{' '}
            <strong className="text-foreground">{event.materialName || event.productName}</strong>.
            Optionally specify a total batch/run basis quantity for variance calculation.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Total batch/run basis qty (optional)"
              value={basisQuantity}
              onChange={(e) => setBasisQuantity(e.target.value)}
              className="flex-1 h-9 px-3 text-xs bg-background border border-border rounded-lg"
            />
            <Button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                await onClassify(basisQuantity ? Number(basisQuantity) : undefined);
                setActiveModal('NONE');
              }}
              className="h-9 px-4 text-xs font-semibold"
            >
              Run Evaluation
            </Button>
          </div>
        </div>
      )}

      {/* Review Modal Dialog */}
      {activeModal === 'REVIEW' && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground">Record Technical Review Notes</h4>
            <button
              type="button"
              onClick={() => setActiveModal('NONE')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <textarea
            placeholder="Technical and operational findings (optional)..."
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={3}
            className="w-full p-2.5 text-xs bg-background border border-border rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                await onReview(reviewNotes);
                setActiveModal('NONE');
              }}
              className="h-9 px-4 text-xs font-semibold"
            >
              Confirm Review
            </Button>
          </div>
        </div>
      )}

      {/* Investigate Modal Dialog */}
      {activeModal === 'INVESTIGATE' && (
        <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground">
              Abnormal Variance Root Cause Investigation
            </h4>
            <button
              type="button"
              onClick={() => setActiveModal('NONE')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Provide a mandatory root cause analysis explaining why the loss exceeded approved tolerance limits.
          </p>
          <textarea
            placeholder="State root cause analysis, preventive actions taken, and equipment/handling condition (min 5 chars)..."
            value={investigationNotes}
            onChange={(e) => setInvestigationNotes(e.target.value)}
            rows={3}
            className="w-full p-2.5 text-xs bg-background border border-border rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              disabled={isLoading || investigationNotes.trim().length < 5}
              onClick={async () => {
                await onInvestigate(investigationNotes);
                setActiveModal('NONE');
              }}
              className="h-9 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Submit Investigation
            </Button>
          </div>
        </div>
      )}

      {/* Reject & Revert Modal Dialog */}
      {activeModal === 'REJECT' && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              <span>Reject Scrap Proposal &amp; Revert Stock to Department</span>
            </h4>
            <button
              type="button"
              onClick={() => setActiveModal('NONE')}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            The reported <strong className="text-foreground">{event.quantity} {event.uomCode || 'units'}</strong> will be reverted back into the department&apos;s pending production queue. The floor batch will be unpaused immediately and the Department Head will be notified to resume production with this material.
          </p>
          <textarea
            placeholder="Reason for reversion (e.g. Material is within acceptable fabrication tolerance; must rework or complete production on line)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            className="w-full p-2.5 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-destructive/20"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => setActiveModal('NONE')}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isLoading || rejectionReason.trim().length < 3}
              onClick={async () => {
                await onReject(rejectionReason);
                setActiveModal('NONE');
              }}
              className="h-9 px-4 text-xs font-bold bg-destructive hover:bg-destructive/90 text-white shadow-xs gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Reverting...' : 'Confirm Revert & Unpause Execution'}</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
