import { fetchApi } from '../api/client';

export interface VendorSummary {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  status: string;
  currency?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxNumber?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  address?: Record<string, unknown> | null;
  score?: number | null;
  performance?: {
    onTimeRate: number | null;
    qualityRate: number | null;
    fillRate: number | null;
    complianceRate: number | null;
    finalizedReceipts?: number;
    debitNoteCount?: number;
    debitNoteValue?: number;
    debitNoteRate?: number | null;
  };
}

export interface VendorProfile extends VendorSummary {
  metrics: {
    totalOrders: number;
    totalOrderValue: number;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    debitNoteCount?: number;
    debitNoteValue?: number;
  };
  orders: Array<{
    id: string;
    poNumber: string;
    status: string;
    createdAt: string;
    totalAmount: number;
    receiptCount: number;
    debitNotes?: Array<{ debitNoteNumber: string; status: string; totalAmount: number; reason: string; createdAt: string }>;
    currency?: string;
    subtotal?: number;
    taxAmount?: number;
    paymentTerms?: string | null;
    deliveryLocation?: string | null;
    approvedAt?: string | null;
    sentAt?: string | null;
    lines?: Array<{ id: string; productId?: string | null; materialId?: string | null; itemName: string; itemCode: string; uom: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number; needDate: string }>;
    receipts?: Array<{ id: string; grnNumber: string; status: string; receivedAt: string; finalizedAt?: string | null; lines: Array<{ productId?: string | null; materialId?: string | null; itemName: string; itemCode: string; uom: string; expectedQuantity: number; receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; damagedQuantity: number }>; payments: Array<{ paymentDate: string; amount: number; paymentMode: string; reference: string }>; debitNotes: Array<{ debitNoteNumber: string; status: string; totalAmount: number; reason: string }> }>;
  }>;
  contacts?: Array<Record<string, unknown>>;
  capabilities?: Array<Record<string, unknown>>;
  complianceDocuments?: Array<Record<string, unknown>>;
  evaluations?: Array<Record<string, unknown>>;
  scoreSnapshots?: Array<Record<string, unknown>>;
  debitNotes?: Array<{ id: string; debitNoteNumber: string; poId?: string | null; grnId?: string | null; status: string; reason: string; currency: string; invoiceNumber?: string | null; taxableAmount: number; taxAmount: number; totalAmount: number; createdAt: string; submittedAt?: string | null; approvedAt?: string | null; lines: Array<{ description: string; expectedQuantity: number; receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; damagedQuantity: number; shortQuantity: number; unitPrice: number; taxRate: number; taxableAmount: number; taxAmount: number; totalAmount: number; reason?: string | null }>; documents?: Array<{ fileName: string; fileUrl: string; createdAt: string }> }>;
}

