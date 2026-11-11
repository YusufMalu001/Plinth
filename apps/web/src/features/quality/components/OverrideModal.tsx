import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  ShieldAlert,
  Lock,
  RefreshCw,
  CheckSquare,
  Square
} from 'lucide-react';
import { QcQueueItemDto } from '@plinth/types';
import { qualityApi } from '../api';

interface OverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetItem: QcQueueItemDto;
}

export function OverrideModal({
  isOpen,
  onClose,
  onSuccess,
  targetItem
}: OverrideModalProps) {
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [hasConfirmedAuth, setHasConfirmedAuth] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isReasonValid = overrideReason.trim().length >= 5;
  const canSubmit = isReasonValid && hasConfirmedAuth && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await qualityApi.recordOverride({
        checkpointType: targetItem.checkpointType,
        targetType: targetItem.targetType,
        targetId: targetItem.targetId,
        overrideReason: overrideReason.trim(),
        sampledQuantity: targetItem.quantity || 1
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute mandatory gate override');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div
        data-testid="override-modal"
        className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Mandatory QC Gate Override
              </h3>
              <p className="text-[11px] text-muted-foreground font-medium">
                High-Privilege Managerial Action
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="p-6 space-y-5">
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-destructive">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <span>Strict Quality Gate Bypass Warning</span>
            </div>
            <p className="text-muted-foreground text-[11.5px] leading-relaxed">
              This action forces a <strong>PASS</strong> status for checkpoint{' '}
              <span className="font-mono font-semibold text-foreground">{targetItem.checkpointType}</span> on{' '}
              <span className="font-mono font-semibold text-foreground">{targetItem.referenceNumber}</span> without performing the standard criteria inspection.
              This bypasses standard quality assurance protocols and generates an indelible audit entry linked to your user account.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <form data-keyboard-submit="off" onSubmit={handleSubmit} className="space-y-4">
            {/* Override Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>
                  Detailed Executive Justification <span className="text-destructive">*</span>
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">Min 5 characters</span>
              </label>
              <textarea
                rows={3}
                required
                data-testid="override-reason-input"
                placeholder="State the formal reason, authorizing manager, and risk mitigation plan..."
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="w-full p-3 text-xs bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground transition-all"
              />
            </div>

            {/* Deliberate Confirmation Step */}
            <div
              onClick={() => setHasConfirmedAuth(!hasConfirmedAuth)}
              data-testid="override-confirm-checkbox"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer select-none transition-colors"
            >
              <button
                type="button"
                className="mt-0.5 text-primary shrink-0"
              >
                {hasConfirmedAuth ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <p className="text-xs text-foreground leading-relaxed">
                I confirm that I possess verified managerial authorization to override this mandatory quality checkpoint, and I acknowledge that this decision will be permanently logged in the audit ledger.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 text-foreground transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                data-testid="override-submit-button"
                className={`h-10 px-5 text-xs font-bold rounded-xl text-white shadow-sm flex items-center gap-2 transition-all cursor-pointer ${!canSubmit
                  ? 'bg-muted-foreground/30 cursor-not-allowed opacity-50'
                  : 'bg-destructive hover:bg-destructive/90 active:scale-[0.99]'
                  }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Override...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Authorize Force-Pass Override</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
