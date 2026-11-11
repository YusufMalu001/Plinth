/**
 * Single source of truth for product naming and the brand lockup (Phase 8).
 * UI copy, metadata, documents and emails must reference these constants
 * instead of hard-coding the brand.
 */
export const PRODUCT_NAME = 'Plinth';
/** Company shown on invoices/PDFs as the issuing entity (neutral, non-client). */
export const COMPANY_NAME = 'Plinth';
export const PRODUCT_TAGLINE = 'Enterprise resource planning';

/** Brand ink: near-black used by the mark and lockup text. */
export const BRAND_INK = '#141414';

/**
 * PlinthMark — the geometric brand mark: a rounded black square carrying the
 * notched "P" counterform. Pure geometry (one path), scales cleanly from the
 * 24px favicon to print sizes.
 * tone="ink" → black square, white cutout (Primary / App icon).
 * tone="paper" → white square, black cutout (Reversed Lockup).
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
  const square = tone === 'ink' ? BRAND_INK : '#ffffff';
  const cut = tone === 'ink' ? '#ffffff' : BRAND_INK;
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="96" height="96" rx="22" fill={square} />
      <path d="M28 22 H70 V42 H48 V74 H28 Z" fill={cut} />
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
        className="h-[1.35em] w-[1.35em] shrink-0"
        title=""
      />
      <span
        className={`font-semibold tracking-[-0.03em] leading-none ${textClassName}`}
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
