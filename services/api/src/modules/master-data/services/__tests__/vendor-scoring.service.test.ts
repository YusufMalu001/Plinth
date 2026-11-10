import { describe, it, expect } from '@jest/globals';
import { vendorScoringService, VendorEvaluationMetrics } from '../vendor-scoring.service';

describe('Vendor Dynamic Scoring Heuristic & Penalties', () => {
  const baseMetrics: VendorEvaluationMetrics = {
    vendorId: 'v-clean-1',
    vendorName: 'Apex Precision Metals',
    vendorCode: 'V-APEX',
    vendorType: 'MATERIAL',
    contactEmail: 'sales@apex.example.com',
    taxNumber: '27AAAAA0000A1Z5',
    paymentTerms: 'Net 30',
    leadTimeDays: 10,
    totalPurchaseOrders: 10,
    totalJobWorkOrders: 0,
    totalOrderValue: 500000,
    onTimeDeliveryRate: 100,
    averageLeadTimeDays: 10,
    discrepancyRate: 0,
    totalDebitNotesCount: 0,
    totalDebitNotesValue: 0,
    goodsQualityRate: 100,
    totalReceivedQty: 1000,
    totalAcceptedQty: 1000,
    totalRejectedQty: 0,
    scrapYieldRate: 0,
    shortageRateOutsourcing: 0,
    totalCustodyIssuedTons: 0,
    totalCustodyReturnedTons: 0,
    paymentTermsScore: 88,
    hasValidGstin: true,
  };

  it('computes top tier score and grade A+ for zero debit notes and zero discrepancies', () => {
    const report = vendorScoringService.generateHeuristicEvaluation([baseMetrics]);
    expect(report.evaluations).toHaveLength(1);
    const evalData = report.evaluations[0];

    expect(evalData.score!).toBeGreaterThanOrEqual(90);
    expect(evalData.grade).toBe('A+');
    expect(evalData.qualityScore).toBe(100);
    expect(evalData.punctualityScore).toBe(100);
    expect(evalData.discrepancyScore).toBe(100);
  });

  it('decreases score and discrepancy score when a debit note is raised against the vendor', () => {
    const cleanReport = vendorScoringService.generateHeuristicEvaluation([baseMetrics]);
    const cleanScore = cleanReport.evaluations[0].score!;

    const withDebitNoteMetrics: VendorEvaluationMetrics = {
      ...baseMetrics,
      vendorId: 'v-with-dn-1',
      totalDebitNotesCount: 1,
      totalDebitNotesValue: 25000,
    };

    const penalReport = vendorScoringService.generateHeuristicEvaluation([withDebitNoteMetrics]);
    const penalScore = penalReport.evaluations[0].score!;

    expect(penalScore).toBeLessThan(cleanScore);
    expect(penalReport.evaluations[0].discrepancyScore).toBeLessThan(cleanReport.evaluations[0].discrepancyScore);
  });

  it('decreases score when damaged or short items are reported', () => {
    const cleanReport = vendorScoringService.generateHeuristicEvaluation([baseMetrics]);
    const cleanScore = cleanReport.evaluations[0].score!;

    const damagedMetrics: VendorEvaluationMetrics = {
      ...baseMetrics,
      vendorId: 'v-damaged-1',
      goodsQualityRate: 80, // 20% damaged/rejected
      discrepancyRate: 25, // 25% lines damaged or short
      totalAcceptedQty: 800,
      totalRejectedQty: 200,
    };

    const damagedReport = vendorScoringService.generateHeuristicEvaluation([damagedMetrics]);
    const damagedScore = damagedReport.evaluations[0].score!;

    expect(damagedScore).toBeLessThan(cleanScore);
    expect(damagedReport.evaluations[0].qualityScore).toBe(80);
    expect(damagedReport.evaluations[0].discrepancyScore).toBeLessThan(100);
  });

  it('penalizes both late delivery and outsourcing scrap/shortage', () => {
    const outsourcingMetrics: VendorEvaluationMetrics = {
      ...baseMetrics,
      vendorId: 'v-outsourcing-1',
      vendorType: 'OUTSOURCING',
      totalJobWorkOrders: 5,
      totalCustodyIssuedTons: 10,
      totalCustodyReturnedTons: 8,
      onTimeDeliveryRate: 60, // 40% delayed
      scrapYieldRate: 8, // 8% scrap
      shortageRateOutsourcing: 15, // 15% missing/short
    };

    const report = vendorScoringService.generateHeuristicEvaluation([outsourcingMetrics]);
    const evalData = report.evaluations[0];

    expect(evalData.punctualityScore).toBe(60);
    expect(evalData.score!).toBeLessThan(75);
    expect(['B', 'C', 'D']).toContain(evalData.grade);
  });
});
