// ── Bail guard ─────────────────────────────────────────────────────────────
export function shouldBail(e: KeyboardEvent): boolean {
  return (
    e.defaultPrevented ||
    e.isComposing ||
    e.keyCode === 229 ||
    e.repeat
  );
}

// ── Submitter discovery ─────────────────────────────────────────────────────
export function getPrimarySubmitter(
  form: HTMLFormElement
): HTMLButtonElement | HTMLInputElement | null {
  for (const el of Array.from(form.elements)) {
    if (
      (el instanceof HTMLButtonElement && el.type === 'submit') ||
      (el instanceof HTMLInputElement && el.type === 'submit')
    ) {
      if (!el.matches('[data-keyboard-skip]')) {
        return el as HTMLButtonElement | HTMLInputElement;
      }
    }
  }
  return null;
}

// ── Submit guard ────────────────────────────────────────────────────────────
export function canSubmit(
  form: HTMLFormElement,
  submitter: HTMLButtonElement | HTMLInputElement | null
): boolean {
  if (!submitter) return false;
  if (form.matches('[data-keyboard-submit="off"]')) return false;
  if (submitter.matches('[data-keyboard-submit="off"]')) return false;
  if (submitter.disabled) return false;
  if (submitter.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

// ── Entry-mode target ───────────────────────────────────────────────────────
const ENTRY_INPUT_TYPES = new Set([
  'text', 'search', 'tel', 'url', 'email', 'number',
  'password', 'date', 'datetime-local', 'time', 'month', 'week',
]);

export function isEntryTarget(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (!ENTRY_INPUT_TYPES.has(el.type)) return false;
  if (el.closest('[data-scan]')) return false;
  if (el.closest('[data-keyboard-ignore]')) return false;
  if (el.getAttribute('aria-expanded') === 'true') return false;
  return true;
}

// ── Visibility ──────────────────────────────────────────────────────────────
export function isVisible(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.hasAttribute('hidden')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    if ((node as HTMLElement).inert) return false;
    const style = (node as HTMLElement).style;
    if (style) {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
    }
    node = node.parentElement;
  }
  return true;
}

// ── Tabbable list ───────────────────────────────────────────────────────────
export function getTabbables(form: HTMLFormElement): Element[] {
  const seenRadioGroups = new Set<string>();
  const result: Element[] = [];

  for (const el of Array.from(form.elements)) {
    if (el.matches('[data-keyboard-skip]')) continue;
    if (!(el instanceof HTMLElement)) continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    if ((el as HTMLElement).tabIndex < 0) continue;
    if ((el as HTMLInputElement).disabled) continue;
    if (!isVisible(el)) continue;

    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const name = el.name || '__unnamed__';
      if (seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
      // Prefer the checked radio, else use the first (this one)
      const checked = form.querySelector<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(name)}"]:checked`
      );
      result.push(checked ?? el);
      continue;
    }

    result.push(el);
  }

  return result;
}

// ── Focus movement ──────────────────────────────────────────────────────────
export function moveFocus(
  form: HTMLFormElement,
  from: Element,
  direction: 1 | -1
): boolean {
  const tabbables = getTabbables(form);
  const idx = tabbables.indexOf(from);
  if (idx === -1) return false;
  const next = tabbables[idx + direction];
  if (!next) return false;
  (next as HTMLElement).focus();
  if (next instanceof HTMLInputElement && ENTRY_INPUT_TYPES.has(next.type)) {
    try { next.select(); } catch { /* read-only or already selected */ }
  }
  return true;
}

// ── Throttle ────────────────────────────────────────────────────────────────
export const submitThrottle = new WeakMap<HTMLFormElement, number>();
const THROTTLE_MS = 800;

export function isThrottled(form: HTMLFormElement): boolean {
  const last = submitThrottle.get(form) ?? 0;
  return Date.now() - last < THROTTLE_MS;
}

export function stampThrottle(form: HTMLFormElement): void {
  submitThrottle.set(form, Date.now());
}
