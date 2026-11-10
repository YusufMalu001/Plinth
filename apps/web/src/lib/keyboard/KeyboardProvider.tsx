'use client';

import { useEffect } from 'react';
import {
  shouldBail,
  getPrimarySubmitter,
  canSubmit,
  isEntryTarget,
  moveFocus,
  isThrottled,
  stampThrottle,
} from './form-keyboard';

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only Enter is handled; everything else passes through immediately.
      if (e.key !== 'Enter') return;
      if (shouldBail(e)) return;

      const target = e.target as Element;
      const form = target.closest<HTMLFormElement>('form');
      if (!form) return;
      if (target.closest('[data-keyboard-ignore]')) return;

      const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey;

      // ── Ctrl+Enter / Cmd+Enter ────────────────────────────────────────────
      if (ctrl && !e.shiftKey) {
        const submitter = getPrimarySubmitter(form);
        if (!canSubmit(form, submitter)) return;
        if (isThrottled(form)) { e.preventDefault(); return; }
        e.preventDefault();
        stampThrottle(form);
        form.requestSubmit(submitter);
        return;
      }

      // ── Ctrl+Shift+Enter / Cmd+Shift+Enter ────────────────────────────────
      if (ctrl && e.shiftKey) {
        if (!form.matches('[data-submit-and-new]')) return;
        const submitter = getPrimarySubmitter(form);
        if (!canSubmit(form, submitter)) return;
        if (isThrottled(form)) { e.preventDefault(); return; }
        e.preventDefault();
        stampThrottle(form);
        form.dataset.submitMode = 'new';
        let cleaned = false;
        const cleanMode = () => {
          if (cleaned) return;
          cleaned = true;
          delete form!.dataset.submitMode;
        };
        form.addEventListener('submit', cleanMode, { once: true });
        setTimeout(cleanMode, 0);
        form.requestSubmit(submitter);
        return;
      }

      // Plain Enter and Shift+Enter from here on (no ctrl, no meta, no alt).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ── Chat mode: textarea[data-enter-submits] ───────────────────────────
      if (
        target instanceof HTMLTextAreaElement &&
        target.matches('[data-enter-submits]') &&
        !e.shiftKey
      ) {
        const submitter = getPrimarySubmitter(form);
        if (!canSubmit(form, submitter)) return;
        if (isThrottled(form)) { e.preventDefault(); return; }
        e.preventDefault();
        stampThrottle(form);
        form.requestSubmit(submitter);
        return;
        // Shift+Enter in chat textarea → native newline, no action.
      }

      // ── Entry mode ────────────────────────────────────────────────────────
      if (form.matches('[data-keyboard-mode="entry"]') && isEntryTarget(target)) {
        const direction = e.shiftKey ? -1 : 1;
        const moved = moveFocus(form, target, direction);
        if (moved) e.preventDefault();
        // If not moved (at boundary), native behavior (newline or nothing).
        return;
      }

      // Everything else: do nothing.
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <>{children}</>;
}
