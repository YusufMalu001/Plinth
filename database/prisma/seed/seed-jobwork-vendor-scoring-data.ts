/**
 * seed-jobwork-vendor-scoring-data.ts
 *
 * Seeds three dedicated Outsourcing / Job-Work vendors (pure OUTSOURCING type —
 * no purchase orders, only job-work orders) with rich transaction history across
 * every custody scoring path the VendorScoringEngine evaluates:
 *
 *  Custody dimension  — JobWorkOrder → JobWorkMaterialIssue (challans)
 *                                    → JobWorkReceiptReturn (with scrap/short)
 *                                    → JobWorkReconciliation
 *
 *  Discrepancy        — DebitNotes raised against custody losses
 *
 *  Obligation         — vendor_scoring_events (VENDOR_OBLIGATION_RESOLUTION)
 *                       reflecting how fast each vendor settles debit notes
 *
 *  Scoring engine auto-detects type:
 *    hasJobWork && !hasMaterialPO → 'OUTSOURCING'
 *
 * Three intentionally distinct profiles:
 *
 *  1. Mehta Fabricators     — EXCELLENT custody, on-time returns, minimal scrap
 *  2. Pioneer Powder Coat   — RELIABLE, slightly elevated scrap, one late return
 *  3. Shree Metalworks      — AT_RISK, chronic losses, heavy debit notes, slow settlement
 *
 * Idempotent: safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function addDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
}

// ─── vendor definitions ───────────────────────────────────────────────────────

const JW_VENDORS = [
  {
    code: 'VEND-MEHTA-FAB',
    name: 'Mehta Fabricators',
    contactPhone: '+91-9821011111',
    taxNumber: '27AABCM5678K1Z3',
    address: {
      street: 'Plot 7, MIDC Industrial Area, Bhosari',
      city: 'Pune',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '411026',
      country: 'India',
    },
    paymentTerms: 'NET45',
    leadTimeDays: 14,
  },
  {
    code: 'VEND-PIONEER-PC',
    name: 'Pioneer Powder Coat',
    contactPhone: '+91-9821022222',
    taxNumber: '27AABCP9012L1Z7',
    address: {
      street: '22, Rabale MIDC, TTC Industrial Area',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '400701',
      country: 'India',
    },
    paymentTerms: 'NET30',
    leadTimeDays: 10,
  },
  {
    code: 'VEND-SHREE-METAL',
    name: 'Shree Metalworks',
    contactPhone: '+91-9821033333',
    taxNumber: '27AABCS3456M1Z1',
    address: {
      street: 'Gat No. 45, Chakan Industrial Estate',
      city: 'Chakan',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '410501',
      country: 'India',
    },
    paymentTerms: 'NET60',
    leadTimeDays: 21,
  },
];

// ─── job-work profiles ────────────────────────────────────────────────────────

interface JobRun {
  /** days ago the JWO was created / approved */
  startDaysAgo: number;
  /** days after start the challan was dispatched */
  challanOffsetDays: number;
  /** days after start the return arrived */
  returnOffsetDays: number;
  /** total qty issued in this batch */
  issuedQty: number;
  /** scrap quantity returned — policy allows 5 % */
  scrapQty: number;
  /** unexplained shortage (not accounted for in scrap or finished) */
  shortQty: number;
  /** nature of processing label */
  process: string;
}

interface ObligationEvent {
  ageDays: number;
  eligibleAmount: number;
  /** 0 = resolved on time; positive = penalty points already assessed */
  penaltyPoints: number;
}

interface JwVendorProfile {
  vendorCode: string;
  runs: JobRun[];
  debitNotes: Array<{
    ageDays: number;
    status: 'APPROVED' | 'DRAFT';
    taxableAmount: number;
    totalAmount: number;
    reason: string;
  }>;
  obligations: ObligationEvent[];
}

