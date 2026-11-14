/**
 * Single source of truth for product naming and the brand lockup (Phase 8).
 * UI copy, metadata, documents and emails must reference these constants
 * instead of hard-coding the brand.
 */
export const PRODUCT_NAME = 'Plinth';
/** Company shown on invoices/PDFs as the issuing entity (neutral, non-client). */
export const COMPANY_NAME = 'Plinth';
export const PRODUCT_TAGLINE = 'Enterprise resource planning';

/** Brand ink: near-black used by the mark and lockup text (--text-primary token). */
export const BRAND_INK = '#171717';
/** Brand accent: vibrant blue used for the upper-right mark block (--accent token). */
export const BRAND_ACCENT = '#3E63DD';

/**
 * PlinthMark — the official brand mark:
 * - Base tier plinth bar (black in light mode, white on dark).
 * - Vertical pillar stem (black in light mode, white on dark).
 * - Upper-right accent block with rounded top-right corner (#3E63DD).
 *
 * Scales cleanly from 16px favicons to billboard sizes.
 * tone="ink"   → black base & pillar, accent blue flag (for light surfaces).
 * tone="paper" → white base & pillar, accent blue flag (for dark surfaces).
 */
export function PlinthMark({
  className = '',
  tone = 'ink',
  title = PRODUCT_NAME,
}: {
  className?: string;
  tone?: 'ink' | 'paper';
  title?: string;
}) {
  const ink = tone === 'ink' ? BRAND_INK : '#ffffff';
  return (
    <svg
      viewBox="0 0 44 48"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      {/* Base Plinth bar */}
      <rect x="0" y="43" width="44" height="5" rx="1" fill={ink} />
      {/* Vertical Pillar stem */}
      <rect x="3" y="0" width="13" height="38" rx="1" fill={ink} />
      {/* Upper-right accent block */}
      <path
        d="M20 0 H33 C37.42 0 41 3.58 41 8 V26 H20 V0 Z"
        fill={BRAND_ACCENT}
      />
    </svg>
  );
}

/**
 * Primary/reversed lockup: mark + wordmark.
 * tone="ink" → black mark & text on light surfaces (Primary Lockup).
 * tone="paper" → white mark & text on dark surfaces (Reversed Lockup).
 */
export function Logo({
  tone = 'ink',
  className = '',
  textClassName = '',
}: {
  tone?: 'ink' | 'paper';
  className?: string;
  textClassName?: string;
}) {
  const ink = tone === 'ink' ? BRAND_INK : '#ffffff';
  return (
    <span
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      aria-label={PRODUCT_NAME}
    >
      <PlinthMark
        tone={tone}
        className="h-[1.15em] w-[1.05em] shrink-0"
        title=""
      />
      <span
        className={`font-semibold tracking-[-0.02em] leading-none ${textClassName}`}
        style={{ color: ink }}
      >
        {PRODUCT_NAME}
      </span>
    </span>
  );
}

/**
 * Legacy plain-text wordmark — kept for dense spots (tables, meta rows).
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`select-none font-semibold tracking-tight text-ink ${className}`}
      aria-label={PRODUCT_NAME}
    >
      {PRODUCT_NAME}
    </span>
  );
}
