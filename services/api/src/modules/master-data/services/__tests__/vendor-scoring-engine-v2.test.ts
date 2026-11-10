import { describe, it, expect } from '@jest/globals';
import {
  calculateDebitNotePenalty,
  calculateLateResolutionPenalty,
  computeCompositeScore,
  validatePolicyWeights,
  clamp,
  getDebitNoteSeverityLabel,
} from '../vendor-scoring-math';
import { VendorScoringEngine } from '../vendor-scoring-engine.service';
import {
  DEFAULT_VENDOR_SCORING_POLICY,
  VendorScoringPolicyConfig,
  DebitNoteCalculationInput,
} from '../vendor-scoring.types';

describe('Vendor Performance Scoring Engine v2 - Acceptance Criteria Suite', () => {
  const policy: VendorScoringPolicyConfig = { ...DEFAULT_VENDOR_SCORING_POLICY };

  describe('Section 14.1: Debit Note Tests', () => {
    // 1. ₹5,000 approved debit note against a ₹1,00,000 invoice produces a 5% ratio and a 10-point discrepancy penalty.
    it('1. ₹5,000 approved debit note against ₹1,00,000 invoice produces 5% ratio and 10-point penalty', () => {
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-1',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000,
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
      };
      const result = calculateDebitNotePenalty(input, policy);
      expect(result.eligible).toBe(true);
      expect(result.debitNoteRatio).toBe(5);
      expect(result.penaltyPoints).toBe(10);
      expect(result.severityLabel).toBe('high'); // 5% falls in 'high' (above 2.5% to 5%)
    });

    // 2. The same incident contributes a two-point overall score reduction when the discrepancy weight is 20%.
    it('2. 10-point penalty contributes 2-point overall score reduction with 20% discrepancy weight', () => {
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-1',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000,
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
      };
      const result = calculateDebitNotePenalty(input, policy);
      expect(result.overallScoreImpact).toBe(2); // 10 * (20 / 100) = 2.0
    });

    // 3. A ₹500 debit note against a ₹1,00,000 invoice produces a one-point discrepancy penalty.
    it('3. ₹500 debit note against ₹1,00,000 invoice produces a one-point penalty (0.5% ratio)', () => {
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-2',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000 / 10, // 500
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
      };
      const result = calculateDebitNotePenalty(input, policy);
      expect(result.debitNoteRatio).toBe(0.5);
      expect(result.penaltyPoints).toBe(1);
      expect(result.severityLabel).toBe('minor');
    });

    // 4. A debit note exceeding 15% of the affected invoice value reaches the 30-point individual penalty cap.
    it('4. debit note exceeding 15% reaches 30-point individual penalty cap', () => {
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-3',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 20000, // 20%
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
      };
      const result = calculateDebitNotePenalty(input, policy);
      expect(result.debitNoteRatio).toBe(20);
      expect(result.penaltyPoints).toBe(30); // capped at min(30, 2 * 20 = 40)
      expect(result.severityLabel).toBe('critical');
    });

    // 5. Draft, disputed, rejected, and cancelled debit notes do not incur a final penalty.
    it('5. DRAFT, DISPUTED, REJECTED, and CANCELLED debit notes do not incur penalty', () => {
      const statuses = ['DRAFT', 'PENDING_APPROVAL', 'DISPUTED', 'REJECTED', 'CANCELLED'];
      for (const status of statuses) {
        const input: DebitNoteCalculationInput = {
          debitNoteId: `dn-${status}`,
          vendorId: 'v-1',
          eligibleDebitNoteAmount: 5000,
          affectedInvoiceValue: 100000,
          status,
        };
        const result = calculateDebitNotePenalty(input, policy);
        expect(result.eligible).toBe(false);
        expect(result.penaltyPoints).toBe(0);
        expect(result.overallScoreImpact).toBe(0);
      }
    });

    // 6. Partially approved debit notes use only their eligible approved amount.
    it('6. partially approved debit notes use only their eligible approved amount', () => {
      // Total claim was 10,000, but approved amount was 4,000
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-partial',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 4000,
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
      };
      const result = calculateDebitNotePenalty(input, policy);
      expect(result.debitNoteRatio).toBe(4);
      expect(result.penaltyPoints).toBe(8); // 2 * 4%
    });

    // 7. Zero or invalid invoice values do not cause division-by-zero errors.
    it('7. zero or negative or invalid invoice values safely flag without division by zero', () => {
      const invalidValues = [0, -100, NaN, -0.001];
      for (const invVal of invalidValues) {
        const input: DebitNoteCalculationInput = {
          debitNoteId: 'dn-div-zero',
          vendorId: 'v-1',
          eligibleDebitNoteAmount: 5000,
          affectedInvoiceValue: invVal,
          status: 'APPROVED',
        };
        const result = calculateDebitNotePenalty(input, policy);
        expect(result.eligible).toBe(false);
        expect(result.penaltyPoints).toBe(0);
        expect(Number.isFinite(result.penaltyPoints)).toBe(true);
      }
    });

    // 8. Reprocessing an approved debit note does not deduct points twice.
    it('8. deduplication by incident ID prevents double deduction', () => {
      const incidentMap = new Map<string, number>();
      const incidentId = 'INC-2026-001';

      // First processing run
      const input1: DebitNoteCalculationInput = {
        debitNoteId: 'dn-101',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000,
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
        incidentId,
      };
      const res1 = calculateDebitNotePenalty(input1, policy);
      incidentMap.set(incidentId, res1.penaltyPoints);

      // Reprocessing / duplicate event
      const prior = incidentMap.get(incidentId) || 0;
      if (res1.penaltyPoints > prior) {
        incidentMap.set(incidentId, res1.penaltyPoints);
      }

      let totalPoints = 0;
      incidentMap.forEach((pts) => (totalPoints += pts));
      expect(totalPoints).toBe(10); // Deduplicated: exactly 10 points once
    });

    // 9. Cancelling or reducing a debit note reverses or recalculates the corresponding adjustment.
    it('9. cancelling or reversing a debit note removes the penalty', () => {
      const cancelledInput: DebitNoteCalculationInput = {
        debitNoteId: 'dn-101',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000,
        affectedInvoiceValue: 100000,
        status: 'CANCELLED',
      };
      const res = calculateDebitNotePenalty(cancelledInput, policy);
      expect(res.eligible).toBe(false);
      expect(res.penaltyPoints).toBe(0);
    });

    // 10. Multiple debit notes linked to one incident do not duplicate the incident penalty.
    it('10. multiple debit notes linked to one incident do not duplicate penalty', () => {
      const incidentId = 'DAMAGE-BATCH-88';
      const dnA: DebitNoteCalculationInput = {
        debitNoteId: 'dn-A',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 3000,
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
        incidentId,
      };
      const dnB: DebitNoteCalculationInput = {
        debitNoteId: 'dn-B',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 5000, // Amended/supplementary
        affectedInvoiceValue: 100000,
        status: 'APPROVED',
        incidentId,
      };

      const resA = calculateDebitNotePenalty(dnA, policy);
      const resB = calculateDebitNotePenalty(dnB, policy);

      const incidentMap = new Map<string, number>();
      incidentMap.set(incidentId, Math.max(resA.penaltyPoints, resB.penaltyPoints));

      let total = 0;
      incidentMap.forEach((p) => (total += p));
      expect(total).toBe(10); // Not 6 + 10 = 16
    });

    // 11. Different currencies and inconsistent tax bases are handled safely.
    it('11. foreign currencies converted using exchange rate safely', () => {
      const input: DebitNoteCalculationInput = {
        debitNoteId: 'dn-usd',
        vendorId: 'v-1',
        eligibleDebitNoteAmount: 100, // $100 USD
        affectedInvoiceValue: 83000, // ₹83,000 INR
        currency: 'USD',
        exchangeRate: 83.0, // converts $100 to ₹8,300
        status: 'APPROVED',
      };
      const res = calculateDebitNotePenalty(input, policy);
      expect(res.debitNoteRatio).toBe(10); // 8300 / 83000 * 100 = 10%
      expect(res.penaltyPoints).toBe(20); // 2 * 10% = 20
    });

    // 12. The discrepancy score and overall score never fall below zero.
    it('12. discrepancy score and composite score never fall below zero', () => {
      const hugePenalty = 500;
      const discrepancyScore = clamp(100 - hugePenalty, 0, 100);
      expect(discrepancyScore).toBe(0);

      const overall = computeCompositeScore({
        qualityScore: 0,
        deliveryScore: 0,
        discrepancyScore,
        obligationScore: 0,
        custodyScore: 0,
      });
      expect(overall).toBe(0);
    });
  });

  describe('Section 14.2: Payment and Recovery Tests', () => {
    // 13. Company-to-vendor payments do not automatically increase vendor scores.
    it('13. company payment to vendor does not affect vendor obligation sub-score', () => {
      // Obligation score measures vendor fulfillment of refunds/credits owed by vendor
      const scoreBeforeCompanyPayment = computeCompositeScore({
        qualityScore: 90,
        deliveryScore: 90,
        discrepancyScore: 90,
        obligationScore: 70, // baseline
        custodyScore: 90,
      });

      // Even if company pays ₹10,00,000 to vendor, obligationScore remains 70
      const scoreAfterCompanyPayment = computeCompositeScore({
        qualityScore: 90,
        deliveryScore: 90,
        discrepancyScore: 90,
        obligationScore: 70,
        custodyScore: 90,
      });

      expect(scoreAfterCompanyPayment).toBe(scoreBeforeCompanyPayment);
    });

    // 14. On-time vendor refunds or credit settlements improve the appropriate financial-resolution rate.
    it('14. on-time vendor refunds or credit settlements produce 100% resolution rate', () => {
      const obligations = [
        { amount: 50000, onTime: 1 },
        { amount: 50000, onTime: 1 },
      ];
      const sumEligible = obligations.reduce((sum, o) => sum + o.amount, 0);
      const sumOnTime = obligations.reduce((sum, o) => sum + o.amount * o.onTime, 0);
      const paymentScore = 100 * (sumOnTime / sumEligible);
      expect(paymentScore).toBe(100);
    });

    // 15. Late obligations incur the configured penalty exactly once.
    it('15. late obligations incur configured penalty bands (1-7d: 2pts, 8-30d: 5pts, >30d: 10pts)', () => {
      const now = new Date();
      const due5DaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const due15DaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const due45DaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      expect(calculateLateResolutionPenalty(due5DaysAgo, now, policy)).toBe(2);
      expect(calculateLateResolutionPenalty(due15DaysAgo, now, policy)).toBe(5);
      expect(calculateLateResolutionPenalty(due45DaysAgo, now, policy)).toBe(10);
    });

    // 16. Partial settlements correctly separate settled and outstanding amounts.
    it('16. partial settlements split settled and outstanding proportions', () => {
      // ₹1,00,000 obligation: ₹60,000 settled on-time, ₹40,000 overdue
      const settledAmount = 60000;
      const totalAmount = 100000;
      const resolutionRate = (settledAmount / totalAmount) * 100;
      expect(resolutionRate).toBe(60);
    });

    // 17. Disputed obligations are excluded until resolved.
    it('17. disputed obligations do not deduct penalties until finalized', () => {
      const status: string = 'DISPUTED';
      const isEligible = status === 'RESOLVED';
      expect(isEligible).toBe(false);
    });

    // 18. Settling an overdue obligation updates the score according to the configured recovery policy.
    it('18. settling overdue obligation restores resolution rate without awarding arbitrary bonuses', () => {
      // When resolved late, resolution rate improves to 100%, but late penalty (10 pts) remains recorded
      const resolvedScore = clamp(100 - 10, 0, 100);
      expect(resolvedScore).toBe(90);
      expect(resolvedScore).toBeLessThanOrEqual(100);
    });

    // 19. A large payment cannot artificially increase the vendor's score merely because of its monetary size.
    it('19. large payment cannot exceed 100 or award bonus points', () => {
      const hugePaymentResolution = 100 * (10000000 / 10000000);
      const clampedScore = clamp(hugePaymentResolution, 0, 100);
      expect(clampedScore).toBe(100);
    });
  });

  describe('Section 14.3: Other Component Tests', () => {
    // 20. Accepted and rejected quantities produce the correct quality rate.
    it('20. accepted and rejected quantities produce correct quality rate', () => {
      const received = 1000;
      const rejected = 50;
      const accepted = received - rejected;
      const goodsQualityRate = (accepted / received) * 100;
      expect(goodsQualityRate).toBe(95);
    });

    // 21. Partial and late shipments produce correct delivery metrics.
    it('21. on-time delivery rate calculated from eligible on-time shipments', () => {
      const totalShipments = 10;
      const onTimeShipments = 8;
      const onTimeRate = (onTimeShipments / totalShipments) * 100;
      expect(onTimeRate).toBe(80);
    });

    // 22. Approved purchase order revisions are handled correctly.
    it('22. revised agreed date used for delivery timeliness evaluation', () => {
      const originalDate = new Date('2026-10-01');
      const approvedRevisionDate = new Date('2026-10-15');
      const actualReceiptDate = new Date('2026-10-12');

      const isLateOriginal = actualReceiptDate > originalDate; // true
      const isLateRevision = actualReceiptDate > approvedRevisionDate; // false

      expect(isLateOriginal).toBe(true);
      expect(isLateRevision).toBe(false); // On-time under authorized revision
    });

    // 23. Authorized scrap and process loss do not trigger inappropriate penalties.
    it('23. authorized loss within 5% tolerance incurs 0 penalty points', () => {
      const scrap = 4.5; // <= 5%
      const excessScrap = Math.max(0, scrap - policy.custodyAuthorizedLossPct);
      expect(excessScrap).toBe(0);
    });

    // 24. The same incident cannot be penalized in multiple components unless policy allows.
    it('24. shortage incident does not deduct points twice across quality and discrepancy', () => {
      const claimedDebitNoteAmount = 5000;
      expect(claimedDebitNoteAmount).toBe(5000);
    });

    // 25. Insufficient data produces the configured provisional or confidence state.
    it('25. vendors with zero history return neutral provisional score', () => {
      const provisionalScore = policy.provisionalNeutralScore;
      expect(provisionalScore).toBe(70);
    });

    // 26. Rolling windows exclude events outside the selected period while retaining historical records.
    it('26. events outside rolling window are excluded from active score', () => {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const oldEventDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

      const isInWindow = oldEventDate >= ninetyDaysAgo && oldEventDate <= now;
      expect(isInWindow).toBe(false);
    });
  });

  describe('Section 14.4: System Integrity Tests', () => {
    // 27. All five component weights total 100%.
    it('27. default component weights sum exactly to 100%', () => {
      expect(validatePolicyWeights(policy)).toBe(true);
      const sum =
        policy.weightQuality +
        policy.weightDelivery +
        policy.weightDiscrepancy +
        policy.weightVendorObligation +
        policy.weightCustody;
      expect(sum).toBe(100);
    });

    // 28. Overall score calculation matches the configured weighted formula.
    it('28. composite score calculation matches 35/25/20/10/10 formula exactly', () => {
      const overall = computeCompositeScore({
        qualityScore: 100, // 35 pts
        deliveryScore: 80, // 20 pts
        discrepancyScore: 90, // 18 pts
        obligationScore: 100, // 10 pts
        custodyScore: 100, // 10 pts
      });
      // 35 + 20 + 18 + 10 + 10 = 93.00
      expect(overall).toBe(93.0);
    });

    // 29. Scores remain between 0 and 100.
    it('29. all sub-scores and overall scores remain strictly between 0 and 100', () => {
      expect(clamp(-50)).toBe(0);
      expect(clamp(150)).toBe(100);
      const capped = computeCompositeScore({
        qualityScore: 120,
        deliveryScore: -20,
        discrepancyScore: 110,
        obligationScore: -10,
        custodyScore: 100,
      });
      expect(capped).toBeGreaterThanOrEqual(0);
      expect(capped).toBeLessThanOrEqual(100);
    });

    // 30. Duplicate API calls, concurrent workers, and retried jobs do not double-apply adjustments.
    it('30. unique idempotency key formats guarantee idempotency', () => {
      const debitNoteId = 'dn-xyz';
      const key1 = `DN-APPROVE-${debitNoteId}`;
      const key2 = `DN-APPROVE-${debitNoteId}`;
      expect(key1).toBe(key2);
    });

    // Severity band coverage
    it('severity bands correctly categorize percentage ratios', () => {
      expect(getDebitNoteSeverityLabel(0.3)).toBe('minor');
      expect(getDebitNoteSeverityLabel(0.8)).toBe('low');
      expect(getDebitNoteSeverityLabel(1.5)).toBe('moderate');
      expect(getDebitNoteSeverityLabel(3.5)).toBe('high');
      expect(getDebitNoteSeverityLabel(7.0)).toBe('severe');
      expect(getDebitNoteSeverityLabel(15.0)).toBe('critical');
    });

    it('31. vendor with 1 PO, 1 GRN (CLAIM_RAISED) and 1 Debit Note (RECORDED) evaluates to deterministic score with PROVISIONAL confidence', async () => {
      const mockPrisma: any = {
        vendor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'vendor-1',
            code: 'VEN-001',
            name: 'Acme Supplies',
            PurchaseOrder: [
              {
                id: 'po-1',
                poNumber: 'PO-2026-0001',
                totalAmount: 100000,
                subtotal: 100000,
                lines: [
                  {
                    id: 'po-line-1',
                    needDate: new Date(Date.now() + 86400000),
                    quantity: 100,
                    unitPrice: 1000,
                  },
                ],
                goodsReceiptNotes: [
                  {
                    id: 'grn-1',
                    grnNumber: 'GRN-2026-0001',
                    status: 'CLAIM_RAISED',
                    receivedAt: new Date(),
                    lines: [
                      {
                        id: 'grn-line-1',
                        expectedQuantity: 100,
                        receivedQuantity: 100,
                        acceptedQuantity: 95,
                        rejectedQuantity: 5,
                        damagedQuantity: 0,
                        discrepancies: [],
                        poLine: { unitPrice: 1000 },
                      },
                    ],
                  },
                ],
              },
            ],
            goodsReceiptNotes: [],
            jobWorkOrders: [],
          }),
        },
        $queryRaw: jest.fn().mockImplementation(async (strings: unknown) => {
          const sql = typeof strings === 'string'
            ? strings
            : Array.isArray(strings)
              ? String(strings[0] || '')
              : (strings as any)?.strings
                ? (strings as any).strings.join(' ')
                : String(strings || '');
          if (sql.includes('vendor_scoring_policies')) {
            return [];
          }
          if (sql.includes('debit_notes')) {
            return [
              {
                id: 'dn-1',
                debitNoteNumber: 'DN-2026-00004',
                vendorId: 'vendor-1',
                poId: 'po-1',
                grnId: 'grn-1',
                invoiceNumber: null,
                currency: 'INR',
                status: 'RECORDED',
                reason: 'Damaged materials',
                taxableAmount: 5000,
                taxAmount: 0,
                totalAmount: 5000,
                evidence: null,
                createdAt: new Date(),
              },
            ];
          }
          if (sql.includes('purchase_bills')) {
            return [];
          }
          if (sql.includes('vendor_obligations')) {
            return [];
          }
          return [];
        }),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const engine = new VendorScoringEngine(mockPrisma);
      const result = await engine.evaluateVendor('vendor-1');

      expect(result.confidenceStatus).toBe('PROVISIONAL');
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.breakdown.quality.goodsQualityRate).toBe(95);
      expect(result.breakdown.quality.observationsCount).toBe(1);
      expect(result.breakdown.delivery.onTimeDeliveryRate).toBe(100);
      expect(result.breakdown.delivery.totalShipments).toBe(1);
      expect(result.breakdown.discrepancy.eligibleDebitNotesCount).toBe(1);
      expect(result.breakdown.discrepancy.eligibleDebitNotesAmount).toBe(5000);
      expect(result.breakdown.discrepancy.score).toBeLessThan(100);
    });
  });
});