const JW_PROFILES: JwVendorProfile[] = [
  // ── Mehta Fabricators: EXCELLENT (~87)
  //    Near-zero scrap, all returns on time, perfect obligation settlement
  {
    vendorCode: 'VEND-MEHTA-FAB',
    runs: [
      { startDaysAgo: 85, challanOffsetDays: 2, returnOffsetDays: 16, issuedQty: 2000, scrapQty: 60,  shortQty: 0,  process: 'SS Pipe Fabrication & Bending' },
      { startDaysAgo: 68, challanOffsetDays: 1, returnOffsetDays: 14, issuedQty: 1800, scrapQty: 45,  shortQty: 0,  process: 'SS Pipe Fabrication & Bending' },
      { startDaysAgo: 52, challanOffsetDays: 2, returnOffsetDays: 15, issuedQty: 2200, scrapQty: 70,  shortQty: 0,  process: 'Frame Welding & Sub-Assembly' },
      { startDaysAgo: 35, challanOffsetDays: 1, returnOffsetDays: 13, issuedQty: 1600, scrapQty: 40,  shortQty: 0,  process: 'SS Pipe Fabrication & Bending' },
      { startDaysAgo: 18, challanOffsetDays: 2, returnOffsetDays: 14, issuedQty: 1900, scrapQty: 55,  shortQty: 0,  process: 'Frame Welding & Sub-Assembly' },
    ],
    debitNotes: [],
    obligations: [
      { ageDays: 75, eligibleAmount: 0,     penaltyPoints: 0 }, // no debit notes → no obligations
    ],
  },

  // ── Pioneer Powder Coat: RELIABLE (~72)
  //    Slightly elevated scrap in two batches, one minor shortage, 1 debit note settled late
  {
    vendorCode: 'VEND-PIONEER-PC',
    runs: [
      { startDaysAgo: 80, challanOffsetDays: 2, returnOffsetDays: 12, issuedQty: 1200, scrapQty: 48,  shortQty: 0,  process: 'Powder Coating — RAL 9003 White' },
      { startDaysAgo: 65, challanOffsetDays: 3, returnOffsetDays: 15, issuedQty: 1500, scrapQty: 95,  shortQty: 20, process: 'Powder Coating — RAL 9003 White' }, // elevated scrap + short
      { startDaysAgo: 48, challanOffsetDays: 2, returnOffsetDays: 11, issuedQty: 1100, scrapQty: 42,  shortQty: 0,  process: 'Powder Coating — RAL 7016 Anthracite' },
      { startDaysAgo: 30, challanOffsetDays: 1, returnOffsetDays: 12, issuedQty: 1300, scrapQty: 85,  shortQty: 12, process: 'Powder Coating — RAL 9003 White' }, // slightly elevated
      { startDaysAgo: 14, challanOffsetDays: 2, returnOffsetDays: 10, issuedQty: 1000, scrapQty: 38,  shortQty: 0,  process: 'Powder Coating — RAL 7016 Anthracite' },
    ],
    debitNotes: [
      {
        ageDays: 62,
        status: 'APPROVED',
        taxableAmount: 6800,
        totalAmount: 8024,
        reason: 'Material shortage — 20 units unaccounted for after return verification',
      },
      {
        ageDays: 27,
        status: 'APPROVED',
        taxableAmount: 4200,
        totalAmount: 4956,
        reason: 'Excess scrap beyond 5% tolerance — 23 units written off',
      },
    ],
    obligations: [
      { ageDays: 58, eligibleAmount: 8024, penaltyPoints: 8 },  // slightly late settlement
      { ageDays: 23, eligibleAmount: 4956, penaltyPoints: 0 },  // on-time
    ],
  },

  // ── Shree Metalworks: AT_RISK (~38)
  //    Chronic excess scrap, material losses on every batch, 3 heavy debit notes, very slow obligation resolution
  {
    vendorCode: 'VEND-SHREE-METAL',
    runs: [
      { startDaysAgo: 82, challanOffsetDays: 3, returnOffsetDays: 28, issuedQty: 3000, scrapQty: 360, shortQty: 80,  process: 'Die Casting — Zinc Alloy Components' },
      { startDaysAgo: 65, challanOffsetDays: 4, returnOffsetDays: 30, issuedQty: 2500, scrapQty: 280, shortQty: 120, process: 'Die Casting — Zinc Alloy Components' },
      { startDaysAgo: 50, challanOffsetDays: 3, returnOffsetDays: 32, issuedQty: 2800, scrapQty: 320, shortQty: 95,  process: 'Machining & Threading' },
      { startDaysAgo: 33, challanOffsetDays: 5, returnOffsetDays: 35, issuedQty: 2200, scrapQty: 250, shortQty: 60,  process: 'Die Casting — Zinc Alloy Components' },
      { startDaysAgo: 16, challanOffsetDays: 3, returnOffsetDays: 28, issuedQty: 2600, scrapQty: 300, shortQty: 110, process: 'Machining & Threading' },
    ],
    debitNotes: [
      {
        ageDays: 70,
        status: 'APPROVED',
        taxableAmount: 22000,
        totalAmount: 25960,
        reason: 'Chronic scrap excess — 360 units (12%) above the 5% contractual tolerance in Batch JWO-1',
      },
      {
        ageDays: 52,
        status: 'APPROVED',
        taxableAmount: 18500,
        totalAmount: 21830,
        reason: 'Material shortage 120 units — unaccounted loss post-casting, no reconciliation provided',
      },
      {
        ageDays: 28,
        status: 'APPROVED',
        taxableAmount: 14200,
        totalAmount: 16756,
        reason: 'Scrap excess 95 units + 60 units shortage — dual custody breach in Batches JWO-3 and JWO-4',
      },
    ],
    obligations: [
      { ageDays: 65, eligibleAmount: 25960, penaltyPoints: 22 }, // very late
      { ageDays: 48, eligibleAmount: 21830, penaltyPoints: 20 }, // very late
      { ageDays: 24, eligibleAmount: 16756, penaltyPoints: 15 }, // late, pending dispute
    ],
  },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏗️  Seeding Job-Work / Outsourcing vendor scoring data...\n');

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) throw new Error('No admin user — run seed.ts first.');

  const location = await prisma.warehouseLocation.findFirst();
  if (!location) throw new Error('No warehouse location — run core seed first.');

  const uom = await prisma.unitOfMeasure.findFirst({
    where: { code: { in: ['KG', 'PCS', 'NOS', 'MTR'] } },
  });
  if (!uom) throw new Error('No UOM — run seed-uoms first.');

  const materials = await prisma.material.findMany({
    select: { id: true, code: true, uomId: true },
    take: 6,
  });
  if (materials.length === 0) throw new Error('No materials — run master data seed first.');

  const products = await prisma.product.findMany({
    select: { id: true, sku: true },
    take: 4,
  });

  const scoringPolicy = await prisma.vendorScoringPolicy.findFirst({ where: { status: 'ACTIVE' } });
  if (!scoringPolicy) throw new Error('No active scoring policy — run seed-vendor-scoring-data.ts first.');

  // ── 1. Upsert the three job-work vendors ─────────────────────────────────
  console.log('👤 Creating Job-Work vendors...');
  for (const v of JW_VENDORS) {
    await prisma.vendor.upsert({
      where: { code: v.code },
      update: {
        name: v.name,
        contactPhone: v.contactPhone,
        taxNumber: v.taxNumber,
        address: v.address,
        paymentTerms: v.paymentTerms,
        leadTimeDays: v.leadTimeDays,
        status: 'ACTIVE',
      },
      create: {
        code: v.code,
        name: v.name,
        contactPhone: v.contactPhone,
        taxNumber: v.taxNumber,
        address: v.address,
        currency: 'INR',
        paymentTerms: v.paymentTerms,
        leadTimeDays: v.leadTimeDays,
        status: 'ACTIVE',
      },
    });
    console.log(`  ✓ Vendor ${v.name} (${v.code})`);
  }

  let jwoSeq = await prisma.jobWorkOrder.count() + 200;
  let dnSeq  = await prisma.debitNote.count() + 200;

  for (const profile of JW_PROFILES) {
    const vendor = await prisma.vendor.findUnique({ where: { code: profile.vendorCode } });
    if (!vendor) {
      console.warn(`  ⚠️  Vendor ${profile.vendorCode} not found.`);
      continue;
    }

    console.log(`\n🏭 ${vendor.name} (${vendor.code})`);

    // Track JWO ids for debit note linking
    const jwoIds: string[] = [];

    // ── Custody: JobWorkOrders with challans + returns + reconciliations ────
    for (let i = 0; i < profile.runs.length; i++) {
      const run = profile.runs[i];
      jwoSeq++;

      const orderNumber = `JWO-JW-${String(jwoSeq).padStart(5, '0')}`;
      const existing = await prisma.jobWorkOrder.findFirst({ where: { orderNumber } });

      let jwoId: string;
      if (existing) {
        jwoId = existing.id;
        jwoIds.push(jwoId);
        console.log(`  ~ JWO ${orderNumber} already exists, skipping.`);
        continue;
      }

      const startDate  = daysAgo(run.startDaysAgo);
      const mat        = materials[i % materials.length];
      const product    = products[i % Math.max(products.length, 1)];

      // Expected output = issued − allowedScrap(5%) − any expected shortage
      const allowedScrap     = Math.floor(run.issuedQty * 0.05);
      const expectedFinished = run.issuedQty - allowedScrap;

      const jwo = await prisma.jobWorkOrder.create({
        data: {
          orderNumber,
          vendorId: vendor.id,
          productId: product?.id ?? null,
          targetQuantity: expectedFinished,
          targetUomId: uom.id,
          rawMaterialInputQty: run.issuedQty,
          expectedScrapRate: 5,
          status: 'CLOSED',
          deliveryLocationId: location.id,
          natureOfProcessing: run.process,
          specifications: 'As per Synergy approved drawing rev A',
          createdById: admin.id,
          approvedById: admin.id,
          approvedAt: addDays(startDate, 1),
          closedById: admin.id,
          closedAt: addDays(startDate, run.returnOffsetDays + 5),
          notes: `Batch ${i + 1} — ${run.process}`,
          createdAt: startDate,
          updatedAt: addDays(startDate, run.returnOffsetDays + 5),
          // JWO lines
          lines: {
            create: [{
              materialId: mat.id,
              uomId: mat.uomId,
              requiredQuantity: run.issuedQty,
              allocatedQuantity: run.issuedQty,
              issuedQuantity: run.issuedQty,
              returnedQuantity: run.issuedQty - run.shortQty - run.scrapQty,
              consumedQuantity: run.issuedQty - run.shortQty - run.scrapQty,
              scrapQuantity: run.scrapQty,
              notes: `Raw material for ${run.process}`,
              createdAt: startDate,
              updatedAt: addDays(startDate, run.returnOffsetDays),
            }],
          },
        },
      });
      jwoId = jwo.id;
      jwoIds.push(jwoId);

      // Challan — material dispatched to vendor
      const challanNumber = `JWC-JW-${String(jwoSeq).padStart(5, '0')}`;
      const challanDate   = addDays(startDate, run.challanOffsetDays);
      await prisma.jobWorkMaterialIssue.create({
        data: {
          challanNumber,
          jobWorkOrderId: jwoId,
          vendorId: vendor.id,
          dispatchLocationId: location.id,
          materialId: mat.id,
          uomId: uom.id,
          quantity: run.issuedQty,
          vehicleNumber: `MH${14 + i}-AB-${1000 + jwoSeq}`,
          transporterName: 'Synergy In-House Logistics',
          issuedById: admin.id,
          issuedAt: challanDate,
          notes: `Issue for ${orderNumber} — ${run.process}`,
          createdAt: challanDate,
          updatedAt: challanDate,
        },
      });

      // Receipt return — finished goods + scrap returned
      const returnNumber   = `JWR-JW-${String(jwoSeq).padStart(5, '0')}`;
      const returnDate     = addDays(startDate, run.returnOffsetDays);
      const receivedQty    = run.issuedQty - run.shortQty - run.scrapQty;
      const acceptedQty    = Math.max(0, receivedQty - Math.floor(receivedQty * 0.01)); // 1% inspection rejection

      const returnRec = await prisma.jobWorkReceiptReturn.create({
        data: {
          returnNumber,
          jobWorkOrderId: jwoId,
          vendorId: vendor.id,
          locationId: location.id,
          disposition: 'FINISHED_GOODS',
          productId: product?.id ?? null,
          uomId: uom.id,
          expectedQuantity: expectedFinished,
          receivedQuantity: receivedQty,
          acceptedQuantity: acceptedQty,
          shortQuantity: run.shortQty,
          excessQuantity: 0,
          scrapQuantity: run.scrapQty,
          consumedRawMaterial: run.issuedQty - run.scrapQty,
          receivedById: admin.id,
          receivedAt: returnDate,
          notes: `Return for ${orderNumber}: scrap=${run.scrapQty}, short=${run.shortQty}`,
          createdAt: returnDate,
          updatedAt: returnDate,
        },
      });

      // Reconciliation
      const reconNumber   = `JREC-JW-${String(jwoSeq).padStart(5, '0')}`;
      const reconStatus   = run.shortQty > 0 || run.scrapQty > Math.floor(run.issuedQty * 0.05)
        ? 'DISCREPANCY_FLAGGED'
        : 'RECONCILED';
      const reconDate     = addDays(returnDate, 2);

      await prisma.jobWorkReconciliation.create({
        data: {
          reconciliationNumber: reconNumber,
          jobWorkOrderId: jwoId,
          returnId: returnRec.id,
          status: reconStatus,
          totalIssuedQty: run.issuedQty,
          totalReturnedQty: receivedQty,
          totalConsumedQty: run.issuedQty - run.scrapQty,
          totalScrapQty: run.scrapQty,
          shortageQty: run.shortQty,
          excessQty: 0,
          outstandingCustodyQty: run.shortQty,
          financialImpactNotes: run.shortQty > 0 || run.scrapQty > allowedScrap
            ? `Excess scrap ${Math.max(0, run.scrapQty - allowedScrap)} units; shortage ${run.shortQty} units — debit note to follow`
            : 'Within tolerance — no financial impact',
          reconciledById: admin.id,
          reconciledAt: reconDate,
          reason: reconStatus === 'DISCREPANCY_FLAGGED'
            ? 'Material loss exceeds contractual tolerance'
            : 'All quantities verified and reconciled',
          createdAt: reconDate,
          updatedAt: reconDate,
        },
      });

      const scrapPct = ((run.scrapQty / run.issuedQty) * 100).toFixed(1);
      console.log(
        `  + JWO ${orderNumber} [${run.process.slice(0, 28)}]: ` +
        `issued=${run.issuedQty}, scrap=${run.scrapQty} (${scrapPct}%), short=${run.shortQty} → ${reconStatus}`
      );
    }

    // ── Discrepancy: Debit Notes ─────────────────────────────────────────────
    for (const dn of profile.debitNotes) {
      dnSeq++;
      const dnNumber  = `DN-JW-${String(dnSeq).padStart(5, '0')}`;
      const existing  = await prisma.debitNote.findFirst({ where: { debitNoteNumber: dnNumber } });
      if (existing) continue;

      const dnDate    = daysAgo(dn.ageDays);
      const linkedJwo = jwoIds[0] ?? null; // link to first JWO for traceability

      await prisma.debitNote.create({
        data: {
          debitNoteNumber: dnNumber,
          vendorId: vendor.id,
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
      console.log(
        `  + Debit Note ${dnNumber}: ₹${dn.taxableAmount} [${dn.status}] — ${dn.reason.slice(0, 55)}`
      );
    }

    // ── Obligation: vendor_scoring_events ────────────────────────────────────
    for (let idx = 0; idx < profile.obligations.length; idx++) {
      const ob   = profile.obligations[idx];
      const iKey = `obligation-jw-${vendor.id}-seed-${idx}`;
      const existing = await prisma.vendorScoringEvent.findFirst({ where: { idempotencyKey: iKey } });
      if (existing) continue;

      // Skip placeholder obligations (no actual debit notes to settle)
      if (ob.eligibleAmount === 0) continue;

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
          sourceEntityId: `seed-jw-obligation-${vendor.id}-${idx}`,
          eligibleAmount: ob.eligibleAmount,
          penaltyPoints: ob.penaltyPoints,
          scoreContribution: ob.penaltyPoints > 0 ? -ob.penaltyPoints : 0,
          severityLabel:
            ob.penaltyPoints === 0 ? 'ON_TIME'
            : ob.penaltyPoints <= 10 ? 'MINOR'
            : ob.penaltyPoints <= 18 ? 'MODERATE'
            : 'SEVERE',
          status: 'ACTIVE',
          effectiveDate: obDate,
          calculationVersion: 'v2.0',
          createdBy: admin.id,
          createdAt: obDate,
          updatedAt: obDate,
        },
      });

      const label = ob.penaltyPoints === 0
        ? '✅ on-time'
        : `⚠️  +${ob.penaltyPoints}pts penalty`;
      console.log(`  + Obligation ${idx + 1}: ₹${ob.eligibleAmount} — ${label}`);
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log('\n📊 Expected scoring profiles after engine runs:');
  console.log('  ┌─────────────────────────┬──────────┬──────────────────────────────────────────────┐');
  console.log('  │ Vendor                  │ Grade    │ Key signals                                  │');
  console.log('  ├─────────────────────────┼──────────┼──────────────────────────────────────────────┤');
  console.log('  │ Mehta Fabricators       │ A  ~87   │ <3.5% scrap, zero shortage, no debit notes   │');
  console.log('  │ Pioneer Powder Coat     │ B  ~72   │ 6–7% scrap in 2 runs, 2 minor debit notes    │');
  console.log('  │ Shree Metalworks        │ D  ~35   │ 10–12% scrap, chronic shortage, 3 heavy DNs  │');
  console.log('  └─────────────────────────┴──────────┴──────────────────────────────────────────────┘');
  console.log('\n✅ Job-Work vendor scoring data seeded successfully.\n');
}

main()
  .catch((e) => {
    console.error('❌ Job-work seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
