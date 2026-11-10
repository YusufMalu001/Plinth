export type SeverityLabel = 'minor' | 'low' | 'moderate' | 'high' | 'severe' | 'critical';

export interface VendorScoringPolicyConfig {
  id?: string;
  name?: string;
  version?: number;
  weightQuality: number; // default 35.00
  weightDelivery: number; // default 25.00
  weightDiscrepancy: number; // default 20.00
  weightVendorObligation: number; // default 10.00 (financial resolution of vendor obligations)
  weightCustody: number; // default 10.00 (scrap & custody reconciliation)
  debitNotePenaltyMultiplier: number; // default 2.00
  debitNoteIndividualCap: number; // default 30.00
  discrepancyAggregateCap: number; // default 100.00
  lateObligationBand1Days: number; // 7
  lateObligationBand1Pts: number; // 2.00
  lateObligationBand2Days: number; // 30
  lateObligationBand2Pts: number; // 5.00
  lateObligationBand3Pts: number; // 10.00
  custodyAuthorizedLossPct: number; // 5.00
  rollingWindowDays: number; // 90
  minEvidenceGrns: number; // 3
  minEvidencePeriodDays: number; // 14
  provisionalPolicy: 'NEUTRAL_PRIOR' | 'EXCLUDE' | 'INSUFFICIENT_EVIDENCE'; // default 'NEUTRAL_PRIOR'
  provisionalNeutralScore: number; // 70.00
  taxBasis: 'EXCLUSIVE' | 'INCLUSIVE'; // default 'EXCLUSIVE'
  thresholdStrong: number; // 90.00
  thresholdGood: number; // 75.00
  thresholdWatch: number; // 60.00
  status?: string;
}

export const DEFAULT_VENDOR_SCORING_POLICY: VendorScoringPolicyConfig = {
  id: 'policy-default-v1',
  name: 'DEFAULT',
  version: 1,
  weightQuality: 35.0,
  weightDelivery: 25.0,
  weightDiscrepancy: 20.0,
  weightVendorObligation: 10.0,
  weightCustody: 10.0,
  debitNotePenaltyMultiplier: 2.0,
  debitNoteIndividualCap: 30.0,
  discrepancyAggregateCap: 100.0,
  lateObligationBand1Days: 7,
  lateObligationBand1Pts: 2.0,
  lateObligationBand2Days: 30,
  lateObligationBand2Pts: 5.0,
  lateObligationBand3Pts: 10.0,
  custodyAuthorizedLossPct: 5.0,
  rollingWindowDays: 90,
  minEvidenceGrns: 3,
  minEvidencePeriodDays: 14,
  provisionalPolicy: 'NEUTRAL_PRIOR',
  provisionalNeutralScore: 70.0,
  taxBasis: 'EXCLUSIVE',
  thresholdStrong: 90.0,
  thresholdGood: 75.0,
  thresholdWatch: 60.0,
  status: 'ACTIVE',
};

export interface DebitNoteCalculationInput {
  debitNoteId: string;
  vendorId: string;
  poId?: string | null;
  grnId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  eligibleDebitNoteAmount: number; // approved eligible amount (tax-exclusive or matching policy)
  affectedInvoiceValue: number; // affected invoice or line value (matching policy)
  currency?: string;
  exchangeRate?: number; // to convert to base currency if foreign
  status: string; // 'DRAFT' | 'RECORDED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DISPUTED'
  reason?: string;
  incidentId?: string | null;
}

export interface DebitNoteCalculationResult {
  eligible: boolean;
  ineligibleReason?: string;
  debitNoteRatio: number; // e.g. 5.0 for 5%
  penaltyPoints: number; // 0 to 30
  severityLabel: SeverityLabel;
  overallScoreImpact: number; // penaltyPoints * (weightDiscrepancy / 100)
}

