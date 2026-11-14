import {
  PrismaClient,
  LifecycleStatus,
  QcCheckpointType,
  InspectionResultStatus,
  CorrectiveActionStatus,
  LossSourceType,
  LossClassification,
  LossEventStatus,
  ExceptionRecordType,
  DiscrepancyType,
  DiscrepancyStatus,
  Prisma
} from '@prisma/client';

export async function seedQualityAndLossManagement(prisma: PrismaClient) {
  console.log('🛡️ Starting Integrated Seeding for Quality & Inspection + Scrap & Loss Management...');

  // ---------------------------------------------------------------------------
  // 1. Fetch Reference Master Data
  // ---------------------------------------------------------------------------
  const [
    departments,
    workCenters,
    locations,
    uoms,
    users,
    employees,
    materials,
    products,
    batches,
    assemblyBatches,
    grnLines
  ] = await Promise.all([
    prisma.department.findMany(),
    prisma.workCenter.findMany(),
    prisma.warehouseLocation.findMany(),
    prisma.unitOfMeasure.findMany(),
    prisma.user.findMany(),
    prisma.employee.findMany({ include: { department: true } }),
    prisma.material.findMany({ take: 50, include: { uom: true } }),
    prisma.product.findMany({ take: 50, include: { uom: true } }),
    prisma.departmentExecutionBatch.findMany({
      include: {
        department: true,
        routeStep: true,
        productionPlan: { include: { product: true } }
      }
    }),
    prisma.assemblyBatch.findMany({
      include: {
        product: true
      }
    }),
    prisma.goodsReceiptLine.findMany({
      include: {
        grn: { include: { location: true, vendor: true } },
        material: true,
        product: true,
        uom: true
      }
    })
  ]);

  console.log(`📊 Master Data loaded:
    - ${departments.length} Departments
    - ${workCenters.length} Work Centers
    - ${locations.length} Locations
    - ${uoms.length} UOMs
    - ${users.length} Users
    - ${employees.length} Employees
    - ${materials.length} Materials
    - ${products.length} Products
    - ${batches.length} Production Batches
    - ${assemblyBatches.length} Assembly Batches
    - ${grnLines.length} GRN Lines`);

  if (employees.length === 0 || users.length === 0 || uoms.length === 0) {
    throw new Error('Precondition failed: Missing employees, users, or UOMs');
  }

  const defaultUom = uoms.find((u) => u.symbol === 'PCS' || u.symbol === 'NOS') || uoms[0];
  const adminUser = users.find((u) => u.role === 'admin') || users[0];
  const storeManagerUser = users.find((u) => u.role === 'manager') || users[1] || users[0];

  // Map employees to departments for realistic inspector assignments
  const getEmployeeForDept = (deptId?: string | null) => {
    if (deptId) {
      const match = employees.find((e) => e.departmentId === deptId);
      if (match) return match;
    }
    return employees[0];
  };

  const getDepartmentLocation = (deptId?: string | null) => {
    const quarantine = locations.find((l) => l.code === 'QC-HOLD' || l.type === 'QUARANTINE');
    if (quarantine) return quarantine;
    return locations[0];
  };

  const receivingDockLocation = locations.find((l) => l.code === 'RAW-MATERIALS' || l.type === 'RAW_MATERIAL') || locations[0];
  const fgLocation = locations.find((l) => l.code === 'FINISHED-GOODS' || l.type === 'FINISHED_GOODS') || locations[0];

  // ---------------------------------------------------------------------------
  // 2. Seed Realistic QC Rules & Criteria
  // ---------------------------------------------------------------------------
  console.log('📐 Creating approved QC Rules with comprehensive criteria checklist (V-009 compliant)...');

  const qcRuleDefinitions = [
    {
      code: 'QC-RULE-RAW-PLATES',
      name: 'Incoming Heavy Plate & Section Metallurgical Inspection',
      description: 'Ultrasonic thickness testing, surface lamination check, and mill test certificate verification for structural raw steel.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-CUTTING',
      parameters: {
        minPassingScore: 95,
        passingScoreThreshold: 95,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REJECT_SCRAP',
        criteriaChecklist: [
          { name: 'Plate Nominal Thickness Verification', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 25.0, minTolerance: 24.5, maxTolerance: 25.8, unit: 'mm', inspectionMethod: 'Digital Ultrasonic Thickness Gauge' },
          { name: 'Surface Laminations & Scale Flaking Check', type: 'VISUAL', required: true, severity: 'CRITICAL', inspectionMethod: '100% Visual Surface Audit' },
          { name: 'Mill Test Certificate (MTC 3.1) Heat Match', type: 'BOOLEAN', required: true, severity: 'CRITICAL', inspectionMethod: 'Heat Number Stencil Verification' },
          { name: 'Diagonal Squareness & Camber Tolerance', type: 'NUMERIC', required: false, severity: 'MAJOR', nominalValue: 0.0, minTolerance: -2.0, maxTolerance: 2.0, unit: 'mm', inspectionMethod: 'Laser Squareness Target' }
        ]
      }
    },
    {
      code: 'QC-RULE-CNC-BEVEL',
      name: 'CNC Profile Cutting, Bevel Angle & Edge Cleanliness Standard',
      description: 'Dimensional profile verification, weld-prep bevel angle check, and dross cleaning audit on plasma/gas cutting tables.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-CUTTING',
      parameters: {
        minPassingScore: 90,
        passingScoreThreshold: 90,
        samplingPercentage: 50,
        samplingRatePercentage: 50,
        defaultFailureAction: 'REWORK',
        criteriaChecklist: [
          { name: 'Cut Length / Width Dimension Accuracy', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 1200.0, minTolerance: 1198.5, maxTolerance: 1201.5, unit: 'mm', inspectionMethod: 'Calibrated Steel Tape & Vernier' },
          { name: 'Bevel Angle (30° / 45° Prep)', type: 'NUMERIC', required: true, severity: 'MAJOR', nominalValue: 30.0, minTolerance: 28.5, maxTolerance: 31.5, unit: 'deg', inspectionMethod: 'Universal Bevel Protractor' },
          { name: 'Slag, Dross & Burrs Completely Removed', type: 'BOOLEAN', required: true, severity: 'MAJOR', inspectionMethod: 'Pneumatic Grinder Post-Clean Check' }
        ]
      }
    },
    {
      code: 'QC-RULE-SAW-WELD',
      name: 'Structural Fit-Up & Submerged Arc Welding Non-Destructive Quality',
      description: 'Fillet weld throat gauge measurement, Dye Penetrant Testing (DPT), and ultrasonic weld root flaw detection.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-FITUP-WELD',
      parameters: {
        minPassingScore: 95,
        passingScoreThreshold: 95,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REWORK',
        criteriaChecklist: [
          { name: 'Weld Leg Length & Throat Thickness', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 10.0, minTolerance: 9.5, maxTolerance: 12.0, unit: 'mm', inspectionMethod: 'AWS Fillet Weld Gauge' },
          { name: 'Dye Penetrant Inspection (Surface Cracks / Porosity)', type: 'VISUAL', required: true, severity: 'CRITICAL', inspectionMethod: 'Solvent Removable Liquid Penetrant ASTM E165' },
          { name: 'Root Pass Slag Inclusion Free (UT Spot Check)', type: 'BOOLEAN', required: true, severity: 'CRITICAL', inspectionMethod: 'A-Scan Ultrasonic Flaw Detector' },
          { name: 'Post-Weld Distortion & Linear Alignment', type: 'NUMERIC', required: false, severity: 'MAJOR', nominalValue: 0.0, minTolerance: -1.5, maxTolerance: 1.5, unit: 'mm', inspectionMethod: 'Precision Piano Wire Alignment' }
        ]
      }
    },
    {
      code: 'QC-RULE-MILL-FLANGE',
      name: 'Precision Milling & Flange Facing Geometric Dimensioning',
      description: 'Facing flatness, spiral serration phonographic finish (Ra), bolt PCD concentricity, and bore tolerances.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-MACHINING',
      parameters: {
        minPassingScore: 98,
        passingScoreThreshold: 98,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REWORK',
        criteriaChecklist: [
          { name: 'Flange Sealing Face Flatness', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 0.0, minTolerance: -0.05, maxTolerance: 0.05, unit: 'mm', inspectionMethod: 'Dial Test Indicator (DTI) on Granite Bed' },
          { name: 'Surface Roughness Ra (Serrated Finish)', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 3.2, minTolerance: 3.2, maxTolerance: 6.3, unit: 'um', inspectionMethod: 'Portable Surface Roughness Tester' },
          { name: 'Bolt Hole Pitch Circle Diameter (PCD)', type: 'NUMERIC', required: true, severity: 'MAJOR', nominalValue: 240.0, minTolerance: 239.7, maxTolerance: 240.3, unit: 'mm', inspectionMethod: 'Digital Coordinate Vernier Caliper' }
        ]
      }
    },
    {
      code: 'QC-RULE-EPOXY-COAT',
      name: 'Shot Blasting Profile Sa 2.5 & Epoxy Coating DFT Audit',
      description: 'Surface cleanliness Sa 2.5, blast surface anchor profile depth, and cured Dry Film Thickness (DFT) adhesion check.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-SURFACE-FINISH',
      parameters: {
        minPassingScore: 95,
        passingScoreThreshold: 95,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REWORK',
        criteriaChecklist: [
          { name: 'Shot Blast Surface Cleanliness Standard', type: 'VISUAL', required: true, severity: 'CRITICAL', inspectionMethod: 'SSPC-SP 10 / ISO 8501-1 Sa 2.5 Visual Comparator' },
          { name: 'Surface Anchor Profile Depth', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 65.0, minTolerance: 50.0, maxTolerance: 85.0, unit: 'um', inspectionMethod: 'Surface Profile Gauge (ASTM D4417 Method B)' },
          { name: 'Total Epoxy System Dry Film Thickness (DFT)', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 250.0, minTolerance: 220.0, maxTolerance: 320.0, unit: 'um', inspectionMethod: 'Magnetic Induction DFT Gauge (SSPC-PA 2)' },
          { name: 'Cross-Hatch Paint Adhesion Test', type: 'BOOLEAN', required: false, severity: 'MAJOR', inspectionMethod: 'Cross Cut Tape Test (ASTM D3359 Method B)' }
        ]
      }
    },
    {
      code: 'QC-RULE-FINAL-FAT',
      name: 'Heavy Industrial Final Assembly, FAT & Hydrostatic Testing',
      description: 'Full mechanical convergence audit, high-pressure hydrostatic leak test, torque audit, and Factory Acceptance Sign-off.',
      targetType: 'DEPARTMENT',
      departmentCode: 'DEPT-FINAL-ASSEMBLY',
      parameters: {
        minPassingScore: 100,
        passingScoreThreshold: 100,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REJECT_SCRAP',
        criteriaChecklist: [
          { name: 'Hydrostatic Hold Pressure (1.5x Design Pressure)', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 24.0, minTolerance: 24.0, maxTolerance: 25.5, unit: 'bar', inspectionMethod: 'Calibrated Digital Hydro Pressure Data-Logger' },
          { name: 'Zero Pressure Drop Across 60-Minute Dwell', type: 'BOOLEAN', required: true, severity: 'CRITICAL', inspectionMethod: 'Pressure Chart Continuous Recording' },
          { name: 'M48/M36 Foundation & Stiffener Bolt Torque Verification', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 850.0, minTolerance: 830.0, maxTolerance: 900.0, unit: 'Nm', inspectionMethod: 'Calibrated Hydraulic Torque Wrench' },
          { name: 'Overall Dimensional General Arrangement (GA) Drawing Audit', type: 'BOOLEAN', required: true, severity: 'CRITICAL', inspectionMethod: 'Full Laser Coordinate Measurement' }
        ]
      }
    },
    {
      code: 'QC-RULE-GLOBAL-GENERAL',
      name: 'Universal Plinth Industrial Quality Inspection Criteria',
      description: 'Factory-wide default quality baseline ensuring no workstation or inbound dock receipt is uninspected.',
      targetType: 'GLOBAL',
      departmentCode: null,
      parameters: {
        minPassingScore: 90,
        passingScoreThreshold: 90,
        samplingPercentage: 100,
        samplingRatePercentage: 100,
        defaultFailureAction: 'REWORK',
        criteriaChecklist: [
          { name: 'Physical Specification & Drawing Match', type: 'BOOLEAN', required: true, severity: 'CRITICAL', inspectionMethod: 'BOM / Drawing Checklist' },
          { name: 'Zero Structural Defect / Crack / Deformation', type: 'VISUAL', required: true, severity: 'CRITICAL', inspectionMethod: 'Visual Inspection Audit' },
          { name: 'Packaging, Marking & QR Serial Identification', type: 'BOOLEAN', required: true, severity: 'MAJOR', inspectionMethod: 'Serial Stencil & Barcode Scanner' }
        ]
      }
    }
  ];

  const createdQcRules: Record<string, any> = {};

  for (const def of qcRuleDefinitions) {
    const targetDept = def.departmentCode ? departments.find((d) => d.code === def.departmentCode) : null;
    const rule = await prisma.qcRule.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        targetType: def.targetType,
        targetId: targetDept ? targetDept.id : null,
        parameters: def.parameters,
        version: 1,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      },
      update: {
        name: def.name,
        description: def.description,
        targetType: def.targetType,
        targetId: targetDept ? targetDept.id : null,
        parameters: def.parameters,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      }
    });
    createdQcRules[def.code] = rule;
  }

  // Also seed product-specific QC rules for top products
  for (let i = 0; i < Math.min(products.length, 10); i++) {
    const prod = products[i];
    const ruleCode = `QC-PROD-${prod.sku || i + 1}`.slice(0, 45);
    const prodRule = await prisma.qcRule.upsert({
      where: { code: ruleCode },
      create: {
        code: ruleCode,
        name: `Rigorous Quality Standards for ${prod.name.slice(0, 40)}`,
        description: `Specification inspection criteria for product SKU ${prod.sku}`,
        targetType: 'PRODUCT',
        targetId: prod.id,
        parameters: {
          minPassingScore: 95,
          passingScoreThreshold: 95,
          samplingPercentage: 100,
          samplingRatePercentage: 100,
          defaultFailureAction: 'REWORK',
          criteriaChecklist: [
            { name: 'Finished Dimensions Within Tolerance', type: 'NUMERIC', required: true, severity: 'CRITICAL', nominalValue: 100.0, minTolerance: 98.5, maxTolerance: 101.5, unit: 'mm' },
            { name: 'Material Grade & Tensile Certificate', type: 'BOOLEAN', required: true, severity: 'CRITICAL' },
            { name: 'Surface Finish & Protective Coating Integrity', type: 'VISUAL', required: true, severity: 'MAJOR' }
          ]
        },
        version: 1,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      },
      update: {
        status: LifecycleStatus.APPROVED
      }
    });
    createdQcRules[ruleCode] = prodRule;
  }

  console.log(`✅ Seeded ${Object.keys(createdQcRules).length} approved QC Rules.`);

  // Link route steps to these QC rules
  console.log('🔗 Linking manufacturing Route Steps to approved QC rules...');
  for (const step of await prisma.routeStep.findMany()) {
    let matchingRule = createdQcRules['QC-RULE-GLOBAL-GENERAL'];
    const sName = (step.stepName || '').toLowerCase();
    if (sName.includes('cutting') || sName.includes('bevel')) {
      matchingRule = createdQcRules['QC-RULE-CNC-BEVEL'];
    } else if (sName.includes('weld') || sName.includes('fit-up')) {
      matchingRule = createdQcRules['QC-RULE-SAW-WELD'];
    } else if (sName.includes('milling') || sName.includes('facing')) {
      matchingRule = createdQcRules['QC-RULE-MILL-FLANGE'];
    } else if (sName.includes('shot') || sName.includes('coating') || sName.includes('blasting')) {
      matchingRule = createdQcRules['QC-RULE-EPOXY-COAT'];
    } else if (sName.includes('assembly') || sName.includes('acceptance') || sName.includes('fat') || sName.includes('final')) {
      matchingRule = createdQcRules['QC-RULE-FINAL-FAT'];
    }

    if (matchingRule) {
      await prisma.routeStep.update({
        where: { id: step.id },
        data: {
          qcRuleId: matchingRule.id,
          isQcRequired: true
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Seed Realistic Wastage Rules for Materials
  // ---------------------------------------------------------------------------
  console.log('📐 Creating approved Wastage Allowance Rules for materials...');
  const wastageRuleMap = new Map<string, any>();

  for (let i = 0; i < materials.length; i++) {
    const mat = materials[i];
    const code = `WR-MAT-${mat.code || i + 1}`.slice(0, 48);
    const standardPct = new Prisma.Decimal(2.5 + (i % 5) * 0.75); // 2.5%, 3.25%, 4.0%, 4.75%, 5.5%
    const tolerancePct = new Prisma.Decimal(1.5 + (i % 3) * 0.5);  // 1.5%, 2.0%, 2.5%

    const wRule = await prisma.wastageRule.upsert({
      where: { code },
      create: {
        code,
        name: `Engineering Wastage Allowance for ${mat.name.slice(0, 40)}`,
        materialId: mat.id,
        standardWastagePct: standardPct,
        tolerancePct: tolerancePct,
        version: 1,
        status: LifecycleStatus.APPROVED,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      },
      update: {
        standardWastagePct: standardPct,
        tolerancePct: tolerancePct,
        status: LifecycleStatus.APPROVED
      }
    });
    wastageRuleMap.set(mat.id, wRule);
  }

  // ---------------------------------------------------------------------------
  // 4. Seed Quality Inspections & Corrective Actions
  // ---------------------------------------------------------------------------
  console.log('🔍 Seeding bulk Quality Inspections across Batches and Goods Receipt Lines...');

  // Realistic sample SVG evidence data URLs
  const evidenceCracksPhoto = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><rect fill="%23fee2e2" width="400" height="260"/><rect x="20" y="20" width="360" height="220" fill="none" stroke="%23dc2626" stroke-width="2" stroke-dasharray="4"/><text fill="%23991b1b" font-size="16" font-family="monospace" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">QC NON-CONFORMANCE EVIDENCE</text><text fill="%23b91c1c" font-size="12" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Mandrel Crack &amp; Root Porosity Detected</text></svg>';
  const evidencePressureDropPhoto = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><rect fill="%23fef3c7" width="400" height="260"/><rect x="20" y="20" width="360" height="220" fill="none" stroke="%23d97706" stroke-width="2"/><text fill="%2392400e" font-size="16" font-family="monospace" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">HYDRO PRESSURE DWELL LOG</text><text fill="%23b45309" font-size="12" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Pressure Loss 3.2 Bar @ Joint 4B</text></svg>';
  const evidenceFlangeRoughnessPhoto = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><rect fill="%23f3f4f6" width="400" height="260"/><rect x="20" y="20" width="360" height="220" fill="none" stroke="%234b5563" stroke-width="2"/><text fill="%231f2937" font-size="16" font-family="monospace" font-weight="bold" x="50%25" y="45%25" text-anchor="middle">SURFACE ROUGHNESS PROFILE</text><text fill="%234b5563" font-size="12" font-family="sans-serif" x="50%25" y="60%25" text-anchor="middle">Ra 8.4um Exceeds 6.3um Limit</text></svg>';

  // Clean existing inspections & loss events to guarantee fresh integrated consistency
  console.log('🧹 Purging any previous test inspections and loss records...');
  await prisma.replacementChallan.deleteMany();
  await prisma.lossEvent.deleteMany();
  await prisma.correctiveAction.deleteMany();
  await prisma.inspectionResult.deleteMany();
  await prisma.exceptionRecord.deleteMany();
  await prisma.goodsReceiptDiscrepancy.deleteMany();

  const createdInspections: any[] = [];
  const scrapExceptionRecords: any[] = [];
  const qcRejectionInspectionResults: any[] = [];
  const grnDiscrepancyRecords: any[] = [];

  // A. Seed Inspections for In-Progress and Completed Batches
  let inspCounter = 1000;
  for (let bIndex = 0; bIndex < Math.min(batches.length, 25); bIndex++) {
    const batch = batches[bIndex];
    const inspector = getEmployeeForDept(batch.departmentId);
    const rule = createdQcRules['QC-RULE-CNC-BEVEL'] || createdQcRules['QC-RULE-GLOBAL-GENERAL'];

    // Distribute dispositions across PASS, REWORK, REJECT_SCRAP, and RE_INSPECTION
    let status: InspectionResultStatus = InspectionResultStatus.PASS;
    let sampledQty = Number(batch.received_qty) > 0 ? Number(batch.received_qty) : 20;
    let defectiveQty = 0;
    let reason: string | null = null;
    let correctiveDesc: string | null = null;
    let evidenceUrls: string[] = [];
    let isOverride = false;
    let overrideReason: string | null = null;

    if (bIndex % 4 === 1) {
      // REWORK disposition
      status = InspectionResultStatus.REWORK;
      defectiveQty = Math.max(1, Math.round(sampledQty * 0.15));
      reason = 'Surface burrs and slight bevel angle distortion (34° vs nominal 30°) detected on edge prep.';
      correctiveDesc = 'Grind and re-bevel edges to nominal 30° weld prep on CNC profile bay.';
      evidenceUrls = [evidenceFlangeRoughnessPhoto];
    } else if (bIndex % 4 === 2) {
      // REJECT_SCRAP disposition -> triggers ExceptionRecord and LossEvent
      status = InspectionResultStatus.REJECT_SCRAP;
      defectiveQty = Math.max(2, Math.round(sampledQty * 0.22));
      reason = 'Severe lamination cracking and thermal scorch deformation beyond permissible structural weld tolerance.';
      evidenceUrls = [evidenceCracksPhoto];
    } else if (bIndex % 4 === 3 && bIndex % 2 === 1) {
      // Override PASS
      status = InspectionResultStatus.PASS;
      isOverride = true;
      overrideReason = 'Shop Floor Chief Engineer verified minor surface discoloration does not affect ASTM tensile properties.';
    }

    const inspNum = `QC-INSP-2026-${inspCounter++}`;
    const inspDate = new Date(Date.now() - (bIndex * 18 + 4) * 3600000);

    const insp = await prisma.inspectionResult.create({
      data: {
        inspectionNumber: inspNum,
        checkpointType: QcCheckpointType.IN_PROCESS,
        qcRuleId: rule.id,
        batchId: batch.id,
        inspectorEmployeeId: inspector.id,
        sampledQuantity: new Prisma.Decimal(sampledQty),
        defectiveQuantity: new Prisma.Decimal(defectiveQty),
        status,
        reason,
        evidenceAttachmentUrls: evidenceUrls,
        isOverride,
        overrideReason,
        overrideByActorId: isOverride ? adminUser.id : null,
        createdAt: inspDate,
        updatedAt: inspDate
      }
    });

    createdInspections.push(insp);

    // If REWORK, create tracked Corrective Action
    if (status === InspectionResultStatus.REWORK && correctiveDesc) {
      const caStatus = bIndex % 2 === 0 ? CorrectiveActionStatus.IN_PROGRESS : CorrectiveActionStatus.OPEN;
      await prisma.correctiveAction.create({
        data: {
          inspectionResultId: insp.id,
          actionDescription: correctiveDesc,
          assignedEmployeeId: inspector.id,
          targetReworkStageId: batch.routeStepId || null,
          status: caStatus,
          resolutionNotes: caStatus === CorrectiveActionStatus.IN_PROGRESS ? 'Rework operation allocated to grinding technician.' : 'Pending re-bevel line clearance.',
          createdAt: new Date(inspDate.getTime() + 1800000),
          updatedAt: new Date(inspDate.getTime() + 3600000)
        }
      });
    }

    // If REJECT_SCRAP on Batch, create Module 8 ExceptionRecord
    if (status === InspectionResultStatus.REJECT_SCRAP) {
      const exc = await prisma.exceptionRecord.create({
        data: {
          batchId: batch.id,
          type: ExceptionRecordType.SCRAP,
          quantity: new Prisma.Decimal(defectiveQty),
          reason: reason || 'QC Rejected Scrap',
          employeeId: inspector.id,
          timestamp: inspDate
        }
      });
      scrapExceptionRecords.push({ exc, batch, inspector, defectiveQty, reason });
    }
  }

  // B. Seed Inspections for GRN Lines (Dock Inward QC)
  console.log('📦 Seeding QC Inspections for Incoming Goods Receipt Lines...');
  for (let gIndex = 0; gIndex < grnLines.length; gIndex++) {
    const grnLine = grnLines[gIndex];
    const inspector = employees[gIndex % employees.length];
    const rule = createdQcRules['QC-RULE-RAW-PLATES'] || createdQcRules['QC-RULE-GLOBAL-GENERAL'];

    let status: InspectionResultStatus = InspectionResultStatus.PASS;
    let sampledQty = Number(grnLine.receivedQuantity) > 0 ? Number(grnLine.receivedQuantity) : 50;
    let defectiveQty = 0;
    let reason: string | null = null;
    let evidenceUrls: string[] = [];

    if (gIndex === 1 || gIndex === 5 || gIndex === 9) {
      // Rejection / Scrap at dock -> triggers GRN Discrepancy
      status = InspectionResultStatus.REJECT_SCRAP;
      defectiveQty = Math.max(3, Math.round(sampledQty * 0.12));
      reason = 'Dimensional thickness variance and deep pitting rust on steel consignment exceeding ISO tolerance.';
      evidenceUrls = [evidenceCracksPhoto];
    } else if (gIndex === 3 || gIndex === 7) {
      // Re-inspection loop
      status = InspectionResultStatus.REWORK;
      defectiveQty = Math.max(2, Math.round(sampledQty * 0.08));
      reason = 'Surface oil and carbon film needs degreasing bath before acceptance into inventory.';
      evidenceUrls = [evidenceFlangeRoughnessPhoto];
    }

    const inspNum = `QC-INSP-2026-${inspCounter++}`;
    const inspDate = new Date(Date.now() - (gIndex * 24 + 12) * 3600000);

    const insp = await prisma.inspectionResult.create({
      data: {
        inspectionNumber: inspNum,
        checkpointType: QcCheckpointType.INCOMING_MATERIAL,
        qcRuleId: rule.id,
        grnLineId: grnLine.id,
        inspectorEmployeeId: inspector.id,
        sampledQuantity: new Prisma.Decimal(sampledQty),
        defectiveQuantity: new Prisma.Decimal(defectiveQty),
        status,
        reason,
        evidenceAttachmentUrls: evidenceUrls,
        createdAt: inspDate,
        updatedAt: inspDate
      }
    });

    createdInspections.push(insp);

    if (status === InspectionResultStatus.REJECT_SCRAP) {
      qcRejectionInspectionResults.push({ insp, grnLine, defectiveQty, reason, inspector });

      // Create GoodsReceiptDiscrepancy for traceability
      const discrepancy = await prisma.goodsReceiptDiscrepancy.create({
        data: {
          grnLineId: grnLine.id,
          type: DiscrepancyType.DAMAGE,
          quantity: defectiveQty,
          status: DiscrepancyStatus.PENDING,
          acceptanceJustification: 'Quarantined in Dock Bay pending Store Manager loss proposal review.',
          resolvedByActorId: storeManagerUser.id,
          createdAt: inspDate,
          updatedAt: inspDate
        }
      });
      grnDiscrepancyRecords.push({ discrepancy, grnLine, defectiveQty, reason });
    }
  }

  // C. Seed Assembly Final Quality Acceptance Inspections
  console.log('⚙️ Seeding QC Inspections for Assembly Convergence & FAT Stations...');
  for (let aIndex = 0; aIndex < assemblyBatches.length; aIndex++) {
    const asmb = assemblyBatches[aIndex];
    const inspector = employees[(aIndex + 2) % employees.length];
    const rule = createdQcRules['QC-RULE-FINAL-FAT'] || createdQcRules['QC-RULE-GLOBAL-GENERAL'];

    const inspNum = `QC-INSP-2026-${inspCounter++}`;
    const inspDate = new Date(Date.now() - (aIndex * 36 + 6) * 3600000);
    const sampledQty = Number(asmb.targetOutputQuantity) > 0 ? Number(asmb.targetOutputQuantity) : 10;
    const isFail = aIndex === 2; // Vessel hydrostatic pressure drop failure

    const insp = await prisma.inspectionResult.create({
      data: {
        inspectionNumber: inspNum,
        checkpointType: QcCheckpointType.FINAL_FG,
        qcRuleId: rule.id,
        inspectorEmployeeId: inspector.id,
        sampledQuantity: new Prisma.Decimal(sampledQty),
        defectiveQuantity: new Prisma.Decimal(isFail ? 2 : 0),
        status: isFail ? InspectionResultStatus.REWORK : InspectionResultStatus.PASS,
        reason: isFail ? 'Hydrostatic test pressure dropped 3.2 bar across 30 min test cycle on main dished end flange seam.' : 'All mechanical, FAT pressure testing and GA dimensions verified 100% compliant.',
        evidenceAttachmentUrls: isFail ? [evidencePressureDropPhoto] : [],
        createdAt: inspDate,
        updatedAt: inspDate
      }
    });

    createdInspections.push(insp);

    if (isFail) {
      await prisma.correctiveAction.create({
        data: {
          inspectionResultId: insp.id,
          actionDescription: 'NDT Dye check and re-torque nozzle reinforcement flange with high-tensile fasteners.',
          assignedEmployeeId: inspector.id,
          status: CorrectiveActionStatus.IN_PROGRESS,
          resolutionNotes: 'Hydraulic torque crew assigned for joint re-sealing.',
          createdAt: new Date(inspDate.getTime() + 1800000),
          updatedAt: new Date(inspDate.getTime() + 3600000)
        }
      });
    }
  }

  console.log(`✅ Seeded ${createdInspections.length} integrated QC Inspections and associated Corrective Actions.`);

  // ---------------------------------------------------------------------------
  // 5. Seed Comprehensive Scrap, Wastage & Loss Management (Ledger, Abnormal Queue, Replacements)
  // ---------------------------------------------------------------------------
  console.log('📉 Seeding Loss Events directly linked to Production, Inventory, and QC Rejections...');

  let lossEventCounter = 1;
  const createdLossEvents: any[] = [];

  // A. Loss Events originated from Production Shopfloor Exceptions (DEPARTMENT_EXECUTION_EXCEPTION)
  for (let i = 0; i < scrapExceptionRecords.length; i++) {
    const { exc, batch, inspector, defectiveQty, reason } = scrapExceptionRecords[i];
    const lossNum = `LOSS-2026-${String(lossEventCounter++).padStart(5, '0')}`;
    const product = batch.productionPlan?.product;
    const material = materials[i % materials.length];
    const wRule = wastageRuleMap.get(material.id);

    // Variances: mix within-tolerance and abnormal
    const isAbnormal = i % 2 === 0;
    const classification = isAbnormal ? LossClassification.ABNORMAL : LossClassification.WITHIN_TOLERANCE;
    const variance = isAbnormal ? new Prisma.Decimal(4.5 + i * 1.5) : new Prisma.Decimal(0.5);

    // Realistic lifecycle statuses: REPORTED, REVIEWED, APPROVED, REJECTED, INVESTIGATED, POSTED, REPLACED
    const statusCycle: LossEventStatus[] = [
      LossEventStatus.REPLACED,
      LossEventStatus.APPROVED,
      LossEventStatus.POSTED,
      LossEventStatus.INVESTIGATED,
      LossEventStatus.REVIEWED,
      LossEventStatus.REPORTED,
      LossEventStatus.REJECTED
    ];
    const status = statusCycle[i % statusCycle.length];

    const reportedDate = new Date(exc.timestamp);
    const reviewedDate = new Date(reportedDate.getTime() + 2 * 3600000);
    const approvedDate = new Date(reportedDate.getTime() + 4 * 3600000);
    const investigatedDate = new Date(reportedDate.getTime() + 3 * 3600000);

    const lossEvent = await prisma.lossEvent.create({
      data: {
        lossNumber: lossNum,
        sourceType: LossSourceType.DEPARTMENT_EXECUTION_EXCEPTION,
        sourceExceptionRecordId: exc.id,
        productId: product ? product.id : null,
        materialId: material.id,
        uomId: material.uomId || defaultUom.id,
        departmentId: batch.departmentId,
        locationId: getDepartmentLocation(batch.departmentId).id,
        quantity: new Prisma.Decimal(defectiveQty),
        reason: `[Shopfloor Execution Exception] ${reason}`,
        reportedByActorId: adminUser.id,
        reportedAt: reportedDate,
        appliedWastageRuleId: wRule ? wRule.id : null,
        appliedWastageRuleVersion: wRule ? 1 : null,
        varianceFromExpected: variance,
        classification,
        status,
        reviewedByActorId: status !== LossEventStatus.REPORTED ? storeManagerUser.id : null,
        reviewedAt: status !== LossEventStatus.REPORTED ? reviewedDate : null,
        reviewNotes: status !== LossEventStatus.REPORTED ? 'Supervisory review completed on shopfloor inspection.' : null,
        approvedByActorId: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(status) ? storeManagerUser.id : null,
        approvedAt: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(status) ? approvedDate : null,
        rejectedByActorId: status === LossEventStatus.REJECTED ? storeManagerUser.id : null,
        rejectedAt: status === LossEventStatus.REJECTED ? reviewedDate : null,
        rejectionReason: status === LossEventStatus.REJECTED ? 'Loss quantity exceeds departmental monthly allowance without justification. Material must be salvaged.' : null,
        investigatedByActorId: status === LossEventStatus.INVESTIGATED ? storeManagerUser.id : null,
        investigatedAt: status === LossEventStatus.INVESTIGATED ? investigatedDate : null,
        investigationNotes: status === LossEventStatus.INVESTIGATED ? 'Root cause analysis confirmed hydraulic clamp pressure sensor degradation during heavy profile cut.' : null,
        stockEffectRef: status === LossEventStatus.POSTED ? `STK-ADJ-2026-${String(lossEventCounter).padStart(4, '0')}` : null,
        replacementChallanRef: status === LossEventStatus.REPLACED ? `REP-CHAL-2026-${String(lossEventCounter).padStart(4, '0')}` : null
      }
    });

    createdLossEvents.push(lossEvent);

    // If REPLACED, create corresponding ReplacementChallan
    if (status === LossEventStatus.REPLACED) {
      const challanNum = lossEvent.replacementChallanRef!;
      await prisma.replacementChallan.create({
        data: {
          challanNumber: challanNum,
          lossEventId: lossEvent.id,
          materialId: material.id,
          productId: product ? product.id : null,
          uomId: material.uomId || defaultUom.id,
          quantity: new Prisma.Decimal(defectiveQty),
          dispatchLocationId: receivingDockLocation.id,
          targetDepartmentId: batch.departmentId,
          notes: `Emergency replacement material dispatch for incident ${lossNum} - CNC Plate Cutting Bay`,
          issuedByActorId: storeManagerUser.id,
          issuedAt: new Date(approvedDate.getTime() + 1800000),
          acknowledgedByActorId: adminUser.id,
          acknowledgedAt: new Date(approvedDate.getTime() + 3600000)
        }
      });
    }
  }

  // B. Loss Events originated from Dock Goods Receipt Discrepancies (GRN_DISCREPANCY)
  for (let j = 0; j < grnDiscrepancyRecords.length; j++) {
    const { discrepancy, grnLine, defectiveQty, reason } = grnDiscrepancyRecords[j];
    const lossNum = `LOSS-2026-${String(lossEventCounter++).padStart(5, '0')}`;
    const material = materials[(j + 5) % materials.length];
    const wRule = wastageRuleMap.get(material.id);

    const lossEvent = await prisma.lossEvent.create({
      data: {
        lossNumber: lossNum,
        sourceType: LossSourceType.GRN_DISCREPANCY,
        sourceDiscrepancyId: discrepancy.id,
        productId: grnLine.productId || null,
        materialId: material.id,
        uomId: grnLine.uomId || material.uomId || defaultUom.id,
        departmentId: departments[0].id,
        locationId: receivingDockLocation.id,
        quantity: new Prisma.Decimal(defectiveQty),
        reason: `[Inward Dock Receipt Discrepancy] ${reason}`,
        reportedByActorId: adminUser.id,
        reportedAt: new Date(discrepancy.createdAt),
        appliedWastageRuleId: wRule ? wRule.id : null,
        appliedWastageRuleVersion: wRule ? 1 : null,
        varianceFromExpected: new Prisma.Decimal(5.2),
        classification: LossClassification.ABNORMAL,
        status: j === 0 ? LossEventStatus.REPLACED : LossEventStatus.REVIEWED,
        reviewedByActorId: storeManagerUser.id,
        reviewedAt: new Date(discrepancy.createdAt.getTime() + 3600000),
        reviewNotes: 'Vendor consignment physical inspection confirms damaged delivery. Debit note logged.',
        approvedByActorId: j === 0 ? storeManagerUser.id : null,
        approvedAt: j === 0 ? new Date(discrepancy.createdAt.getTime() + 7200000) : null,
        replacementChallanRef: j === 0 ? `REP-CHAL-2026-${String(lossEventCounter).padStart(4, '0')}` : null
      }
    });

    createdLossEvents.push(lossEvent);

    if (j === 0) {
      await prisma.replacementChallan.create({
        data: {
          challanNumber: lossEvent.replacementChallanRef!,
          lossEventId: lossEvent.id,
          materialId: material.id,
          productId: grnLine.productId || null,
          uomId: grnLine.uomId || material.uomId || defaultUom.id,
          quantity: new Prisma.Decimal(defectiveQty),
          dispatchLocationId: receivingDockLocation.id,
          targetDepartmentId: departments[0].id,
          notes: `Vendor replacement consignment dispatch for damaged GRN line items`,
          issuedByActorId: storeManagerUser.id,
          issuedAt: new Date(discrepancy.createdAt.getTime() + 7200000),
          acknowledgedByActorId: adminUser.id,
          acknowledgedAt: new Date(discrepancy.createdAt.getTime() + 10800000)
        }
      });
    }
  }

  // C. Loss Events originated directly from Standalone QC Rejections (QC_REJECTION_NO_BATCH)
  for (let k = 0; k < Math.min(qcRejectionInspectionResults.length, 3); k++) {
    const { insp, defectiveQty, reason } = qcRejectionInspectionResults[k];
    const lossNum = `LOSS-2026-${String(lossEventCounter++).padStart(5, '0')}`;
    const material = materials[(k + 10) % materials.length];
    const wRule = wastageRuleMap.get(material.id);

    const lossEvent = await prisma.lossEvent.create({
      data: {
        lossNumber: lossNum,
        sourceType: LossSourceType.QC_REJECTION_NO_BATCH,
        sourceInspectionResultId: insp.id,
        materialId: material.id,
        uomId: material.uomId || defaultUom.id,
        departmentId: departments[k % departments.length].id,
        locationId: getDepartmentLocation(departments[k % departments.length].id).id,
        quantity: new Prisma.Decimal(defectiveQty),
        reason: `[QC Rejection Gate] ${reason}`,
        reportedByActorId: adminUser.id,
        reportedAt: new Date(insp.createdAt),
        appliedWastageRuleId: wRule ? wRule.id : null,
        appliedWastageRuleVersion: wRule ? 1 : null,
        varianceFromExpected: new Prisma.Decimal(6.0),
        classification: LossClassification.ABNORMAL,
        status: LossEventStatus.APPROVED,
        reviewedByActorId: storeManagerUser.id,
        reviewedAt: new Date(insp.createdAt.getTime() + 3600000),
        reviewNotes: 'QC station scrap tag verified against calibrated instruments.',
        approvedByActorId: storeManagerUser.id,
        approvedAt: new Date(insp.createdAt.getTime() + 7200000)
      }
    });

    createdLossEvents.push(lossEvent);
  }

  // D. Additional Realistic Loss Events across All 4 Business Scenarios
  // Scenario 01: Inward Raw Material QC
  // Scenario 02: In-Process WIP Defect
  // Scenario 03: Final Assembly QA Defect
  // Scenario 04: Customer / Dealer RMA
  console.log('🔄 Seeding diverse realistic scenario incidents (Inward QC, WIP Defect, Assembly QA, Customer RMA)...');

  const additionalScenarios = [
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL',
      item: materials[0],
      qty: 48,
      reason: 'Mandrel bending tool misalignment in tube forming caused high-stress cracking across 48 stainless pipe segments.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.INVESTIGATED,
      variance: 7.2,
      investigationNotes: 'Sensor calibration on pipe bender completed. Hydraulic fluid replaced.'
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL',
      item: materials[1],
      qty: 15,
      reason: 'Normal off-cut trim, punch holes, and deburring metal shavings during standard heavy beam sizing.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.POSTED,
      variance: 0.6,
      stockEffect: true
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT',
      item: products[0],
      qty: 8,
      reason: 'Final Assembly QA Defect: Structural weld distortion and high-voltage insulation breakdown on final testing rig.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPLACED,
      variance: 5.4,
      isReplaced: true
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT',
      item: products[1],
      qty: 12,
      reason: 'Customer / Dealer RMA: In-transit vibration caused bent cross-members and paint chipping reported by distributor.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REVIEWED,
      variance: 8.0
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL',
      item: materials[2],
      qty: 24,
      reason: 'Inward Raw Material QC: Supplier heat lot showed sulfur inclusion exceeding ASTM chemical specification on lab test.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPORTED,
      variance: 9.5
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL',
      item: materials[3],
      qty: 60,
      reason: 'In-Process WIP Defect: Severe CNC plasma torch height controller spike gouged 60 structural gusset plates.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.REPLACED,
      variance: 11.2,
      isReplaced: true
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'MATERIAL',
      item: materials[4],
      qty: 18,
      reason: 'Punching and shearing scrap within baseline engineered allowance for foundation bolt bracket plates.',
      classification: LossClassification.WITHIN_TOLERANCE,
      status: LossEventStatus.APPROVED,
      variance: 0.9
    },
    {
      sourceType: LossSourceType.MANUAL_REPORT,
      itemKind: 'PRODUCT',
      item: products[2],
      qty: 5,
      reason: 'Final Assembly QA Defect: Pressure vessel hydrostatic weld porosity leakage at 18 Bar hold cycle.',
      classification: LossClassification.ABNORMAL,
      status: LossEventStatus.INVESTIGATED,
      variance: 4.8,
      investigationNotes: 'Weld wire spool moisture contamination confirmed. Dry storage oven protocol enforced.'
    }
  ];

  for (let sIdx = 0; sIdx < additionalScenarios.length; sIdx++) {
    const sc = additionalScenarios[sIdx];
    const lossNum = `LOSS-2026-${String(lossEventCounter++).padStart(5, '0')}`;
    const reportedDate = new Date(Date.now() - (sIdx * 30 + 10) * 3600000);
    const targetDept = departments[sIdx % departments.length];
    const targetLoc = locations[sIdx % locations.length];
    const wRule = sc.itemKind === 'MATERIAL' ? wastageRuleMap.get(sc.item.id) : null;

    const lossEvent = await prisma.lossEvent.create({
      data: {
        lossNumber: lossNum,
        sourceType: sc.sourceType,
        materialId: sc.itemKind === 'MATERIAL' ? sc.item.id : null,
        productId: sc.itemKind === 'PRODUCT' ? sc.item.id : null,
        uomId: sc.item.uomId || defaultUom.id,
        departmentId: targetDept.id,
        locationId: targetLoc.id,
        quantity: new Prisma.Decimal(sc.qty),
        reason: sc.reason,
        reportedByActorId: adminUser.id,
        reportedAt: reportedDate,
        appliedWastageRuleId: wRule ? wRule.id : null,
        appliedWastageRuleVersion: wRule ? 1 : null,
        varianceFromExpected: new Prisma.Decimal(sc.variance),
        classification: sc.classification,
        status: sc.status,
        reviewedByActorId: sc.status !== LossEventStatus.REPORTED ? storeManagerUser.id : null,
        reviewedAt: sc.status !== LossEventStatus.REPORTED ? new Date(reportedDate.getTime() + 3600000) : null,
        reviewNotes: sc.status !== LossEventStatus.REPORTED ? 'Supervisory review completed on shopfloor inspection.' : null,
        approvedByActorId: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(sc.status) ? storeManagerUser.id : null,
        approvedAt: ([LossEventStatus.APPROVED, LossEventStatus.POSTED, LossEventStatus.REPLACED] as LossEventStatus[]).includes(sc.status) ? new Date(reportedDate.getTime() + 7200000) : null,
        investigatedByActorId: sc.status === LossEventStatus.INVESTIGATED ? storeManagerUser.id : null,
        investigatedAt: sc.status === LossEventStatus.INVESTIGATED ? new Date(reportedDate.getTime() + 5400000) : null,
        investigationNotes: sc.investigationNotes || null,
        stockEffectRef: sc.stockEffect ? `STK-ADJ-2026-${String(lossEventCounter).padStart(4, '0')}` : null,
        replacementChallanRef: sc.isReplaced ? `REP-CHAL-2026-${String(lossEventCounter).padStart(4, '0')}` : null
      }
    });

    createdLossEvents.push(lossEvent);

    if (sc.isReplaced) {
      await prisma.replacementChallan.create({
        data: {
          challanNumber: lossEvent.replacementChallanRef!,
          lossEventId: lossEvent.id,
          materialId: sc.itemKind === 'MATERIAL' ? sc.item.id : null,
          productId: sc.itemKind === 'PRODUCT' ? sc.item.id : null,
          uomId: sc.item.uomId || defaultUom.id,
          quantity: new Prisma.Decimal(sc.qty),
          dispatchLocationId: targetLoc.id,
          targetDepartmentId: targetDept.id,
          notes: `Official replacement delivery under warranty/disposition for incident ${lossNum}`,
          issuedByActorId: storeManagerUser.id,
          issuedAt: new Date(reportedDate.getTime() + 7200000),
          acknowledgedByActorId: adminUser.id,
          acknowledgedAt: new Date(reportedDate.getTime() + 10800000)
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Summary Verification Counts
  // ---------------------------------------------------------------------------
  const [
    totalQcRules,
    totalInspections,
    totalCorrectiveActions,
    totalWastageRules,
    totalLossEvents,
    totalReplacementChallans
  ] = await Promise.all([
    prisma.qcRule.count(),
    prisma.inspectionResult.count(),
    prisma.correctiveAction.count(),
    prisma.wastageRule.count(),
    prisma.lossEvent.count(),
    prisma.replacementChallan.count()
  ]);

  console.log(`
🎉 Integrated Quality & Inspection + Scrap & Loss Seeding COMPLETED!
====================================================================
  - QC Rules:               ${totalQcRules}
  - Inspection Results:     ${totalInspections}
  - Corrective Actions:     ${totalCorrectiveActions}
  - Wastage Allowance Rules:${totalWastageRules}
  - Loss Events:            ${totalLossEvents}
  - Replacement Challans:   ${totalReplacementChallans}
====================================================================
All records are fully linked to real Production Batches, Assembly Batches,
Goods Receipt Lines, Employees, and Users. No empty/null required fields!
`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedQualityAndLossManagement(prisma)
    .catch((err) => {
      console.error('Fatal error during seeding:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
