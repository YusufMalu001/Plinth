import {
  PrismaClient,
  LifecycleStatus,
  LossSourceType,
  LossClassification,
  LossEventStatus,
  Prisma
} from '@prisma/client';

export async function seedLossManagement(prisma: PrismaClient) {
  console.log('📉 Seeding Loss Management (WastageRules, LossEvents, ReplacementChallans)...');

  // 1. Fetch reference master data
  const [materials, products, departments, locations, uoms, users] = await Promise.all([
    prisma.material.findMany({ take: 20 }),
    prisma.product.findMany({ take: 20 }),
    prisma.department.findMany({ take: 10 }),
    prisma.warehouseLocation.findMany({ take: 10 }),
    prisma.unitOfMeasure.findMany({ take: 10 }),
    prisma.user.findMany({ take: 5 })
  ]);

  if (materials.length === 0 && products.length === 0) {
    console.log('⚠️ No materials or products found. Please seed master data first.');
    return;
  }

  const adminUser = users.find((u) => u.role === 'admin') || users[0];
  const managerUser = users.find((u) => u.role === 'manager' || u.role === 'employee') || users[1] || users[0];
  const defaultUom = uoms[0] || (await prisma.unitOfMeasure.findFirst());

  if (!defaultUom || !adminUser) {
    console.log('⚠️ Missing base UOM or User. Skipping loss management seed.');
    return;
  }

  // 2. Seed Approved WastageRules for real materials
  console.log('📐 Creating approved WastageRules...');
  const wastageRuleMap = new Map<string, any>();

  for (let i = 0; i < Math.min(materials.length, 10); i++) {
    const mat = materials[i];
    const code = `WR-MAT-${mat.code || i + 1}`.slice(0, 50);
    const existingRule = await prisma.wastageRule.findUnique({ where: { code } });

    if (!existingRule) {
      const standardPct = new Prisma.Decimal(2.0 + (i % 4) * 0.75); // e.g. 2.0%, 2.75%, 3.5%, 4.25%
      const tolerancePct = new Prisma.Decimal(1.0 + (i % 3) * 0.5); // e.g. 1.0%, 1.5%, 2.0%

      const created = await prisma.wastageRule.create({
        data: {
          code,
          name: `Standard Wastage Allowance for ${mat.name.slice(0, 40)}`,
          materialId: mat.id,
          standardWastagePct: standardPct,
          tolerancePct: tolerancePct,
          version: 1,
          status: LifecycleStatus.APPROVED,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
        }
      });
      wastageRuleMap.set(mat.id, created);
    } else {
      wastageRuleMap.set(mat.id, existingRule);
    }
  }

  // 3. Prepare realistic Loss Incidents using real items
  console.log('🔥 Seeding Loss Events...');

  // Sample photo SVG data URLs for realistic evidence previews
  const samplePhoto1 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%23fee2e2" width="300" height="200"/><text fill="%23dc2626" font-size="14" font-family="sans-serif" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">DAMAGED BATCH EVIDENCE</text><text fill="%237f1d1d" font-size="11" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Mandrel Crack Deformation #1</text></svg>';
  const samplePhoto2 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect fill="%23fef3c7" width="300" height="200"/><text fill="%23d97706" font-size="14" font-family="sans-serif" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">QC CRUSH IMPACT PHOTO</text><text fill="%2392400e" font-size="11" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Transit Damage Log #2</text></svg>';

  const incidentDefinitions = [
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL' as const,
      itemIndex: 0,
      qty: 45,
      reason: 'Mandrel misalignment in tube bender caused high-stress cracking on 45 stainless steel lengths.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REVIEWED,
      daysAgo: 2,
      variance: 6.8,
      evidence: [samplePhoto1]
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL' as const,
      itemIndex: 1,
      qty: 12,
      reason: 'Normal off-cut trim and deburring metal shavings during standard pipe sizing.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.APPROVED,
      daysAgo: 4,
      variance: 0.8,
      evidence: []
    },
    {
      sourceType: LossSourceType.DEPARTMENT_EXECUTION_EXCEPTION,
      itemKind: 'MATERIAL' as const,
      itemIndex: 2,
      qty: 65,
      reason: 'Heater barrel thermal runaway caused severe polymer discoloration and scorching.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.INVESTIGATED,
      daysAgo: 5,
      variance: 14.2,
      evidence: [samplePhoto1, samplePhoto2]
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT' as const,
      itemIndex: 0,
      qty: 8,
      reason: 'Forklift transit collision near Loading Bay 3 crushed packaged drying stand cartons.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPLACED,
      daysAgo: 7,
      variance: 10.0,
      evidence: [samplePhoto2]
    },
    {
      sourceType: LossSourceType.QC_REJECTION_NO_BATCH,
      itemKind: 'PRODUCT' as const,
      itemIndex: 1,
      qty: 15,
      reason: 'Orange peel defect and uneven powder coat thickness exceeding aesthetic QA threshold.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.APPROVED,
      daysAgo: 9,
      variance: 8.5,
      evidence: [samplePhoto1]
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL' as const,
      itemIndex: 3,
      qty: 5,
      reason: 'Standard tooling setup scrap for laser alignment verification.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.POSTED,
      daysAgo: 11,
      variance: 0.3,
      evidence: []
    },
    {
      sourceType: LossSourceType.GRN_DISCREPANCY,
      itemKind: 'MATERIAL' as const,
      itemIndex: 4,
      qty: 28,
      reason: 'Transit rain moisture seepage compromised packaging and rusted steel fastener lot.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPORTED,
      daysAgo: 1,
      variance: 12.0,
      evidence: [samplePhoto2]
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT' as const,
      itemIndex: 2,
      qty: 6,
      reason: 'Minor packaging scratch during internal cart transfer to Finished Goods dock.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.REVIEWED,
      daysAgo: 3,
      variance: 1.2,
      evidence: []
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL' as const,
      itemIndex: 5,
      qty: 18,
      reason: 'Routine start-up purge wastage on injection moulding line 2.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.APPROVED,
      daysAgo: 6,
      variance: 0.9,
      evidence: []
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT' as const,
      itemIndex: 3,
      qty: 10,
      reason: 'Defective nylon pulley wheels with flash burrs causing cord friction.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPLACED,
      daysAgo: 8,
      variance: 9.2,
      evidence: [samplePhoto1]
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL' as const,
      itemIndex: 6,
      qty: 7,
      reason: 'End-of-coil scrap scrap remainder below minimum usable cut length.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.POSTED,
      daysAgo: 12,
      variance: 0.4,
      evidence: []
    },
    {
      sourceType: LossSourceType.DEPARTMENT_EXECUTION_EXCEPTION,
      itemKind: 'MATERIAL' as const,
      itemIndex: 0,
      qty: 35,
      reason: 'Hydraulic pressure drop on punch press resulting in incomplete hole punches.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REVIEWED,
      daysAgo: 14,
      variance: 7.5,
      evidence: [samplePhoto2]
    }
  ];

  const now = new Date();

  for (let idx = 0; idx < incidentDefinitions.length; idx++) {
    const inc = incidentDefinitions[idx];
    const lossNumber = `LOSS-2026-${String(idx + 1).padStart(5, '0')}`;

    const existing = await prisma.lossEvent.findUnique({ where: { lossNumber } });
    if (existing) continue;

    const targetMaterial = inc.itemKind === 'MATERIAL' ? materials[inc.itemIndex % materials.length] : null;
    const targetProduct = inc.itemKind === 'PRODUCT' ? products[inc.itemIndex % products.length] : null;
    const targetDept = departments[idx % departments.length] || null;
    const targetLoc = locations[idx % locations.length] || null;
    const rule = targetMaterial ? wastageRuleMap.get(targetMaterial.id) : null;

    const reportedDate = new Date(now.getTime() - inc.daysAgo * 24 * 60 * 60 * 1000);

    const createdLoss = await prisma.lossEvent.create({
      data: {
        lossNumber,
        sourceType: inc.sourceType,
        materialId: targetMaterial?.id ?? null,
        productId: targetProduct?.id ?? null,
        uomId: targetMaterial?.uomId || targetProduct?.uomId || defaultUom.id,
        departmentId: targetDept?.id ?? null,
        locationId: targetLoc?.id ?? null,
        quantity: new Prisma.Decimal(inc.qty),
        reason: inc.reason,
        reportedByActorId: adminUser.id,
        reportedAt: reportedDate,
        appliedWastageRuleId: rule?.id ?? null,
        appliedWastageRuleVersion: rule ? 1 : null,
        varianceFromExpected: new Prisma.Decimal(inc.variance),
        classification: inc.classification,
        status: inc.status,
        reviewedByActorId: inc.status !== LossEventStatus.REPORTED ? managerUser.id : null,
        reviewedAt: inc.status !== LossEventStatus.REPORTED ? new Date(reportedDate.getTime() + 3600000) : null,
        reviewNotes: inc.status !== LossEventStatus.REPORTED ? 'Supervisory review completed on shopfloor inspection.' : null,
        approvedByActorId: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(inc.status) ? managerUser.id : null,
        approvedAt: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(inc.status) ? new Date(reportedDate.getTime() + 7200000) : null,
        investigatedByActorId: inc.status === LossEventStatus.INVESTIGATED ? managerUser.id : null,
        investigatedAt: inc.status === LossEventStatus.INVESTIGATED ? new Date(reportedDate.getTime() + 5400000) : null,
        investigationNotes: inc.status === LossEventStatus.INVESTIGATED ? 'Investigated root cause: Hydraulic fluid temperature sensor recalibration initiated.' : null,
        stockEffectRef: inc.status === LossEventStatus.POSTED ? `STK-ADJ-2026-${String(idx + 1).padStart(4, '0')}` : null,
        replacementChallanRef: inc.status === LossEventStatus.REPLACED ? `REP-CHAL-2026-${String(idx + 1).padStart(4, '0')}` : null,
      }
    });

    // If REPLACED, create corresponding ReplacementChallan
    if (inc.status === LossEventStatus.REPLACED && targetLoc) {
      const challanNumber = `REP-CHAL-2026-${String(idx + 1).padStart(4, '0')}`;
      const existingChallan = await prisma.replacementChallan.findUnique({ where: { challanNumber } });
      if (!existingChallan) {
        await prisma.replacementChallan.create({
          data: {
            challanNumber,
            lossEventId: createdLoss.id,
            materialId: targetMaterial?.id ?? null,
            productId: targetProduct?.id ?? null,
            uomId: targetMaterial?.uomId || targetProduct?.uomId || defaultUom.id,
            quantity: new Prisma.Decimal(inc.qty),
            dispatchLocationId: targetLoc.id,
            targetDepartmentId: targetDept?.id ?? null,
            notes: `Emergency replacement dispatch for incident ${lossNumber}`,
            issuedByActorId: managerUser.id,
            issuedAt: new Date(reportedDate.getTime() + 10800000),
            acknowledgedByActorId: adminUser.id,
            acknowledgedAt: new Date(reportedDate.getTime() + 14400000)
          }
        });
      }
    }
  }

  console.log('✅ Loss Management seeding completed with real inventory items!');
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedLossManagement(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
