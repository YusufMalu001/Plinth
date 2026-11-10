/**
 * @plinth/tokens — single source of truth for all Plinth colours, type, and shape.
 *
 * Consumers:
 *  - apps/web       → injects `CSS_TOKENS` as a <style> tag in the root layout and
 *                     maps the variables into the Tailwind config.
 *  - PDF components → import the constants directly.
 *  - Email services → import the constants directly (inline HTML styles).
 *  - Server charts  → import `CHART_PALETTE` (dashboard.service.ts).
 *
 * Never hardcode these values anywhere else. See PLINTH_REFACTOR.md Phase 2.
 */

/** Surfaces & neutrals — no coloured backgrounds anywhere in the app shell. */
export const COLOR = {
  bgPage: '#FFFFFF',
  bgSurface: '#FFFFFF',
  bgMuted: '#F4F5F6',
  bgHover: '#F8F8F8',
  border: '#EDEDED',
  borderStrong: '#D9D9D9',
  textPrimary: '#171717',
  textSecondary: '#525252',
  textMuted: '#8D8D8D',
  textPlaceholder: '#A3A3A3',
} as const;

/** Primary action (black) and focus. */
export const ACTION = {
  primaryBg: '#171717',
  primaryBgHover: '#2E2E2E',
  primaryText: '#FFFFFF',
  secondaryBg: COLOR.bgMuted,
  secondaryText: COLOR.textPrimary,
  focusRing: '#7C7C7C',
} as const;

/** Semantic tones — statuses, charts, alerts, progress, tags ONLY. */
export interface SemanticTone {
  bg: string;
  text: string;
  solid: string;
}

export const SEMANTIC: Record<string, SemanticTone> = {
  green: { bg: '#E4F5E9', text: '#18794E', solid: '#30A46C' },
  red: { bg: '#FFF0F0', text: '#C62828', solid: '#E5484D' },
  orange: { bg: '#FFF2E5', text: '#B54708', solid: '#F76808' },
  amber: { bg: '#FFF8DB', text: '#946800', solid: '#F5B800' },
  blue: { bg: '#EAF3FF', text: '#1D5FBF', solid: '#3E63DD' },
  purple: { bg: '#F3EEFF', text: '#6B3FC4', solid: '#8E4EC6' },
  teal: { bg: '#E3F7F5', text: '#0F766E', solid: '#12A594' },
  pink: { bg: '#FFEEF7', text: '#B3256B', solid: '#D6409F' },
  grey: { bg: '#F1F1F1', text: '#525252', solid: '#8D8D8D' },
} as const;

/** Chart palette, ordered and colour-blind-aware. */
export const CHART_PALETTE: string[] = [
  SEMANTIC.blue.solid,
  SEMANTIC.teal.solid,
  SEMANTIC.orange.solid,
  SEMANTIC.purple.solid,
  SEMANTIC.green.solid,
  SEMANTIC.pink.solid,
  SEMANTIC.amber.solid,
  SEMANTIC.red.solid,
];

/** Type */
export const TYPE_SCALES = {
  fontFamily:
    "'Inter', 'Inter Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  base: '14px/20px',
  pageTitle: '24px semibold',
  sectionTitle: '16px semibold',
  tableText: '13px',
  labels: '12px',
} as const;

/** Shape & spacing */
export const SHAPE = {
  radiusControl: '8px',
  radiusCard: '12px',
  radiusPill: '999px',
  spacingBase: '4px',
  rowHeight: '44px',
  controlHeightCompact: '32px',
  controlHeight: '36px',
} as const;

/** Popover shadow (the only allowed default shadow outside none). */
export const SHADOWS = {
  none: 'none',
  popover: '0 6px 24px rgba(0,0,0,.08)',
} as const;

/**
 * CSS variable block generated from the constants above.
 * Injected once by the web root layout; Tailwind maps these names.
 * Keep in sync with `COLOR`, `ACTION`, `SEMANTIC`, `CHART_PALETTE`.
 */
export const CSS_TOKENS = `
:root, .theme-plinth {
  --bg-page: ${COLOR.bgPage};
  --bg-surface: ${COLOR.bgSurface};
  --bg-muted: ${COLOR.bgMuted};
  --bg-hover: ${COLOR.bgHover};
  --border: ${COLOR.border};
  --border-strong: ${COLOR.borderStrong};
  --text-primary: ${COLOR.textPrimary};
  --text-secondary: ${COLOR.textSecondary};
  --text-muted: ${COLOR.textMuted};
  --text-placeholder: ${COLOR.textPlaceholder};
  --action-primary-bg: ${ACTION.primaryBg};
  --action-primary-bg-hover: ${ACTION.primaryBgHover};
  --action-primary-text: ${ACTION.primaryText};
  --action-secondary-bg: ${ACTION.secondaryBg};
  --action-secondary-text: ${ACTION.secondaryText};
  --focus-ring: ${ACTION.focusRing};
  --tone-green-bg: ${SEMANTIC.green.bg};
  --tone-green-text: ${SEMANTIC.green.text};
  --tone-green-solid: ${SEMANTIC.green.solid};
  --tone-red-bg: ${SEMANTIC.red.bg};
  --tone-red-text: ${SEMANTIC.red.text};
  --tone-red-solid: ${SEMANTIC.red.solid};
  --tone-orange-bg: ${SEMANTIC.orange.bg};
  --tone-orange-text: ${SEMANTIC.orange.text};
  --tone-orange-solid: ${SEMANTIC.orange.solid};
  --tone-amber-bg: ${SEMANTIC.amber.bg};
  --tone-amber-text: ${SEMANTIC.amber.text};
  --tone-amber-solid: ${SEMANTIC.amber.solid};
  --tone-blue-bg: ${SEMANTIC.blue.bg};
  --tone-blue-text: ${SEMANTIC.blue.text};
  --tone-blue-solid: ${SEMANTIC.blue.solid};
  --tone-purple-bg: ${SEMANTIC.purple.bg};
  --tone-purple-text: ${SEMANTIC.purple.text};
  --tone-purple-solid: ${SEMANTIC.purple.solid};
  --tone-teal-bg: ${SEMANTIC.teal.bg};
  --tone-teal-text: ${SEMANTIC.teal.text};
  --tone-teal-solid: ${SEMANTIC.teal.solid};
  --tone-pink-bg: ${SEMANTIC.pink.bg};
  --tone-pink-text: ${SEMANTIC.pink.text};
  --tone-pink-solid: ${SEMANTIC.pink.solid};
  --tone-grey-bg: ${SEMANTIC.grey.bg};
  --tone-grey-text: ${SEMANTIC.grey.text};
  --tone-grey-solid: ${SEMANTIC.grey.solid};
  --chart-1: ${CHART_PALETTE[0]};
  --chart-2: ${CHART_PALETTE[1]};
  --chart-3: ${CHART_PALETTE[2]};
  --chart-4: ${CHART_PALETTE[3]};
  --chart-5: ${CHART_PALETTE[4]};
  --chart-6: ${CHART_PALETTE[5]};
  --chart-7: ${CHART_PALETTE[6]};
  --chart-8: ${CHART_PALETTE[7]};
  --radius-control: ${SHAPE.radiusControl};
  --radius-card: ${SHAPE.radiusCard};
  --radius-pill: ${SHAPE.radiusPill};
  --row-height: ${SHAPE.rowHeight};
  --control-height-compact: ${SHAPE.controlHeightCompact};
  --control-height: ${SHAPE.controlHeight};
  --shadow-popover: ${SHADOWS.popover};
  --font-sans: ${TYPE_SCALES.fontFamily};
}
`.trim();
