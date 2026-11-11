/**
 * Single source of truth for product naming (Phase 8 pulled forward).
 * UI copy, metadata, documents and emails must reference these constants
 * instead of hard-coding the brand.
 */
export const PRODUCT_NAME = 'Plinth';
/** Company shown on invoices/PDFs as the issuing entity (neutral, non-client). */
export const COMPANY_NAME = 'Plinth';
export const PRODUCT_TAGLINE = 'Enterprise resource planning';

/**
 * Plain-text wordmark. The old image logo is retired; the mark is typography
 * only (Inter/weight-driven, no gradients, no colour literals).
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
