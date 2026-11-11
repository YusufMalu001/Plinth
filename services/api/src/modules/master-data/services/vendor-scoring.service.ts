import { PrismaClient, Prisma } from '@prisma/client';
import { VendorScoringEngine } from './vendor-scoring-engine.service';
import {
  VendorScoringPolicyConfig,
  DEFAULT_VENDOR_SCORING_POLICY,
  ScoreComponentBreakdown,
  VendorPerformanceEvaluation,
} from './vendor-scoring.types';
import {
  computeCompositeScore,
  getPerformanceClassification,
  clamp,
} from './vendor-scoring-math';

const prisma = new PrismaClient();
const scoringEngine = new VendorScoringEngine(prisma);

export type VendorType = 'MATERIAL' | 'OUTSOURCING' | 'ALL';

export interface VendorEvaluationMetrics {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  vendorType: 'MATERIAL' | 'OUTSOURCING' | 'HYBRID';
  contactEmail?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;

  // Volume metrics
  totalPurchaseOrders: number;
  totalJobWorkOrders: number;
  totalOrderValue: number;

  // 1. Punctuality / Lead time compliance (0-100%)
  onTimeDeliveryRate: number;
  averageLeadTimeDays: number | null;

  // 2. Discrepancy & Shortage Rate (0-100%)
  discrepancyRate: number; // % receipts with shortage, damage, or discrepancy
  totalDebitNotesCount: number;
  totalDebitNotesValue: number;

  // 3. Goods Quality & Acceptance Rate (0-100%)
  goodsQualityRate: number; // Accepted qty / Received qty
  totalReceivedQty: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;

  // 4. Job Work Scrap Yield & Custody Reconciliation (For outsourcing)
  scrapYieldRate: number; // scrap returned / total raw material issued (%)
  shortageRateOutsourcing: number;
  totalCustodyIssuedTons: number;
  totalCustodyReturnedTons: number;

  // 5. Vendor Obligation / Commercial Terms & Compliance
  paymentTermsScore: number; // 0-100
  vendorObligationRate?: number; // 0-100 fulfillment of refunds/credits
  hasValidGstin: boolean;
}

export interface GeminiVendorEvaluation {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  vendorType: 'MATERIAL' | 'OUTSOURCING' | 'HYBRID';
  score: number | null; // 0-100 or null if unrated
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'N/A';
  reliabilityRating: 'EXCELLENT' | 'RELIABLE' | 'MODERATE' | 'AT_RISK' | 'UNRATED';
  // Sub-scores (5 components strictly normalized to 0-100)
  punctualityScore: number; // Delivery & fulfillment (25%)
  qualityScore: number; // Quality (35%)
  discrepancyScore: number; // Financial discrepancies (20%)
  commercialTermsScore: number; // Backward-compatibility alias for financial resolution / vendor obligations
  obligationScore?: number; // Financial resolution behavior (10%)
  scrapYieldScore?: number; // Scrap and custody reconciliation (10%)

  // Breakdown & confidence
  confidenceStatus?: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_EVIDENCE';
  breakdown?: ScoreComponentBreakdown;

  summary: string;
  strengths: string[];
  areasForImprovement: string[];
  recommendation: string;

