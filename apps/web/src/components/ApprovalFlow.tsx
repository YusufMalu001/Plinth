'use client';

import React, { useState } from 'react';
import { Button, Card } from '@plinth/ui';
import { LifecycleStatus } from '@plinth/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../features/api/client';
import { ShieldCheck, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { showToast } from './toast-store';
import { friendlyErrorMessage } from '../features/auth/access-control';

interface ApprovalFlowProps {
  entityId: string;
  entityTypePath: string; // e.g. 'materials', 'uom', 'products', 'rules/qc'
  currentStatus: LifecycleStatus;
  hasPermission: boolean;
  onSuccess?: () => void;
}

export function ApprovalFlow({
  entityId,
  entityTypePath,
  currentStatus,
  hasPermission,
  onSuccess,
}: ApprovalFlowProps) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');

  const approveMutation = useMutation({
    mutationFn: (data: { remarks?: string }) =>
      fetchApi(`/${entityTypePath}/${entityId}/approve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityTypePath, entityId] });
      queryClient.invalidateQueries({ queryKey: [entityTypePath] });
      showToast({
        kind: 'success',
        title: 'Record Approved',
        message: 'Master record approved and promoted to active status.',
      });
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
      showToast({
        kind: 'error',
        title: 'Approval Failed',
        message: friendlyErrorMessage(err),
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { remarks?: string }) =>
      fetchApi(`/${entityTypePath}/${entityId}/reject`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityTypePath, entityId] });
      queryClient.invalidateQueries({ queryKey: [entityTypePath] });
      showToast({
        kind: 'info',
        title: 'Changes Requested',
        message: 'Record returned to draft for revisions.',
      });
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
      showToast({
        kind: 'error',
        title: 'Rejection Failed',
        message: friendlyErrorMessage(err),
      });
    },
  });

  if (currentStatus !== 'PENDING_VALIDATION') {
    return null;
  }

  if (!hasPermission) {
    return (
      <Card className="p-5 border border-[#004a80]/20 bg-[#004a80]/5 rounded-2xl shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#004a80]/10 text-[#004a80] dark:text-blue-400 border border-[#004a80]/20 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#004a80] dark:text-blue-300">
              Pending Validation Sign-off
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              This master record has been submitted and is currently in the validation queue. You do not currently have approval clearance.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border border-[#004a80]/30 bg-card shadow-xs overflow-hidden">
      {/* Header with Navy Accent */}
      <div className="bg-[#004a80]/10 border-b border-[#004a80]/20 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#004a80] text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#004a80] dark:text-blue-400 block">
              Validation & Compliance Gate
            </span>
            <h3 className="text-xs font-bold text-foreground">
              Pending Technical Review & Approval
            </h3>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold text-[#004a80] dark:text-blue-300 bg-[#004a80]/15 px-2.5 py-0.5 rounded-full border border-[#004a80]/30">
          <span className="h-1.5 w-1.5 rounded-full bg-[#004a80] animate-pulse" />
          Sign-off Required
        </span>
      </div>

      <div className="p-5 space-y-4 text-xs">
        <p className="text-muted-foreground leading-relaxed">
          Review the engineering specifications, tax compliance, and inventory parameters above. Approving will promote this record to <strong className="text-foreground">APPROVED / ACTIVE</strong> in the ERP catalog.
        </p>

        {/* Validation Checklist Preview */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Schema & Unique Code Verification</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>HSN & Tax Rate Validation</span>
          </div>
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Unit of Measure Reference Active</span>
          </div>
        </div>

        {/* Approval Remarks Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Reviewer Remarks / Audit Note (Optional)
          </label>
          <textarea
            className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-[#004a80] focus:ring-4 focus:ring-[#004a80]/10 transition-all resize-none shadow-xs"
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Add compliance notes or justification..."
          />
        </div>

        {/* Action Buttons Suite */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rejectMutation.mutate({ remarks })}
            disabled={approveMutation.isPending || rejectMutation.isPending}
            className="text-xs font-semibold hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30"
          >
            <XCircle className="w-3.5 h-3.5 mr-1 text-red-500" />
            {rejectMutation.isPending ? 'Requesting...' : 'Request Changes'}
          </Button>

          <Button
            size="sm"
            onClick={() => approveMutation.mutate({ remarks })}
            disabled={approveMutation.isPending || rejectMutation.isPending}
            className="bg-[#004a80] hover:bg-[#003c68] text-white font-bold shadow-xs text-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {approveMutation.isPending ? 'Authorizing...' : 'Approve & Activate'}
          </Button>
        </div>

        {(approveMutation.isError || rejectMutation.isError) && (
          <div className="p-3 bg-red-500/10 text-red-600 rounded-xl border border-red-500/20 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {(approveMutation.error as Error)?.message ||
                (rejectMutation.error as Error)?.message ||
                'Action failed. Please verify permissions.'}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