export interface ScoreComponentBreakdownDto {
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

export interface VendorScoringDetailDto {
  vendorId: string;
  policyId?: string;
  policyVersion: number;
  scoringPeriodStart: string;
  scoringPeriodEnd: string;
  overallScore: number | null;
  confidenceStatus: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_EVIDENCE';
  evidenceObservationsCount: number;
  classification: 'STRONG' | 'GOOD' | 'WATCH' | 'AT_RISK' | 'UNRATED';
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A';
  breakdown: ScoreComponentBreakdownDto;
  activeDebitNotes: Array<{
    debitNoteId: string;
    debitNoteNumber?: string;
    eligibleAmount: number;
    affectedInvoiceValue: number;
    debitNoteRatio: number;
    penaltyPoints: number;
    severityLabel: 'minor' | 'low' | 'moderate' | 'high' | 'severe' | 'critical';
    status: string;
    reason?: string;
    overallContribution: number;
  }>;
}

export interface GeminiVendorEvaluationDto {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  vendorType: 'MATERIAL' | 'OUTSOURCING' | 'HYBRID';
  score: number | null;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A';
  reliabilityRating: 'EXCELLENT' | 'RELIABLE' | 'MODERATE' | 'AT_RISK' | 'UNRATED';
  punctualityScore: number;
  qualityScore: number;
  discrepancyScore: number;
  commercialTermsScore: number;
  obligationScore?: number;
  scrapYieldScore?: number;
  confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_EVIDENCE';
  breakdown?: ScoreComponentBreakdownDto;
  summary: string;
  strengths: string[];
  areasForImprovement: string[];
  recommendation: string;
  metrics: {
    totalPurchaseOrders: number;
    totalJobWorkOrders: number;
    onTimeDeliveryRate: number;
    discrepancyRate: number;
    goodsQualityRate: number;
    scrapYieldRate: number;
    totalDebitNotesCount: number;
    paymentTerms?: string | null;
  };
}

export interface VendorScoringReportDto {
  generatedAt: string;
  provider: 'gemini' | 'heuristic_fallback';
  modelId: string;
  vendorAverageScore: number;
  vendorTypeFilter: 'MATERIAL' | 'OUTSOURCING' | 'ALL';
  topVendors: GeminiVendorEvaluationDto[];
  evaluations: GeminiVendorEvaluationDto[];
  executiveSummary: string;
  policyVersion?: number;
}

export interface VendorScoringPolicyDto {
  id?: string;
  name?: string;
  version?: number;
  weightQuality: number;
  weightDelivery: number;
  weightDiscrepancy: number;
  weightVendorObligation: number;
  weightCustody: number;
  debitNotePenaltyMultiplier: number;
  debitNoteIndividualCap: number;
  discrepancyAggregateCap: number;
  lateObligationBand1Days: number;
  lateObligationBand1Pts: number;
  lateObligationBand2Days: number;
  lateObligationBand2Pts: number;
  lateObligationBand3Pts: number;
  custodyAuthorizedLossPct: number;
  rollingWindowDays: number;
  minEvidenceGrns: number;
  minEvidencePeriodDays: number;
  provisionalPolicy: string;
  provisionalNeutralScore: number;
  taxBasis: string;
  thresholdStrong: number;
  thresholdGood: number;
  thresholdWatch: number;
  status?: string;
}
export const vendorsApi = {
  list: (params: { page?: number; limit?: number; search?: string; status?: string; activeOnly?: boolean } = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => value && query.set(key, String(value)));
    return fetchApi<{ items: VendorSummary[]; total: number }>(`/master-data/vendors?${query.toString()}`);
  },
  getById: (id: string) => fetchApi<VendorSummary>(`/master-data/vendors/${id}`),
  profile: (id: string) => fetchApi<VendorProfile>(`/master-data/vendors/${id}/profile`),
  create: (body: Record<string, unknown>) => fetchApi<VendorSummary>('/master-data/vendors', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) => fetchApi<VendorSummary>(`/master-data/vendors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => fetchApi<{ id: string }>(`/master-data/vendors/${id}`, { method: 'DELETE' }),
  submit: (id: string) => fetchApi<VendorSummary>(`/master-data/vendors/${id}/submit`, { method: 'POST' }),
  approve: (id: string, remarks?: string) => fetchApi<VendorSummary>(`/master-data/vendors/${id}/approve`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  reject: (id: string, reason?: string) => fetchApi<VendorSummary>(`/master-data/vendors/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deactivate: (id: string, reason?: string) => fetchApi<VendorSummary>(`/master-data/vendors/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  transitionStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => fetchApi<VendorSummary>(`/master-data/vendors/${id}/status`, { method: 'POST', body: JSON.stringify({ targetStatus: status }) }),
  evaluations: (id: string) => fetchApi<Array<Record<string, unknown>>>(`/master-data/vendors/${id}/evaluations`),
  addEvaluation: (id: string, body: Record<string, unknown>) => fetchApi<Record<string, unknown>>(`/master-data/vendors/${id}/evaluations`, { method: 'POST', body: JSON.stringify(body) }),
  getScoringReport: (type: 'MATERIAL' | 'OUTSOURCING' | 'ALL' = 'ALL', vendorId?: string) => {
    const query = new URLSearchParams();
    if (type) query.set('type', type);
    if (vendorId) query.set('vendorId', vendorId);
    return fetchApi<VendorScoringReportDto>(`/master-data/vendors/analytics/scoring?${query.toString()}`);
  },
  getScoringDetail: (vendorId: string, windowDays?: number) => {
    const query = new URLSearchParams();
    if (windowDays) query.set('windowDays', String(windowDays));
    return fetchApi<VendorScoringDetailDto>(`/master-data/vendors/${vendorId}/scoring-detail?${query.toString()}`);
  },
  getScoringPolicy: () => {
    return fetchApi<VendorScoringPolicyDto>('/master-data/vendor-scoring/policy');
  },
  updateScoringPolicy: (body: Partial<VendorScoringPolicyDto>) => {
    return fetchApi<VendorScoringPolicyDto>('/master-data/vendor-scoring/policy', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

