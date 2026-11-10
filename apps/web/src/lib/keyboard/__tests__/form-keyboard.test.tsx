import React, { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { KeyboardProvider } from '../KeyboardProvider';
import { RESERVED_COMBOS, ReservedCombo } from '../reserved-keys';

describe('Form Keyboard Layer', () => {

  beforeEach(() => {
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function makeForm(html: string): HTMLFormElement {
    const trimmed = html.trim();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = trimmed.startsWith('<form') ? trimmed : `<form>${trimmed}</form>`;
    const form = wrapper.firstElementChild as HTMLFormElement;
    document.body.appendChild(form);
    return form;
  }

  function dispatch(el: Element, overrides: Partial<KeyboardEventInit> & { key: string }) {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...overrides,
    });
    el.dispatchEvent(event);
    return event;
  }

  function renderWithProvider(ui?: ReactElement) {
    return render(<KeyboardProvider>{ui ?? <div />}</KeyboardProvider>);
  }

  // ── Test 1 — Ctrl+Enter in textarea submits once ───────────────────────────
  it('submits form once on Ctrl+Enter in textarea', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const textarea = form.querySelector('textarea')!;
    const event = dispatch(textarea, { key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ── Test 2 — Cmd+Enter (metaKey) submits ────────────────────────────────────
  it('submits form on Cmd+Enter (metaKey)', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const textarea = form.querySelector('textarea')!;
    const event = dispatch(textarea, { key: 'Enter', metaKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ── Test 3 — Ctrl+Enter does nothing when submitter disabled ────────────────
  it('does nothing when submitter is disabled', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit" disabled>Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const textarea = form.querySelector('textarea')!;
    const event = dispatch(textarea, { key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── Test 4 — Ctrl+Enter does nothing on data-keyboard-submit="off" ──────────
  it('does nothing on data-keyboard-submit="off"', () => {
    renderWithProvider();
    const form = makeForm(`
      <form data-keyboard-submit="off">
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const textarea = form.querySelector('textarea')!;
    const event = dispatch(textarea, { key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── Test 5 — IME / repeat bail ──────────────────────────────────────────────
  it('bails when composing, keyCode is 229, or event repeats', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const textarea = form.querySelector('textarea')!;

    // 1. isComposing
    const e1 = dispatch(textarea, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(e1.defaultPrevented).toBe(false);

    // 2. keyCode === 229
    const e2 = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      ctrlKey: true,
      keyCode: 229,
    });
    textarea.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);

    // 3. repeat === true
    const e3 = dispatch(textarea, { key: 'Enter', ctrlKey: true, repeat: true });
    expect(e3.defaultPrevented).toBe(false);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── Test 6 — Throttle window: two rapid Ctrl+Enter → one submit ─────────────
  it('throttles rapid Ctrl+Enter submissions within 800ms', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const textarea = form.querySelector('textarea')!;

    const e1 = dispatch(textarea, { key: 'Enter', ctrlKey: true });
    const e2 = dispatch(textarea, { key: 'Enter', ctrlKey: true });

    expect(e1.defaultPrevented).toBe(true);
    expect(e2.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ── Test 7 — Plain Enter / Shift+Enter / Tab never prevented ────────────────
  it('never prevents plain Enter, Shift+Enter, or Tab on standard textarea', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const textarea = form.querySelector('textarea')!;

    const e1 = dispatch(textarea, { key: 'Enter' });
    const e2 = dispatch(textarea, { key: 'Enter', shiftKey: true });
    const e3 = dispatch(textarea, { key: 'Tab' });

    expect(e1.defaultPrevented).toBe(false);
    expect(e2.defaultPrevented).toBe(false);
    expect(e3.defaultPrevented).toBe(false);
  });

  // ── Test 8 — Standard form: Enter in single-line input is not intercepted ───
  it('does not intercept Enter in standard single-line input', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <input type="text" />
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const input = form.querySelector('input')!;

    const event = dispatch(input, { key: 'Enter' });

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ── Test 9 — Entry mode focus traversal ─────────────────────────────────────
  it('supports entry-mode focus traversal with Enter and Shift+Enter', () => {
    renderWithProvider();
    const form = makeForm(`
      <form data-keyboard-mode="entry">
        <input id="i1" type="text" />
        <input id="i-disabled" type="text" disabled />
        <input id="i-tabindex" type="text" tabindex="-1" />
        <input id="i-skip" type="text" data-keyboard-skip />
        <input id="i-hidden" type="text" style="display: none;" />
        <input id="i2" type="text" />
        <input id="i3" type="text" />
        <button id="btn-submit" type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const i1 = form.querySelector<HTMLInputElement>('#i1')!;
    const i2 = form.querySelector<HTMLInputElement>('#i2')!;
    const i3 = form.querySelector<HTMLInputElement>('#i3')!;
    const btnSubmit = form.querySelector<HTMLButtonElement>('#btn-submit')!;

    i1.focus();
    expect(document.activeElement).toBe(i1);

    // Enter on i1 -> skips disabled, tabindex=-1, skip, hidden -> focuses i2
    const e1 = dispatch(i1, { key: 'Enter' });
    expect(e1.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(i2);

    // Enter on i2 -> focuses i3
    const e2 = dispatch(i2, { key: 'Enter' });
    expect(e2.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(i3);

    // Enter on i3 -> focuses submit button, does NOT submit
    const e3 = dispatch(i3, { key: 'Enter' });
    expect(e3.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btnSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    // Shift+Enter from i3 -> moves back to i2
    i3.focus();
    const e4 = dispatch(i3, { key: 'Enter', shiftKey: true });
    expect(e4.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(i2);
  });

  // ── Test 10 — Entry mode ignores excluded targets ───────────────────────────
  it('does not traverse or intercept Enter on excluded targets in entry mode', () => {
    renderWithProvider();
    const form = makeForm(`
      <form data-keyboard-mode="entry">
        <textarea id="t"></textarea>
        <select id="s"><option>1</option></select>
        <button id="b" type="button">Btn</button>
        <a id="a" href="#">Link</a>
        <input id="cb" type="checkbox" />
        <input id="sc" type="text" data-scan />
        <input id="exp" type="text" aria-expanded="true" />
      </form>
    `);

    const targets = [
      form.querySelector('#t')!,
      form.querySelector('#s')!,
      form.querySelector('#b')!,
      form.querySelector('#a')!,
      form.querySelector('#cb')!,
      form.querySelector('#sc')!,
      form.querySelector('#exp')!,
    ];

    for (const target of targets) {
      (target as HTMLElement).focus();
      const initialActive = document.activeElement;
      const event = dispatch(target, { key: 'Enter' });
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(initialActive);
    }

    // Also verify when event is already defaultPrevented
    const i = document.createElement('input');
    i.type = 'text';
    form.appendChild(i);
    i.focus();
    const preventedEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });
    preventedEvent.preventDefault();
    i.dispatchEvent(preventedEvent);
    expect(document.activeElement).toBe(i);
  });

  // ── Test 11 — Chat mode ─────────────────────────────────────────────────────
  it('submits on Enter in chat mode textarea, passes Shift+Enter through', () => {
    renderWithProvider();
    const form = makeForm(`
      <form>
        <textarea data-enter-submits></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);
    const textarea = form.querySelector('textarea')!;

    // Plain Enter submits
    const e1 = dispatch(textarea, { key: 'Enter' });
    expect(e1.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Shift+Enter produces newline (not prevented, no submit)
    const e2 = dispatch(textarea, { key: 'Enter', shiftKey: true });
    expect(e2.defaultPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // ── Test 12 — Submit-and-new ────────────────────────────────────────────────
  it('handles Ctrl+Shift+Enter in data-submit-and-new forms', () => {
    renderWithProvider();
    const form = makeForm(`
      <form data-submit-and-new>
        <input type="text" />
        <button type="submit">Submit</button>
      </form>
    `);
    let capturedMode: string | undefined;
    const onSubmit = vi.fn((e: Event) => {
      e.preventDefault();
      capturedMode = (e.target as HTMLFormElement).dataset.submitMode;
    });
    form.addEventListener('submit', onSubmit);
    const input = form.querySelector('input')!;

    const event = dispatch(input, { key: 'Enter', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(capturedMode).toBe('new');
    expect(form.dataset.submitMode).toBeUndefined();

    // Form without data-submit-and-new does NOT submit on Ctrl+Shift+Enter
    const formPlain = makeForm(`
      <form>
        <input type="text" />
        <button type="submit">Submit</button>
      </form>
    `);
    const onPlainSubmit = vi.fn((e: Event) => e.preventDefault());
    formPlain.addEventListener('submit', onPlainSubmit);
    const plainInput = formPlain.querySelector('input')!;
    const plainEvent = dispatch(plainInput, { key: 'Enter', ctrlKey: true, shiftKey: true });
    expect(plainEvent.defaultPrevented).toBe(false);
    expect(onPlainSubmit).not.toHaveBeenCalled();
  });

  // ── Test 13 — Conflict guard (RESERVED_COMBOS) ──────────────────────────────
  describe('Conflict guard (RESERVED_COMBOS)', () => {
    it.each(RESERVED_COMBOS.map((c) => [c]))('does not intercept %s', (combo: ReservedCombo) => {
      // Skip combos handled by this layer
      if (combo.key === 'Enter') return;

      renderWithProvider();
      for (const mode of ['', 'entry'] as const) {
        const form = makeForm(`<input type="text" /><button type="submit">Submit</button>`);
        if (mode === 'entry') form.dataset.keyboardMode = 'entry';
        const onSubmit = vi.fn((e: Event) => e.preventDefault());
        const initialFocus = form.querySelector('input')!;
        form.addEventListener('submit', onSubmit);
        initialFocus.focus();

        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: combo.key,
          ctrlKey: combo.ctrl ?? false,
          shiftKey: combo.shift ?? false,
          altKey: combo.alt ?? false,
          metaKey: combo.meta ?? false,
        });
        initialFocus.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(initialFocus);
      }
    });
  });

  // ── Test 14 — Provider unmount removes listener ────────────────────────────
  it('removes document event listener on unmount', () => {
    const { unmount } = renderWithProvider();
    unmount();

    const form = makeForm(`
      <form>
        <textarea></textarea>
        <button type="submit">Submit</button>
      </form>
    `);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', onSubmit);

    const textarea = form.querySelector('textarea')!;
    const event = dispatch(textarea, { key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
