import {
  PrismaClient,
  SalesShipmentMode,
  SalesShipmentStatus,
  SalesFulfillmentStatus,
  SalesPickListStatus,
  SalesPackageStatus,
  SalesOrderStatus,
  SalesPaymentStatus,
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
  console.log('📦 Seeding Realistic Logistics & Dispatch Module Data...');
  console.log('🚚 ========================================================');

  const admin = await prisma.user.findFirst({
    where: {
      OR: [{ role: 'admin' }, { email: 'admin@plintherp.com' }],
    },
  });

  const actorId = admin?.id || 'sys-admin-actor';

  // 1. Warehouse Location
  let warehouse = await prisma.warehouseLocation.findFirst({
    where: { status: LifecycleStatus.ACTIVE },
  });

  if (!warehouse) {
    warehouse = await prisma.warehouseLocation.create({
      data: {
        code: 'WH-MAIN-01',
        name: 'Plinth Central Distribution Hub (Pune)',
        type: 'WAREHOUSE',
        status: LifecycleStatus.ACTIVE,
      },
    });
  }

  // 2. Customers
  let customers = await prisma.customer.findMany({ take: 5 });
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
  // 3. Products
  let products = await prisma.product.findMany({
    where: { status: LifecycleStatus.ACTIVE },
    take: 6,
  });
  if (products.length === 0) {
    products = await prisma.product.findMany({ take: 6 });
  }
  if (products.length === 0) {
    throw new Error('No products found. Please run seed-official-plinth-data.ts first.');
  }
  const carriersData = [
    {
      code: 'BLUEDART',
      name: 'Blue Dart Express Ltd',
      mode: SalesShipmentMode.COURIER,
      trackingUrlTemplate: 'https://www.bluedart.com/tracking?track={awb}',
      adapterKey: 'bluedart-v1',
      services: [
        { code: 'APEX', name: 'Apex Air Priority', estimatedTransitDays: 1, supportsCod: true },
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

  // 5. Seed Realistic Orders across Fulfillment Pipeline stages:
  console.log('📋 Seeding Sales Orders across all Fulfillment Pipeline stages...');

  const orderTemplates = [
    {
      orderNumber: 'SO-DISP-101',
      channel: SalesOrderChannel.PHYSICAL,
      customer: customers[0],
      product: products[0],
      qty: 25,
      rate: 4500,
      fulfillmentStatus: SalesFulfillmentStatus.PENDING_ALLOCATION,
      pickStatus: null as SalesPickListStatus | null,
      packageStatus: null as SalesPackageStatus | null,
      shipmentStatus: null as SalesShipmentStatus | null,
      awb: null as string | null,
      carrierCode: null as string | null,
      hasException: false,
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-102',
      channel: SalesOrderChannel.E_TRADE,
      customer: customers[1] || customers[0],
      product: products[1] || products[0],
      qty: 10,
      rate: 12500,
      fulfillmentStatus: SalesFulfillmentStatus.PICKING,
      pickStatus: SalesPickListStatus.IN_PROGRESS,
      packageStatus: null as SalesPackageStatus | null,
      shipmentStatus: null as SalesShipmentStatus | null,
      awb: null as string | null,
      carrierCode: null as string | null,
      hasException: false,
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-103',
      channel: SalesOrderChannel.STORE_POS,
      customer: customers[0],
      product: products[0],
      qty: 50,
      rate: 3800,
      fulfillmentStatus: SalesFulfillmentStatus.PICKED,
      pickStatus: SalesPickListStatus.COMPLETED,
      packageStatus: null as SalesPackageStatus | null,
      shipmentStatus: null as SalesShipmentStatus | null,
      awb: null as string | null,
      carrierCode: null as string | null,
      hasException: false,
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-104',
      channel: SalesOrderChannel.PHYSICAL,
      customer: customers[1] || customers[0],
      product: products[1] || products[0],
      qty: 15,
      rate: 18500,
      fulfillmentStatus: SalesFulfillmentStatus.STAGED,
      pickStatus: SalesPickListStatus.COMPLETED,
      packageStatus: SalesPackageStatus.SEALED,
      shipmentStatus: SalesShipmentStatus.STAGED,
      awb: 'BLUEDART-882910401',
      carrierCode: 'BLUEDART',
      hasException: false,
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-105',
      channel: SalesOrderChannel.PHYSICAL,
      customer: customers[0],
      product: products[0],
      qty: 8,
      rate: 5200,
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      packageStatus: SalesPackageStatus.SEALED,
      shipmentStatus: SalesShipmentStatus.IN_TRANSIT,
      awb: 'DLV-992381205',
      carrierCode: 'DELHIVERY',
      hasException: false,
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-106',
      channel: SalesOrderChannel.PHYSICAL,
      customer: customers[1] || customers[0],
      product: products[1] || products[0],
      qty: 4,
      rate: 22000,
      fulfillmentStatus: SalesFulfillmentStatus.DISPATCHED,
      pickStatus: SalesPickListStatus.COMPLETED,
      packageStatus: SalesPackageStatus.SEALED,
      shipmentStatus: SalesShipmentStatus.OUT_FOR_DELIVERY,
      hasException: true,
      awb: 'PLINTH-FL-009182',
      carrierCode: 'PLINTH_FLEET',
      hasPod: false,
    },
    {
      orderNumber: 'SO-DISP-107',
      channel: SalesOrderChannel.PHYSICAL,
      customer: customers[0],
      product: products[0],
      qty: 20,
      rate: 4500,
      fulfillmentStatus: SalesFulfillmentStatus.COMPLETED,
      pickStatus: SalesPickListStatus.COMPLETED,
      packageStatus: SalesPackageStatus.DELIVERED,
      shipmentStatus: SalesShipmentStatus.DELIVERED,
      awb: 'VRL-MAH-771920',
      carrierCode: 'VRL_LOGISTICS',
      hasException: false,
      hasPod: true,
    },
  ];

  const stagedShipmentsForManifest: string[] = [];

  for (const tpl of orderTemplates) {
    const netAmount = tpl.qty * tpl.rate;
    const taxAmount = netAmount * 0.18;
    const grandTotal = netAmount + taxAmount;

    // 5.1 Sales Order
    const order = await prisma.salesOrder.upsert({
      where: { orderNumber: tpl.orderNumber },
      update: {},
      create: {
        orderNumber: tpl.orderNumber,
        customerId: tpl.customer.id,
        channel: tpl.channel,
        warehouseLocationId: warehouse.id,
        status: SalesOrderStatus.CONFIRMED,
        paymentStatus: SalesPaymentStatus.PAID,
        currency: 'INR',
        subtotal: netAmount,
        taxTotal: taxAmount,
        grandTotal: grandTotal,
        createdByActorId: actorId,
        addresses: {
          create: [
            {
              kind: 'SHIPPING',
              name: tpl.customer.name,
              line1: 'Industrial Area MIDC, Plot 42',
              city: 'Pune',
              state: 'Maharashtra',
              postalCode: '411026',
              country: 'IN',
              phone: tpl.customer.contactPhone || '+91 98220 12345',
            },
            {
              kind: 'BILLING',
              name: tpl.customer.name,
              line1: 'Industrial Area MIDC, Plot 42',
              city: 'Pune',
              state: 'Maharashtra',
              postalCode: '411026',
              country: 'IN',
              phone: tpl.customer.contactPhone || '+91 98220 12345',
            },
          ],
        },
        lines: {
          create: [
            {
              productId: tpl.product.id,
              sku: tpl.product.sku,
              description: tpl.product.name,
              uomId: tpl.product.uomId,
              orderedQuantity: tpl.qty,
              allocatedQuantity: tpl.fulfillmentStatus !== SalesFulfillmentStatus.PENDING_ALLOCATION ? tpl.qty : 0,
              pickedQuantity: tpl.pickStatus === SalesPickListStatus.COMPLETED ? tpl.qty : 0,
              packedQuantity: tpl.packageStatus ? tpl.qty : 0,
              shippedQuantity: tpl.shipmentStatus ? tpl.qty : 0,
              unitPrice: tpl.rate,
              taxRate: 18,
              lineTotal: grandTotal,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const orderLine = order.lines[0];

    // 5.2 Fulfillment Record
    const fulfillmentNumber = `FUL-${tpl.orderNumber}`;
    const fulfillment = await prisma.salesFulfillment.upsert({
      where: {
        fulfillmentNumber,
      },
      update: {
        status: tpl.fulfillmentStatus,
      },
      create: {
        fulfillmentNumber,
        salesOrderId: order.id,
        warehouseLocationId: warehouse.id,
        status: tpl.fulfillmentStatus,
        promisedShipAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        createdByActorId: actorId,
      },
    });

    // 5.3 Order Allocation (if past stage 1)
    let allocation: Prisma.SalesOrderAllocationGetPayload<Record<string, never>> | null = null;
    if (tpl.fulfillmentStatus !== SalesFulfillmentStatus.PENDING_ALLOCATION) {
      allocation = await prisma.salesOrderAllocation.create({
        data: {
          salesOrderId: order.id,
          salesOrderLineId: orderLine.id,
          productId: tpl.product.id,
          uomId: tpl.product.uomId,
          locationId: warehouse.id,
          quantity: tpl.qty,
          status: 'COMMITTED',
          lotId: 'LOT-2026-B01',
          createdById: actorId,
        },
      });
    }

    // 5.4 Pick List (if in picking or beyond)
    let pickList: Prisma.SalesPickListGetPayload<{ include: { items: true } }> | null = null;
    if (tpl.pickStatus) {
      pickList = await prisma.salesPickList.upsert({
        where: { pickListNumber: `PICK-${tpl.orderNumber}` },
        update: { status: tpl.pickStatus },
        create: {
          pickListNumber: `PICK-${tpl.orderNumber}`,
          fulfillmentId: fulfillment.id,
          status: tpl.pickStatus,
          startedAt: new Date(),
          completedAt: tpl.pickStatus === SalesPickListStatus.COMPLETED ? new Date() : null,
          createdByActorId: actorId,
          assignedToActorId: actorId,
          items: {
            create: [
              {
                salesOrderLineId: orderLine.id,
                allocationId: allocation?.id,
                expectedQuantity: tpl.qty,
                pickedQuantity: 0,
                binCode: 'A1-R02-B04',
                lotId: 'LOT-2026-B01',
                pickedByActorId: actorId,
              },
            ],
          },
        },
        include: { items: true },
      });
    }

    // 5.5 Sealed Package (if in packing or beyond)
    let pkg: Prisma.SalesPackageGetPayload<{ include: { items: true } }> | null = null;
    if (tpl.packageStatus) {
      pkg = await prisma.salesPackage.upsert({
        where: { packageNumber: `PKG-${tpl.orderNumber}-01` },
        update: { status: tpl.packageStatus },
        create: {
          packageNumber: `PKG-${tpl.orderNumber}-01`,
          fulfillmentId: fulfillment.id,
          packageType: 'CORRUGATED_BOX_5PLY',
          status: tpl.packageStatus,
          barcode: `BAR-PKG-${tpl.orderNumber}`,
          lengthCm: 45.0,
          widthCm: 35.0,
          heightCm: 25.0,
          grossWeightKg: tpl.qty * 1.5 + 0.8,
          netWeightKg: tpl.qty * 1.5,
          tareWeightKg: 0.8,
          sealNumber: `SEAL-PLINTH-${tpl.orderNumber.slice(-3)}`,
          handlingInstructions: 'FRAGILE - HANDLE WITH CARE. KEEP DRY.',
          sealedAt: new Date(),
          sealedByActorId: actorId,
          createdByActorId: actorId,
          items: {
            create: [
              {
                salesOrderLineId: orderLine.id,
                allocationId: allocation?.id,
                quantity: tpl.qty,
                packedByActorId: actorId,
                packedAt: new Date(),
              },
            ],
          },
        },
        include: { items: true },
      });
    }

    // 5.6 Shipment Record (if staged, in transit, or delivered)
    if (tpl.shipmentStatus && pkg && tpl.carrierCode && tpl.awb) {
      const selectedCarrier = seededCarriers.find((c) => c.code === tpl.carrierCode) || seededCarriers[0];
      const selectedService = selectedCarrier.services?.[0];

      const shipment = await prisma.salesShipment.upsert({
        where: { shipmentNumber: `SHP-${tpl.orderNumber}` },
        update: { status: tpl.shipmentStatus },
        create: {
          shipmentNumber: `SHP-${tpl.orderNumber}`,
          salesOrderId: order.id,
          fulfillmentId: fulfillment.id,
          warehouseLocationId: warehouse.id,
          mode: selectedCarrier.mode,
          status: tpl.shipmentStatus,
          carrierId: selectedCarrier.id,
          carrierServiceId: selectedService?.id,
          awbNumber: tpl.awb,
          freightTerms: 'PREPAID',
          freightAmount: 850.0,
          vehicleNumber: 'MH-12-RN-8890',
          driverName: 'Rameshwar Shinde',
          driverPhone: '+91 94220 88910',
          dispatchDock: 'DOCK-EAST-02',
          pickupScheduledAt: new Date(),
          handedOverAt: tpl.shipmentStatus !== SalesShipmentStatus.STAGED ? new Date() : null,
          deliveredAt: tpl.shipmentStatus === SalesShipmentStatus.DELIVERED ? new Date() : null,
          createdByActorId: actorId,
          packages: {
            create: [
              {
                packageId: pkg.id,
                loadedAt: new Date(),
                loadedByActorId: actorId,
              },
            ],
          },
          lines: {
            create: [
              {
                salesOrderLineId: orderLine.id,
                quantity: tpl.qty,
              },
            ],
          },
        },
      });

      if (tpl.shipmentStatus === SalesShipmentStatus.STAGED) {
        stagedShipmentsForManifest.push(shipment.id);
      }

      // Mandatory Dispatch Documents: Invoice, Packing Slip, Shipping Label
      await prisma.salesDispatchDocument.createMany({
        data: [
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.INVOICE,
            documentNumber: `INV-${tpl.orderNumber}`,
            fileUrl: `https://plintherp.internal/docs/invoices/INV-${tpl.orderNumber}.pdf`,
            issuedAt: new Date(),
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.PACKING_SLIP,
            documentNumber: `PS-${tpl.orderNumber}`,
            fileUrl: `https://plintherp.internal/docs/packing-slips/PS-${tpl.orderNumber}.pdf`,
            issuedAt: new Date(),
          },
          {
            salesOrderId: order.id,
            shipmentId: shipment.id,
            type: SalesDispatchDocumentType.SHIPPING_LABEL,
            documentNumber: `LBL-${tpl.awb}`,
            fileUrl: `https://plintherp.internal/docs/labels/LBL-${tpl.awb}.pdf`,
            issuedAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });

      // Tracking Events
      await prisma.salesTrackingEvent.createMany({
        data: [
          {
            shipmentId: shipment.id,
            status: SalesShipmentStatus.STAGED,
            source: SalesTrackingSource.SYSTEM,
            location: 'Plinth Central Warehouse Dock 2, Pune',
            message: 'Shipment packaged, labeled, and staged at outbound loading dock',
            eventAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
          },
          ...(tpl.shipmentStatus !== SalesShipmentStatus.STAGED
            ? [
                {
                  shipmentId: shipment.id,
                  status: SalesShipmentStatus.HANDED_OVER,
                  source: SalesTrackingSource.CARRIER,
                  location: 'Pune Central Transshipment Hub',
                  message: `Cargo handed over to carrier ${selectedCarrier.name}. Vehicle MH-12-RN-8890 departed.`,
                  eventAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                },
              ]
            : []),
          ...(tpl.shipmentStatus === SalesShipmentStatus.IN_TRANSIT || tpl.shipmentStatus === SalesShipmentStatus.OUT_FOR_DELIVERY || tpl.shipmentStatus === SalesShipmentStatus.DELIVERED
            ? [
                {
                  shipmentId: shipment.id,
                  status: SalesShipmentStatus.IN_TRANSIT,
                  source: SalesTrackingSource.CARRIER,
                  location: 'Hub Sorting Facility, Bangalore',
                  message: 'Arrived at destination gateway sorting hub.',
                  eventAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
                },
              ]
            : []),
        ],
        skipDuplicates: true,
      });

      // Delivery Exception (for testing stage 6)
      if (tpl.hasException) {
        await prisma.salesDeliveryAttempt.create({
          data: {
            shipmentId: shipment.id,
            outcome: 'CUSTOMER_UNAVAILABLE',
            failureReason: 'Gate closed / Factory security required revised gate pass before 6 PM',
            nextAttemptAt: new Date(Date.now() + 18 * 60 * 60 * 1000),
            recipientName: 'Security Officer Deshmukh',
            notes: 'Consignee plant manager contacted; rescheduled for 10:00 AM next morning.',
            actorId,
          },
        });
      }

      // Proof of Delivery (for testing completed stage)
      if (tpl.hasPod) {
        await prisma.salesProofOfDelivery.upsert({
          where: { shipmentId: shipment.id },
          update: {},
          create: {
            shipmentId: shipment.id,
            method: 'OTP_AND_SIGNATURE',
            recipientName: 'Kishore Patil (Stores In-charge)',
            otpReference: 'OTP-982114',
            signatureUrl: 'https://plintherp.internal/pod/sig-99281.png',
            photoUrls: ['https://plintherp.internal/pod/photo-unloading-dock-01.jpg'],
            latitude: 18.5204,
            longitude: 73.8567,
            deliveredAt: new Date(Date.now() - 30 * 60 * 1000),
            capturedByActorId: actorId,
          },
        });
      }
    }
  }

  // 6. Seed Dispatch Manifest
  console.log('📜 Seeding Sales Dispatch Manifest with Gatepass & Driver Handover...');
  const blueDartCarrier = seededCarriers.find((c) => c.code === 'BLUEDART') || seededCarriers[0];

  const manifest = await prisma.salesDispatchManifest.upsert({
    where: { manifestNumber: 'MNF-2026-1001' },
    update: {},
    create: {
      manifestNumber: 'MNF-2026-1001',
      warehouseLocationId: warehouse.id,
      carrierId: blueDartCarrier.id,
      vehicleNumber: 'MH-14-GA-5521',
      driverName: 'Santosh Waghmare',
      driverPhone: '+91 98900 33441',
      status: 'OPEN',
      packageCount: 3,
      totalWeightKg: 42.5,
      createdByActorId: actorId,
      driverAcknowledgedAt: new Date(),
    },
  });

  for (const shpId of stagedShipmentsForManifest) {
    await prisma.salesManifestShipment.upsert({
      where: { manifestId_shipmentId: { manifestId: manifest.id, shipmentId: shpId } },
      update: {},
      create: {
        manifestId: manifest.id,
        shipmentId: shpId,
      },
    });
  }

  console.log('✅ Logistics & Dispatch Seed Completed Successfully!');
  console.log('✨ Seeded:');
  console.log('   - 5 Logistics Carriers & Freight Services');
  console.log('   - 7 Comprehensive Sales Orders in Allocation, Picking, Packing, Staging, In-Transit & POD');
  console.log('   - 1 Live Outbound Dispatch Manifest (MNF-2026-1001)');
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
