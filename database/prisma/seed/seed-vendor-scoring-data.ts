/**
 * seed-vendor-scoring-data.ts
 *
 * Seeds rich, realistic transaction history for every vendor so the
 * VendorScoringEngine has full evidence across all five dimensions:
 *
 *  1. Quality       — GRN accepted vs received qty  (weightQuality)
 *  2. Delivery      — GRN receivedAt vs PO needDate (weightDelivery)
 *  3. Discrepancy   — DebitNotes with penalty pts   (weightDiscrepancy)
 *  4. Obligation    — vendor_scoring_events VENDOR_OBLIGATION_RESOLUTION
 *  5. Custody       — JobWorkOrder challans + returns (weightCustody)
 *
 * Each vendor is given a distinct realistic profile so scores differ
 * meaningfully and the confidence status reaches SUFFICIENT_EVIDENCE.
 *
 * Idempotent: safe to run multiple times; uses upsert / findFirst guards
 * throughout so re-runs only add missing rows.
 */

import { PrismaClient, PoStatus, GrnStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function addDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
}

/** Vendor profiles — each dimension tuned to produce a distinct overall score */
interface VendorProfile {
  code: string;
  /** POs to create: each becomes a PO → GRN pair */
  orders: Array<{
    /** days ago the PO was created */
    poAgeDays: number;
    /** days after PO creation the need-date falls */
    needOffsetDays: number;
    /** days after PO creation the GRN was received (positive = late) */
    grnOffsetDays: number;
    qty: number;
    unitPrice: number;
    /** fraction of qty accepted (1.0 = perfect, 0.85 = 15% rejection) */
    acceptRatio: number;
  }>;
  debitNotes: Array<{
    /** days ago the debit note was raised */
    ageDays: number;
    /** APPROVED = counts against score, DRAFT = not eligible */
    status: 'APPROVED' | 'DRAFT';
    taxableAmount: number;
    totalAmount: number;
    reason: string;
  }>;
  /** VENDOR_OBLIGATION_RESOLUTION events — financial obligation resolution speed */
  obligations: Array<{
    ageDays: number;
    eligibleAmount: number;
    /** 0 = on-time, positive = late-penalty points already computed */
    penaltyPoints: number;
  }>;
  /** Job-work custody scenario — only relevant for outsourcing vendors */
  jobWork?: {
    issuedQty: number;
    /** scrap returned — should be ≤ 5 % of issued for no penalty */
    scrapQty: number;
    /** material shortfall returned short (unexplained loss) */
    shortQty: number;
  };
}

// ─── vendor profiles ──────────────────────────────────────────────────────────

