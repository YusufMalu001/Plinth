'use client';

import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@synergy/ui';

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  error?: string | null;
  isDeleting?: boolean;
  confirmText?: string;
  loadingText?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  title,
  message,
  error,
  isDeleting = false,
  confirmText = 'Confirm delete',
  loadingText = 'Deleting…',
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex min-h-screen min-h-[100dvh] w-screen items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={() => !isDeleting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="confirm-delete-title" className="text-base font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={onConfirm}>{isDeleting ? loadingText : confirmText}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
