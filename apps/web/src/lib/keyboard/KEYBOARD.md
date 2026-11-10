# Synergy Form Keyboard Layer

## Handled combinations (exhaustive list)

| Key | Modifier | Condition | Action |
|-----|----------|-----------|--------|
| Enter | Ctrl or Cmd | Any form | Submit via `requestSubmit()` (800 ms throttle) |
| Enter | Ctrl/Cmd + Shift | Form has `data-submit-and-new` | Submit with `form.dataset.submitMode = 'new'` (cleared after submit) |
| Enter | None | `<textarea data-enter-submits>` | Submit (chat mode); Shift+Enter passes through as newline |
| Enter | None | Form has `data-keyboard-mode="entry"` and target is a text-like input | Focus next tabbable field and select its text |
| Enter | Shift | Form has `data-keyboard-mode="entry"` and target is a text-like input | Focus previous tabbable field |

**Every other key, including all F-keys, Alt+letter, Ctrl+letter other than those above, Tab, Shift+Tab, Escape, arrows, Space, Home, End, and modifier combinations, is never intercepted.**

## Bail conditions (checked before any action)

- `event.defaultPrevented` — an inner component already handled it.
- `event.isComposing` — IME composition in progress.
- `event.keyCode === 229` — Hindi/Indic IME candidate confirmation Enter; must reach the IME.
- `event.repeat` — key held down; only the first press fires.

## Data attributes

| Attribute | Applied to | Effect |
|-----------|-----------|--------|
| `data-keyboard-submit="off"` | `<form>` | Ctrl+Enter and all Enter-submit paths are disabled on this form. Use on approval, finalize, sign-off, override, adjustment, and handover forms. |
| `data-keyboard-mode="entry"` | `<form>` | Enables focus traversal via Enter/Shift+Enter on text-like inputs within this form. Do not enable without user approval. |
| `data-enter-submits` | `<textarea>` | Enables Enter-to-submit (chat mode) on this textarea. Shift+Enter still produces a newline. |
| `data-submit-and-new` | `<form>` | Enables Ctrl+Shift+Enter to submit with `form.dataset.submitMode = 'new'`. The form handler reads `(e.target as HTMLFormElement).dataset.submitMode`. |
| `data-keyboard-skip` | Any `form.elements` member | Excluded from tabbable list and from submitter discovery. |
| `data-keyboard-ignore` | Any ancestor element | The keyboard layer ignores all events from descendants. |
| `data-scan` | `<input>` | Scanner/barcode input; excluded from entry-mode focus traversal so the scanner's trailing Enter is not intercepted. |

## Entry input types

The following `<input>` types participate in entry-mode traversal:
`text`, `search`, `tel`, `url`, `email`, `number`, `password`, `date`, `datetime-local`, `time`, `month`, `week`.

Excluded: `textarea`, `select`, `button`, `a`, `checkbox`, `radio`, `file`, `range`, `color`, `hidden`, any element with `aria-expanded="true"` (open combobox owns Enter), and inputs inside `[data-scan]` or `[data-keyboard-ignore]`.

## How to add a form to entry mode

1. Get user/team approval (see candidate list in Final Report).
2. Add `data-keyboard-mode="entry"` to the `<form>` element.
3. Tag any barcode/scanner inputs within the form with `data-scan`.
4. Tag any submit button that should not be the keyboard target with `data-keyboard-skip`.
5. Test that Tab and Shift+Tab still work as before (they are never intercepted).

## Note on Shift+Tab

`fn+Tab` is not detectable in the browser. `Shift+Tab` is the only supported reverse-focus shortcut and is never intercepted by this layer.