const PROFILES: VendorProfile[] = [
  // ── Natasha Cast: EXCELLENT overall (~88)
  //    Excellent quality + delivery, zero debit notes, exemplary obligations
  {
    code: 'VEND-NATASHA-CAST',
    orders: [
      { poAgeDays: 70, needOffsetDays: 14, grnOffsetDays: 12, qty: 500, unitPrice: 145, acceptRatio: 0.99 },
      { poAgeDays: 55, needOffsetDays: 10, grnOffsetDays: 9,  qty: 400, unitPrice: 145, acceptRatio: 1.0  },
      { poAgeDays: 40, needOffsetDays: 12, grnOffsetDays: 11, qty: 600, unitPrice: 148, acceptRatio: 0.98 },
      { poAgeDays: 25, needOffsetDays: 14, grnOffsetDays: 13, qty: 350, unitPrice: 148, acceptRatio: 0.99 },
      { poAgeDays: 12, needOffsetDays: 10, grnOffsetDays: 9,  qty: 450, unitPrice: 150, acceptRatio: 1.0  },
    ],
    debitNotes: [],
    obligations: [
      { ageDays: 60, eligibleAmount: 8500,  penaltyPoints: 0 },
      { ageDays: 45, eligibleAmount: 12000, penaltyPoints: 0 },
      { ageDays: 20, eligibleAmount: 9000,  penaltyPoints: 0 },
    ],
  },

  // ── Rajasthan Plastics: RELIABLE overall (~74)
  //    Good quality, mostly on-time (1 late), 1 small debit note, 1 delayed obligation
  {
    code: 'VEND-RAJASTHAN-PLASTICS',
    orders: [
      { poAgeDays: 75, needOffsetDays: 12, grnOffsetDays: 11, qty: 300, unitPrice: 210, acceptRatio: 0.96 },
      { poAgeDays: 60, needOffsetDays: 10, grnOffsetDays: 14, qty: 250, unitPrice: 210, acceptRatio: 0.94 }, // LATE
      { poAgeDays: 45, needOffsetDays: 12, grnOffsetDays: 11, qty: 400, unitPrice: 215, acceptRatio: 0.97 },
      { poAgeDays: 30, needOffsetDays: 14, grnOffsetDays: 13, qty: 320, unitPrice: 215, acceptRatio: 0.95 },
      { poAgeDays: 15, needOffsetDays: 10, grnOffsetDays: 9,  qty: 280, unitPrice: 218, acceptRatio: 0.96 },
    ],
    debitNotes: [
      { ageDays: 58, status: 'APPROVED', taxableAmount: 4500,  totalAmount: 5310,  reason: 'Short supply — 18 units missing from delivery' },
    ],
    obligations: [
      { ageDays: 65, eligibleAmount: 15000, penaltyPoints: 0 },
      { ageDays: 40, eligibleAmount: 7500,  penaltyPoints: 8 }, // late
    ],
  },

  // ── Ravi Mishra Consignments: MODERATE overall (~61)
  //    Mixed quality, 2 late deliveries, 2 debit notes, slow obligation resolution
  {
    code: 'VEND-RAVI-MISHRA',
    orders: [
      { poAgeDays: 80, needOffsetDays: 10, grnOffsetDays: 9,  qty: 200, unitPrice: 320, acceptRatio: 0.92 },
      { poAgeDays: 65, needOffsetDays: 10, grnOffsetDays: 16, qty: 180, unitPrice: 320, acceptRatio: 0.88 }, // LATE + low qual
      { poAgeDays: 50, needOffsetDays: 12, grnOffsetDays: 11, qty: 220, unitPrice: 325, acceptRatio: 0.91 },
      { poAgeDays: 35, needOffsetDays: 10, grnOffsetDays: 15, qty: 150, unitPrice: 325, acceptRatio: 0.87 }, // LATE + low qual
      { poAgeDays: 18, needOffsetDays: 12, grnOffsetDays: 11, qty: 200, unitPrice: 330, acceptRatio: 0.90 },
    ],
    debitNotes: [
      { ageDays: 62, status: 'APPROVED', taxableAmount: 9200,  totalAmount: 10856, reason: 'Quality rejection — 24 damaged units, surface defects observed' },
      { ageDays: 33, status: 'APPROVED', taxableAmount: 5800,  totalAmount: 6844,  reason: 'Short delivery — 15 units short against PO quantity' },
    ],
    obligations: [
      { ageDays: 70, eligibleAmount: 10856, penaltyPoints: 12 }, // late
      { ageDays: 50, eligibleAmount: 6844,  penaltyPoints: 15 }, // very late
    ],
  },

  // ── Sachin Soni Polymers: AT_RISK overall (~42)
  //    Poor delivery consistency, significant quality issues, multiple heavy debit notes
  {
    code: 'VEND-SACHIN-SONI',
    orders: [
      { poAgeDays: 82, needOffsetDays: 14, grnOffsetDays: 13, qty: 1000, unitPrice: 85, acceptRatio: 0.80 }, // low qual
      { poAgeDays: 68, needOffsetDays: 10, grnOffsetDays: 18, qty: 800,  unitPrice: 85, acceptRatio: 0.75 }, // LATE + low qual
      { poAgeDays: 52, needOffsetDays: 12, grnOffsetDays: 20, qty: 900,  unitPrice: 88, acceptRatio: 0.78 }, // LATE + low qual
      { poAgeDays: 35, needOffsetDays: 14, grnOffsetDays: 12, qty: 700,  unitPrice: 88, acceptRatio: 0.82 },
      { poAgeDays: 20, needOffsetDays: 10, grnOffsetDays: 17, qty: 850,  unitPrice: 90, acceptRatio: 0.79 }, // LATE
    ],
    debitNotes: [
      { ageDays: 65, status: 'APPROVED', taxableAmount: 18500, totalAmount: 21830, reason: 'Major quality failure — 200 units rejected, ABS grade non-conformant' },
      { ageDays: 48, status: 'APPROVED', taxableAmount: 11200, totalAmount: 13216, reason: 'Delayed delivery penalty — 8 days past agreed schedule' },
      { ageDays: 28, status: 'APPROVED', taxableAmount: 7400,  totalAmount: 8732,  reason: 'Short supply — 68 units missing without explanation' },
    ],
    obligations: [
      { ageDays: 60, eligibleAmount: 21830, penaltyPoints: 20 }, // very late
      { ageDays: 45, eligibleAmount: 13216, penaltyPoints: 18 },
      { ageDays: 25, eligibleAmount: 8732,  penaltyPoints: 0  }, // one on-time
    ],
    jobWork: {
      issuedQty:  1500,
      scrapQty:   120,  // 8 % — exceeds 5 % allowed
      shortQty:   45,   // unexplained loss
    },
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Seeding vendor scoring transaction history...\n');

  // Prerequisites
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) throw new Error('No admin user found — run seed.ts first.');

  const location = await prisma.warehouseLocation.findFirst();
  if (!location) throw new Error('No warehouse location found — run core seed first.');

  const uom = await prisma.unitOfMeasure.findFirst({
    where: { code: { in: ['PCS', 'NOS', 'KG', 'MTR'] } },
  });
  if (!uom) throw new Error('No UOM found — run seed-uoms first.');

  const materials = await prisma.material.findMany({
    select: { id: true, code: true, uomId: true },
    take: 10,
  });
  if (materials.length === 0) throw new Error('No materials found — run master data seed first.');

  const products = await prisma.product.findMany({
    select: { id: true, sku: true },
    take: 5,
  });

  // Fetch the active scoring policy (or create a default one for seeds)
  let scoringPolicy = await prisma.vendorScoringPolicy.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (!scoringPolicy) {
    scoringPolicy = await prisma.vendorScoringPolicy.create({
      data: {
        name: 'Default Vendor Scoring Policy',
        version: 1,
        status: 'ACTIVE',
        rollingWindowDays: 90,
        minEvidenceGrns: 3,
        weightQuality: 35,
        weightDelivery: 30,
        weightDiscrepancy: 20,
        weightVendorObligation: 10,
        weightCustody: 5,
        thresholdStrong: 85,
        thresholdGood: 70,
        thresholdWatch: 55,
        provisionalNeutralScore: 65,
        provisionalPolicy: 'NEUTRAL_PRIOR',
        taxBasis: 'EXCLUSIVE',
        discrepancyAggregateCap: 40,
        custodyAuthorizedLossPct: 5,
        lateObligationBand1Days: 7,
        lateObligationBand2Days: 30,
        lateObligationBand3Pts: 5,
        createdBy: admin.id,
      },
    });
    console.log('  ✓ Created default VendorScoringPolicy (ACTIVE)');
  }

  let poSeq = await prisma.purchaseOrder.count() + 100;
  let grnSeq = await prisma.goodsReceiptNote.count() + 100;
  let dnSeq  = await prisma.debitNote.count() + 100;
  let jwoSeq = await prisma.jobWorkOrder.count() + 100;

  for (const profile of PROFILES) {
    const vendor = await prisma.vendor.findUnique({ where: { code: profile.code } });
    if (!vendor) {
      console.warn(`  ⚠️  Vendor ${profile.code} not found — skipping.`);
      continue;
    }

    console.log(`\n🏭 ${vendor.name} (${profile.code})`);

    // ── 1+2: Quality & Delivery — POs with GRNs ───────────────────────────
    const createdPos: Array<{ id: string; lineId: string; poTotal: number }> = [];

    for (const o of profile.orders) {
      poSeq++;
      const poNumber = `PO-SCRD-${String(poSeq).padStart(5, '0')}`;
      const existing = await prisma.purchaseOrder.findFirst({ where: { poNumber } });
      if (existing) {
        const line = await prisma.purchaseOrderLine.findFirst({ where: { poId: existing.id } });
        createdPos.push({ id: existing.id, lineId: line?.id ?? '', poTotal: o.qty * o.unitPrice });
        continue;
      }

      const mat = materials[poSeq % materials.length];
      const poDate = daysAgo(o.poAgeDays);
      const needDate = addDays(poDate, o.needOffsetDays);
      const subtotal = o.qty * o.unitPrice;
      const tax = subtotal * 0.18;

      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          revisionNumber: 1,
          vendorId: vendor.id,
          status: PoStatus.SENT,
          currency: 'INR',
          subtotal,
          taxAmount: tax,
          totalAmount: subtotal + tax,
          paymentTerms: 'NET30',
          approvedAt: poDate,
          createdAt: poDate,
          updatedAt: poDate,
          lines: {
            create: [{
              materialId: mat.id,
              uomId: mat.uomId,
              quantity: o.qty,
              unitPrice: o.unitPrice,
              taxRate: 18,
              lineTotal: subtotal + tax,
              needDate,
              createdAt: poDate,
              updatedAt: poDate,
            }],
          },
        },
        include: { lines: true },
      });
      createdPos.push({ id: po.id, lineId: po.lines[0].id, poTotal: subtotal });
      console.log(`  + PO ${poNumber}: qty=${o.qty} @ ₹${o.unitPrice}, need=${needDate.toDateString()}`);
    }

    // Create GRNs against each PO
    for (let i = 0; i < profile.orders.length; i++) {
      const o   = profile.orders[i];
      const pos = createdPos[i];
      if (!pos.lineId) continue;

      grnSeq++;
      const grnNumber = `GRN-SCRD-${String(grnSeq).padStart(5, '0')}`;
      const existingGrn = await prisma.goodsReceiptNote.findFirst({ where: { grnNumber } });
      if (existingGrn) continue;

      const poDate   = daysAgo(o.poAgeDays);
      const grnDate  = addDays(poDate, o.grnOffsetDays);
      const accepted = Math.round(o.qty * o.acceptRatio);
      const rejected = o.qty - accepted;

      await prisma.goodsReceiptNote.create({
        data: {
          grnNumber,
          poId: pos.id,
          vendorId: vendor.id,
          locationId: location.id,
          status: GrnStatus.FINALIZED,
          receivedByActorId: admin.id,
          finalizedByActorId: admin.id,
          finalizedAt: grnDate,
          receivedAt: grnDate,
          createdAt: grnDate,
          updatedAt: grnDate,
          lines: {
            create: [{
              poLineId: pos.lineId,
              materialId: materials[i % materials.length].id,
              uomId: uom.id,
              expectedQuantity: o.qty,
              receivedQuantity: o.qty,
              acceptedQuantity: accepted,
              rejectedQuantity: rejected,
              damagedQuantity: Math.floor(rejected * 0.5),
              shortQuantity: 0,
              excessQuantity: 0,
              invoiceUnitPrice: o.unitPrice,
              status: rejected > 0 ? 'DISCREPANT' : 'VERIFIED',
              createdAt: grnDate,
              updatedAt: grnDate,
            }],
          },
        },
      });

      const onTime = o.grnOffsetDays <= o.needOffsetDays;
      console.log(`  + GRN ${grnNumber}: accepted=${accepted}/${o.qty} (${Math.round(o.acceptRatio * 100)}%), ${onTime ? '✅ on-time' : '⚠️ LATE'}`);
    }

    // ── 3: Discrepancy — DebitNotes ────────────────────────────────────────
    for (const dn of profile.debitNotes) {
      dnSeq++;
      const dnNumber = `DN-SCRD-${String(dnSeq).padStart(5, '0')}`;
      const existing = await prisma.debitNote.findFirst({ where: { debitNoteNumber: dnNumber } });
      if (existing) continue;

      const dnDate = daysAgo(dn.ageDays);
      const linkedPo = createdPos[0];

      await prisma.debitNote.create({
        data: {
          debitNoteNumber: dnNumber,
          vendorId: vendor.id,
          poId: linkedPo?.id ?? null,
          currency: 'INR',
          status: dn.status,
          reason: dn.reason,
          taxableAmount: dn.taxableAmount,
          taxAmount: dn.totalAmount - dn.taxableAmount,
          totalAmount: dn.totalAmount,
          createdBy: admin.id,
          approvedBy: dn.status === 'APPROVED' ? admin.id : null,
          approvedAt: dn.status === 'APPROVED' ? dnDate : null,
          submittedAt: dnDate,
          createdAt: dnDate,
          updatedAt: dnDate,
        },
      });
      console.log(`  + Debit Note ${dnNumber}: ₹${dn.taxableAmount} [${dn.status}] — ${dn.reason.slice(0, 50)}`);
    }

    // ── 4: Obligation — vendor_scoring_events ──────────────────────────────
    for (let idx = 0; idx < profile.obligations.length; idx++) {
      const ob = profile.obligations[idx];
      const iKey = `obligation-${vendor.id}-seed-${idx}`;
      const existing = await prisma.vendorScoringEvent.findFirst({ where: { idempotencyKey: iKey } });
      if (existing) continue;

      const obDate = daysAgo(ob.ageDays);

      await prisma.vendorScoringEvent.create({
        data: {
          idempotencyKey: iKey,
          vendorId: vendor.id,
          policyId: scoringPolicy.id,
          policyVersion: scoringPolicy.version,
          eventType: 'VENDOR_OBLIGATION_RESOLUTION',
          component: 'vendorObligation',
          sourceEntityType: 'DebitNote',
          sourceEntityId: `seed-obligation-${vendor.id}-${idx}`,
          eligibleAmount: ob.eligibleAmount,
          penaltyPoints: ob.penaltyPoints,
          scoreContribution: ob.penaltyPoints > 0 ? -ob.penaltyPoints : 0,
          severityLabel: ob.penaltyPoints === 0 ? 'ON_TIME' : ob.penaltyPoints <= 10 ? 'MINOR' : 'MODERATE',
          status: 'ACTIVE',
          effectiveDate: obDate,
          calculationVersion: 'v2.0',
          createdBy: admin.id,
          createdAt: obDate,
          updatedAt: obDate,
        },
      });

      const label = ob.penaltyPoints === 0 ? '✅ on-time' : `⚠️ +${ob.penaltyPoints}pts penalty`;
      console.log(`  + Obligation event ${idx + 1}: ₹${ob.eligibleAmount} — ${label}`);
    }

    // ── 5: Custody — JobWorkOrders (for vendors with jobWork profile) ──────
    if (profile.jobWork) {
      const jw = profile.jobWork;
      jwoSeq++;
      const orderNumber = `JWO-SCRD-${String(jwoSeq).padStart(5, '0')}`;
      const existingJwo = await prisma.jobWorkOrder.findFirst({ where: { orderNumber } });

      let jwoId: string;
      if (existingJwo) {
        jwoId = existingJwo.id;
      } else {
        const mat = materials[0];
        const product = products[0];
        const jwoDate = daysAgo(75);

        const jwo = await prisma.jobWorkOrder.create({
          data: {
            orderNumber,
            vendorId: vendor.id,
            productId: product?.id ?? null,
            targetQuantity: jw.issuedQty * 0.9,
            targetUomId: uom.id,
            rawMaterialInputQty: jw.issuedQty,
            expectedScrapRate: 5,
            status: 'CLOSED',
            deliveryLocationId: location.id,
            natureOfProcessing: 'Polymer Moulding & Assembly',
            specifications: 'ABS grade as per approved spec sheet',
            createdById: admin.id,
            approvedById: admin.id,
            approvedAt: jwoDate,
            closedById: admin.id,
            closedAt: daysAgo(10),
            createdAt: jwoDate,
            updatedAt: daysAgo(10),
          },
        });
        jwoId = jwo.id;
        console.log(`  + JobWorkOrder ${orderNumber}: issued=${jw.issuedQty} units`);
      }

      // Challan — material issued to vendor custody
      const challanNumber = `JWC-SCRD-${String(jwoSeq).padStart(5, '0')}`;
      const existingChallan = await prisma.jobWorkMaterialIssue.findFirst({ where: { challanNumber } });
      if (!existingChallan) {
        await prisma.jobWorkMaterialIssue.create({
          data: {
            challanNumber,
            jobWorkOrderId: jwoId,
            vendorId: vendor.id,
            dispatchLocationId: location.id,
            materialId: materials[0].id,
            uomId: uom.id,
            quantity: jw.issuedQty,
            issuedById: admin.id,
            issuedAt: daysAgo(72),
            createdAt: daysAgo(72),
            updatedAt: daysAgo(72),
          },
        });
        console.log(`  + Challan ${challanNumber}: issued=${jw.issuedQty} to vendor`);
      }

      // Receipt return — with scrap and shortfall
      const returnNumber = `JWR-SCRD-${String(jwoSeq).padStart(5, '0')}`;
      const existingReturn = await prisma.jobWorkReceiptReturn.findFirst({ where: { returnNumber } });
      if (!existingReturn) {
        const returned = jw.issuedQty - jw.shortQty - jw.scrapQty;
        await prisma.jobWorkReceiptReturn.create({
          data: {
            returnNumber,
            jobWorkOrderId: jwoId,
            vendorId: vendor.id,
            locationId: location.id,
            disposition: 'FINISHED_GOODS',
            productId: products[0]?.id ?? null,
            uomId: uom.id,
            expectedQuantity: jw.issuedQty * 0.9,
            receivedQuantity: returned,
            acceptedQuantity: returned - Math.floor(returned * 0.02),
            shortQuantity: jw.shortQty,
            excessQuantity: 0,
            scrapQuantity: jw.scrapQty,
            consumedRawMaterial: jw.issuedQty - jw.scrapQty,
            receivedById: admin.id,
            receivedAt: daysAgo(15),
            createdAt: daysAgo(15),
            updatedAt: daysAgo(15),
          },
        });
        console.log(`  + Return ${returnNumber}: scrap=${jw.scrapQty} (${((jw.scrapQty / jw.issuedQty) * 100).toFixed(1)}%), short=${jw.shortQty}`);
      }
    }
  }

  console.log('\n✅ Vendor scoring transaction history seeded successfully.');
  console.log('   Run the scoring engine via the Vendor Directory to see updated scores.\n');
}

main()
  .catch((e) => {
    console.error('❌ Vendor scoring seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