  // Raw metrics for UI rendering
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

export interface VendorScoringReport {
  generatedAt: string;
  provider: 'gemini' | 'heuristic_fallback';
  modelId: string;
  vendorAverageScore: number;
  vendorTypeFilter: VendorType;
  topVendors: GeminiVendorEvaluation[];
  evaluations: GeminiVendorEvaluation[];
  executiveSummary: string;
  policyVersion?: number;
}

interface RawDebitNoteQueryRow {
  id: string;
  debitNoteNumber: string;
  vendorId: string;
  poId: string | null;
  grnId: string | null;
  invoiceNumber: string | null;
  currency: string;
  status: string;
  reason: string;
  taxableAmount: number | Prisma.Decimal;
  taxAmount: number | Prisma.Decimal;
  totalAmount: number | Prisma.Decimal;
  evidence: unknown;
  createdAt: Date;
  incidentId?: string | null;
}



export const vendorScoringService = {
  /**
   * Access to the underlying engine instance
   */
  getEngine(): VendorScoringEngine {
    return scoringEngine;
  },

  /**
   * Gathers operational transaction data across Purchase Orders, Receipts,
   * Debit Notes, Job Work Orders, and Custody records.
   */
  async gatherVendorMetrics(
    filterType: VendorType = 'ALL',
    targetVendorId?: string
  ): Promise<VendorEvaluationMetrics[]> {
    const vendorWhere: Prisma.VendorWhereInput = {};
    if (targetVendorId) {
      vendorWhere.id = targetVendorId;
    }

    const vendors = await prisma.vendor.findMany({
      where: vendorWhere,
      include: {
        PurchaseOrder: {
          include: {
            lines: true,
            goodsReceiptNotes: {
              include: {
                lines: {
                  include: {
                    discrepancies: true,
                  },
                },
              },
            },
          },
        },
        goodsReceiptNotes: {
          where: { poId: null },
          include: {
            lines: {
              include: {
                discrepancies: true,
              },
            },
          },
        },
        jobWorkOrders: {
          include: {
            challans: true,
            returns: true,
            reconciliations: true,
          },
        },
      },
    });

    let allDebitNotes: RawDebitNoteQueryRow[] = [];
    try {
      allDebitNotes = await prisma.$queryRaw<RawDebitNoteQueryRow[]>`SELECT * FROM "debit_notes"`;
    } catch {
      allDebitNotes = [];
    }

    const metricsList: VendorEvaluationMetrics[] = [];

    for (const v of vendors) {
      const pos = v.PurchaseOrder || [];
      const jobOrders = v.jobWorkOrders || [];

      const hasMaterialPO = pos.length > 0;
      const hasJobWork = jobOrders.length > 0;

      let determinedType: 'MATERIAL' | 'OUTSOURCING' | 'HYBRID' = 'MATERIAL';
      if (hasMaterialPO && hasJobWork) {
        determinedType = 'HYBRID';
      } else if (hasJobWork) {
        determinedType = 'OUTSOURCING';
      } else {
        determinedType = 'MATERIAL';
      }

      if (filterType === 'MATERIAL' && determinedType === 'OUTSOURCING') continue;
      if (filterType === 'OUTSOURCING' && determinedType === 'MATERIAL') continue;

      let totalPoAmount = 0;
      let onTimeReceiptsCount = 0;
      let totalEvaluatedReceipts = 0;
      let totalReceivedQty = 0;
      let totalAcceptedQty = 0;
      let totalRejectedQty = 0;
      let totalLinesWithDiscrepancy = 0;
      let totalLinesChecked = 0;

      pos.forEach((po) => {
        totalPoAmount += Number(po.totalAmount || 0);

        po.goodsReceiptNotes.forEach((grn) => {
          totalEvaluatedReceipts++;
          const latestNeedDate = po.lines.reduce<Date | null>((latest, l) => {
            return !latest || l.needDate > latest ? l.needDate : latest;
          }, null);

          if (!latestNeedDate || new Date(grn.receivedAt).getTime() <= new Date(latestNeedDate).getTime()) {
            onTimeReceiptsCount++;
          }

          grn.lines.forEach((line) => {
            totalLinesChecked++;
            const rec = Number(line.receivedQuantity || 0);
            const acc = Number(line.acceptedQuantity || 0);
            const rej = Number(line.rejectedQuantity || 0);
            const dam = Number(line.damagedQuantity || 0);
            const sho = Number(line.shortQuantity || 0);

            totalReceivedQty += rec;
            totalAcceptedQty += acc;
            totalRejectedQty += rej;

            if (rej > 0 || dam > 0 || sho > 0 || (line.discrepancies && line.discrepancies.length > 0)) {
              totalLinesWithDiscrepancy++;
            }
          });
        });
      });

      // Outsourcing Job Work metrics
      let totalCustodyIssuedTons = 0;
      let totalCustodyReturnedTons = 0;
      let totalCustodyShortageTons = 0;
      let totalCustodyScrapTons = 0;

      jobOrders.forEach((jo) => {
        jo.challans.forEach((c) => {
          totalCustodyIssuedTons += Number(c.quantity || 0);
        });
        jo.returns.forEach((r) => {
          totalCustodyReturnedTons += Number(r.acceptedQuantity || 0);
          totalCustodyShortageTons += Number(r.shortQuantity || 0);
          totalCustodyScrapTons += Number(r.scrapQuantity || 0);
        });
      });

      const scrapYieldRate =
        totalCustodyIssuedTons > 0
          ? Number(((totalCustodyScrapTons / totalCustodyIssuedTons) * 100).toFixed(1))
          : 0;

      const shortageRateOutsourcing =
        totalCustodyReturnedTons + totalCustodyShortageTons > 0
          ? Number(
              ((totalCustodyShortageTons / (totalCustodyReturnedTons + totalCustodyShortageTons)) * 100).toFixed(1)
            )
          : 0;

      // Active debit notes (APPROVED, SUBMITTED, RECORDED) incur active deductions
      const vendorDebitNotes = allDebitNotes.filter((dn) => {
        const belongs = dn.vendorId === v.id || pos.some((po) => po.id === dn.poId);
        const isEligible = ['APPROVED', 'SUBMITTED', 'RECORDED'].includes(String(dn.status || '').toUpperCase());
        return belongs && isEligible;
      });

      const totalDebitNotesCount = vendorDebitNotes.length;
      const totalDebitNotesValue = vendorDebitNotes.reduce((sum, dn) => sum + Number(dn.totalAmount || 0), 0);

      // If vendor has no evaluated receipts yet, indicate lack of observation (0 or null equivalent)
      const hasReceiptData = totalEvaluatedReceipts > 0;
      const onTimeDeliveryRate =
        hasReceiptData ? Math.round((onTimeReceiptsCount / totalEvaluatedReceipts) * 100) : 0;

      const hasQualityData = totalReceivedQty > 0;
      const goodsQualityRate =
        hasQualityData ? Math.round((totalAcceptedQty / totalReceivedQty) * 100) : 0;

      let discrepancyRate = 0;
      if (totalLinesChecked > 0) {
        discrepancyRate = Math.round((totalLinesWithDiscrepancy / totalLinesChecked) * 100);
      } else if (hasJobWork) {
        discrepancyRate = Math.round(shortageRateOutsourcing);
      }
      let paymentTermsScore = 80;
      const pt = (v.paymentTerms || '').toLowerCase();
      if (pt.includes('60') || pt.includes('45')) paymentTermsScore = 95;
      else if (pt.includes('30')) paymentTermsScore = 88;
      else if (pt.includes('15')) paymentTermsScore = 80;
      else if (pt.includes('advance') || pt.includes('immediate')) paymentTermsScore = 65;

      const hasValidGstin = Boolean(v.taxNumber && v.taxNumber.trim().length >= 10);

      metricsList.push({
        vendorId: v.id,
        vendorName: v.name,
        vendorCode: v.code,
        vendorType: determinedType,
        contactEmail: v.contactEmail,
        taxNumber: v.taxNumber,
        paymentTerms: v.paymentTerms,
        leadTimeDays: v.leadTimeDays,
        totalPurchaseOrders: pos.length,
        totalJobWorkOrders: jobOrders.length,
        totalOrderValue: totalPoAmount,
        onTimeDeliveryRate,
        averageLeadTimeDays: v.leadTimeDays,
        discrepancyRate,
        totalDebitNotesCount,
        totalDebitNotesValue,
        goodsQualityRate,
        totalReceivedQty,
        totalAcceptedQty,
        totalRejectedQty,
        scrapYieldRate,
        shortageRateOutsourcing,
        totalCustodyIssuedTons,
        totalCustodyReturnedTons,
        paymentTermsScore,
        hasValidGstin,
      });
    }

    return metricsList;
  },

  /**
   * Deterministic mathematical evaluation conforming to Vendor Performance Scoring Engine v2.0
   * Formula:
   * overallScore = 0.35 * quality + 0.25 * delivery + 0.20 * discrepancy + 0.10 * obligation + 0.10 * custody
   */
  generateHeuristicEvaluation(
    metrics: VendorEvaluationMetrics[],
    filterType: VendorType = 'ALL',
    policy: VendorScoringPolicyConfig = DEFAULT_VENDOR_SCORING_POLICY
  ): VendorScoringReport {
    const evaluations: GeminiVendorEvaluation[] = metrics.map((m) => {
      const hasReceiptHistory = m.totalPurchaseOrders > 0 && m.totalReceivedQty > 0;
      const hasJobWorkHistory = m.totalJobWorkOrders > 0;
      const hasOperationalHistory = hasReceiptHistory || hasJobWorkHistory || m.totalDebitNotesCount > 0;

      // Determine evidence confidence status
      let confidenceStatus: 'SUFFICIENT_EVIDENCE' | 'PROVISIONAL' | 'INSUFFICIENT_EVIDENCE' = 'SUFFICIENT_EVIDENCE';
      if (!hasOperationalHistory) {
        confidenceStatus = 'INSUFFICIENT_EVIDENCE';
      } else if ((m.totalPurchaseOrders < policy.minEvidenceGrns) && !hasJobWorkHistory) {
        confidenceStatus = 'PROVISIONAL';
      }

      // 1. Quality Sub-score (35% weight)
      const qualityScore = hasReceiptHistory
        ? clamp(m.goodsQualityRate, 0, 100)
        : policy.provisionalNeutralScore;

      // 2. Delivery & Fulfillment Sub-score (25% weight)
      const punctualityScore = hasReceiptHistory
        ? clamp(m.onTimeDeliveryRate, 0, 100)
        : policy.provisionalNeutralScore;

      // 3. Financial Discrepancies Sub-score (20% weight)
      let discrepancyScore = 100;
      if (m.totalDebitNotesCount > 0 && m.totalOrderValue > 0) {
        const ratio = (m.totalDebitNotesValue / m.totalOrderValue) * 100;
        const penalty = Math.min(policy.debitNoteIndividualCap, policy.debitNotePenaltyMultiplier * ratio);
        discrepancyScore = clamp(100 - penalty, 0, 100);
      } else if (m.totalDebitNotesCount > 0) {
        const penalty = Math.min(policy.debitNoteIndividualCap, m.totalDebitNotesCount * 10);
        discrepancyScore = clamp(100 - penalty, 0, 100);
      } else if (m.discrepancyRate > 0) {
        discrepancyScore = clamp(100 - m.discrepancyRate * 2, 0, 100);
      } else if (m.vendorType === 'OUTSOURCING' && m.shortageRateOutsourcing > 0) {
        discrepancyScore = clamp(100 - m.shortageRateOutsourcing * 3, 0, 100);
      } else if (!hasOperationalHistory) {
        discrepancyScore = policy.provisionalNeutralScore;
      }

      // 4. Financial Resolution of Vendor Obligations Sub-score (10% weight)
      const obligationScore = m.vendorObligationRate != null
        ? clamp(m.vendorObligationRate, 0, 100)
        : 100;
      const commercialTermsScore = obligationScore;

      // 5. Scrap and Custody Reconciliation Sub-score (10% weight)
      let scrapYieldScore = hasJobWorkHistory ? 100 : policy.provisionalNeutralScore;
      if (hasJobWorkHistory) {
        const excessScrap = Math.max(0, m.scrapYieldRate - policy.custodyAuthorizedLossPct);
        const custodyLoss = excessScrap * 4 + m.shortageRateOutsourcing * 5;
        scrapYieldScore = clamp(100 - custodyLoss, 0, 100);
      }

      const effectiveQualityScore =
        m.vendorType === 'OUTSOURCING' && hasJobWorkHistory
          ? Math.min(qualityScore, scrapYieldScore)
          : qualityScore;

      const compositeScore = computeCompositeScore(
        {
          qualityScore: effectiveQualityScore,
          deliveryScore: punctualityScore,
          discrepancyScore,
          obligationScore,
          custodyScore: scrapYieldScore,
        },
        policy
      );

      let finalScore: number | null = compositeScore;
      if (!hasOperationalHistory) {
        finalScore = null;
      }

      const { grade } = getPerformanceClassification(finalScore, policy);

      let reliabilityRating: 'EXCELLENT' | 'RELIABLE' | 'MODERATE' | 'AT_RISK' | 'UNRATED' = 'UNRATED';
      if (finalScore !== null) {
        if (finalScore >= policy.thresholdStrong) reliabilityRating = 'EXCELLENT';
        else if (finalScore >= policy.thresholdGood) reliabilityRating = 'RELIABLE';
        else if (finalScore >= policy.thresholdWatch) reliabilityRating = 'MODERATE';
        else reliabilityRating = 'AT_RISK';
      }

      const strengths: string[] = [];
      const areasForImprovement: string[] = [];

      if (qualityScore >= 92) strengths.push('Consistently high incoming goods quality acceptance rate (35% weight)');
      else areasForImprovement.push('Improve pre-dispatch lot inspection to lower rejection rates');

      if (punctualityScore >= 88) strengths.push('Reliable fulfillment punctuality against PO delivery dates (25% weight)');
      else areasForImprovement.push('Address lead time bottlenecks and dispatch delays');

      if (discrepancyScore >= 90) strengths.push('Clean delivery record with minimal discrepancy or debit note penalties (20% weight)');
      else areasForImprovement.push('Reduce packing discrepancies, damaged shipments, and reconciliation claims');

      if (m.vendorType === 'OUTSOURCING' || m.vendorType === 'HYBRID') {
        if (m.scrapYieldRate <= policy.custodyAuthorizedLossPct) {
          strengths.push(`Scrap yield within authorized loss allowance (${m.scrapYieldRate}% <= ${policy.custodyAuthorizedLossPct}%)`);
        } else {
          areasForImprovement.push(`Optimize machining/extrusion scrap recovery to bring down ${m.scrapYieldRate}% loss rate`);
        }
      }

      if (strengths.length === 0) strengths.push('Active operational supplier profile in Plinth ERP');
      if (areasForImprovement.length === 0) areasForImprovement.push('Maintain current performance benchmarks and expand volume');

      return {
        vendorId: m.vendorId,
        vendorName: m.vendorName,
        vendorCode: m.vendorCode,
        vendorType: m.vendorType,
        score: finalScore,
        grade,
        reliabilityRating,
        confidenceStatus,
        punctualityScore,
        qualityScore,
        discrepancyScore,
        commercialTermsScore,
        obligationScore,
        scrapYieldScore,
        summary: `${m.vendorName} demonstrates ${reliabilityRating.toLowerCase()} operational reliability (${compositeScore}/100, ${confidenceStatus.toLowerCase()}) under policy v${policy.version || 1}. Delivery: ${punctualityScore}%, Quality: ${qualityScore}%, Discrepancy: ${discrepancyScore}%.`,
        strengths,
        areasForImprovement,
        recommendation:
          grade === 'A+' || grade === 'A'
            ? 'Recommended as preferred vendor for contract expansion and high-priority orders.'
            : grade === 'B'
            ? 'Approved for standard replenishment with periodic quality checks.'
            : 'Conduct vendor audit and require corrective action plans before issuing critical POs.',
        metrics: {
          totalPurchaseOrders: m.totalPurchaseOrders,
          totalJobWorkOrders: m.totalJobWorkOrders,
          onTimeDeliveryRate: m.onTimeDeliveryRate,
          discrepancyRate: m.discrepancyRate,
          goodsQualityRate: m.goodsQualityRate,
          scrapYieldRate: m.scrapYieldRate,
          totalDebitNotesCount: m.totalDebitNotesCount,
          paymentTerms: m.paymentTerms,
        },
      };
    });

    const average =
      evaluations.length > 0
        ? Math.round(evaluations.reduce((sum, e) => sum + (e.score ?? 0), 0) / evaluations.length)
        : 80;

    const topVendors = [...evaluations].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);

    return {
      generatedAt: new Date().toISOString(),
      provider: 'heuristic_fallback',
      modelId: 'vendor-scoring-engine-v2.0',
      vendorAverageScore: average,
      vendorTypeFilter: filterType,
      topVendors,
      evaluations,
      executiveSummary: `Auditable Vendor Performance Engine v2.0 evaluated ${evaluations.length} vendors across 5 weighted sub-scores (Quality 35%, Delivery 25%, Discrepancy 20%, Vendor Obligations 10%, Scrap/Custody 10%). Portfolio average is ${average}/100.`,
      policyVersion: policy.version || 1,
    };
  },

