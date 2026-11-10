import {
  VendorScoringPolicyConfig,
  DebitNoteCalculationInput,
  DebitNoteCalculationResult,
  SeverityLabel,
  DEFAULT_VENDOR_SCORING_POLICY,
} from './vendor-scoring.types';

/**
 * Determine severity band from debitNoteRatio (0 to 100 percentage)
 * - Up to 0.5%: minor
 * - Above 0.5% to 1%: low
 * - Above 1% to 2.5%: moderate
 * - Above 2.5% to 5%: high
 * - Above 5% to 10%: severe
 * - Above 10%: critical
 */
export function getDebitNoteSeverityLabel(ratioPct: number): SeverityLabel {
  if (ratioPct <= 0.5) return 'minor';
  if (ratioPct <= 1.0) return 'low';
  if (ratioPct <= 2.5) return 'moderate';
  if (ratioPct <= 5.0) return 'high';
  if (ratioPct <= 10.0) return 'severe';
  return 'critical';
}

/**
 * Clamp a number to [min, max]
 */
export function clamp(val: number, min = 0, max = 100): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

/**
 * Round a number to precision decimal places
 */
export function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates penalty and ratio for a single debit note:
 * debitNoteRatio = (eligibleDebitNoteAmount / affectedInvoiceValue) * 100
 * debitNotePenalty = min(30, 2 * debitNoteRatio)
 */
export function calculateDebitNotePenalty(
  input: DebitNoteCalculationInput,
  policy: VendorScoringPolicyConfig = DEFAULT_VENDOR_SCORING_POLICY
): DebitNoteCalculationResult {
  const eligibleStatuses = ['APPROVED', 'SUBMITTED', 'RECORDED'];
  if (!eligibleStatuses.includes(input.status.toUpperCase())) {
    return {
      eligible: false,
      ineligibleReason: `Status [${input.status}] is not eligible for scoring deduction. Only active submitted, recorded, or approved notes incur penalties.`,
      debitNoteRatio: 0,
      penaltyPoints: 0,
      severityLabel: 'minor',
      overallScoreImpact: 0,
    };
  }

  const affectedValue = Number(input.affectedInvoiceValue || 0);
  if (affectedValue <= 0 || !Number.isFinite(affectedValue)) {
    return {
      eligible: false,
      ineligibleReason: `Affected invoice value [${affectedValue}] is zero, negative, or missing. Flagged for review.`,
      debitNoteRatio: 0,
      penaltyPoints: 0,
      severityLabel: 'minor',
      overallScoreImpact: 0,
    };
  }

  let eligibleAmount = Number(input.eligibleDebitNoteAmount || 0);
  if (eligibleAmount <= 0 || !Number.isFinite(eligibleAmount)) {
    return {
      eligible: false,
      ineligibleReason: `Eligible amount [${eligibleAmount}] must be greater than zero.`,
      debitNoteRatio: 0,
      penaltyPoints: 0,
      severityLabel: 'minor',
      overallScoreImpact: 0,
    };
  }

  // Currency conversion if foreign currency and exchange rate provided
  if (input.currency && input.currency !== 'INR' && input.exchangeRate && input.exchangeRate > 0) {
    eligibleAmount *= input.exchangeRate;
  }

  const debitNoteRatio = (eligibleAmount / affectedValue) * 100;
  const multiplier = Number(policy.debitNotePenaltyMultiplier || 2.0);
  const indCap = Number(policy.debitNoteIndividualCap || 30.0);
  const rawPenalty = multiplier * debitNoteRatio;
  const penaltyPoints = Math.min(indCap, Math.max(0, rawPenalty));
  const severityLabel = getDebitNoteSeverityLabel(debitNoteRatio);
  const overallScoreImpact = penaltyPoints * (policy.weightDiscrepancy / 100);

  return {
    eligible: true,
    debitNoteRatio: round(debitNoteRatio, 4),
    penaltyPoints: round(penaltyPoints, 4),
    severityLabel,
    overallScoreImpact: round(overallScoreImpact, 4),
  };
}

/**
 * Calculate late resolution penalty for an overdue vendor obligation:
 * - 1-7 days late: 2 pts
 * - 8-30 days late: 5 pts
 * - >30 days late: 10 pts
 */
export function calculateLateResolutionPenalty(
  dueDate: Date,
  resolvedDate: Date | null | undefined,
  policy: VendorScoringPolicyConfig = DEFAULT_VENDOR_SCORING_POLICY
): number {
  const referenceEnd = resolvedDate ? new Date(resolvedDate).getTime() : Date.now();
  const due = new Date(dueDate).getTime();
  const diffDays = Math.floor((referenceEnd - due) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 0;
  if (diffDays <= policy.lateObligationBand1Days) return policy.lateObligationBand1Pts;
  if (diffDays <= policy.lateObligationBand2Days) return policy.lateObligationBand2Pts;
  return policy.lateObligationBand3Pts;
}

/**
 * Validate policy weights total 100
 */
export function validatePolicyWeights(policy: Partial<VendorScoringPolicyConfig>): boolean {
  const q = Number(policy.weightQuality ?? 35);
  const d = Number(policy.weightDelivery ?? 25);
  const disc = Number(policy.weightDiscrepancy ?? 20);
  const vo = Number(policy.weightVendorObligation ?? 10);
  const c = Number(policy.weightCustody ?? 10);
  const sum = q + d + disc + vo + c;
  return Math.abs(sum - 100.0) < 0.001;
}

/**
 * Deterministically compute overall score from 5 normalized sub-scores
 * overallScore = 0.35 * quality + 0.25 * delivery + 0.20 * discrepancy + 0.10 * obligation + 0.10 * custody
 */
export function computeCompositeScore(
  scores: {
    qualityScore: number;
    deliveryScore: number;
    discrepancyScore: number;
    obligationScore: number;
    custodyScore: number;
  },
  policy: VendorScoringPolicyConfig = DEFAULT_VENDOR_SCORING_POLICY
): number {
  const q = clamp(scores.qualityScore);
  const del = clamp(scores.deliveryScore);
  const disc = clamp(scores.discrepancyScore);
  const ob = clamp(scores.obligationScore);
  const c = clamp(scores.custodyScore);

  const raw =
    (policy.weightQuality / 100) * q +
    (policy.weightDelivery / 100) * del +
    (policy.weightDiscrepancy / 100) * disc +
    (policy.weightVendorObligation / 100) * ob +
    (policy.weightCustody / 100) * c;

  return round(clamp(raw, 0, 100), 2);
}

/**
 * Performance classification helper
 */
export function getPerformanceClassification(
  score: number | null,
  policy: VendorScoringPolicyConfig = DEFAULT_VENDOR_SCORING_POLICY
): { classification: 'STRONG' | 'GOOD' | 'WATCH' | 'AT_RISK' | 'UNRATED'; grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A' } {
  if (score === null || score === undefined) return { classification: 'UNRATED', grade: 'N/A' };
  if (score >= policy.thresholdStrong) return { classification: 'STRONG', grade: 'A+' };
  if (score >= policy.thresholdGood) return { classification: 'GOOD', grade: 'A' };
  if (score >= policy.thresholdWatch) return { classification: 'WATCH', grade: 'B' };
  if (score >= 45) return { classification: 'AT_RISK', grade: 'C' };
  return { classification: 'AT_RISK', grade: 'D' };
}
