import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  VendorScoringPolicyConfig,
  DEFAULT_VENDOR_SCORING_POLICY,
  DebitNoteCalculationInput,
  ConfidenceStatus,
  ScoreComponentBreakdown,
  VendorPerformanceEvaluation,
} from './vendor-scoring.types';
import {
  calculateDebitNotePenalty,
  computeCompositeScore,
  getPerformanceClassification,
  clamp,
  round,
} from './vendor-scoring-math';

interface RawPolicyRow {
  id: string;
  name: string;
  version: number | string;
  weightQuality: number | string;
  weightDelivery: number | string;
  weightDiscrepancy: number | string;
  weightVendorObligation: number | string;
  weightCustody: number | string;
  debitNotePenaltyMultiplier: number | string;
  debitNoteIndividualCap: number | string;
  discrepancyAggregateCap: number | string;
  lateObligationBand1Days: number;
  lateObligationBand1Pts: number | string;
  lateObligationBand2Days: number;
  lateObligationBand2Pts: number | string;
  lateObligationBand3Pts: number | string;
  custodyAuthorizedLossPct: number | string;
  rollingWindowDays: number;
  minEvidenceGrns: number;
  minEvidencePeriodDays: number;
  provisionalPolicy: 'NEUTRAL_PRIOR' | 'EXCLUDE' | 'INSUFFICIENT_EVIDENCE';
  provisionalNeutralScore: number | string;
  taxBasis: 'EXCLUSIVE' | 'INCLUSIVE';
  thresholdStrong: number | string;
  thresholdGood: number | string;
  thresholdWatch: number | string;
  status: string;
}

interface RawEventRow {
  id: string;
  idempotencyKey: string;
  vendorId: string;
  policyId: string | null;
  policyVersion: number;
  eventType: string;
  component: string;
  sourceEntityType: string;
  sourceEntityId: string;
  incidentId: string | null;
  debitNoteId: string | null;
  grnId: string | null;
  poId: string | null;
  jobWorkOrderId: string | null;
  eligibleAmount: number | Prisma.Decimal | null;
  affectedInvoiceValue: number | Prisma.Decimal | null;
  currency: string;
  penaltyPoints: number | Prisma.Decimal;
  scoreContribution: number | Prisma.Decimal;
  debitNoteRatio: number | Prisma.Decimal | null;
  severityLabel: string | null;
  status: string;
  reversalOfId: string | null;
  effectiveDate: Date;
  calculationVersion: string;
  createdBy: string;
}

interface RawDebitNoteRow {
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

interface RawPurchaseBillRow {
  id: string;
  supplierInvoiceNumber: string;
  normalizedInvoiceNumber: string;
  taxableAmount?: number | Prisma.Decimal;
  totalAmount: number | Prisma.Decimal;
}

export class VendorScoringEngine {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Fetch active scoring policy from database or return default
   */
  async getActivePolicy(): Promise<VendorScoringPolicyConfig> {
    try {
      const rows = await this.prisma.$queryRaw<RawPolicyRow[]>`
        SELECT * FROM "vendor_scoring_policies"
        WHERE "status" = 'ACTIVE'
        ORDER BY "version" DESC
        LIMIT 1
      `;
      if (rows && rows[0]) {
        const r = rows[0];
        return {
          id: r.id,
          name: r.name,
          version: Number(r.version),
          weightQuality: Number(r.weightQuality),
          weightDelivery: Number(r.weightDelivery),
          weightDiscrepancy: Number(r.weightDiscrepancy),
          weightVendorObligation: Number(r.weightVendorObligation),
          weightCustody: Number(r.weightCustody),
          debitNotePenaltyMultiplier: Number(r.debitNotePenaltyMultiplier),
          debitNoteIndividualCap: Number(r.debitNoteIndividualCap),
          discrepancyAggregateCap: Number(r.discrepancyAggregateCap),
          lateObligationBand1Days: Number(r.lateObligationBand1Days),
          lateObligationBand1Pts: Number(r.lateObligationBand1Pts),
          lateObligationBand2Days: Number(r.lateObligationBand2Days),
          lateObligationBand2Pts: Number(r.lateObligationBand2Pts),
          lateObligationBand3Pts: Number(r.lateObligationBand3Pts),
          custodyAuthorizedLossPct: Number(r.custodyAuthorizedLossPct),
          rollingWindowDays: Number(r.rollingWindowDays),
          minEvidenceGrns: Number(r.minEvidenceGrns),
          minEvidencePeriodDays: Number(r.minEvidencePeriodDays),
          provisionalPolicy: r.provisionalPolicy,
          provisionalNeutralScore: Number(r.provisionalNeutralScore),
          taxBasis: r.taxBasis,
          thresholdStrong: Number(r.thresholdStrong),
          thresholdGood: Number(r.thresholdGood),
          thresholdWatch: Number(r.thresholdWatch),
          status: r.status,
        };
      }
    } catch {
      // Fallback if table not ready yet
    }
    return DEFAULT_VENDOR_SCORING_POLICY;
  }