  /**
   * Main scoreVendors entrypoint
   */
  async scoreVendors(filterType: VendorType = 'ALL', targetVendorId?: string): Promise<VendorScoringReport> {
    const policy = await scoringEngine.getActivePolicy();

    // 1. Gather all vendors to evaluate
    const vendorWhere: Prisma.VendorWhereInput = {};
    if (targetVendorId) {
      vendorWhere.id = targetVendorId;
    }
    const vendors = await prisma.vendor.findMany({
      where: vendorWhere,
      select: { id: true, code: true, name: true, paymentTerms: true },
      orderBy: { name: 'asc' },
    });

    if (vendors.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        provider: 'heuristic_fallback',
        modelId: 'vendor-scoring-engine-v2.0',
        vendorAverageScore: 0,
        vendorTypeFilter: filterType,
        topVendors: [],
        evaluations: [],
        executiveSummary: 'No vendors found matching criteria.',
        policyVersion: policy.version || 1,
      };
    }

    // 2. Fetch metrics for operational metadata (orders count, payment terms, etc.)
    const metricsList = await this.gatherVendorMetrics(filterType, targetVendorId);
    const metricsMap = new Map<string, VendorEvaluationMetrics>();
    metricsList.forEach((m) => metricsMap.set(m.vendorId, m));

