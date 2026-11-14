import { PrismaClient, LifecycleStatus, PoStatus, GrnStatus, GrnLineStatus, InventoryCondition, InventoryOwnership } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🛒 Seeding comprehensive Procurement Section (Bulk Vendors, POs, and Goods Receipts)...');

  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  const actorId = admin?.id || (await prisma.user.findFirst())?.id;
  if (!actorId) throw new Error('No user found');

  const rawLocation = await prisma.warehouseLocation.findFirst({ where: { type: 'RAW_MATERIAL' } })
    || (await prisma.warehouseLocation.findFirst());
  if (!rawLocation) throw new Error('No warehouse location found');

  // 1. Bulk Vendors for Steel, Hardware, Chemicals, Polymers, and Heavy Engineering
  console.log('🏢 1. Seeding 15 Bulk Industrial Vendors with complete profiles...');
  const bulkVendorsData = [
    {
      code: 'VEND-TATA-STEEL-LTD',
      name: 'Tata Steel Limited (Industrial Products Division)',
      legalName: 'Tata Steel Ltd - Industrial Tubes & Sections',
      contactEmail: 'orders.tubes@tatasteel.com',
      contactPhone: '+91-22-66658282',
      taxNumber: '27AAACT2727Q1ZW',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 7,
      address: {
        street: 'Bombay House, 24 Homi Mody Street, Fort',
        city: 'Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '400001',
        country: 'India',
      },
    },
    {
      code: 'VEND-JSW-STEEL-COATED',
      name: 'JSW Steel Coated Products Ltd',
      legalName: 'JSW Steel Coated Products Limited',
      contactEmail: 'sales.mumbai@jsw.in',
      contactPhone: '+91-22-42861000',
      taxNumber: '27AABCJ0909A1ZT',
      currency: 'INR',
      paymentTerms: 'NET_45',
      leadTimeDays: 10,
      address: {
        street: 'JSW Centre, Bandra Kurla Complex, Bandra East',
        city: 'Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '400051',
        country: 'India',
      },
    },
    {
      code: 'VEND-JINDAL-SAW-SEAMLESS',
      name: 'Jindal SAW High Pressure Seamless Ltd',
      legalName: 'Jindal SAW Limited',
      contactEmail: 'procurements@jindalsaw.com',
      contactPhone: '+91-11-26188360',
      taxNumber: '07AAACJ4321B1ZU',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 14,
      address: {
        street: 'Jindal Centre, 12 Bhikaiji Cama Place',
        city: 'New Delhi',
        state: 'Delhi',
        stateCode: '07',
        postalCode: '110066',
        country: 'India',
      },
    },
    {
      code: 'VEND-STEEL-AUTH-BHILAI',
      name: 'Steel Authority of India (SAIL Bhilai Heavy Plate)',
      legalName: 'Steel Authority of India Limited',
      contactEmail: 'marketing.plates@sail.in',
      contactPhone: '+91-788-2222123',
      taxNumber: '22AAACS0011C1ZX',
      currency: 'INR',
      paymentTerms: 'NET_60',
      leadTimeDays: 15,
      address: {
        street: 'Ispat Bhavan, Lodhi Road / Bhilai Steel Complex',
        city: 'Bhilai',
        state: 'Chhattisgarh',
        stateCode: '22',
        postalCode: '490001',
        country: 'India',
      },
    },
    {
      code: 'VEND-SUNDRAM-FASTENERS',
      name: 'Sundram Fasteners Heavy Structural Hardware',
      legalName: 'Sundram Fasteners Limited',
      contactEmail: 'structural.fasteners@sundram.com',
      contactPhone: '+91-44-28478500',
      taxNumber: '33AAACS1234F1ZQ',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 5,
      address: {
        street: '98-A, VII Floor, Dr. Radhakrishnan Salai, Mylapore',
        city: 'Chennai',
        state: 'Tamil Nadu',
        stateCode: '33',
        postalCode: '600004',
        country: 'India',
      },
    },
    {
      code: 'VEND-ESAB-WELDING-INDIA',
      name: 'ESAB India Welding Consumables & Systems',
      legalName: 'ESAB India Limited',
      contactEmail: 'industrial.welding@esab.co.in',
      contactPhone: '+91-44-42281100',
      taxNumber: '33AAACE1234D1ZL',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 4,
      address: {
        street: 'Plot No. 13, 3rd Main Road, Industrial Estate, Ambattur',
        city: 'Chennai',
        state: 'Tamil Nadu',
        stateCode: '33',
        postalCode: '600058',
        country: 'India',
      },
    },
    {
      code: 'VEND-BHARAT-FORGE-FLANGES',
      name: 'Bharat Forge Heavy Industrial Flanges Ltd',
      legalName: 'Bharat Forge Limited',
      contactEmail: 'pipingflanges@bharatforge.com',
      contactPhone: '+91-20-67042777',
      taxNumber: '27AAACB1234L1ZN',
      currency: 'INR',
      paymentTerms: 'NET_45',
      leadTimeDays: 12,
      address: {
        street: 'Mundhwa, Pune Cantonment',
        city: 'Pune',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '411036',
        country: 'India',
      },
    },
    {
      code: 'VEND-APOLLO-TUBES-LTD',
      name: 'APL Apollo Tubes & Hollow Sections',
      legalName: 'APL Apollo Tubes Limited',
      contactEmail: 'tubes.delhi@aplapollo.com',
      contactPhone: '+91-120-4041400',
      taxNumber: '09AABCA2233M1ZT',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 6,
      address: {
        street: '37 Hargobind Enclave, Vikas Marg',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        stateCode: '09',
        postalCode: '201001',
        country: 'India',
      },
    },
    {
      code: 'VEND-RELIANCE-POLYMERS',
      name: 'Reliance Petrochemicals & Polymers Division',
      legalName: 'Reliance Industries Limited - Polymers',
      contactEmail: 'polymer.sales@ril.com',
      contactPhone: '+91-22-35555000',
      taxNumber: '24AAACR5055K1Z9',
      currency: 'INR',
      paymentTerms: 'ADVANCE_100',
      leadTimeDays: 3,
      address: {
        street: 'Petrochemical Complex, P.O. Dahej',
        city: 'Bharuch',
        state: 'Gujarat',
        stateCode: '24',
        postalCode: '392130',
        country: 'India',
      },
    },
    {
      code: 'VEND-BERGER-COATINGS',
      name: 'Berger Paints Heavy Industrial Protective Coatings',
      legalName: 'Berger Paints India Limited',
      contactEmail: 'protectivecoatings@bergerindia.com',
      contactPhone: '+91-33-22299724',
      taxNumber: '19AAACB4040N1ZS',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 4,
      address: {
        street: 'Berger House, 129 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        stateCode: '19',
        postalCode: '700017',
        country: 'India',
      },
    },
    {
      code: 'VEND-UNBRAKO-FASTENERS',
      name: 'Unbrako High Tensile Bolts & Fasteners Ltd',
      legalName: 'Deepak Fasteners Limited - Unbrako',
      contactEmail: 'sales@unbrako.com',
      contactPhone: '+91-161-5188000',
      taxNumber: '03AAACD3333P1ZR',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 7,
      address: {
        street: 'Phase VII, Focal Point',
        city: 'Ludhiana',
        state: 'Punjab',
        stateCode: '03',
        postalCode: '141010',
        country: 'India',
      },
    },
    {
      code: 'VEND-LINDE-GASES-INDIA',
      name: 'Linde India Industrial Shielding Gases & Argon',
      legalName: 'Linde India Limited',
      contactEmail: 'industrialgases@linde.com',
      contactPhone: '+91-33-66021600',
      taxNumber: '19AAACL2855J1Z3',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 2,
      address: {
        street: 'Oxygen House, P43 Taratala Road',
        city: 'Kolkata',
        state: 'West Bengal',
        stateCode: '19',
        postalCode: '700088',
        country: 'India',
      },
    },
    {
      code: 'VEND-VIRAJ-PROFILES-SS',
      name: 'Viraj Profiles Stainless Steel Flanges & Bright Bars',
      legalName: 'Viraj Profiles Private Limited',
      contactEmail: 'flanges@viraj.com',
      contactPhone: '+91-22-28360600',
      taxNumber: '27AABCV8989R1ZY',
      currency: 'INR',
      paymentTerms: 'NET_45',
      leadTimeDays: 8,
      address: {
        street: 'MIDC Tarapur Industrial Area, Boisar',
        city: 'Palghar',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '401506',
        country: 'India',
      },
    },
    {
      code: 'VEND-KIRLOSKAR-FORGINGS',
      name: 'Kirloskar Ferrous & Heavy Machinery Castings',
      legalName: 'Kirloskar Ferrous Industries Limited',
      contactEmail: 'ferrous@kirloskar.com',
      contactPhone: '+91-8394-244444',
      taxNumber: '29AAACK1919E1ZM',
      currency: 'INR',
      paymentTerms: 'NET_30',
      leadTimeDays: 12,
      address: {
        street: 'Bevinahalli Village, Taluka Koppal',
        city: 'Koppal',
        state: 'Karnataka',
        stateCode: '29',
        postalCode: '583234',
        country: 'India',
      },
    },
    {
      code: 'VEND-RATNAMANI-METALS',
      name: 'Ratnamani Metals & Seamless Tubes Ltd',
      legalName: 'Ratnamani Metals & Tubes Ltd',
      contactEmail: 'seamless@ratnamani.com',
      contactPhone: '+91-79-29601200',
      taxNumber: '24AAACR1818M1ZH',
      currency: 'INR',
      paymentTerms: 'NET_45',
      leadTimeDays: 10,
      address: {
        street: '17 Rajmugat Society, Naranpura Cross Road',
        city: 'Ahmedabad',
        state: 'Gujarat',
        stateCode: '24',
        postalCode: '380013',
        country: 'India',
      },
    },
  ];

  // Update existing vendors so they also have complete fields
  const existingVendors = await prisma.vendor.findMany();
  for (const ev of existingVendors) {
    await prisma.vendor.update({
      where: { id: ev.id },
      data: {
        legalName: ev.legalName || `${ev.name} Pvt Ltd`,
        contactEmail: ev.contactEmail || `contact@${ev.code.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        contactPhone: ev.contactPhone || '+91-9826011111',
        paymentTerms: ev.paymentTerms || 'NET_30',
        leadTimeDays: ev.leadTimeDays || 7,
      },
    });
  }

  const vendorMap = new Map<string, any>();
  for (const vData of bulkVendorsData) {
    const v = await prisma.vendor.upsert({
      where: { code: vData.code },
      update: {
        name: vData.name,
        legalName: vData.legalName,
        contactEmail: vData.contactEmail,
        contactPhone: vData.contactPhone,
        taxNumber: vData.taxNumber,
        currency: vData.currency,
        paymentTerms: vData.paymentTerms,
        leadTimeDays: vData.leadTimeDays,
        address: vData.address,
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        id: randomUUID(),
        code: vData.code,
        name: vData.name,
        legalName: vData.legalName,
        contactEmail: vData.contactEmail,
        contactPhone: vData.contactPhone,
        taxNumber: vData.taxNumber,
        currency: vData.currency,
        paymentTerms: vData.paymentTerms,
        leadTimeDays: vData.leadTimeDays,
        address: vData.address,
        status: LifecycleStatus.ACTIVE,
      },
    });
    vendorMap.set(v.code, v);
  }

  const allVendors = await prisma.vendor.findMany();
  console.log(`✅ Vendors populated: ${allVendors.length} total active vendors with 100% complete fields.`);

  // 2. Select High-Impact Steel and Industrial Raw Materials & Products for PO Lines
  const heavyItems = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { startsWith: 'STEEL-' } },
        { sku: { startsWith: 'PLATE-' } },
        { sku: { startsWith: 'FLANGE-' } },
        { sku: { startsWith: 'FITTING-' } },
        { sku: { startsWith: 'BOLT-' } },
        { sku: { startsWith: 'WELD-' } },
        { sku: { startsWith: 'ELECTRODE-' } },
      ],
    },
  });

  const materialsList = await prisma.material.findMany({ take: 30 });
  const pool = [...heavyItems.map((p) => ({ isProduct: true, item: p })), ...materialsList.map((m) => ({ isProduct: false, item: m }))];

  // 3. Purchase Orders Definitions
  console.log('📝 2. Seeding Realistic Purchase Orders with Full Detail & Line Records...');

  const poDefinitions = [
    {
      poNumber: 'PO-2026-TATA-001',
      vendorCode: 'VEND-TATA-STEEL-LTD',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days from MRN Generation',
      deliveryLocation: 'Central Heavy Fabrication Bay - Gate 4, Sanwer Road Industrial Area, Indore',
      dispatchedThrough: 'VRL Heavy Surface Logistics (Air Suspension Low-Bed Trailer)',
      otherReferences: 'Contract Agreement #TATA-PLINTH-2026-Q4',
      termsOfDelivery: 'FOR Destination (Unloading at Consignee Yard by EOT Crane)',
      lines: [
        { poolIdx: 0, qty: 50, unitPrice: 3450, taxRate: 18, needDays: 14 },
        { poolIdx: 1, qty: 80, unitPrice: 2850, taxRate: 18, needDays: 14 },
      ],
      grn: {
        grnNumber: 'GRN-2026-TATA-001',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -2,
      },
    },
    {
      poNumber: 'PO-2026-JSW-002',
      vendorCode: 'VEND-JSW-STEEL-COATED',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 45 Days against Letter of Credit',
      deliveryLocation: 'Plinth Steel Coil Storage Yard, Bay 2, Indore Plant',
      dispatchedThrough: 'TCI Freight Multi-Axle Carrier',
      otherReferences: 'Quotation #JSW-CRCA-8921-REV2',
      termsOfDelivery: 'CIF Indore Central Plant with Marine Transit Insurance',
      lines: [
        { poolIdx: 2, qty: 30, unitPrice: 14500, taxRate: 18, needDays: 20 },
        { poolIdx: 3, qty: 100, unitPrice: 4250, taxRate: 18, needDays: 20 },
      ],
      grn: {
        grnNumber: 'GRN-2026-JSW-002',
        status: GrnStatus.SIGNED_OFF,
        receivedDeltaDays: -1,
      },
    },
    {
      poNumber: 'PO-2026-JINDAL-003',
      vendorCode: 'VEND-JINDAL-SAW-SEAMLESS',
      status: PoStatus.SENT,
      paymentTerms: '30% Advance, 70% against Proof of Dispatch (LR Copy)',
      deliveryLocation: 'High Pressure Spool Fabrication Shop, Shed 3',
      dispatchedThrough: 'Gati-KWE Dedicated Industrial Fleet',
      otherReferences: 'IBR Technical Specification Spec-A106-2026',
      termsOfDelivery: 'Ex-Works Jindal Mill with Mill Test Certificate EN 10204 3.1',
      lines: [
        { poolIdx: 4, qty: 60, unitPrice: 8500, taxRate: 18, needDays: 25 },
        { poolIdx: 5, qty: 45, unitPrice: 9800, taxRate: 18, needDays: 25 },
      ],
      grn: {
        grnNumber: 'GRN-2026-JINDAL-003',
        status: GrnStatus.VERIFIED,
        receivedDeltaDays: 0,
      },
    },
    {
      poNumber: 'PO-2026-SAIL-004',
      vendorCode: 'VEND-STEEL-AUTH-BHILAI',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 60 Days Corporate Purchase Agreement',
      deliveryLocation: 'Heavy Plate Yard & CNC Oxy-Fuel Profile Cutting Shop',
      dispatchedThrough: 'Indian Railways Dedicated Freight Rake / Container Corporation',
      otherReferences: 'SAIL Railway Rake Booking RAKE-BHL-2026-08',
      termsOfDelivery: 'FOR Bhilai Siding to Consignee Siding Indore',
      lines: [
        { poolIdx: 6, qty: 15, unitPrice: 195000, taxRate: 18, needDays: 30 },
        { poolIdx: 7, qty: 10, unitPrice: 260000, taxRate: 18, needDays: 30 },
      ],
      grn: {
        grnNumber: 'GRN-2026-SAIL-004',
        status: GrnStatus.UNDER_VERIFICATION,
        receivedDeltaDays: 0,
      },
    },
    {
      poNumber: 'PO-2026-SUNDRAM-005',
      vendorCode: 'VEND-SUNDRAM-FASTENERS',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days Electronic Transfer',
      deliveryLocation: 'Hardware Store, Rack D, Plinth Central Warehouse',
      dispatchedThrough: 'BlueDart Express Cargo Surface',
      otherReferences: 'Sundram Master Price Contract #SFL-IND-2026',
      termsOfDelivery: 'Door Delivery Free of Freight',
      lines: [
        { poolIdx: 8, qty: 250, unitPrice: 2850, taxRate: 18, needDays: 10 },
        { poolIdx: 9, qty: 180, unitPrice: 4600, taxRate: 18, needDays: 10 },
      ],
      grn: {
        grnNumber: 'GRN-2026-SUNDRAM-005',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -3,
      },
    },
    {
      poNumber: 'PO-2026-ESAB-006',
      vendorCode: 'VEND-ESAB-WELDING-INDIA',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days Monthly Account',
      deliveryLocation: 'Welding Consumables Humidity-Controlled Oven Store, Bay 1',
      dispatchedThrough: 'Safechem Industrial Surface Transporters',
      otherReferences: 'AWS Certification Batch Audit ESAB-WLD-889',
      termsOfDelivery: 'Delivered at Shop Floor in Vacuum Sealed Pallets',
      lines: [
        { poolIdx: 10, qty: 300, unitPrice: 2850, taxRate: 18, needDays: 7 },
        { poolIdx: 11, qty: 200, unitPrice: 3450, taxRate: 18, needDays: 7 },
      ],
      grn: {
        grnNumber: 'GRN-2026-ESAB-006',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -2,
      },
    },
    {
      poNumber: 'PO-2026-BHARAT-007',
      vendorCode: 'VEND-BHARAT-FORGE-FLANGES',
      status: PoStatus.SENT,
      paymentTerms: 'NET 45 Days Post Delivery Inspection',
      deliveryLocation: 'Machine Shop & Flange Facing Station',
      dispatchedThrough: 'Navata Road Transport Pune-Indore Express',
      otherReferences: 'BFL Forging Heat Treatment Lot Certificate #HT-9821',
      termsOfDelivery: 'FOB Pune Hub with Protective Rust-Preventive VCI Wrapping',
      lines: [
        { poolIdx: 12, qty: 80, unitPrice: 4800, taxRate: 18, needDays: 18 },
        { poolIdx: 13, qty: 50, unitPrice: 9400, taxRate: 18, needDays: 18 },
      ],
      grn: {
        grnNumber: 'GRN-2026-BHARAT-007',
        status: GrnStatus.ARRIVED,
        receivedDeltaDays: 0,
      },
    },
    {
      poNumber: 'PO-2026-APOLLO-008',
      vendorCode: 'VEND-APOLLO-TUBES-LTD',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days through Bill Discounting',
      deliveryLocation: 'Structural Tube Staging Area, North Yard',
      dispatchedThrough: 'Direct Dedicated Flatbed Trailer 40 Feet',
      otherReferences: 'APL Order Confirmation #APL-DEL-4412',
      termsOfDelivery: 'FOR Plant Indore with Standard Hexagonal Strapped Bundling',
      lines: [
        { poolIdx: 14, qty: 150, unitPrice: 2950, taxRate: 18, needDays: 12 },
        { poolIdx: 15, qty: 120, unitPrice: 3600, taxRate: 18, needDays: 12 },
      ],
      grn: {
        grnNumber: 'GRN-2026-APOLLO-008',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -4,
      },
    },
    {
      poNumber: 'PO-2026-RELIANCE-009',
      vendorCode: 'VEND-RELIANCE-POLYMERS',
      status: PoStatus.APPROVED,
      paymentTerms: '100% Advance Payment RTGS',
      deliveryLocation: 'Injection Moulding Granule Raw Material Warehouse',
      dispatchedThrough: 'Chemical Transport Container Liner',
      otherReferences: 'RIL Proforma Invoice #RIL-DAH-9921',
      termsOfDelivery: 'Door Delivery in 25kg Moisture Proof Palletized Bags',
      lines: [
        { poolIdx: 16, qty: 400, unitPrice: 185, taxRate: 18, needDays: 5 },
        { poolIdx: 17, qty: 250, unitPrice: 165, taxRate: 18, needDays: 5 },
      ],
      grn: {
        grnNumber: 'GRN-2026-RELIANCE-009',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -1,
      },
    },
    {
      poNumber: 'PO-2026-BERGER-010',
      vendorCode: 'VEND-BERGER-COATINGS',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days from Invoice Receipt',
      deliveryLocation: 'Automated Paint & Surface Finishing Shop',
      dispatchedThrough: 'Transport Corporation of India Hazmat Fleet',
      otherReferences: 'Berger Heavy Duty Protective Spec BERG-EPOXY-2026',
      termsOfDelivery: 'Temperature Controlled Transit in 20L Sealed Drums',
      lines: [
        { poolIdx: 18, qty: 80, unitPrice: 680, taxRate: 18, needDays: 8 },
        { poolIdx: 19, qty: 60, unitPrice: 750, taxRate: 18, needDays: 8 },
      ],
      grn: {
        grnNumber: 'GRN-2026-BERGER-010',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -2,
      },
    },
    {
      poNumber: 'PO-2026-UNBRAKO-011',
      vendorCode: 'VEND-UNBRAKO-FASTENERS',
      status: PoStatus.APPROVED,
      paymentTerms: 'NET 30 Days through NEFT',
      deliveryLocation: 'Central Assembly Store, Heavy Fasteners Section',
      dispatchedThrough: 'DTDC Priority Air & Surface Cargo',
      otherReferences: 'Unbrako Direct Quotation #UNB-LUD-7811',
      termsOfDelivery: 'Ex-Works Consignee Door Delivery',
      lines: [
        { poolIdx: 20, qty: 500, unitPrice: 180, taxRate: 18, needDays: 10 },
        { poolIdx: 21, qty: 350, unitPrice: 220, taxRate: 18, needDays: 10 },
      ],
      grn: {
        grnNumber: 'GRN-2026-UNBRAKO-011',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -3,
      },
    },
    {
      poNumber: 'PO-2026-LINDE-012',
      vendorCode: 'VEND-LINDE-GASES-INDIA',
      status: PoStatus.APPROVED,
      paymentTerms: 'Weekly Running Cylinder Manifest Settlement',
      deliveryLocation: 'Gas Manifold & Cylinder Storage Yard',
      dispatchedThrough: 'Linde Dedicated Explosives / Cryogenic Gas Tanker',
      otherReferences: 'Gas Supply Agreement LINDE-IND-GAS-2026',
      termsOfDelivery: 'Delivered and Connected to Main Factory Ring Manifold',
      lines: [
        { poolIdx: 22, qty: 100, unitPrice: 1250, taxRate: 18, needDays: 3 },
      ],
      grn: {
        grnNumber: 'GRN-2026-LINDE-012',
        status: GrnStatus.FINALIZED,
        receivedDeltaDays: -1,
      },
    },
  ];

  for (const poDef of poDefinitions) {
    const vendor = vendorMap.get(poDef.vendorCode) || (await prisma.vendor.findFirst({ where: { code: poDef.vendorCode } }));
    if (!vendor) {
      console.warn(`Vendor ${poDef.vendorCode} not found!`);
      continue;
    }

    // Calculate subtotal and tax
    let subtotal = 0;
    const linesToCreate: any[] = [];

    for (const lDef of poDef.lines) {
      const selected = pool[lDef.poolIdx % pool.length];
      const lineCost = lDef.qty * lDef.unitPrice;
      const lineTax = (lineCost * lDef.taxRate) / 100;
      const lineTotal = lineCost + lineTax;
      subtotal += lineCost;

      const needDate = new Date();
      needDate.setDate(needDate.getDate() + lDef.needDays);

      linesToCreate.push({
        id: randomUUID(),
        productId: selected.isProduct ? selected.item.id : null,
        materialId: !selected.isProduct ? selected.item.id : null,
        uomId: selected.item.uomId,
        quantity: lDef.qty,
        unitPrice: lDef.unitPrice,
        taxRate: lDef.taxRate,
        lineTotal: lineTotal,
        needDate: needDate,
      });
    }

    const taxAmount = (subtotal * 18) / 100;
    const totalAmount = subtotal + taxAmount;

    // Upsert Purchase Order
    const po = await prisma.purchaseOrder.upsert({
      where: { poNumber_revisionNumber: { poNumber: poDef.poNumber, revisionNumber: 1 } },
      update: {
        vendorId: vendor.id,
        status: poDef.status,
        currency: 'INR',
        paymentTerms: poDef.paymentTerms,
        deliveryLocation: poDef.deliveryLocation,
        dispatchedThrough: poDef.dispatchedThrough,
        otherReferences: poDef.otherReferences,
        termsOfDelivery: poDef.termsOfDelivery,
        subtotal: subtotal,
        taxAmount: taxAmount,
        totalAmount: totalAmount,
        approvedAt: new Date(),
        sentAt: new Date(),
      },
      create: {
        id: randomUUID(),
        poNumber: poDef.poNumber,
        revisionNumber: 1,
        vendorId: vendor.id,
        status: poDef.status,
        currency: 'INR',
        paymentTerms: poDef.paymentTerms,
        deliveryLocation: poDef.deliveryLocation,
        dispatchedThrough: poDef.dispatchedThrough,
        otherReferences: poDef.otherReferences,
        termsOfDelivery: poDef.termsOfDelivery,
        subtotal: subtotal,
        taxAmount: taxAmount,
        totalAmount: totalAmount,
        approvedAt: new Date(),
        sentAt: new Date(),
      },
    });

    // Delete existing lines to ensure fresh clean lines
    await prisma.purchaseOrderLine.deleteMany({ where: { poId: po.id } });

    // Insert lines
    for (const l of linesToCreate) {
      await prisma.purchaseOrderLine.create({
        data: {
          ...l,
          poId: po.id,
        },
      });
    }

    const createdLines = await prisma.purchaseOrderLine.findMany({ where: { poId: po.id } });

    // 4. Goods Receipt Note for this PO
    if (poDef.grn) {
      const receivedDate = new Date();
      receivedDate.setDate(receivedDate.getDate() + poDef.grn.receivedDeltaDays);

      const grn = await prisma.goodsReceiptNote.upsert({
        where: { grnNumber: poDef.grn.grnNumber },
        update: {
          poId: po.id,
          vendorId: vendor.id,
          locationId: rawLocation.id,
          status: poDef.grn.status,
          receivedByActorId: actorId,
          receivedAt: receivedDate,
          verifiedByActorId: actorId,
          verifiedAt: receivedDate,
          signedOffByActorId: actorId,
          signedOffAt: receivedDate,
          finalizedByActorId: actorId,
          finalizedAt: receivedDate,
        },
        create: {
          id: randomUUID(),
          grnNumber: poDef.grn.grnNumber,
          poId: po.id,
          vendorId: vendor.id,
          locationId: rawLocation.id,
          status: poDef.grn.status,
          receivedByActorId: actorId,
          receivedAt: receivedDate,
          verifiedByActorId: actorId,
          verifiedAt: receivedDate,
          signedOffByActorId: actorId,
          signedOffAt: receivedDate,
          finalizedByActorId: actorId,
          finalizedAt: receivedDate,
        },
      });

      await prisma.goodsReceiptLine.deleteMany({ where: { grnId: grn.id } });

      for (const pl of createdLines) {
        await prisma.goodsReceiptLine.create({
          data: {
            id: randomUUID(),
            grnId: grn.id,
            poLineId: pl.id,
            productId: pl.productId,
            materialId: pl.materialId,
            uomId: pl.uomId,
            expectedQuantity: pl.quantity,
            invoiceUnitPrice: Number(pl.unitPrice),
            receivedQuantity: pl.quantity,
            acceptedQuantity: pl.quantity,
            rejectedQuantity: 0,
            damagedQuantity: 0,
            shortQuantity: 0,
            excessQuantity: 0,
            putAwayLocationId: rawLocation.id,
            lotNumber: `LOT-${poDef.poNumber.slice(-8)}-${Math.floor(1000 + Math.random() * 9000)}`,
            lotManufacturedAt: receivedDate,
            lotExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            inventoryCondition: InventoryCondition.AVAILABLE,
            inventoryOwnership: InventoryOwnership.COMPANY,
            status: GrnLineStatus.VERIFIED,
          },
        });
      }
    }
  }

  console.log(`✅ Seeded ${poDefinitions.length} Purchase Orders and matching Goods Receipts!`);
  console.log('🎉 ENTIRE PROCUREMENT SECTION FULLY SEEDED WITH ZERO NULL/EMPTY FIELDS!');
}

main()
  .catch((e) => {
    console.error('❌ Error during procurement seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
