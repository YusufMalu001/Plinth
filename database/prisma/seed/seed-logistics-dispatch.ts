import {
  PrismaClient,
  SalesShipmentMode,
  SalesShipmentStatus,
  SalesFulfillmentStatus,
  SalesPickListStatus,
  SalesPackageStatus,
  SalesOrderStatus,
  SalesPaymentStatus,
  SalesAllocationStatus,
  SalesAccountingStatus,
  SalesOrderLineStatus,
  SalesOrderChannel,
  SalesTrackingSource,
  SalesDispatchDocumentType,
  LifecycleStatus,
  Prisma,
} from '@prisma/client';

type CarrierWithServices = Prisma.SalesCarrierGetPayload<{
  include: { services: true };
}>;

const prisma = new PrismaClient();

export async function seedLogisticsDispatch() {
  console.log('🚚 ========================================================');
  console.log('📦 Bulk Seeding Comprehensive Logistics & Dispatch Data...');
  console.log('🚚 ========================================================');

  const admin = await prisma.user.findFirst({
    where: {
      OR: [{ role: 'admin' }, { email: 'admin@plintherp.com' }, { email: 'admin@plinth.example' }],
    },
  });

  const actorId = admin?.id || 'sys-admin-actor';

  // 1. Warehouse Locations (Ensure finished goods & distribution hub)
  let warehouse = await prisma.warehouseLocation.findFirst({
    where: { type: 'FINISHED_GOODS', status: LifecycleStatus.ACTIVE },
  });

  if (!warehouse) {
    warehouse = await prisma.warehouseLocation.findFirst({
      where: { status: LifecycleStatus.ACTIVE },
    });
  }

  if (!warehouse) {
    warehouse = await prisma.warehouseLocation.create({
      data: {
        code: 'WH-MAIN-01',
        name: 'Plinth Central Distribution Hub (Pune)',
        type: 'FINISHED_GOODS',
        status: LifecycleStatus.ACTIVE,
        fulfillmentV2Enabled: true,
      },
    });
  }

  // 2. Fetch Customers
  let customers = await prisma.customer.findMany({ take: 10 });
  if (customers.length === 0) {
    const c1 = await prisma.customer.create({
      data: {
        name: 'Bharat Heavy Auto Ancillaries Pvt Ltd',
        code: 'CUST-BHA-001',
        contactEmail: 'procurement@bharatauto.in',
        contactPhone: '+91 98220 12345',
        currency: 'INR',
        taxNumber: '27AAACB2234M1Z5',
        billingAddress: { line1: 'Plot 42, MIDC Bhosari', city: 'Pune', state: 'Maharashtra', postalCode: '411026', country: 'India' },
        shippingAddress: { line1: 'Plot 42, MIDC Bhosari', city: 'Pune', state: 'Maharashtra', postalCode: '411026', country: 'India' },
        creditLimit: 2500000,
        status: LifecycleStatus.ACTIVE,
      },
    });
    const c2 = await prisma.customer.create({
      data: {
        name: 'Apex Precision Engineering Works',
        code: 'CUST-APX-002',
        contactEmail: 'orders@apexprecision.com',
        contactPhone: '+91 98450 67890',
        currency: 'INR',
        taxNumber: '29AABCA5678P1ZV',
        billingAddress: { line1: 'Peenya Industrial Area, Stage 3', city: 'Bangalore', state: 'Karnataka', postalCode: '560058', country: 'India' },
        shippingAddress: { line1: 'Peenya Industrial Area, Stage 3', city: 'Bangalore', state: 'Karnataka', postalCode: '560058', country: 'India' },
        creditLimit: 1500000,
        status: LifecycleStatus.ACTIVE,
      },
    });
    customers = [c1, c2];
  }

  // 3. Fetch Products
  let products = await prisma.product.findMany({
    where: { status: LifecycleStatus.ACTIVE },
    take: 12,
  });
  if (products.length === 0) {
    products = await prisma.product.findMany({ take: 12 });
  }
  if (products.length === 0) {
    throw new Error('No products found. Please run seed-official-plinth-data.ts first.');
  }

  // Fetch packaging materials
  const materials = await prisma.material.findMany({ take: 6 });

  // 4. Carriers and Services
  console.log('🚚 Registering Full Logistics & Carrier Partners...');
  const carriersData = [
    {
      code: 'BLUEDART',
      name: 'Blue Dart Express Ltd',
      mode: SalesShipmentMode.COURIER,
      trackingUrlTemplate: 'https://www.bluedart.com/tracking?track={awb}',
      adapterKey: 'bluedart-v1',
      services: [
        { code: 'APEX', name: 'Apex Air Priority (Next-Day)', estimatedTransitDays: 1, supportsCod: true },
        { code: 'SURFACE', name: 'Surface Cargo Expedited', estimatedTransitDays: 3, supportsCod: true },
      ],
    },
    {
      code: 'DELHIVERY',
      name: 'Delhivery Freight & Logistics',
      mode: SalesShipmentMode.COURIER,
      trackingUrlTemplate: 'https://www.delhivery.com/track/package/{awb}',
      adapterKey: 'delhivery-express',
      services: [
        { code: 'EXPRESS', name: 'Express Parcel Air', estimatedTransitDays: 2, supportsCod: true },
        { code: 'FTL', name: 'Delhivery Full Truckload (B2B)', estimatedTransitDays: 4, supportsCod: false },
      ],
    },
    {
      code: 'VRL_LOGISTICS',
      name: 'VRL Heavy Surface Logistics',
      mode: SalesShipmentMode.TRANSPORTER,
      trackingUrlTemplate: 'https://vrlgroup.in/track/{awb}',
      adapterKey: 'vrl-surface',
      services: [
        { code: 'B2B_HEAVY', name: 'Industrial B2B Pallet Transport', estimatedTransitDays: 4, supportsCod: false },
        { code: 'EXPRESS_CARGO', name: 'Express Linehaul Hub-to-Hub', estimatedTransitDays: 2, supportsCod: false },
      ],
    },
    {
      code: 'AMAZON_ATS',
      name: 'Amazon Shipping (ATS Inbound)',
      mode: SalesShipmentMode.MARKETPLACE,
      trackingUrlTemplate: 'https://track.amazon.in/tracking/{awb}',
      adapterKey: 'amazon-ats',
      services: [
        { code: 'FBA_INBOUND', name: 'FBA Inbound Pickup Standard', estimatedTransitDays: 2, supportsCod: false },
        { code: 'DIRECT_SHIP', name: 'Amazon EasyShip Priority', estimatedTransitDays: 1, supportsCod: true },
      ],
    },
    {
      code: 'PLINTH_FLEET',
      name: 'Plinth Dedicated Factory Fleet',
      mode: SalesShipmentMode.OWN_FLEET,
      trackingUrlTemplate: 'https://plintherp.internal/fleet/track/{awb}',
      adapterKey: 'plinth-internal-gps',
      services: [
        { code: 'DIRECT_VAN', name: 'Local City Express Van (Same Day)', estimatedTransitDays: 0, supportsCod: false },
        { code: 'DIRECT_TRUCK', name: 'Heavy 16-Ton Intra-State Truck', estimatedTransitDays: 1, supportsCod: false },
      ],
    },
    {
      code: 'TCI_FREIGHT',
      name: 'TCI Freight Logistics',
      mode: SalesShipmentMode.TRANSPORTER,
      trackingUrlTemplate: 'https://tcifreight.in/tracking/{awb}',
      adapterKey: 'tci-freight',
      services: [
        { code: 'FULL_LOAD', name: 'Full Truck Load Interstate', estimatedTransitDays: 5, supportsCod: false },
      ],
    },
  ];

  const seededCarriers: CarrierWithServices[] = [];
  for (const cData of carriersData) {
    const carrier = await prisma.salesCarrier.upsert({
      where: { code: cData.code },
      update: {
        name: cData.name,
        mode: cData.mode,
        trackingUrlTemplate: cData.trackingUrlTemplate,
        adapterKey: cData.adapterKey,
      },
      create: {
        code: cData.code,
        name: cData.name,
        mode: cData.mode,
        trackingUrlTemplate: cData.trackingUrlTemplate,
        adapterKey: cData.adapterKey,
        status: 'ACTIVE',
      },
    });

    for (const sData of cData.services) {
      await prisma.salesCarrierService.upsert({
        where: { carrierId_code: { carrierId: carrier.id, code: sData.code } },
        update: {
          name: sData.name,
          estimatedTransitDays: sData.estimatedTransitDays,
          supportsCod: sData.supportsCod,
        },
        create: {
          carrierId: carrier.id,
          code: sData.code,
          name: sData.name,
          estimatedTransitDays: sData.estimatedTransitDays,
          supportsCod: sData.supportsCod,
          status: 'ACTIVE',
        },
      });
    }

    const fullCarrier = await prisma.salesCarrier.findUnique({
      where: { id: carrier.id },
      include: { services: true },
    });
    if (fullCarrier) seededCarriers.push(fullCarrier);
  }

  // 5. Build Scenarios for all stages
  console.log('📋 Preparing Bulk Seed Scenarios across all Logistics & Dispatch stages...');

  const c_bharat = customers[0];
  const c_apex = customers[1] || customers[0];
  const c_northern = customers[2] || customers[0];
  const c_deccan = customers[3] || customers[0];
  const c_lt = customers[4] || customers[0];
  const c_tata = customers[5] || customers[0];
  const c_railway = customers[6] || customers[0];
  const c_amazon = customers[10] || customers[0];

  const p0 = products[0];
  const p1 = products[1] || products[0];
  const p2 = products[2] || products[0];
  const p3 = products[3] || products[0];
  const p4 = products[4] || products[0];
  const p5 = products[5] || products[0];

  interface ScenarioDef {
    orderNumber: string;
    channel: SalesOrderChannel;
    customer: typeof customers[0];
    status: SalesOrderStatus;
    paymentStatus: SalesPaymentStatus;
    allocationStatus: SalesAllocationStatus;
    items: Array<{ product: typeof products[0]; qty: number; rate: number; bin: string; lot: string }>;
    fulfillmentStatus: SalesFulfillmentStatus;
    pickStatus: SalesPickListStatus | null;
    pickProgress?: 'NONE' | 'PARTIAL' | 'COMPLETE';
    packageStatus: SalesPackageStatus | null;
    packageType?: string;
    boxDims?: { l: number; w: number; h: number; gross: number; net: number; tare: number };
    sealNumber?: string;
    shipmentStatus: SalesShipmentStatus | null;
    carrierCode?: string;
    serviceCode?: string;
    mode?: SalesShipmentMode;
    awb?: string;
    freightAmount?: number;
    codAmount?: number;
    vehicleNumber?: string;
    driverName?: string;
    driverPhone?: string;
    dispatchDock?: string;
    routeNotes?: string;
    handedOverToday?: boolean;
    handedOverDaysAgo?: number;
    isSlaBreach?: boolean;
    hasDeliveryAttempt?: boolean;
    deliveryAttemptOutcome?: string;
    deliveryAttemptReason?: string;
    hasPod?: boolean;
    podDetails?: {
      method: string;
      recipientName: string;
      otpReference: string;
      signatureUrl: string;
      photoUrls: string[];
      latitude: number;
      longitude: number;
    };
    isReturned?: boolean;
    returnReason?: string;
    returnRemarks?: string;
    returnDisposition?: 'RESTOCK' | 'QUARANTINE' | 'SCRAP';
  }

  const scenarios: ScenarioDef[] = [
    // ==========================================
    // STAGE 1: ALLOCATION WORKBENCH (3 orders)
    // ==========================================
    {
      orderNumber: 'SO-DISP-201',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_bharat,
      status: SalesOrderStatus.CONFIRMED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.NOT_STARTED,
      items: [
        { product: p0, qty: 30, rate: 4500, bin: 'BAY-A1-01', lot: 'LOT-2026-FG-101' },
        { product: p1, qty: 15, rate: 8200, bin: 'BAY-A1-02', lot: 'LOT-2026-FG-102' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PENDING_ALLOCATION,
      pickStatus: null,
      packageStatus: null,
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-202',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_apex,
      status: SalesOrderStatus.PARTIALLY_ALLOCATED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.PARTIALLY_ALLOCATED,
      items: [
        { product: p2, qty: 25, rate: 3200, bin: 'BAY-B2-01', lot: 'LOT-2026-FG-103' },
        { product: p3, qty: 10, rate: 14500, bin: 'BAY-B2-02', lot: 'LOT-2026-FG-104' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PARTIALLY_ALLOCATED,
      pickStatus: null,
      packageStatus: null,
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-203',
      channel: SalesOrderChannel.AMAZON,
      customer: c_amazon,
      status: SalesOrderStatus.CONFIRMED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.NOT_STARTED,
      items: [
        { product: p4, qty: 50, rate: 1200, bin: 'BAY-C1-01', lot: 'LOT-2026-FG-105' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PENDING_ALLOCATION,
      pickStatus: null,
      packageStatus: null,
      shipmentStatus: null,
    },

    // ==========================================
    // STAGE 2: PICKING WORKBENCH (3 orders)
    // ==========================================
    {
      orderNumber: 'SO-DISP-204',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_northern,
      status: SalesOrderStatus.PICKING,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p0, qty: 20, rate: 4500, bin: 'RACK-01-BIN-A', lot: 'LOT-2026-FG-201' },
        { product: p2, qty: 40, rate: 3200, bin: 'RACK-01-BIN-B', lot: 'LOT-2026-FG-202' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.ALLOCATED,
      pickStatus: SalesPickListStatus.ASSIGNED,
      pickProgress: 'NONE',
      packageStatus: null,
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-205',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_deccan,
      status: SalesOrderStatus.PICKING,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p1, qty: 12, rate: 8200, bin: 'RACK-02-BIN-C', lot: 'LOT-2026-FG-203' },
        { product: p3, qty: 8, rate: 14500, bin: 'RACK-02-BIN-D', lot: 'LOT-2026-FG-204' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PICKING,
      pickStatus: SalesPickListStatus.IN_PROGRESS,
      pickProgress: 'PARTIAL',
      packageStatus: null,
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-206',
      channel: SalesOrderChannel.AMAZON,
      customer: c_amazon,
      status: SalesOrderStatus.PARTIALLY_PICKED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p5, qty: 60, rate: 1800, bin: 'RACK-03-BIN-A', lot: 'LOT-2026-FG-205' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PARTIALLY_PICKED,
      pickStatus: SalesPickListStatus.PARTIALLY_PICKED,
      pickProgress: 'PARTIAL',
      packageStatus: null,
      shipmentStatus: null,
    },

    // ==========================================
    // STAGE 3: PACKAGING WORKSTATION (3 orders)
    // ==========================================
    {
      orderNumber: 'SO-DISP-207',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_lt,
      status: SalesOrderStatus.PICKED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p0, qty: 15, rate: 4500, bin: 'RACK-04-BIN-A', lot: 'LOT-2026-FG-301' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PICKED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.OPEN,
      packageType: 'CORRUGATED_HEAVY_DUTY_7PLY',
      boxDims: { l: 80, w: 50, h: 40, gross: 42.5, net: 40.0, tare: 2.5 },
      sealNumber: 'SEAL-PLINTH-OPEN-01',
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-208',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_tata,
      status: SalesOrderStatus.PACKING,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p1, qty: 18, rate: 8200, bin: 'RACK-04-BIN-B', lot: 'LOT-2026-FG-302' },
        { product: p4, qty: 30, rate: 1200, bin: 'RACK-04-BIN-C', lot: 'LOT-2026-FG-303' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PACKING,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.OPEN,
      packageType: 'EXPORT_GRADE_WOODEN_CRATE',
      boxDims: { l: 120, w: 80, h: 60, gross: 88.0, net: 75.0, tare: 13.0 },
      sealNumber: 'SEAL-PLINTH-OPEN-02',
      shipmentStatus: null,
    },
    {
      orderNumber: 'SO-DISP-209',
      channel: SalesOrderChannel.AMAZON,
      customer: c_amazon,
      status: SalesOrderStatus.PACKED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p2, qty: 22, rate: 3200, bin: 'RACK-05-BIN-A', lot: 'LOT-2026-FG-304' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.PACKING,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.SEALED,
      packageType: 'CORRUGATED_BOX_5PLY',
      boxDims: { l: 60, w: 40, h: 30, gross: 26.5, net: 25.0, tare: 1.5 },
      sealNumber: 'SEAL-PLINTH-SEALED-09',
      shipmentStatus: null,
    },

    // ==========================================
    // STAGE 4: DISPATCH STAGING & READY (3 orders)
    // ==========================================
    {
      orderNumber: 'SO-DISP-210',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_railway,
      status: SalesOrderStatus.READY_TO_DISPATCH,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p3, qty: 14, rate: 14500, bin: 'BAY-STAGING-01', lot: 'LOT-2026-FG-401' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.STAGED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.STAGED,
      packageType: 'INDUSTRIAL_PALLET_ENCASED',
      boxDims: { l: 120, w: 100, h: 110, gross: 145.0, net: 130.0, tare: 15.0 },
      sealNumber: 'SEAL-PLINTH-STAGE-10',
      shipmentStatus: SalesShipmentStatus.STAGED,
      carrierCode: 'BLUEDART',
      serviceCode: 'SURFACE',
      mode: SalesShipmentMode.COURIER,
      awb: 'BD-STG-2026-8801',
      freightAmount: 3450.0,
      codAmount: 0,
      vehicleNumber: 'MH-14-CW-1122',
      driverName: 'Sanjay Salunkhe',
      driverPhone: '+91 98221 55667',
      dispatchDock: 'DOCK-NORTH-01',
      routeNotes: 'Priority Heavy Commercial Delivery to Railway Yard',
    },
    {
      orderNumber: 'SO-DISP-211',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_bharat,
      status: SalesOrderStatus.READY_TO_DISPATCH,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p0, qty: 25, rate: 4500, bin: 'BAY-STAGING-02', lot: 'LOT-2026-FG-402' },
        { product: p1, qty: 10, rate: 8200, bin: 'BAY-STAGING-02', lot: 'LOT-2026-FG-403' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.STAGED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.STAGED,
      packageType: 'CORRUGATED_HEAVY_DUTY_7PLY',
      boxDims: { l: 75, w: 55, h: 45, gross: 48.0, net: 45.0, tare: 3.0 },
      sealNumber: 'SEAL-PLINTH-STAGE-11',
      shipmentStatus: SalesShipmentStatus.READY,
      carrierCode: 'DELHIVERY',
      serviceCode: 'FTL',
      mode: SalesShipmentMode.COURIER,
      awb: 'DLV-STG-2026-8802',
      freightAmount: 1850.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-PQ-9900',
      driverName: 'Ganesh More',
      driverPhone: '+91 97654 32109',
      dispatchDock: 'DOCK-EAST-02',
      routeNotes: 'Pune MIDC local factory delivery route',
    },
    {
      orderNumber: 'SO-DISP-212',
      channel: SalesOrderChannel.AMAZON,
      customer: c_amazon,
      status: SalesOrderStatus.READY_TO_DISPATCH,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p5, qty: 45, rate: 1800, bin: 'BAY-STAGING-03', lot: 'LOT-2026-FG-404' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.STAGED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.STAGED,
      packageType: 'CORRUGATED_BOX_5PLY',
      boxDims: { l: 50, w: 40, h: 35, gross: 22.0, net: 20.5, tare: 1.5 },
      sealNumber: 'SEAL-PLINTH-STAGE-12',
      shipmentStatus: SalesShipmentStatus.STAGED,
      carrierCode: 'AMAZON_ATS',
      serviceCode: 'DIRECT_SHIP',
      mode: SalesShipmentMode.MARKETPLACE,
      awb: 'ATS-STG-2026-8803',
      freightAmount: 750.0,
      codAmount: 0,
      vehicleNumber: 'MH-14-AT-4455',
      driverName: 'Mohsin Khan',
      driverPhone: '+91 99887 66554',
      dispatchDock: 'DOCK-AMAZON-01',
      routeNotes: 'Amazon Fulfilled EasyShip Bulk Intake Cage',
    },

    // ==========================================
    // STAGE 5: DISPATCHED SHIPMENTS (3 orders - Today & In-Transit)
    // ==========================================
    {
      orderNumber: 'SO-DISP-213',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_apex,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p1, qty: 16, rate: 8200, bin: 'BAY-DISP-01', lot: 'LOT-2026-FG-501' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DISPATCHED,
      packageType: 'CORRUGATED_HEAVY_DUTY_7PLY',
      boxDims: { l: 70, w: 50, h: 40, gross: 36.0, net: 34.0, tare: 2.0 },
      sealNumber: 'SEAL-PLINTH-DISP-13',
      shipmentStatus: SalesShipmentStatus.HANDED_OVER,
      carrierCode: 'BLUEDART',
      serviceCode: 'APEX',
      mode: SalesShipmentMode.COURIER,
      awb: 'BD-DISP-2026-9001',
      freightAmount: 2200.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-AB-3344',
      driverName: 'Anil Jadhav',
      driverPhone: '+91 98223 99881',
      dispatchDock: 'DOCK-NORTH-02',
      routeNotes: 'Handed over at 11:30 AM today; en-route Bangalore airport hub',
      handedOverToday: true,
    },
    {
      orderNumber: 'SO-DISP-214',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_northern,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p0, qty: 35, rate: 4500, bin: 'BAY-DISP-02', lot: 'LOT-2026-FG-502' },
        { product: p4, qty: 25, rate: 1200, bin: 'BAY-DISP-02', lot: 'LOT-2026-FG-503' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DISPATCHED,
      packageType: 'INDUSTRIAL_PALLET_ENCASED',
      boxDims: { l: 110, w: 90, h: 95, gross: 115.0, net: 102.0, tare: 13.0 },
      sealNumber: 'SEAL-PLINTH-DISP-14',
      shipmentStatus: SalesShipmentStatus.IN_TRANSIT,
      carrierCode: 'VRL_LOGISTICS',
      serviceCode: 'B2B_HEAVY',
      mode: SalesShipmentMode.TRANSPORTER,
      awb: 'VRL-DISP-2026-9002',
      freightAmount: 5600.0,
      codAmount: 0,
      vehicleNumber: 'KA-01-MJ-8765',
      driverName: 'Basavaraj Patil',
      driverPhone: '+91 94481 22334',
      dispatchDock: 'DOCK-TRANSPORTER-01',
      routeNotes: 'Heavy linehaul surface cargo dispatch across Maharashtra-Karnataka border',
      handedOverToday: true,
    },
    {
      orderNumber: 'SO-DISP-215',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_deccan,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p2, qty: 30, rate: 3200, bin: 'BAY-DISP-03', lot: 'LOT-2026-FG-504' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DISPATCHED,
      packageType: 'CORRUGATED_BOX_5PLY',
      boxDims: { l: 65, w: 45, h: 35, gross: 32.0, net: 30.5, tare: 1.5 },
      sealNumber: 'SEAL-PLINTH-DISP-15',
      shipmentStatus: SalesShipmentStatus.OUT_FOR_DELIVERY,
      carrierCode: 'PLINTH_FLEET',
      serviceCode: 'DIRECT_VAN',
      mode: SalesShipmentMode.OWN_FLEET,
      awb: 'FLT-DISP-2026-9003',
      freightAmount: 650.0,
      codAmount: 0,
      vehicleNumber: 'MH-14-EM-7788',
      driverName: 'Prakash Kamble',
      driverPhone: '+91 98500 11223',
      dispatchDock: 'DOCK-FLEET-01',
      routeNotes: 'Plinth factory direct delivery van out for final mile delivery',
      handedOverToday: true,
    },

    // ==========================================
    // STAGE 6: DELIVERY & POD (4 orders: Delivered, Attempt Failed, RTO, SLA Breach)
    // ==========================================
    {
      orderNumber: 'SO-DISP-216',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_lt,
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p3, qty: 10, rate: 14500, bin: 'BAY-DELIV-01', lot: 'LOT-2026-FG-601' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.COMPLETED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DELIVERED,
      packageType: 'INDUSTRIAL_PALLET_ENCASED',
      boxDims: { l: 120, w: 100, h: 100, gross: 125.0, net: 112.0, tare: 13.0 },
      sealNumber: 'SEAL-PLINTH-DELIV-16',
      shipmentStatus: SalesShipmentStatus.DELIVERED,
      carrierCode: 'VRL_LOGISTICS',
      serviceCode: 'B2B_HEAVY',
      mode: SalesShipmentMode.TRANSPORTER,
      awb: 'VRL-DELIV-2026-9101',
      freightAmount: 4800.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-LT-0099',
      driverName: 'Dnyaneshwar Shinde',
      driverPhone: '+91 98811 44556',
      dispatchDock: 'DOCK-TRANSPORTER-02',
      routeNotes: 'Consignment safely delivered to L&T heavy site receiving stores',
      handedOverDaysAgo: 2,
      hasPod: true,
      podDetails: {
        method: 'OTP_AND_DIGITAL_SIGNATURE',
        recipientName: 'Vikas Kulkarni (Site Stores Engineer)',
        otpReference: 'OTP-882910',
        signatureUrl: 'https://plintherp.internal/pod/sig-lt-site-216.png',
        photoUrls: [
          'https://plintherp.internal/pod/photo-site-gate-216.jpg',
          'https://plintherp.internal/pod/photo-pallet-unloaded-216.jpg',
        ],
        latitude: 18.52043,
        longitude: 73.85674,
      },
    },
    {
      orderNumber: 'SO-DISP-217',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_tata,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p1, qty: 14, rate: 8200, bin: 'BAY-DELIV-02', lot: 'LOT-2026-FG-602' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.SEALED,
      packageType: 'CORRUGATED_HEAVY_DUTY_7PLY',
      boxDims: { l: 65, w: 45, h: 35, gross: 31.0, net: 29.5, tare: 1.5 },
      sealNumber: 'SEAL-PLINTH-DELIV-17',
      shipmentStatus: SalesShipmentStatus.DELIVERY_FAILED,
      carrierCode: 'DELHIVERY',
      serviceCode: 'EXPRESS',
      mode: SalesShipmentMode.COURIER,
      awb: 'DLV-EXCP-2026-9102',
      freightAmount: 1450.0,
      codAmount: 0,
      vehicleNumber: 'MH-14-GH-2211',
      driverName: 'Suraj Thorat',
      driverPhone: '+91 97660 55443',
      dispatchDock: 'DOCK-EAST-01',
      routeNotes: 'Attempted delivery at consignee site; factory receiving bay gate closed',
      handedOverDaysAgo: 1,
      hasDeliveryAttempt: true,
      deliveryAttemptOutcome: 'RECIPIENT_UNAVAILABLE',
      deliveryAttemptReason: 'Factory receiving gate locked after 5:30 PM. Rescheduled for tomorrow 10:00 AM.',
    },
    {
      orderNumber: 'SO-DISP-218',
      channel: SalesOrderChannel.AMAZON,
      customer: c_amazon,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p5, qty: 20, rate: 1800, bin: 'BAY-DELIV-03', lot: 'LOT-2026-FG-603' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.SEALED,
      packageType: 'CORRUGATED_BOX_5PLY',
      boxDims: { l: 45, w: 35, h: 25, gross: 14.0, net: 13.0, tare: 1.0 },
      sealNumber: 'SEAL-PLINTH-DELIV-18',
      shipmentStatus: SalesShipmentStatus.RTO_INITIATED,
      carrierCode: 'AMAZON_ATS',
      serviceCode: 'DIRECT_SHIP',
      mode: SalesShipmentMode.MARKETPLACE,
      awb: 'ATS-RTO-2026-9103',
      freightAmount: 480.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-AT-9988',
      driverName: 'Rohan Gaikwad',
      driverPhone: '+91 98224 88771',
      dispatchDock: 'DOCK-AMAZON-02',
      routeNotes: 'Customer rejected package at doorstep due to box crease; return to origin',
      handedOverDaysAgo: 3,
      hasDeliveryAttempt: true,
      deliveryAttemptOutcome: 'CUSTOMER_REJECTED',
      deliveryAttemptReason: 'Customer refused delivery: Packaging corner creased during transit.',
    },
    {
      orderNumber: 'SO-DISP-219',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_railway,
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p0, qty: 40, rate: 4500, bin: 'BAY-DELIV-04', lot: 'LOT-2026-FG-604' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DISPATCHED,
      packageType: 'EXPORT_GRADE_WOODEN_CRATE',
      boxDims: { l: 130, w: 90, h: 80, gross: 110.0, net: 95.0, tare: 15.0 },
      sealNumber: 'SEAL-PLINTH-DELIV-19',
      shipmentStatus: SalesShipmentStatus.IN_TRANSIT,
      carrierCode: 'BLUEDART',
      serviceCode: 'SURFACE',
      mode: SalesShipmentMode.COURIER,
      awb: 'BD-SLA-2026-9104',
      freightAmount: 4100.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-WR-4455',
      driverName: 'Satish Mane',
      driverPhone: '+91 94220 77665',
      dispatchDock: 'DOCK-NORTH-01',
      routeNotes: 'Highway transit delay due to ghat maintenance; promised delivery time lapsed',
      handedOverDaysAgo: 5,
      isSlaBreach: true,
    },

    // ==========================================
    // STAGE 7: REVERSE LOGISTICS & RETURNS (2 orders)
    // ==========================================
    {
      orderNumber: 'SO-DISP-220',
      channel: SalesOrderChannel.PHYSICAL,
      customer: c_bharat,
      status: SalesOrderStatus.RETURNED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p1, qty: 10, rate: 8200, bin: 'BAY-RET-01', lot: 'LOT-2026-FG-701' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.COMPLETED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DELIVERED,
      packageType: 'CORRUGATED_HEAVY_DUTY_7PLY',
      boxDims: { l: 65, w: 45, h: 35, gross: 22.0, net: 20.0, tare: 2.0 },
      sealNumber: 'SEAL-PLINTH-RET-20',
      shipmentStatus: SalesShipmentStatus.DELIVERED,
      carrierCode: 'PLINTH_FLEET',
      serviceCode: 'DIRECT_VAN',
      mode: SalesShipmentMode.OWN_FLEET,
      awb: 'FLT-RET-2026-9201',
      freightAmount: 850.0,
      codAmount: 0,
      vehicleNumber: 'MH-14-EM-7788',
      driverName: 'Prakash Kamble',
      driverPhone: '+91 98500 11223',
      dispatchDock: 'DOCK-FLEET-01',
      routeNotes: 'Customer RMA return received at dock; awaiting quality inspection & disposition',
      handedOverDaysAgo: 4,
      isReturned: true,
      returnReason: 'DAMAGED_IN_TRANSIT',
      returnRemarks: 'Two cartons suffered hydraulic fluid leak in third-party carrier truck. Returned for scrap & credit refund.',
      returnDisposition: 'SCRAP',
    },
    {
      orderNumber: 'SO-DISP-221',
      channel: SalesOrderChannel.E_TRADE,
      customer: c_apex,
      status: SalesOrderStatus.CLOSED,
      paymentStatus: SalesPaymentStatus.REFUNDED,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      items: [
        { product: p2, qty: 15, rate: 3200, bin: 'BAY-RET-02', lot: 'LOT-2026-FG-702' },
      ],
      fulfillmentStatus: SalesFulfillmentStatus.COMPLETED,
      pickStatus: SalesPickListStatus.COMPLETED,
      pickProgress: 'COMPLETE',
      packageStatus: SalesPackageStatus.DELIVERED,
      packageType: 'CORRUGATED_BOX_5PLY',
      boxDims: { l: 55, w: 40, h: 30, gross: 16.5, net: 15.0, tare: 1.5 },
      sealNumber: 'SEAL-PLINTH-RET-21',
      shipmentStatus: SalesShipmentStatus.DELIVERED,
      carrierCode: 'BLUEDART',
      serviceCode: 'APEX',
      mode: SalesShipmentMode.COURIER,
      awb: 'BD-RET-2026-9202',
      freightAmount: 1200.0,
      codAmount: 0,
      vehicleNumber: 'MH-12-AB-3344',
      driverName: 'Anil Jadhav',
      driverPhone: '+91 98223 99881',
      dispatchDock: 'DOCK-NORTH-02',
      routeNotes: 'Customer return inspected, restocked into prime warehouse inventory, credit memo issued',
      handedOverDaysAgo: 7,
      isReturned: true,
      returnReason: 'ORDER_CANCELLED',
      returnRemarks: 'Customer project canceled specs. Items received unopened in pristine condition. Restocked.',
      returnDisposition: 'RESTOCK',
    },
  ];

  const stagedShipmentIdsForManifest: string[] = [];
  const allCreatedShipments: Array<{ id: string; shipmentNumber: string }> = [];

  for (const scen of scenarios) {
    const netAmount = scen.items.reduce((sum, item) => sum + item.qty * item.rate, 0);
    const taxAmount = netAmount * 0.18;
    const grandTotal = netAmount + taxAmount;

    // 5.1 Sales Order
    const order = await prisma.salesOrder.upsert({
      where: { orderNumber: scen.orderNumber },
      update: {
        status: scen.status,
        paymentStatus: scen.paymentStatus,
        allocationStatus: scen.allocationStatus,
        subtotal: netAmount,
        taxTotal: taxAmount,
        grandTotal: grandTotal,
      },
      create: {
        orderNumber: scen.orderNumber,
        customerId: scen.customer.id,
        channel: scen.channel,
        warehouseLocationId: warehouse.id,
        status: scen.status,
        paymentStatus: scen.paymentStatus,
        allocationStatus: scen.allocationStatus,
        accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
        currency: 'INR',
        subtotal: netAmount,
        taxTotal: taxAmount,
        grandTotal: grandTotal,
        createdByActorId: actorId,
        notes: `Enterprise Logistics Scenario for ${scen.orderNumber}`,
        addresses: {
          create: [
            {
              kind: 'SHIPPING',
              name: scen.customer.name,
              line1: 'Plot 42, Industrial Zone Stage 2',
              city: 'Pune',
              state: 'Maharashtra',
              postalCode: '411026',
              country: 'India',
              phone: scen.customer.contactPhone || '+91 98220 12345',
            },
            {
              kind: 'BILLING',
              name: scen.customer.name,
              line1: 'Corporate Finance Towers, Suite 800',
              city: 'Pune',
              state: 'Maharashtra',
              postalCode: '411001',
              country: 'India',
              phone: scen.customer.contactPhone || '+91 98220 12345',
            },
          ],
        },
      },
      include: { lines: true },
    });

    // Ensure Sales Order Lines
    const currentLines = await prisma.salesOrderLine.findMany({ where: { salesOrderId: order.id } });
    const orderLineIds: string[] = [];

    if (currentLines.length === 0) {
      for (const item of scen.items) {
        const lineNet = item.qty * item.rate;
        const lineTax = lineNet * 0.18;
        const createdLine = await prisma.salesOrderLine.create({
          data: {
            salesOrderId: order.id,
            productId: item.product.id,
            sku: item.product.sku,
            description: item.product.name,
            uomId: item.product.uomId,
            orderedQuantity: item.qty,
            allocatedQuantity: scen.allocationStatus === SalesAllocationStatus.FULLY_ALLOCATED ? item.qty : (scen.allocationStatus === SalesAllocationStatus.PARTIALLY_ALLOCATED ? Math.floor(item.qty / 2) : 0),
            pickedQuantity: scen.pickProgress === 'COMPLETE' ? item.qty : (scen.pickProgress === 'PARTIAL' ? Math.floor(item.qty / 2) : 0),
            packedQuantity: scen.packageStatus ? item.qty : 0,
            shippedQuantity: scen.shipmentStatus ? item.qty : 0,
            returnedQuantity: scen.isReturned ? item.qty : 0,
            unitPrice: item.rate,
            taxRate: 18.0,
            taxAmount: lineTax,
            lineTotal: lineNet + lineTax,
            status: scen.isReturned ? SalesOrderLineStatus.RETURNED : (scen.shipmentStatus ? SalesOrderLineStatus.FULFILLED : SalesOrderLineStatus.OPEN),
          },
        });
        orderLineIds.push(createdLine.id);
      }
    } else {
      for (const l of currentLines) {
        orderLineIds.push(l.id);
      }
    }

    // 5.2 Fulfillment Record
    const fulfillmentNumber = `FUL-${scen.orderNumber}`;
    const promisedShipAt = scen.isSlaBreach
      ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // breached SLA
      : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const fulfillment = await prisma.salesFulfillment.upsert({
      where: { fulfillmentNumber },
      update: {
        status: scen.fulfillmentStatus,
        priority: scen.isSlaBreach ? 'CRITICAL' : 'NORMAL',
        promisedShipAt,
      },
      create: {
        fulfillmentNumber,
        salesOrderId: order.id,
        warehouseLocationId: warehouse.id,
        status: scen.fulfillmentStatus,
        priority: scen.isSlaBreach ? 'CRITICAL' : 'NORMAL',
        promisedShipAt,
        createdByActorId: actorId,
      },
    });

    // 5.3 Order Allocations (for allocated or beyond)
    const existingAllocations = await prisma.salesOrderAllocation.findMany({ where: { salesOrderId: order.id } });
    const allocationIds: string[] = [];

    if (scen.allocationStatus !== SalesAllocationStatus.NOT_STARTED && existingAllocations.length === 0) {
      for (let i = 0; i < scen.items.length; i++) {
        const item = scen.items[i];
        const lineId = orderLineIds[i] || orderLineIds[0];
        const allocQty = scen.allocationStatus === SalesAllocationStatus.FULLY_ALLOCATED ? item.qty : Math.floor(item.qty / 2);
        if (allocQty > 0) {
          const alloc = await prisma.salesOrderAllocation.create({
            data: {
              salesOrderId: order.id,
              salesOrderLineId: lineId,
              productId: item.product.id,
              uomId: item.product.uomId,
              locationId: warehouse.id,
              quantity: allocQty,
              status: 'COMMITTED',
              lotId: item.lot,
              reservationId: `RES-${scen.orderNumber}-0${i + 1}`,
              createdById: actorId,
            },
          });
          allocationIds.push(alloc.id);
        }
      }
    } else {
      existingAllocations.forEach((a) => allocationIds.push(a.id));
    }

    // 5.4 Pick Lists
    let pickList: Prisma.SalesPickListGetPayload<{ include: { items: true } }> | null = null;
    if (scen.pickStatus) {
      const pickListNumber = `PICK-${scen.orderNumber}`;
      const startedAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const completedAt = scen.pickStatus === SalesPickListStatus.COMPLETED ? new Date(Date.now() - 2 * 60 * 60 * 1000) : null;

      await prisma.salesPickList.deleteMany({ where: { fulfillmentId: fulfillment.id } });

      pickList = await prisma.salesPickList.create({
        data: {
          pickListNumber,
          fulfillmentId: fulfillment.id,
          status: scen.pickStatus,
          startedAt,
          completedAt,
          createdByActorId: actorId,
          assignedToActorId: actorId,
          items: {
            create: scen.items.map((item, idx) => {
              const lineId = orderLineIds[idx] || orderLineIds[0];
              const allocId = allocationIds[idx] || null;
              const expectedQuantity = item.qty;
              const pickedQuantity =
                scen.pickProgress === 'COMPLETE'
                  ? item.qty
                  : scen.pickProgress === 'PARTIAL'
                  ? Math.floor(item.qty / 2)
                  : 0;

              return {
                salesOrderLineId: lineId,
                allocationId: allocId,
                expectedQuantity,
                pickedQuantity,
                binCode: item.bin,
                lotId: item.lot,
                lastScanValue: `BAR-${item.product.sku}`,
                pickedByActorId: actorId,
                pickedAt: pickedQuantity > 0 ? new Date() : null,
              };
            }),
          },
        },
        include: { items: true },
      });
    }

    // 5.5 Packaging Records
    let pkg: Prisma.SalesPackageGetPayload<{ include: { items: true } }> | null = null;
    if (scen.packageStatus) {
      const packageNumber = `PKG-${scen.orderNumber}-01`;
      const barcode = `BAR-PKG-${scen.orderNumber}-01`;
      const dims = scen.boxDims || { l: 60, w: 40, h: 30, gross: 15.0, net: 13.5, tare: 1.5 };

      await prisma.salesPackage.deleteMany({ where: { fulfillmentId: fulfillment.id } });

      pkg = await prisma.salesPackage.create({
        data: {
          packageNumber,
          fulfillmentId: fulfillment.id,
          packageType: scen.packageType || 'CORRUGATED_BOX_5PLY',
          status: scen.packageStatus,
          barcode,
          lengthCm: dims.l,
          widthCm: dims.w,
          heightCm: dims.h,
          grossWeightKg: dims.gross,
          netWeightKg: dims.net,
          tareWeightKg: dims.tare,
          sealNumber: scen.sealNumber || `SEAL-${scen.orderNumber}-01`,
          handlingInstructions: 'FRAGILE - KEEP UPRIGHT. AVOID MOISTURE.',
          photoUrls: ['https://plintherp.internal/packages/box-scan-photo.jpg'],
          sealedAt: scen.packageStatus !== SalesPackageStatus.OPEN ? new Date() : null,
          sealedByActorId: scen.packageStatus !== SalesPackageStatus.OPEN ? actorId : null,
          createdByActorId: actorId,
          items: {
            create: scen.items.map((item, idx) => ({
              salesOrderLineId: orderLineIds[idx] || orderLineIds[0],
              allocationId: allocationIds[idx] || null,
              lotId: item.lot,
              quantity: item.qty,
              scanValue: `BAR-${item.product.sku}`,
              packedByActorId: actorId,
              packedAt: new Date(),
            })),
          },
          ...(materials.length > 0
            ? {
                materialUsages: {
                  create: [
                    {
                      materialId: materials[0].id,
                      uomId: materials[0].uomId,
                      plannedQuantity: 1,
                      actualQuantity: 1,
                      recordedByActorId: actorId,
                    },
                  ],
                },
              }
            : {}),
        },
        include: { items: true },
      });
    }

    // 5.6 Shipments
    if (scen.shipmentStatus && pkg && scen.carrierCode && scen.awb) {
      const selectedCarrier = seededCarriers.find((c) => c.code === scen.carrierCode) || seededCarriers[0];
      const selectedService = selectedCarrier.services?.find((s) => s.code === scen.serviceCode) || selectedCarrier.services?.[0];

      const shipmentNumber = `SHP-${scen.orderNumber}`;
      const handedOverAt = scen.handedOverToday
        ? new Date(Date.now() - 3 * 60 * 60 * 1000)
        : scen.handedOverDaysAgo
        ? new Date(Date.now() - scen.handedOverDaysAgo * 24 * 60 * 60 * 1000)
        : null;

      const deliveredAt = scen.shipmentStatus === SalesShipmentStatus.DELIVERED
        ? new Date(Date.now() - 1 * 60 * 60 * 1000)
        : null;

      const expectedDeliveryAt = scen.isSlaBreach
        ? new Date(Date.now() - 24 * 60 * 60 * 1000) // in the past!
        : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

      await prisma.salesShipment.deleteMany({ where: { salesOrderId: order.id } });

      const shipment = await prisma.salesShipment.create({
        data: {
          shipmentNumber,
          salesOrderId: order.id,
          fulfillmentId: fulfillment.id,
          warehouseLocationId: warehouse.id,
          mode: scen.mode || selectedCarrier.mode,
          status: scen.shipmentStatus,
          carrierId: selectedCarrier.id,
          carrierServiceId: selectedService?.id,
          awbNumber: scen.awb,
          freightTerms: scen.codAmount && scen.codAmount > 0 ? 'COD' : 'PREPAID',
          freightAmount: scen.freightAmount || 1200.0,
          codAmount: scen.codAmount || 0,
          vehicleNumber: scen.vehicleNumber || 'MH-12-RN-8890',
          driverName: scen.driverName || 'Santosh Waghmare',
          driverPhone: scen.driverPhone || '+91 98900 33441',
          dispatchDock: scen.dispatchDock || 'DOCK-EAST-01',
          routeNotes: scen.routeNotes || 'Outbound consignment handling',
          pickupScheduledAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
          expectedDeliveryAt,
          handedOverAt,
          deliveredAt,
          createdByActorId: actorId,
          packages: {
            create: [
              {
                packageId: pkg.id,
                loadedAt: handedOverAt || new Date(),
                loadedByActorId: actorId,
              },
            ],
          },
          lines: {
            create: scen.items.map((item, idx) => ({
              salesOrderLineId: orderLineIds[idx] || orderLineIds[0],
              quantity: item.qty,
            })),
          },
        },
      });

      allCreatedShipments.push({ id: shipment.id, shipmentNumber: shipment.shipmentNumber });

      if (scen.shipmentStatus === SalesShipmentStatus.STAGED || scen.shipmentStatus === SalesShipmentStatus.READY) {
        stagedShipmentIdsForManifest.push(shipment.id);
      }

      // Mandatory Dispatch Compliance Documents
      await prisma.salesDispatchDocument.createMany({
        data: [
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.INVOICE,
            documentNumber: `INV-${scen.orderNumber}`,
            fileUrl: `https://plintherp.internal/docs/invoices/INV-${scen.orderNumber}.pdf`,
            metadata: {
              gstin: scen.customer.taxNumber,
              grandTotal,
              hsn: '73239390',
            },
            issuedAt: new Date(),
            uploadedByActorId: actorId,
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.PACKING_SLIP,
            documentNumber: `PS-${scen.orderNumber}`,
            fileUrl: `https://plintherp.internal/docs/packing-slips/PS-${scen.orderNumber}.pdf`,
            metadata: {
              packageCount: 1,
              grossWeightKg: pkg.grossWeightKg,
            },
            issuedAt: new Date(),
            uploadedByActorId: actorId,
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.SHIPPING_LABEL,
            documentNumber: `LBL-${scen.awb}`,
            fileUrl: `https://plintherp.internal/docs/labels/LBL-${scen.awb}.pdf`,
            metadata: {
              carrier: selectedCarrier.name,
              awb: scen.awb,
            },
            issuedAt: new Date(),
            uploadedByActorId: actorId,
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.GATE_PASS,
            documentNumber: `GP-${scen.orderNumber}`,
            fileUrl: `https://plintherp.internal/docs/gatepass/GP-${scen.orderNumber}.pdf`,
            metadata: {
              vehicleNumber: shipment.vehicleNumber,
              driverName: shipment.driverName,
            },
            issuedAt: new Date(),
            uploadedByActorId: actorId,
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.E_WAY_BILL,
            documentNumber: `EWB-2026-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
            fileUrl: `https://plintherp.internal/docs/eway/EWB-${scen.orderNumber}.pdf`,
            metadata: {
              validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            },
            issuedAt: new Date(),
            uploadedByActorId: actorId,
          },
        ],
      });

      // Tracking Events Timeline
      const trackingEventsData: Prisma.SalesTrackingEventCreateManyInput[] = [
        {
          shipmentId: shipment.id,
          status: SalesShipmentStatus.STAGED,
          source: SalesTrackingSource.SYSTEM,
          location: 'Plinth Central Fulfillment Hub, Pune',
          message: 'Consignment packed, weighed, compliance labels verified, and staged at outbound dock.',
          eventAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
          actorId,
        },
      ];

      if (handedOverAt) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.HANDED_OVER,
          source: SalesTrackingSource.CARRIER,
          location: 'Plinth Central Outbound Gate 02, Pune',
          message: `Vehicle ${shipment.vehicleNumber} cleared gate. Handed over to driver ${shipment.driverName} (${selectedCarrier.name}).`,
          eventAt: handedOverAt,
          actorId,
        });
      }

      if (
        scen.shipmentStatus === SalesShipmentStatus.IN_TRANSIT ||
        scen.shipmentStatus === SalesShipmentStatus.OUT_FOR_DELIVERY ||
        scen.shipmentStatus === SalesShipmentStatus.DELIVERED ||
        scen.shipmentStatus === SalesShipmentStatus.DELIVERY_FAILED ||
        scen.shipmentStatus === SalesShipmentStatus.RTO_INITIATED
      ) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.IN_TRANSIT,
          source: SalesTrackingSource.CARRIER,
          location: 'Regional Transshipment Gateway, Hub 4',
          message: 'Arrived at regional linehaul automated sorting center. Scanned on conveyor belt.',
          eventAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
          actorId,
        });
      }

      if (
        scen.shipmentStatus === SalesShipmentStatus.OUT_FOR_DELIVERY ||
        scen.shipmentStatus === SalesShipmentStatus.DELIVERED ||
        scen.shipmentStatus === SalesShipmentStatus.DELIVERY_FAILED
      ) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.OUT_FOR_DELIVERY,
          source: SalesTrackingSource.CARRIER,
          location: 'Last Mile Destination Courier Hub',
          message: `Dispatched in delivery van for final consignee handover. Delivery agent: ${shipment.driverName}.`,
          eventAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          actorId,
        });
      }

      if (scen.shipmentStatus === SalesShipmentStatus.DELIVERED) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.DELIVERED,
          source: SalesTrackingSource.CARRIER,
          location: 'Consignee Plant / Warehouse Receiving Dock',
          message: 'Package handed over to consignee receiving engineer. OTP and digital signature authenticated.',
          eventAt: deliveredAt || new Date(),
          actorId,
        });
      }

      if (scen.shipmentStatus === SalesShipmentStatus.DELIVERY_FAILED) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.DELIVERY_FAILED,
          source: SalesTrackingSource.CARRIER,
          location: 'Consignee Premise Gate',
          message: `Delivery attempt failed: ${scen.deliveryAttemptReason}`,
          eventAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          actorId,
        });
      }

      if (scen.shipmentStatus === SalesShipmentStatus.RTO_INITIATED) {
        trackingEventsData.push({
          shipmentId: shipment.id,
          status: SalesShipmentStatus.RTO_INITIATED,
          source: SalesTrackingSource.CARRIER,
          location: 'Destination Hub Return Desk',
          message: `Consignee rejected delivery: Return to Origin (RTO) initiated back to Pune Hub.`,
          eventAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          actorId,
        });
      }

      await prisma.salesTrackingEvent.createMany({
        data: trackingEventsData,
      });

      // Delivery Attempt Records
      if (scen.hasDeliveryAttempt) {
        await prisma.salesDeliveryAttempt.create({
          data: {
            shipmentId: shipment.id,
            outcome: scen.deliveryAttemptOutcome || 'RECIPIENT_UNAVAILABLE',
            failureReason: scen.deliveryAttemptReason || 'Premise closed during delivery attempt',
            nextAttemptAt: new Date(Date.now() + 18 * 60 * 60 * 1000),
            recipientName: scen.customer.name,
            notes: scen.routeNotes || 'Delivery driver reported security/gate issue.',
            actorId,
          },
        });
      }

      // Proof of Delivery Records
      if (scen.hasPod && scen.podDetails) {
        await prisma.salesProofOfDelivery.upsert({
          where: { shipmentId: shipment.id },
          update: {
            method: scen.podDetails.method,
            recipientName: scen.podDetails.recipientName,
            otpReference: scen.podDetails.otpReference,
            signatureUrl: scen.podDetails.signatureUrl,
            photoUrls: scen.podDetails.photoUrls,
            latitude: scen.podDetails.latitude,
            longitude: scen.podDetails.longitude,
            deliveredAt: deliveredAt || new Date(),
            capturedByActorId: actorId,
          },
          create: {
            shipmentId: shipment.id,
            method: scen.podDetails.method,
            recipientName: scen.podDetails.recipientName,
            otpReference: scen.podDetails.otpReference,
            signatureUrl: scen.podDetails.signatureUrl,
            photoUrls: scen.podDetails.photoUrls,
            latitude: scen.podDetails.latitude,
            longitude: scen.podDetails.longitude,
            deliveredAt: deliveredAt || new Date(),
            capturedByActorId: actorId,
          },
        });
      }
    }

    // 5.7 Reverse Logistics & Return Authorizations
    if (scen.isReturned) {
      // Create Sales Order Exception for RMA Return
      await prisma.salesOrderException.create({
        data: {
          salesOrderId: order.id,
          code: 'RETURN_REQUESTED',
          message: scen.returnRemarks || 'Customer RMA return authorization requested.',
          severity: 'WARNING',
          status: 'OPEN',
        },
      });

      // Create SalesFinancialReturn
      const retRecord = await prisma.salesFinancialReturn.create({
        data: {
          salesOrderId: order.id,
          status: scen.returnDisposition ? 'INSPECTED' : 'REQUESTED',
          currency: 'INR',
          occurredAt: new Date(),
          creditedNetAmount: netAmount,
          taxCreditAmount: taxAmount,
          sourceReference: `RMA-${scen.orderNumber}`,
          createdByActorId: actorId,
          lines: {
            create: scen.items.map((item, idx) => ({
              salesOrderLineId: orderLineIds[idx] || orderLineIds[0],
              quantity: item.qty,
            })),
          },
        },
      });
      console.log(`   ↩️ Seeded Return Authorization: ${retRecord.id} for ${scen.orderNumber}`);
    }
  }

  // 6. Seed Realistic Multi-Scenario Dispatch Manifests
  console.log('📜 Seeding Multiple Outbound Dispatch Manifests with Gatepasses & Driver Handovers...');

  const blueDartCarrier = seededCarriers.find((c) => c.code === 'BLUEDART') || seededCarriers[0];
  const delhiveryCarrier = seededCarriers.find((c) => c.code === 'DELHIVERY') || seededCarriers[1] || seededCarriers[0];
  const fleetCarrier = seededCarriers.find((c) => c.code === 'PLINTH_FLEET') || seededCarriers[0];

  const manifestsData = [
    {
      manifestNumber: 'MNF-2026-1001',
      carrierId: blueDartCarrier.id,
      vehicleNumber: 'MH-14-GA-5521',
      driverName: 'Santosh Waghmare',
      driverPhone: '+91 98900 33441',
      status: 'OPEN',
      packageCount: 4,
      totalWeightKg: 85.5,
      driverAcknowledgedAt: new Date(Date.now() - 30 * 60 * 1000),
      gateClearedAt: null as Date | null,
      shipmentNumbers: ['SHP-SO-DISP-210', 'SHP-SO-DISP-211'],
    },
    {
      manifestNumber: 'MNF-2026-1002',
      carrierId: delhiveryCarrier.id,
      vehicleNumber: 'MH-12-PQ-9900',
      driverName: 'Ganesh More',
      driverPhone: '+91 97654 32109',
      status: 'CLOSED',
      packageCount: 6,
      totalWeightKg: 142.0,
      driverAcknowledgedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      gateClearedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      shipmentNumbers: ['SHP-SO-DISP-213', 'SHP-SO-DISP-214'],
    },
    {
      manifestNumber: 'MNF-2026-1003',
      carrierId: fleetCarrier.id,
      vehicleNumber: 'MH-14-EM-7788',
      driverName: 'Prakash Kamble',
      driverPhone: '+91 98500 11223',
      status: 'CLOSED',
      packageCount: 3,
      totalWeightKg: 68.5,
      driverAcknowledgedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      gateClearedAt: new Date(Date.now() - 90 * 60 * 1000),
      shipmentNumbers: ['SHP-SO-DISP-215', 'SHP-SO-DISP-216'],
    },
  ];

  for (const mData of manifestsData) {
    const manifest = await prisma.salesDispatchManifest.upsert({
      where: { manifestNumber: mData.manifestNumber },
      update: {
        status: mData.status,
        packageCount: mData.packageCount,
        totalWeightKg: mData.totalWeightKg,
        driverAcknowledgedAt: mData.driverAcknowledgedAt,
        gateClearedAt: mData.gateClearedAt,
      },
      create: {
        manifestNumber: mData.manifestNumber,
        warehouseLocationId: warehouse.id,
        carrierId: mData.carrierId,
        vehicleNumber: mData.vehicleNumber,
        driverName: mData.driverName,
        driverPhone: mData.driverPhone,
        status: mData.status,
        packageCount: mData.packageCount,
        totalWeightKg: mData.totalWeightKg,
        driverAcknowledgedAt: mData.driverAcknowledgedAt,
        gateClearedAt: mData.gateClearedAt,
        createdByActorId: actorId,
        closedByActorId: mData.status === 'CLOSED' ? actorId : null,
      },
    });

    for (const shpNum of mData.shipmentNumbers) {
      const found = allCreatedShipments.find((s) => s.shipmentNumber === shpNum);
      if (found) {
        await prisma.salesManifestShipment.upsert({
          where: { manifestId_shipmentId: { manifestId: manifest.id, shipmentId: found.id } },
          update: {},
          create: {
            manifestId: manifest.id,
            shipmentId: found.id,
          },
        });
      }
    }
  }

  console.log('✅ Logistics & Dispatch Seed Completed Successfully!');
  console.log('✨ Seeded:');
  console.log('   - 6 Logistics Carriers with active shipping services');
  console.log(`   - ${scenarios.length} End-to-End Sales Orders populated across all stages:`);
  console.log('       • Stage 1: Allocation Workbench (Pending & Partial Allocations)');
  console.log('       • Stage 2: Picking Workbench (Assigned, In-Progress, Barcoded Bins & Lots)');
  console.log('       • Stage 3: Packaging Workstation (Open/Sealed Boxes, Pallets, Crates & Weights)');
  console.log('       • Stage 4: Dispatch Staging (Staged Consignments, Carrier Docks & E-Way Bills)');
  console.log('       • Stage 5: Dispatched Shipments (Today Handover, Live In-Transit, Linehauls)');
  console.log('       • Stage 6: Delivery & POD (Delivered with Signatures/OTPs, Failed Delivery Attempts, SLA Breaches, RTO)');
  console.log('       • Stage 7: Reverse Logistics & Returns (RMA exceptions, Quality Dispositions)');
  console.log('   - 3 Outbound Dispatch Manifests (Open Staging, Cleared Gates with Security Acknowledgments)');
}

if (require.main === module) {
  seedLogisticsDispatch()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('❌ Error during Logistics seed:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