export interface VendorObligationInput {
  obligationId: string;
  vendorId: string;
  referenceType: string; // 'REFUND' | 'CREDIT_SETTLEMENT' | 'DEBIT_RECONCILIATION'
  referenceId?: string;
  eligibleAmount: number;
  currency?: string;
  dueDate: Date;
  resolvedDate?: Date | null;
  status: 'DRAFT' | 'PENDING' | 'DISPUTED' | 'RESOLVED' | 'CANCELLED';
  settledAmount?: number;
}

export interface CustodyObservationInput {
  jobWorkOrderId?: string;
  challanId?: string;
  materialId?: string;
  issuedQuantity: number;
  issuedValue: number;
  returnedQuantity: number;
  returnedValue: number;
  acceptedScrapQuantity: number;
  unexplainedShortageQuantity: number;
  unexplainedLossValue: number;
  incidentId?: string | null;
  date: Date;
}

export interface QualityObservationInput {
  grnId: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  receivedValue?: number;
  acceptedValue?: number;
  isCancelled?: boolean;
  isTestRecord?: boolean;
  date: Date;
}

export interface DeliveryObservationInput {
  grnId: string;
  poId?: string;
  qualifyingReceiptDate: Date;
  agreedDeliveryDate: Date; // po revision approved date or agreed date
  orderedQuantity: number;
  receivedQuantity: number;
  isCancelledOrder?: boolean;
  buyerCausedDelay?: boolean;
}

export type ConfidenceStatus = 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_EVIDENCE';

export interface ScoreComponentBreakdown {
  quality: {
    score: number;
    weight: number;
    contribution: number;
    observationsCount: number;
    acceptedQuantity: number;
    receivedQuantity: number;
    goodsQualityRate: number;
    acceptedValue: number;
    receivedValue: number;
    isProvisional: boolean;
  };
  delivery: {
    score: number;
    weight: number;
    contribution: number;
    totalShipments: number;
    onTimeShipments: number;
    lateShipments: number;
    onTimeDeliveryRate: number;
    fulfillmentRate: number;
    isProvisional: boolean;
  };
  discrepancy: {
    score: number;
    weight: number;
    contribution: number;
    totalEligiblePenaltyPoints: number;
    incidentCount: number;
    eligibleDebitNotesCount: number;
    eligibleDebitNotesAmount: number;
    isProvisional: boolean;
  };
  vendorObligation: {
    score: number;
    weight: number;
    contribution: number;
    totalObligationsCount: number;
    resolvedOnTimeCount: number;
    overdueCount: number;
    amountWeightedResolutionRate: number;
    lateResolutionPenaltyPoints: number;
    isProvisional: boolean;
    evidenceMessage?: string;
  };
  custody: {
    score: number;
    weight: number;
    contribution: number;
    jobWorkOrdersCount: number;
    totalIssuedValue: number;
    totalLossValue: number;
    custodyLossRate: number;
    excessScrapRate: number;
    isProvisional: boolean;
  };
}

export interface VendorPerformanceEvaluation {
  vendorId: string;
  policyId?: string;
  policyVersion: number;
  scoringPeriodStart: Date;
  scoringPeriodEnd: Date;
  overallScore: number | null; // 0 to 100, or null if unrated/insufficient evidence
  confidenceStatus: ConfidenceStatus;
  evidenceObservationsCount: number;
  classification: 'STRONG' | 'GOOD' | 'WATCH' | 'AT_RISK' | 'UNRATED';
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A';
  breakdown: ScoreComponentBreakdown;
  activeDebitNotes: Array<{
    debitNoteId: string;
    debitNoteNumber?: string;
    eligibleAmount: number;
    affectedInvoiceValue: number;
    debitNoteRatio: number;
    penaltyPoints: number;
    severityLabel: SeverityLabel;
    status: string;
    reason?: string;
    overallContribution: number;
  }>;
  recentIncidents: Array<{
    incidentId?: string | null;
    eventType: string;
    component: string;
    penaltyPoints: number;
    scoreContribution: number;
    sourceEntityType: string;
    sourceEntityId: string;
    effectiveDate: Date;
  }>;
}
