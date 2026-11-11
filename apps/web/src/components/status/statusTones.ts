/**
 * Central status → tone map (PLINTH_REFACTOR.md Phase 5 / Addendum #8).
 * Seeded from the legacy `StatusBadge.tsx` variant switch; status semantics are
 * unchanged — only the presentation resolves through this map now.
 *
 * Tones come from `@plinth/tokens` (`SEMANTIC`): soft `bg`, coloured `text`,
 * `solid` for fills (charts, progress).
 */

export type StatusTone = 'green' | 'red' | 'orange' | 'amber' | 'blue' | 'purple' | 'teal' | 'pink' | 'grey';

export interface ToneClasses {
  bg: string;
  text: string;
  solid: string;
}

export const TONE_CLASSES: Record<StatusTone, ToneClasses> = {
  green: { bg: 'tone-green-bg', text: 'tone-green-text', solid: 'tone-green-solid' },
  red: { bg: 'tone-red-bg', text: 'tone-red-text', solid: 'tone-red-solid' },
  orange: { bg: 'tone-orange-bg', text: 'tone-orange-text', solid: 'tone-orange-solid' },
  amber: { bg: 'tone-amber-bg', text: 'tone-amber-text', solid: 'tone-amber-solid' },
  blue: { bg: 'tone-blue-bg', text: 'tone-blue-text', solid: 'tone-blue-solid' },
  purple: { bg: 'tone-purple-bg', text: 'tone-purple-text', solid: 'tone-purple-solid' },
  teal: { bg: 'tone-teal-bg', text: 'tone-teal-text', solid: 'tone-teal-solid' },
  pink: { bg: 'tone-pink-bg', text: 'tone-pink-text', solid: 'tone-pink-solid' },
  grey: { bg: 'tone-grey-bg', text: 'tone-grey-text', solid: 'tone-grey-solid' },
};

/** Human label overrides for statuses whose raw enum reads poorly. */
export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUBMITTED: 'Submitted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  SENT: 'Sent',
  PARTIALLY_RECEIVED: 'Partly Received',
  FULLY_RECEIVED: 'Received',
  CLOSED: 'Closed',
  PENDING: 'Pending',
  ARRIVED: 'Arrived',
  UNDER_VERIFICATION: 'In Progress',
  DISCREPANCY_PENDING: 'Discrepancy',
  VERIFIED: 'Verified',
  SIGNED_OFF: 'Signed Off',
  FINALIZED: 'Finalized',
  IN_PROGRESS: 'In Progress',
  PAUSED: 'Paused',
  COMPLETE: 'Complete',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  SUPERSEDED: 'Superseded',
  QUEUED: 'Queued',
  POSTED: 'Posted',
  RECEIVED: 'Received',
  PARTIALLY_RETURNED: 'Partly Returned',
  FULLY_RETURNED: 'Returned',
  VALIDATION_PENDING: 'Pending Validation',
  PENDING_VALIDATION: 'Pending Validation',
};

/**
 * Status → tone. Every document status in the app MUST resolve through this map.
 * Defaults per spec Phase 5 §2; module-specific assignments seeded from the
 * legacy StatusBadge variant switch (variant → colour equivalence:
 * default=green, secondary=amber, outline=blue, destructive=red, muted=grey).
 */
const STATUS_TONES: Record<string, StatusTone> = {
  // Module 1 — master data lifecycle
  DRAFT: 'orange',
  VALIDATION_PENDING: 'blue',
  PENDING_VALIDATION: 'blue',
  SUPERSEDED: 'grey',
  RETIRED: 'grey',
  APPROVED: 'green',
  ACTIVE: 'green',
  INACTIVE: 'red',
  PARTIALLY_RETURNED: 'blue',
  FULLY_RETURNED: 'green',
  DISCREPANCY_FLAGGED: 'red',
  DEBIT_NOTE_INITIATED: 'orange',

  // Module 2 — PR + PO
  SUBMITTED: 'blue',
  REJECTED: 'red',
  CHANGES_REQUESTED: 'amber',
  PO_CREATED: 'green',
  CANCELLED: 'red',
  SENT: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  FULLY_RECEIVED: 'green',
  CLOSED: 'grey',

  // Receiving (Expected receipt / GRN / GRN line / Discrepancy)
  PENDING: 'blue',
  ARRIVED: 'blue',
  UNDER_VERIFICATION: 'blue',
  DISCREPANCY_PENDING: 'red',
  VERIFIED: 'green',
  SIGNED_OFF: 'amber',
  FINALIZED: 'green',
  DISCREPANT: 'red',
  UNDER_REVIEW: 'amber',
  RESOLVED: 'green',

  // Module 4 — stock movements
  ISSUED: 'amber',
  REVERSED: 'grey',
  REQUESTED: 'blue',
  RECEIVED: 'green',
  PROPOSED: 'blue',
  POSTED: 'green',
  RELEASED: 'green',
  CONSUMED: 'green',

  // Module 8 — production batches & handover
  AWAITING_RECEIPT: 'blue',
  ASSIGNED: 'amber',
  IN_PROGRESS: 'blue',
  PAUSED: 'amber',
  PARTIAL: 'amber',
  COMPLETE: 'green',
  REWORK: 'red',
  HANDOVER_PENDING: 'blue',
  NEXT_STAGE_ACCEPTED: 'green',
  ACCEPTED: 'green',
  REFUSED: 'red',

  // Module 18 — finance / Tally integration
  ELIGIBLE: 'amber',
  QUEUED: 'blue',
  PARTIALLY_FAILED: 'red',
  EXPORTED: 'green',
  ACKNOWLEDGED: 'green',
  RECONCILED: 'green',
  FAILED: 'red',
  INVESTIGATED: 'amber',
  CORRECTED: 'amber',
  RETRIED: 'blue',
  HELD: 'red',
  COMPLETED: 'green',
  INTERNALLY_CONSISTENT: 'green',
  VARIANCE_FLAGGED: 'red',
  DUPLICATE_FLAGGED: 'red',
  MANUALLY_RESOLVED: 'amber',

  // Module 9 — WIP exceptions & severities
  OPEN: 'red',
  INVESTIGATING: 'amber',
  DISMISSED: 'grey',
  LOW: 'grey',
  MEDIUM: 'amber',
  HIGH: 'red',
  CRITICAL: 'red',
  DOUBLE_PRESENCE: 'red',
  NEGATIVE_QUANTITY: 'red',
  BROKEN_GENEALOGY_CHAIN: 'red',
  CONSERVATION_MISMATCH: 'red',
  INVALID_STAGE_TRANSITION: 'red',

  // Module 10 — quality / inspection
  PASS: 'green',
  FAIL: 'red',
  REJECT_SCRAP: 'red',
  RE_INSPECTION: 'blue',
  INCOMING_MATERIAL: 'blue',
  IN_PROCESS: 'blue',
  INTERMEDIATE: 'blue',
  ASSEMBLY: 'blue',
  PRE_FG: 'blue',
  FINAL_FG: 'blue',

  // Module 11 — loss / damage / waste
  REPORTED: 'blue',
  REVIEWED: 'amber',
  REPLACED: 'green',
};

/** Unknown or missing statuses resolve to a neutral grey. */
export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'grey';
  return STATUS_TONES[status] ?? 'grey';
}

/** Human label for a raw status value (e.g. "PARTIALLY_RECEIVED" → "Partly Received"). */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  const normalized = String(status).replace(/_/g, ' ').toLowerCase();
  return STATUS_LABELS[status] ?? normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}