    // 3. Evaluate each vendor using the canonical VendorScoringEngine (identical to vendor detail)
    const evaluations: GeminiVendorEvaluation[] = [];

    for (const v of vendors) {
      const metrics = metricsMap.get(v.id);
      const determinedType: 'MATERIAL' | 'OUTSOURCING' | 'HYBRID' = metrics?.vendorType || 'MATERIAL';

      if (filterType === 'MATERIAL' && determinedType === 'OUTSOURCING') continue;
      if (filterType === 'OUTSOURCING' && determinedType === 'MATERIAL') continue;

      let ev: VendorPerformanceEvaluation;
      try {
        ev = await scoringEngine.evaluateVendor(v.id, { policy });
      } catch (err) {
        continue;
      }

      const qualityScore = ev.breakdown.quality.score;
      const punctualityScore = ev.breakdown.delivery.score;
      const discrepancyScore = ev.breakdown.discrepancy.score;
      const obligationScore = ev.breakdown.vendorObligation.score;
      const scrapYieldScore = ev.breakdown.custody.score;
      const compositeScore = ev.overallScore;

      const strengths: string[] = [];
      const areasForImprovement: string[] = [];

      if (qualityScore >= 92) strengths.push('Consistently high incoming goods quality acceptance rate (35% weight)');
      else areasForImprovement.push('Improve pre-dispatch lot inspection to lower rejection rates');

      if (punctualityScore >= 88) strengths.push('Reliable fulfillment punctuality against PO delivery dates (25% weight)');
      else areasForImprovement.push('Address lead time bottlenecks and dispatch delays');

      if (discrepancyScore >= 90) strengths.push('Clean delivery record with minimal discrepancy or debit note penalties (20% weight)');
      else areasForImprovement.push('Reduce packing discrepancies, damaged shipments, and reconciliation claims');

      if (determinedType === 'OUTSOURCING' || determinedType === 'HYBRID') {
        const scrapRate = metrics?.scrapYieldRate ?? 0;
        if (scrapRate <= policy.custodyAuthorizedLossPct) {
          strengths.push(`Scrap yield within authorized loss allowance (${scrapRate}% <= ${policy.custodyAuthorizedLossPct}%)`);
        } else {
          areasForImprovement.push(`Optimize machining/extrusion scrap recovery to bring down ${scrapRate}% loss rate`);
        }
      }

      if (strengths.length === 0) strengths.push('Active operational supplier profile in Plinth ERP');
      if (areasForImprovement.length === 0) areasForImprovement.push('Maintain current performance benchmarks and expand volume');

      const reliabilityRating: 'EXCELLENT' | 'RELIABLE' | 'MODERATE' | 'AT_RISK' | 'UNRATED' =
        compositeScore === null
          ? 'UNRATED'
          : compositeScore >= policy.thresholdStrong
          ? 'EXCELLENT'
          : compositeScore >= policy.thresholdGood
          ? 'RELIABLE'
          : compositeScore >= policy.thresholdWatch
          ? 'MODERATE'
          : 'AT_RISK';
      evaluations.push({
        vendorId: v.id,
        vendorName: v.name,
        vendorCode: v.code,
        vendorType: determinedType,
        score: compositeScore,
        grade: ev.grade,
        reliabilityRating,
        confidenceStatus: ev.confidenceStatus,
        punctualityScore,
        qualityScore,
        discrepancyScore,
        commercialTermsScore: obligationScore,
        obligationScore,
        scrapYieldScore,
        breakdown: ev.breakdown,
        summary: compositeScore === null
          ? `${v.name} has no recorded trading or receipt history yet. Vendor scoring is N/A until operational activity begins.`
          : `${v.name} demonstrates ${reliabilityRating.toLowerCase()} operational reliability (${compositeScore}/100, ${ev.confidenceStatus.toLowerCase()}) under policy v${policy.version || 1}. Delivery: ${punctualityScore}%, Quality: ${qualityScore}%, Discrepancy: ${discrepancyScore}%.`,
        strengths,
        areasForImprovement,
        recommendation:
          compositeScore === null
            ? 'Newly onboarded vendor. Issue trial purchase order to begin performance tracking.'
            : ev.grade === 'A+' || ev.grade === 'A'
            ? 'Recommended as preferred vendor for contract expansion and high-priority orders.'
            : ev.grade === 'B'
            ? 'Approved for standard replenishment with periodic quality checks.'
            : 'Conduct vendor audit and require corrective action plans before issuing critical POs.',
        metrics: {
          totalPurchaseOrders: metrics?.totalPurchaseOrders ?? 0,
          totalJobWorkOrders: metrics?.totalJobWorkOrders ?? ev.breakdown.custody.jobWorkOrdersCount,
          onTimeDeliveryRate: punctualityScore,
          discrepancyRate: metrics?.discrepancyRate ?? 0,
          goodsQualityRate: qualityScore,
          scrapYieldRate: metrics?.scrapYieldRate ?? 0,
          totalDebitNotesCount: ev.breakdown.discrepancy.eligibleDebitNotesCount,
          paymentTerms: v.paymentTerms || metrics?.paymentTerms || null,
        },
      });
    }

    const scoredEvaluations = evaluations.filter((e): e is typeof e & { score: number } => e.score !== null);
    const average =
      scoredEvaluations.length > 0
        ? Math.round(scoredEvaluations.reduce((sum, e) => sum + e.score, 0) / scoredEvaluations.length)
        : 80;

    const topVendors = [...scoredEvaluations].sort((a, b) => b.score - a.score).slice(0, 5);

    return {
      generatedAt: new Date().toISOString(),
      provider: 'heuristic_fallback',
      modelId: 'vendor-scoring-engine-v2.0',
      vendorAverageScore: average,
      vendorTypeFilter: filterType,
      topVendors,
      evaluations,
      executiveSummary: `Auditable Vendor Performance Engine v2.0 evaluated ${evaluations.length} vendors across 5 weighted sub-scores (Quality 35%, Delivery 25%, Discrepancy 20%, Vendor Obligations 10%, Scrap/Custody 10%). Portfolio average is ${average}/100.`,
      policyVersion: policy.version || 1,
    };
  },
};
