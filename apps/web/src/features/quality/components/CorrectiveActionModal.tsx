import React, { useState } from 'react';
import { X, RotateCcw, RefreshCw } from 'lucide-react';
import { CorrectiveActionDto, CorrectiveActionStatus } from '@plinth/types';
import { qualityApi } from '../api';

interface CorrectiveActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  action: CorrectiveActionDto;
}

export function CorrectiveActionModal({
  isOpen,
  onClose,
  onSuccess,
  action
}: CorrectiveActionModalProps) {
  const [status, setStatus] = useState<CorrectiveActionStatus>(action.status || 'IN_PROGRESS');
  const [resolutionNotes, setResolutionNotes] = useState<string>(action.resolutionNotes || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await qualityApi.updateCorrectiveAction(action.id, {
        status,
        resolutionNotes: resolutionNotes.trim() || undefined
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update corrective action');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5 text-primary">
            <RotateCcw className="w-5 h-5" />
            <h3 className="text-base font-semibold text-foreground">Update Corrective Action</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {errorMessage}
            </div>
          )}

          <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs space-y-1">
            <span className="text-muted-foreground block font-medium">Action Description</span>
            <p className="font-semibold text-foreground">{action.actionDescription}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              Resolution Status <span className="text-destructive">*</span>
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as CorrectiveActionStatus)}
              className="w-full h-10 px-3 text-xs bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 text-foreground"
            >
              <option value="OPEN">OPEN (Pending)</option>
              <option value="IN_PROGRESS">IN_PROGRESS (Under Execution)</option>
              <option value="COMPLETED">COMPLETED (Rework Finished)</option>
              <option value="VERIFIED">VERIFIED (Verified by Quality)</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              Resolution Notes
            </label>
            <textarea
              rows={3}
              placeholder="Describe work completed, adjustments made, or verification findings..."
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              className="w-full p-3 text-xs bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 text-foreground"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Status'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
