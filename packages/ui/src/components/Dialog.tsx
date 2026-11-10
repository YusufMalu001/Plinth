import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../index';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted || typeof document === 'undefined') return null;

  const content = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Full-screen Dark Backdrop covering the entire viewport including header */}
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      {/* Dialog Card with rounded corners, clean border, and overflow hidden */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl overflow-hidden',
          className
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