  /**
   * Create or update scoring policy (versioned)
   */
  async createPolicy(
    input: Partial<VendorScoringPolicyConfig>,
    actorId = 'SYSTEM'
  ): Promise<VendorScoringPolicyConfig> {
    const active = await this.getActivePolicy();
    const nextVersion = (active.version ?? 1) + 1;
    const policyId = randomUUID();

    const merged: VendorScoringPolicyConfig = {
      ...DEFAULT_VENDOR_SCORING_POLICY,
      ...input,
      id: policyId,
      version: nextVersion,
      name: input.name || active.name || 'DEFAULT',
      status: 'ACTIVE',
    };

    // Deactivate previous policies
    await this.prisma.$executeRaw`
      UPDATE "vendor_scoring_policies" SET "status" = 'INACTIVE' WHERE "name" = ${merged.name}
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "vendor_scoring_policies" (
        "id", "version", "name", "weightQuality", "weightDelivery", "weightDiscrepancy",
        "weightVendorObligation", "weightCustody", "debitNotePenaltyMultiplier",
        "debitNoteIndividualCap", "discrepancyAggregateCap", "lateObligationBand1Days",
        "lateObligationBand1Pts", "lateObligationBand2Days", "lateObligationBand2Pts",
        "lateObligationBand3Pts", "custodyAuthorizedLossPct", "rollingWindowDays",
        "minEvidenceGrns", "minEvidencePeriodDays", "provisionalPolicy",
        "provisionalNeutralScore", "taxBasis", "thresholdStrong", "thresholdGood",
        "thresholdWatch", "status", "createdBy", "createdAt", "updatedAt"
      ) VALUES (
        ${policyId}, ${nextVersion}, ${merged.name}, ${merged.weightQuality}, ${merged.weightDelivery}, ${merged.weightDiscrepancy},
        ${merged.weightVendorObligation}, ${merged.weightCustody}, ${merged.debitNotePenaltyMultiplier},
        ${merged.debitNoteIndividualCap}, ${merged.discrepancyAggregateCap}, ${merged.lateObligationBand1Days},
        ${merged.lateObligationBand1Pts}, ${merged.lateObligationBand2Days}, ${merged.lateObligationBand2Pts},
        ${merged.lateObligationBand3Pts}, ${merged.custodyAuthorizedLossPct}, ${merged.rollingWindowDays},
        ${merged.minEvidenceGrns}, ${merged.minEvidencePeriodDays}, ${merged.provisionalPolicy},
        ${merged.provisionalNeutralScore}, ${merged.taxBasis}, ${merged.thresholdStrong}, ${merged.thresholdGood},
        ${merged.thresholdWatch}, 'ACTIVE', ${actorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;

    return merged;
  }

  /**
   * Idempotent Event Recording:
   * Records a scoring event in vendor_scoring_events.
   * If an active event already exists with the same idempotencyKey, returns existing.
   */
  async recordEvent(params: {
    idempotencyKey: string;
    vendorId: string;
    eventType:
      | 'DEBIT_NOTE_PENALTY'
      | 'DEBIT_NOTE_REVERSAL'
      | 'GRN_QUALITY_OBSERVATION'
      | 'GRN_DELIVERY_OBSERVATION'
      | 'VENDOR_OBLIGATION_RESOLUTION'
      | 'CUSTODY_RECONCILIATION'
      | 'SCORE_RECALCULATION';
    component: string;
    sourceEntityType: string;
    sourceEntityId: string;
    incidentId?: string | null;
    debitNoteId?: string | null;
    grnId?: string | null;
    poId?: string | null;
    jobWorkOrderId?: string | null;
    eligibleAmount?: number | null;
    affectedInvoiceValue?: number | null;
    currency?: string;
    penaltyPoints: number;
    scoreContribution: number;
    debitNoteRatio?: number | null;
    severityLabel?: string | null;
    effectiveDate?: Date;
    createdBy?: string;
    reversalOfId?: string | null;
  }): Promise<RawEventRow> {
    const existing = await this.prisma.$queryRaw<RawEventRow[]>`
      SELECT * FROM "vendor_scoring_events"
      WHERE "idempotencyKey" = ${params.idempotencyKey}
      LIMIT 1
    `;
    if (existing && existing.length > 0) {
      return existing[0];
    }

    const policy = await this.getActivePolicy();
    const eventId = randomUUID();
    const effectiveDate = params.effectiveDate || new Date();
    const currency = params.currency || 'INR';
    const createdBy = params.createdBy || 'SYSTEM';

    await this.prisma.$executeRaw`
      INSERT INTO "vendor_scoring_events" (
        "id", "idempotencyKey", "vendorId", "policyId", "policyVersion",
        "eventType", "component", "sourceEntityType", "sourceEntityId",
        "incidentId", "debitNoteId", "grnId", "poId", "jobWorkOrderId",
        "eligibleAmount", "affectedInvoiceValue", "currency",
        "penaltyPoints", "scoreContribution", "debitNoteRatio", "severityLabel",
        "status", "reversalOfId", "effectiveDate", "calculationVersion",
        "createdBy", "createdAt", "updatedAt"
      ) VALUES (
        ${eventId}, ${params.idempotencyKey}, ${params.vendorId}, ${policy.id || null}, ${policy.version || 1},
        ${params.eventType}::"VendorScoringEventType", ${params.component}, ${params.sourceEntityType}, ${params.sourceEntityId},
        ${params.incidentId || null}, ${params.debitNoteId || null}, ${params.grnId || null}, ${params.poId || null}, ${params.jobWorkOrderId || null},
        ${params.eligibleAmount != null ? params.eligibleAmount : null},
        ${params.affectedInvoiceValue != null ? params.affectedInvoiceValue : null},
        ${currency},
        ${params.penaltyPoints}, ${params.scoreContribution},
        ${params.debitNoteRatio != null ? params.debitNoteRatio : null},
        ${params.severityLabel || null},
        'ACTIVE'::"VendorScoringEventStatus",
        ${params.reversalOfId || null},
        ${effectiveDate}, 'v2.0',
        ${createdBy}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;

    const created = await this.prisma.$queryRaw<RawEventRow[]>`
      SELECT * FROM "vendor_scoring_events" WHERE "id" = ${eventId} LIMIT 1
    `;
    return created[0];
  }

  /**
   * Reverse an existing scoring event
   */
  async reverseEvent(eventId: string, actorId = 'SYSTEM'): Promise<RawEventRow | null> {
    const rows = await this.prisma.$queryRaw<RawEventRow[]>`
      SELECT * FROM "vendor_scoring_events" WHERE "id" = ${eventId} LIMIT 1
    `;
    if (!rows || rows.length === 0) return null;
    const original = rows[0];

    if (original.status === 'REVERSED') return original;

    const reversalId = randomUUID();
    const reversalKey = `REV-${original.idempotencyKey}-${reversalId.slice(0, 8)}`;

    await this.prisma.$transaction(async (tx) => {
      // Mark original as REVERSED
      await tx.$executeRaw`
        UPDATE "vendor_scoring_events"
        SET "status" = 'REVERSED'::"VendorScoringEventStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${original.id}
      `;

      // Insert offsetting reversal event
      await tx.$executeRaw`
        INSERT INTO "vendor_scoring_events" (
          "id", "idempotencyKey", "vendorId", "policyId", "policyVersion",
          "eventType", "component", "sourceEntityType", "sourceEntityId",
          "incidentId", "debitNoteId", "grnId", "poId", "jobWorkOrderId",
          "eligibleAmount", "affectedInvoiceValue", "currency",
          "penaltyPoints", "scoreContribution", "debitNoteRatio", "severityLabel",
          "status", "reversalOfId", "effectiveDate", "calculationVersion",
          "createdBy", "createdAt", "updatedAt"
        ) VALUES (
          ${reversalId}, ${reversalKey}, ${original.vendorId}, ${original.policyId}, ${original.policyVersion},
          'DEBIT_NOTE_REVERSAL'::"VendorScoringEventType", ${original.component}, ${original.sourceEntityType}, ${original.sourceEntityId},
          ${original.incidentId}, ${original.debitNoteId}, ${original.grnId}, ${original.poId}, ${original.jobWorkOrderId},
          ${original.eligibleAmount}, ${original.affectedInvoiceValue}, ${original.currency},
          ${-Number(original.penaltyPoints)}, ${-Number(original.scoreContribution)},
          ${original.debitNoteRatio}, ${original.severityLabel},
          'ACTIVE'::"VendorScoringEventStatus",
          ${original.id},
          CURRENT_TIMESTAMP, 'v2.0',
          ${actorId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
    });

    const res = await this.prisma.$queryRaw<RawEventRow[]>`SELECT * FROM "vendor_scoring_events" WHERE "id" = ${reversalId} LIMIT 1`;
    return res[0];
  }

  /**
   * Recalculate vendor score for a given window and persist snapshot
   */
  async evaluateVendor(
    vendorId: string,
    options?: { windowDays?: number; policy?: VendorScoringPolicyConfig }
  ): Promise<VendorPerformanceEvaluation> {
    const policy = options?.policy || (await this.getActivePolicy());
    const windowDays = options?.windowDays || policy.rollingWindowDays || 90;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // 1. Fetch Vendor & basic information
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        PurchaseOrder: {
          include: {
            lines: true,
            goodsReceiptNotes: {
              include: {
                lines: { include: { discrepancies: true, poLine: true } },
              },
            },
          },
        },
        goodsReceiptNotes: {
          where: { poId: null },
          include: {
            lines: { include: { discrepancies: true, poLine: true } },
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

    if (!vendor) {
      throw new Error(`Vendor [${vendorId}] not found.`);
    }

    // 2. Fetch all Debit Notes for this vendor
    let debitNotes: RawDebitNoteRow[] = [];
    try {
      debitNotes = await this.prisma.$queryRaw<RawDebitNoteRow[]>`
        SELECT * FROM "debit_notes"
        WHERE "vendorId" = ${vendorId}
        ORDER BY "createdAt" DESC
      `;
    } catch {
      debitNotes = [];
    }

    // Also fetch purchase bills for affected invoice value lookup
    let purchaseBills: RawPurchaseBillRow[] = [];
    try {
      purchaseBills = await this.prisma.$queryRaw<RawPurchaseBillRow[]>`
        SELECT * FROM "purchase_bills"
        WHERE "vendorId" = ${vendorId}
      `;
    } catch {
      purchaseBills = [];
    }
    const billMap = new Map<string, RawPurchaseBillRow>();
    purchaseBills.forEach((b) => {
      billMap.set(b.id, b);
      if (b.supplierInvoiceNumber) {
        billMap.set(b.supplierInvoiceNumber, b);
      }
      if (b.normalizedInvoiceNumber) {
        billMap.set(b.normalizedInvoiceNumber, b);
      }
    });

    // 3. Process Quality & Delivery from Finalized GRNs in window
    const allPos = vendor.PurchaseOrder || [];
    const directGrns = vendor.goodsReceiptNotes || [];
    const allGrns = [
      ...allPos.flatMap((p) => p.goodsReceiptNotes.map((g) => ({ ...g, po: p }))),
      ...directGrns.map((g) => ({ ...g, po: null })),
    ];
    const eligibleGrnStatuses = ['VERIFIED', 'CLAIM_RAISED', 'SIGNED_OFF', 'FINALIZED'];
    // Filter by window and exclude non-verified or cancelled
    const eligibleGrns = allGrns.filter((g) => {
      const isWithinWindow =
        new Date(g.receivedAt) >= periodStart && new Date(g.receivedAt) <= periodEnd;
      const isVerified = eligibleGrnStatuses.includes(String(g.status || '').toUpperCase());
      return isWithinWindow && isVerified;
    });
    // Quality metrics
    let totalReceivedQty = 0;
    let totalAcceptedQty = 0;
    let totalReceivedValue = 0;
    let totalAcceptedValue = 0;

    // Delivery metrics
    let totalEligibleShipments = 0;
    let onTimeEligibleShipments = 0;
    let lateShipments = 0;
    let totalOrderedQty = 0;

    eligibleGrns.forEach((g) => {
      totalEligibleShipments++;
      const po = g.po;

      // Delivery check against PO need date
      let agreedDate: Date | null = null;
      if (po && po.lines && po.lines.length > 0) {
        agreedDate = po.lines.reduce<Date | null>(
          (latest, l) => (!latest || l.needDate > latest ? l.needDate : latest),
          null
        );
      }

      const receiptDate = new Date(g.receivedAt);
      if (!agreedDate || receiptDate.getTime() <= new Date(agreedDate).getTime()) {
        onTimeEligibleShipments++;
      } else {
        lateShipments++;
      }

      g.lines.forEach((l) => {
        const rec = Number(l.receivedQuantity || 0);
        const acc = Number(l.acceptedQuantity || 0);
        const unitPrice = Number(l.poLine?.unitPrice || 0);

        totalReceivedQty += rec;
        totalAcceptedQty += acc;
        totalReceivedValue += rec * unitPrice;
        totalAcceptedValue += acc * unitPrice;
        totalOrderedQty += Number(l.expectedQuantity || 0);
      });
    });

    // Quality Score (0-100) - Only score when receipts observed, else provisional neutral
    const hasReceivedQuality = totalReceivedQty > 0;
    const goodsQualityRate = hasReceivedQuality
      ? round((totalAcceptedQty / totalReceivedQty) * 100, 2)
      : 0;
    const qualityScore = hasReceivedQuality
      ? clamp(goodsQualityRate, 0, 100)
      : policy.provisionalNeutralScore;

    // Delivery Score (0-100) - Only score when shipments observed, else provisional neutral
    const hasShipmentData = totalEligibleShipments > 0;
    const onTimeDeliveryRate = hasShipmentData
      ? round((onTimeEligibleShipments / totalEligibleShipments) * 100, 2)
      : 0;
    const fulfillmentRate =
      totalOrderedQty > 0 ? round((totalAcceptedQty / totalOrderedQty) * 100, 2) : 0;
    const deliveryScore = hasShipmentData
      ? clamp(onTimeDeliveryRate, 0, 100)
      : policy.provisionalNeutralScore;
    // 4. Financial Discrepancies & Debit Notes
    // Group debit notes by incidentId to prevent duplicate counting
    const incidentMap = new Map<string, number>();
    const activeDebitNotesDisplay: VendorPerformanceEvaluation['activeDebitNotes'] = [];
    let totalEligibleDebitNotesCount = 0;
    let totalEligibleDebitNotesAmount = 0;

    for (const dn of debitNotes) {
      const createdAt = new Date(dn.createdAt);
      if (createdAt < periodStart || createdAt > periodEnd) continue;

      // Find affected invoice value
      let affectedInvoiceValue = 0;
      if (dn.invoiceNumber && billMap.has(dn.invoiceNumber)) {
        const b = billMap.get(dn.invoiceNumber);
        if (b) {
          affectedInvoiceValue =
            policy.taxBasis === 'EXCLUSIVE'
              ? Number(b.taxableAmount || b.totalAmount || 0)
              : Number(b.totalAmount || 0);
        }
      } else if (dn.poId) {
        const po = allPos.find((p) => p.id === dn.poId);
        if (po) {
          affectedInvoiceValue =
            policy.taxBasis === 'EXCLUSIVE'
              ? Number(po.subtotal || po.totalAmount || 0)
              : Number(po.totalAmount || 0);
        }
      } else if (dn.grnId) {
        const grnMatch = allGrns.find((g) => g.id === dn.grnId);
        if (grnMatch && grnMatch.lines) {
          affectedInvoiceValue = grnMatch.lines.reduce((sum: number, l) => {
            const qty = Number(l.receivedQuantity || l.acceptedQuantity || l.expectedQuantity || 0);
            const price = Number(l.poLine?.unitPrice || 0);
            return sum + qty * price;
          }, 0);
        }
      }

      // Check evidence field for linked invoice value if not found
      if (dn.evidence && typeof dn.evidence === 'object' && dn.evidence !== null) {
        if ('affectedInvoiceValue' in dn.evidence && typeof dn.evidence.affectedInvoiceValue === 'number') {
          affectedInvoiceValue = dn.evidence.affectedInvoiceValue;
        }
      }

      const input: DebitNoteCalculationInput = {
        debitNoteId: dn.id,
        vendorId: dn.vendorId,
        poId: dn.poId,
        grnId: dn.grnId,
        invoiceNumber: dn.invoiceNumber,
        eligibleDebitNoteAmount:
          policy.taxBasis === 'EXCLUSIVE'
            ? Number(dn.taxableAmount || dn.totalAmount || 0)
            : Number(dn.totalAmount || 0),
        affectedInvoiceValue,
        currency: dn.currency || 'INR',
        status: dn.status,
        reason: dn.reason,
        incidentId: dn.incidentId || dn.id,
      };

      const result = calculateDebitNotePenalty(input, policy);

      if (result.eligible) {
        totalEligibleDebitNotesCount++;
        totalEligibleDebitNotesAmount += input.eligibleDebitNoteAmount;

        const incidentKey = input.incidentId || dn.id;
        const priorPenalty = incidentMap.get(incidentKey) || 0;
        if (result.penaltyPoints > priorPenalty) {
          incidentMap.set(incidentKey, result.penaltyPoints);
        }

        activeDebitNotesDisplay.push({
          debitNoteId: dn.id,
          debitNoteNumber: dn.debitNoteNumber,
          eligibleAmount: input.eligibleDebitNoteAmount,
          affectedInvoiceValue,
          debitNoteRatio: result.debitNoteRatio,
          penaltyPoints: result.penaltyPoints,
          severityLabel: result.severityLabel,
          status: dn.status,
          reason: dn.reason,
          overallContribution: result.overallScoreImpact,
        });
      }
    }

    // Sum deduplicated incident penalties
    let totalEligiblePenaltyPoints = 0;
    incidentMap.forEach((pts) => {
      totalEligiblePenaltyPoints += pts;
    });

    // Apply aggregate cap
    totalEligiblePenaltyPoints = Math.min(
      policy.discrepancyAggregateCap,
      totalEligiblePenaltyPoints
    );

    const discrepancyScore = round(clamp(100 - totalEligiblePenaltyPoints, 0, 100), 2);

    // 5. Financial Resolution Behavior (Vendor Obligations)
    let vendorObligationRows: RawEventRow[] = [];
    try {
      vendorObligationRows = await this.prisma.$queryRaw<RawEventRow[]>`
        SELECT * FROM "vendor_scoring_events"
        WHERE "vendorId" = ${vendorId}
          AND "eventType" = 'VENDOR_OBLIGATION_RESOLUTION'
          AND "status" = 'ACTIVE'
          AND "effectiveDate" >= ${periodStart}
          AND "effectiveDate" <= ${periodEnd}
      `;
    } catch {
      vendorObligationRows = [];
    }

    let obligationScore = 100;
    let obligationProvisional = false;
    let amountWeightedResolutionRate = 100;
    let lateResolutionPenaltyPoints = 0;
    let totalObligationsCount = 0;
    let resolvedOnTimeCount = 0;
    let overdueCount = 0;

    if (vendorObligationRows.length === 0) {
      obligationProvisional = true;
      obligationScore = 100;
    } else {
      let sumEligibleAmount = 0;
      let sumOnTimeAmount = 0;

      for (const ob of vendorObligationRows) {
        totalObligationsCount++;
        const amt = Number(ob.eligibleAmount || 0);
        sumEligibleAmount += amt;

        const isOverdue = Number(ob.penaltyPoints) > 0;
        if (isOverdue) {
          overdueCount++;
          lateResolutionPenaltyPoints += Number(ob.penaltyPoints);
        } else {
          resolvedOnTimeCount++;
          sumOnTimeAmount += amt;
        }
      }

      amountWeightedResolutionRate =
        sumEligibleAmount > 0 ? (sumOnTimeAmount / sumEligibleAmount) * 100 : 100;
      obligationScore = round(
        clamp(
          amountWeightedResolutionRate - lateResolutionPenaltyPoints,
          0,
          100
        ),
        2
      );
    }

    // 6. Scrap & Custody Reconciliation (Outsourcing & Job Work)
    const jobOrders = vendor.jobWorkOrders || [];
    let totalCustodyIssuedValue = 0;
    let totalCustodyLossValue = 0;
    let custodyScore = 100;
    let custodyProvisional = false;

    if (jobOrders.length === 0) {
      custodyProvisional = true;
      custodyScore = 100;
    } else {
      let totalIssuedQty = 0;
      let totalScrapQty = 0;
      let totalShortageQty = 0;

      jobOrders.forEach((jo) => {
        jo.challans.forEach((c) => {
          totalIssuedQty += Number(c.quantity || 0);
        });
        jo.returns.forEach((r) => {
          totalShortageQty += Number(r.shortQuantity || 0);
          totalScrapQty += Number(r.scrapQuantity || 0);
        });
      });

      const allowedScrapPct = policy.custodyAuthorizedLossPct || 5.0;
      const allowedScrapQty = (totalIssuedQty * allowedScrapPct) / 100;
      const excessScrapQty = Math.max(0, totalScrapQty - allowedScrapQty);
      const unexplainedLossQty = totalShortageQty + excessScrapQty;

      totalCustodyIssuedValue = totalIssuedQty;
      totalCustodyLossValue = unexplainedLossQty;

      const custodyLossRate =
        totalIssuedQty > 0 ? (unexplainedLossQty / totalIssuedQty) * 100 : 0;
      custodyScore = round(clamp(100 - custodyLossRate * 2, 0, 100), 2);
    }

    // 7. Evidence & Confidence Evaluation
    const evidenceObservationsCount =
      eligibleGrns.length +
      totalEligibleDebitNotesCount +
      vendorObligationRows.length +
      jobOrders.length;
    let confidenceStatus: ConfidenceStatus = 'SUFFICIENT_EVIDENCE';
    if (evidenceObservationsCount === 0) {
      confidenceStatus = 'INSUFFICIENT_EVIDENCE';
    } else if (eligibleGrns.length < policy.minEvidenceGrns) {
      confidenceStatus = 'PROVISIONAL';
    }
    // 8. Composite Overall Score
    let overallScore = computeCompositeScore(
      {
        qualityScore,
        deliveryScore,
        discrepancyScore,
        obligationScore,
        custodyScore,
      },
      policy
    );

    if (confidenceStatus === 'INSUFFICIENT_EVIDENCE') {
      overallScore = null as unknown as number;
    }
    const { classification, grade } = getPerformanceClassification(overallScore, policy);

    const breakdown: ScoreComponentBreakdown = {
      quality: {
        score: qualityScore,
        weight: policy.weightQuality,
        contribution: round(qualityScore * (policy.weightQuality / 100), 2),
        observationsCount: eligibleGrns.length,
        acceptedQuantity: totalAcceptedQty,
        receivedQuantity: totalReceivedQty,
        goodsQualityRate,
        acceptedValue: totalAcceptedValue,
        receivedValue: totalReceivedValue,
        isProvisional: eligibleGrns.length === 0,
      },
      delivery: {
        score: deliveryScore,
        weight: policy.weightDelivery,
        contribution: round(deliveryScore * (policy.weightDelivery / 100), 2),
        totalShipments: totalEligibleShipments,
        onTimeShipments: onTimeEligibleShipments,
        lateShipments,
        onTimeDeliveryRate,
        fulfillmentRate,
        isProvisional: totalEligibleShipments === 0,
      },
      discrepancy: {
        score: discrepancyScore,
        weight: policy.weightDiscrepancy,
        contribution: round(discrepancyScore * (policy.weightDiscrepancy / 100), 2),
        totalEligiblePenaltyPoints,
        incidentCount: incidentMap.size,
        eligibleDebitNotesCount: totalEligibleDebitNotesCount,
        eligibleDebitNotesAmount: totalEligibleDebitNotesAmount,
        isProvisional: totalEligibleDebitNotesCount === 0 && eligibleGrns.length === 0,
      },
      vendorObligation: {
        score: obligationScore,
        weight: policy.weightVendorObligation,
        contribution: round(obligationScore * (policy.weightVendorObligation / 100), 2),
        totalObligationsCount,
        resolvedOnTimeCount,
        overdueCount,
        amountWeightedResolutionRate,
        lateResolutionPenaltyPoints,
        isProvisional: obligationProvisional,
        evidenceMessage: obligationProvisional
          ? 'No eligible vendor financial obligations (refunds/credits) recorded in window'
          : undefined,
      },
      custody: {
        score: custodyScore,
        weight: policy.weightCustody,
        contribution: round(custodyScore * (policy.weightCustody / 100), 2),
        jobWorkOrdersCount: jobOrders.length,
        totalIssuedValue: totalCustodyIssuedValue,
        totalLossValue: totalCustodyLossValue,
        custodyLossRate:
          totalCustodyIssuedValue > 0
            ? round((totalCustodyLossValue / totalCustodyIssuedValue) * 100, 2)
            : 0,
        excessScrapRate: 0,
        isProvisional: custodyProvisional,
      },
    };

    const evaluation: VendorPerformanceEvaluation = {
      vendorId,
      policyId: policy.id,
      policyVersion: policy.version || 1,
      scoringPeriodStart: periodStart,
      scoringPeriodEnd: periodEnd,
      overallScore,
      confidenceStatus,
      evidenceObservationsCount,
      classification,
      grade,
      breakdown,
      activeDebitNotes: activeDebitNotesDisplay,
      recentIncidents: [],
    };

    try {
      if (evaluation.overallScore !== null) {
        await this.persistScoreSnapshot(evaluation, vendorId);
      }
    } catch {
      // Non-blocking
    }

    return evaluation;
  }

  /**
   * Persist evaluation snapshot into vendor_score_snapshots
   */
  async persistScoreSnapshot(
    ev: VendorPerformanceEvaluation,
    vendorId: string
  ): Promise<void> {
    const snapshotId = randomUUID();
    const scorecardId = ev.policyId || 'policy-default-v1';

    await this.prisma.$executeRaw`
      INSERT INTO "vendor_score_snapshots" (
        "id", "vendorId", "scorecardId", "score", "metrics", "calculatedAt",
        "policyId", "policyVersion", "qualityScore", "deliveryScore",
        "discrepancyScore", "obligationScore", "custodyScore",
        "confidenceStatus", "componentBreakdown", "scoringPeriodStart", "scoringPeriodEnd"
      ) VALUES (
        ${snapshotId}, ${vendorId}, ${scorecardId}, ${ev.overallScore},
        ${JSON.stringify({
          classification: ev.classification,
          grade: ev.grade,
          evidenceCount: ev.evidenceObservationsCount,
        })}::jsonb,
        CURRENT_TIMESTAMP,
        ${ev.policyId || null}, ${ev.policyVersion},
        ${ev.breakdown.quality.score}, ${ev.breakdown.delivery.score},
        ${ev.breakdown.discrepancy.score}, ${ev.breakdown.vendorObligation.score},
        ${ev.breakdown.custody.score},
        ${ev.confidenceStatus},
        ${JSON.stringify(ev.breakdown)}::jsonb,
        ${ev.scoringPeriodStart}, ${ev.scoringPeriodEnd}
      )
    `;
  }
}
