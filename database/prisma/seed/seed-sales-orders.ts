import {
  PrismaClient,
  SalesOrderChannel,
  SalesOrderStatus,
  SalesPaymentStatus,
  SalesAllocationStatus,
  SalesAccountingStatus,
  SalesOrderLineStatus,
  SalesApprovalDecision,
  SalesExceptionSeverity,
  SalesExceptionStatus,
  SalesFulfillmentStatus,
  SalesShipmentMode,
  SalesShipmentStatus,
  SalesDispatchDocumentType,
  SalesPackageStatus,
  LifecycleStatus
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Seeding comprehensive Sales & Orders module data...');

  // 1. Fetch Key System References
  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@plinth.example' },
  });
  if (!adminUser) throw new Error('Admin user not found');

  const fgLocation = await prisma.warehouseLocation.findFirst({
    where: { code: 'FINISHED-GOODS' },
  });
  if (!fgLocation) throw new Error('Finished goods warehouse location not found');

  const carriers = await prisma.salesCarrier.findMany();
  const delhivery = carriers.find((c) => c.code === 'DELHIVERY') || carriers[0];
  const bluedart = carriers.find((c) => c.code === 'BLUEDART') || carriers[1] || carriers[0];

  // 2. Fetch Positive Finished Goods Inventory
  const fgBalances = await prisma.inventoryBalance.findMany({
    where: {
      locationId: fgLocation.id,
      quantity: { gt: 0 },
    },
    take: 60,
  });

  const productIds = fgBalances.map((b) => b.itemId);
  const fgProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (fgProducts.length === 0) {
    throw new Error('No finished goods products found with positive balance');
  }

  console.log(`📦 Found ${fgProducts.length} finished goods products ready for sales orders.`);

  // 3. Upsert Sales Channels
  const channelsData = [
    {
      code: 'STORE_POS',
      name: 'Plinth Store POS Counter',
      description: 'Direct In-Store POS checkout counter and retail walk-in fulfillment',
      status: LifecycleStatus.ACTIVE,
      currency: 'INR',
    },
    {
      code: 'AMAZON_IN',
      name: 'Amazon India Marketplace',
      description: 'Amazon.in Seller Central direct API sync and FBA/EasyShip fulfillment',
      status: LifecycleStatus.ACTIVE,
      currency: 'INR',
    },
    {
      code: 'DEALER_DIRECT',
      name: 'B2B Regional Dealer & Distributor Network',
      description: 'Direct wholesale network servicing regional industrial hardware dealers and fabricators',
      status: LifecycleStatus.ACTIVE,
      currency: 'INR',
    },
    {
      code: 'ETRADE_PORTAL',
      name: 'Plinth Corporate E-Commerce Portal',
      description: 'B2B/B2C direct online enterprise order booking and quotation engine',
      status: LifecycleStatus.ACTIVE,
      currency: 'INR',
    },
  ];

  const channelMap = new Map<string, any>();
  for (const ch of channelsData) {
    const upserted = await prisma.salesChannel.upsert({
      where: { code: ch.code },
      update: {
        name: ch.name,
        description: ch.description,
        status: ch.status,
        currency: ch.currency,
      },
      create: {
        code: ch.code,
        name: ch.name,
        description: ch.description,
        status: ch.status,
        currency: ch.currency,
      },
    });
    channelMap.set(ch.code, upserted);
  }
  console.log(`✅ Upserted ${channelMap.size} sales channels.`);

  // 4. Upsert Comprehensive Customers & Dealers
  const customersList = [
    {
      code: 'CUST-DEALER-001',
      name: 'Mahavir Industrial Hardware & Tools',
      customerType: 'DEALER',
      contactEmail: 'orders@mahavirhardware.in',
      contactPhone: '+91 98201 44552',
      taxNumber: '27AAACM1234F1Z5',
      creditLimit: 1500000,
      creditPeriodDays: 45,
      paymentTerms: 'NET 45 Days',
      contactPerson: 'Kantilal Shah',
      billingAddress: {
        customerType: 'DEALER',
        contactPerson: 'Kantilal Shah',
        line1: 'Plot 44, GIDC Industrial Estate Phase 2',
        line2: 'Near Narmada Canal Road',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '382445',
        country: 'IN',
        panNumber: 'AAACM1234F',
        creditPeriodDays: 45,
      },
      shippingAddress: {
        contactPerson: 'Warehouse Incharge - Prakash',
        line1: 'Central Depot, Shed 12, GIDC Phase 2',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '382445',
        country: 'IN',
      },
    },
    {
      code: 'CUST-DEALER-002',
      name: 'Apex Fasteners & Heavy Piping Corp',
      customerType: 'DEALER',
      contactEmail: 'sales@apexfasteners.com',
      contactPhone: '+91 98112 33441',
      taxNumber: '07AABCA5432K1Z9',
      creditLimit: 2500000,
      creditPeriodDays: 60,
      paymentTerms: 'NET 60 Days',
      contactPerson: 'Virender Oberoi',
      billingAddress: {
        customerType: 'DEALER',
        contactPerson: 'Virender Oberoi',
        line1: 'Shop 104-106, Iron Market, Naraina Industrial Area Phase 1',
        city: 'New Delhi',
        state: 'Delhi',
        postalCode: '110028',
        country: 'IN',
        panNumber: 'AABCA5432K',
        creditPeriodDays: 60,
      },
      shippingAddress: {
        contactPerson: 'Virender Oberoi',
        line1: 'Naraina Iron Hub Shed 4B',
        city: 'New Delhi',
        state: 'Delhi',
        postalCode: '110028',
        country: 'IN',
      },
    },
    {
      code: 'CUST-DIST-001',
      name: 'Northern Steel & Engineering Distributors',
      customerType: 'DISTRIBUTOR',
      contactEmail: 'logistics@northernsteeldist.com',
      contactPhone: '+91 94172 88990',
      taxNumber: '03AAACN9988D1Z3',
      creditLimit: 5000000,
      creditPeriodDays: 90,
      paymentTerms: 'NET 90 Days',
      contactPerson: 'Harpreet Singh Sandhu',
      billingAddress: {
        customerType: 'DISTRIBUTOR',
        contactPerson: 'Harpreet Singh Sandhu',
        line1: 'Grand Trunk Road, Focal Point Phase 5',
        city: 'Ludhiana',
        state: 'Punjab',
        postalCode: '141010',
        country: 'IN',
        panNumber: 'AAACN9988D',
        creditPeriodDays: 90,
      },
      shippingAddress: {
        contactPerson: 'Baljit Singh',
        line1: 'Warehouse Hub 8, Transport Nagar',
        city: 'Ludhiana',
        state: 'Punjab',
        postalCode: '141010',
        country: 'IN',
      },
    },
    {
      code: 'CUST-DIST-002',
      name: 'Deccan Hardware & Infrastructure Supply Ltd',
      customerType: 'DISTRIBUTOR',
      contactEmail: 'commercial@deccanhardware.co.in',
      contactPhone: '+91 98490 22314',
      taxNumber: '36AACCD7766M1Z8',
      creditLimit: 4000000,
      creditPeriodDays: 60,
      paymentTerms: 'NET 60 Days',
      contactPerson: 'K. Venkat Rao',
      billingAddress: {
        customerType: 'DISTRIBUTOR',
        contactPerson: 'K. Venkat Rao',
        line1: 'Door No 5-9-102, Ranigunj Wholesale Hardware Street',
        city: 'Secunderabad',
        state: 'Telangana',
        postalCode: '500003',
        country: 'IN',
        panNumber: 'AACCD7766M',
        creditPeriodDays: 60,
      },
      shippingAddress: {
        contactPerson: 'Warehouse Manager - Ramesh',
        line1: 'Medchal Industrial Logistics Park, Unit 3',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '501401',
        country: 'IN',
      },
    },
    {
      code: 'CUST-CORP-001',
      name: 'Larsen & Toubro Heavy Infrastructure Division',
      customerType: 'CORPORATE',
      contactEmail: 'procurement.epc@larsentoubro.com',
      contactPhone: '+91 99203 11223',
      taxNumber: '27AAACL0011L1ZG',
      creditLimit: 10000000,
      creditPeriodDays: 90,
      paymentTerms: 'Milestone Net 90',
      contactPerson: 'Aniruddha Deshpande',
      billingAddress: {
        customerType: 'CORPORATE',
        contactPerson: 'Aniruddha Deshpande',
        line1: 'L&T House, Ballard Estate, P.O. Box 278',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'IN',
        panNumber: 'AAACL0011L',
        creditPeriodDays: 90,
      },
      shippingAddress: {
        contactPerson: 'Site Incharge - Project Metro Line 3',
        line1: 'Casting Yard Site, Aarey Colony, Goregaon East',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400065',
        country: 'IN',
      },
    },
    {
      code: 'CUST-CORP-002',
      name: 'Tata Steel Construction Logistics Services',
      customerType: 'CORPORATE',
      contactEmail: 'purchase@tatasteellogistics.com',
      contactPhone: '+91 93310 99887',
      taxNumber: '20AAACT2244P1Z2',
      creditLimit: 8000000,
      creditPeriodDays: 75,
      paymentTerms: 'NET 75 Days',
      contactPerson: 'Debabrata Mukherjee',
      billingAddress: {
        customerType: 'CORPORATE',
        contactPerson: 'Debabrata Mukherjee',
        line1: 'Tata Centre, 43 Jawaharlal Nehru Road',
        city: 'Kolkata',
        state: 'West Bengal',
        postalCode: '700071',
        country: 'IN',
        panNumber: 'AAACT2244P',
        creditPeriodDays: 75,
      },
      shippingAddress: {
        contactPerson: 'Jamshedpur Central Receiving Yard',
        line1: 'Works Gate No. 4, Burma Mines',
        city: 'Jamshedpur',
        state: 'Jharkhand',
        postalCode: '831007',
        country: 'IN',
      },
    },
    {
      code: 'CUST-INST-001',
      name: 'Western Railway Zonal Engineering Depot',
      customerType: 'INSTITUTIONAL',
      contactEmail: 'materials.hq@wr.railnet.gov.in',
      contactPhone: '+91 90044 99111',
      taxNumber: '27GOVWR1122G1ZP',
      creditLimit: 3000000,
      creditPeriodDays: 120,
      paymentTerms: 'Govt Treasury Voucher 120 Days',
      contactPerson: 'Dy. Chief Material Manager',
      billingAddress: {
        customerType: 'INSTITUTIONAL',
        contactPerson: 'Dy. Chief Material Manager',
        line1: 'HQ Stores Office, Churchgate Station Building',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400020',
        country: 'IN',
        panNumber: 'GOVWR1122G',
        creditPeriodDays: 120,
      },
      shippingAddress: {
        contactPerson: 'Senior Section Engineer (Stores)',
        line1: 'General Stores Depot, Mahalaxmi Yard',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400011',
        country: 'IN',
      },
    },
    {
      code: 'CUST-INST-002',
      name: 'National Highways Authority Project Cell',
      customerType: 'INSTITUTIONAL',
      contactEmail: 'piu.ahmedabad@nhai.gov.in',
      contactPhone: '+91 97129 44332',
      taxNumber: '24GOVNH8877A1Z9',
      creditLimit: 4500000,
      creditPeriodDays: 90,
      paymentTerms: 'Govt Release NET 90',
      contactPerson: 'Project Director NHAI',
      billingAddress: {
        customerType: 'INSTITUTIONAL',
        contactPerson: 'Project Director NHAI',
        line1: 'PIU Office, 1st Floor, Highway Admin Building, SP Ring Road',
        city: 'Gandhinagar',
        state: 'Gujarat',
        postalCode: '382010',
        country: 'IN',
        panNumber: 'GOVNH8877A',
        creditPeriodDays: 90,
      },
      shippingAddress: {
        contactPerson: 'Resident Engineer - Package 3',
        line1: 'Expressway Flyover Depot, KM 45 Station',
        city: 'Vadodara',
        state: 'Gujarat',
        postalCode: '390019',
        country: 'IN',
      },
    },
    {
      code: 'CUST-RETAIL-001',
      name: 'Plinth Direct Walk-in Retail Customer',
      customerType: 'RETAIL',
      contactEmail: 'pos.counter@plinth.example',
      contactPhone: '+91 98765 00001',
      taxNumber: 'URP-RETAIL-UNREGISTERED',
      creditLimit: 50000,
      creditPeriodDays: 0,
      paymentTerms: 'Immediate Cash / UPI / Card',
      contactPerson: 'Counter Walk-in',
      billingAddress: {
        customerType: 'RETAIL',
        contactPerson: 'Walk-in Consumer',
        line1: 'Plinth Flagship Experience Store, Indiranagar 100ft Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'IN',
        panNumber: 'APZPR9911C',
        creditPeriodDays: 0,
      },
      shippingAddress: {
        contactPerson: 'Walk-in Consumer',
        line1: 'Plinth Flagship Experience Store, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
        country: 'IN',
      },
    },
    {
      code: 'CUST-RETAIL-002',
      name: 'Aditi Sharma (Homeowner & Renovator)',
      customerType: 'RETAIL',
      contactEmail: 'aditi.sharma99@gmail.com',
      contactPhone: '+91 98205 11984',
      taxNumber: 'URP-CONSUMER',
      creditLimit: 100000,
      creditPeriodDays: 0,
      paymentTerms: 'Immediate POS Payment',
      contactPerson: 'Aditi Sharma',
      billingAddress: {
        customerType: 'RETAIL',
        contactPerson: 'Aditi Sharma',
        line1: 'Flat 702, Oakwood Regency, Koramangala 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560034',
        country: 'IN',
        panNumber: 'BPYPS4412B',
        creditPeriodDays: 0,
      },
      shippingAddress: {
        contactPerson: 'Aditi Sharma',
        line1: 'Flat 702, Oakwood Regency, Koramangala 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560034',
        country: 'IN',
      },
    },
    {
      code: 'CUST-AMZ-001',
      name: 'Amazon India Direct Fulfillment Customers',
      customerType: 'RETAIL',
      contactEmail: 'amazon-orders@plinth.example',
      contactPhone: '+91 80 4000 5000',
      taxNumber: '29AAACA6677K1ZV',
      creditLimit: 1000000,
      creditPeriodDays: 14,
      paymentTerms: 'Amazon Bimonthly Remittance',
      contactPerson: 'Marketplace Sync Engine',
      billingAddress: {
        customerType: 'RETAIL',
        contactPerson: 'Amazon Seller Services Private Limited',
        line1: 'Brigade Gateway, 8th Floor, 26/1 Dr. Rajkumar Road, Malleshwaram',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560055',
        country: 'IN',
        panNumber: 'AAACA6677K',
        creditPeriodDays: 14,
      },
      shippingAddress: {
        contactPerson: 'End Consumer via EasyShip',
        line1: 'Amazon Sort Center BLR1, NH44 Hosur Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560099',
        country: 'IN',
      },
    },
    {
      code: 'CUST-HOLD-001',
      name: 'Reliant Hardware Distributors (Credit Delinquent)',
      customerType: 'DEALER',
      contactEmail: 'accounts@relianthardware.org',
      contactPhone: '+91 98450 12398',
      taxNumber: '29AABCR8877Q1Z4',
      creditLimit: 200000, // Deliberately lower than order total to test Credit Hold
      creditPeriodDays: 15,
      paymentTerms: 'NET 15 Days (Overdue)',
      contactPerson: 'Mahesh Gopinath',
      billingAddress: {
        customerType: 'DEALER',
        contactPerson: 'Mahesh Gopinath',
        line1: 'Shop 8 & 9, Commercial Street Hardware Complex',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'IN',
        panNumber: 'AABCR8877Q',
        creditPeriodDays: 15,
      },
      shippingAddress: {
        contactPerson: 'Mahesh Gopinath',
        line1: 'Godown 3, Kalasipalyam New Extension',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560002',
        country: 'IN',
      },
    },
  ];

  const customerMap = new Map<string, any>();
  for (const c of customersList) {
    const upserted = await prisma.customer.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        taxNumber: c.taxNumber,
        creditLimit: c.creditLimit,
        billingAddress: c.billingAddress,
        shippingAddress: c.shippingAddress,
        currency: 'INR',
        status: LifecycleStatus.ACTIVE,
      },
      create: {
        code: c.code,
        name: c.name,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        taxNumber: c.taxNumber,
        creditLimit: c.creditLimit,
        billingAddress: c.billingAddress,
        shippingAddress: c.shippingAddress,
        currency: 'INR',
        status: LifecycleStatus.ACTIVE,
      },
    });
    customerMap.set(c.code, upserted);
  }
  console.log(`✅ Upserted ${customerMap.size} customer and dealer accounts.`);

  // 5. Build Scenario-Based Real Sales Orders
  const orderScenarios = [
    // Scenario 1: Retail Store POS Completed (Cash / Card / UPI)
    {
      orderNumber: 'SO-POS-2026-001',
      channel: SalesOrderChannel.STORE_POS,
      channelCode: 'STORE_POS',
      customerCode: 'CUST-RETAIL-001',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [0, 4],
      quantities: [2, 1],
      discounts: [100, 50],
      paymentMethod: 'UPI',
      notes: 'Store POS Counter Quick Checkout - Paid via PhonePe QR',
      daysAgo: 1,
    },
    {
      orderNumber: 'SO-POS-2026-002',
      channel: SalesOrderChannel.STORE_POS,
      channelCode: 'STORE_POS',
      customerCode: 'CUST-RETAIL-002',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [1, 5],
      quantities: [3, 2],
      discounts: [200, 0],
      paymentMethod: 'CARD',
      notes: 'Customer Aditi Sharma - In-Store POS POS-01 Terminal Swipe',
      daysAgo: 2,
    },
    {
      orderNumber: 'SO-POS-2026-003',
      channel: SalesOrderChannel.STORE_POS,
      channelCode: 'STORE_POS',
      customerCode: 'CUST-RETAIL-001',
      status: SalesOrderStatus.PACKED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.READY_TO_EXPORT,
      productIndices: [2, 6, 8],
      quantities: [2, 4, 1],
      discounts: [50, 0, 100],
      paymentMethod: 'CASH',
      notes: 'Counter Order Staged for In-Store Evening Pickup',
      daysAgo: 0,
    },

    // Scenario 2: Amazon Marketplace Channel Sync Orders
    {
      orderNumber: 'SO-AMZ-2026-8801',
      channel: SalesOrderChannel.AMAZON,
      channelCode: 'AMAZON_IN',
      customerCode: 'CUST-AMZ-001',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      amazonOrderId: '402-8921473-1928374',
      productIndices: [0], // Ceiling cloth dryer
      quantities: [1],
      discounts: [0],
      paymentMethod: 'AMAZON_PAY',
      carrier: delhivery,
      trackingNumber: 'DEL-AMZ-889912',
      notes: 'Amazon Prime Order - Dispatched via Delhivery Surface Air Express',
      daysAgo: 4,
    },
    {
      orderNumber: 'SO-AMZ-2026-8802',
      channel: SalesOrderChannel.AMAZON,
      channelCode: 'AMAZON_IN',
      customerCode: 'CUST-AMZ-001',
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.READY_TO_EXPORT,
      amazonOrderId: '402-1782634-8716253',
      productIndices: [3, 6],
      quantities: [1, 2],
      discounts: [150, 0],
      paymentMethod: 'AMAZON_PAY',
      carrier: bluedart,
      trackingNumber: 'BD-882736192',
      notes: 'Amazon Standard EasyShip - In-Transit to Hyderabad Hub',
      daysAgo: 2,
    },
    {
      orderNumber: 'SO-AMZ-2026-8803',
      channel: SalesOrderChannel.AMAZON,
      channelCode: 'AMAZON_IN',
      customerCode: 'CUST-AMZ-001',
      status: SalesOrderStatus.READY_TO_DISPATCH,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
      amazonOrderId: '402-9988221-4433221',
      productIndices: [4, 7],
      quantities: [2, 1],
      discounts: [0, 0],
      paymentMethod: 'AMAZON_PAY',
      carrier: delhivery,
      trackingNumber: 'DEL-AMZ-991122',
      notes: 'Amazon Express - Staged at Outbound Dock Bay 3',
      daysAgo: 1,
    },
    {
      orderNumber: 'SO-AMZ-2026-8804',
      channel: SalesOrderChannel.AMAZON,
      channelCode: 'AMAZON_IN',
      customerCode: 'CUST-AMZ-001',
      status: SalesOrderStatus.CONFIRMED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.PARTIALLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.NOT_ELIGIBLE,
      amazonOrderId: '402-4455667-1122334',
      productIndices: [1, 2],
      quantities: [4, 2],
      discounts: [100, 50],
      paymentMethod: 'AMAZON_PAY',
      notes: 'Newly Synced Amazon Marketplace Order - Awaiting picking batch',
      daysAgo: 0,
    },

    // Scenario 3: Credit Hold Queue Orders (Exceeded Limits / Overdue)
    {
      orderNumber: 'SO-HOLD-2026-001',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-HOLD-001',
      status: SalesOrderStatus.ON_HOLD,
      paymentStatus: SalesPaymentStatus.PENDING,
      allocationStatus: SalesAllocationStatus.NOT_STARTED,
      accountingStatus: SalesAccountingStatus.NOT_ELIGIBLE,
      productIndices: [8, 9, 1], // Heavy structural truss and bolts
      quantities: [5, 10, 20],
      discounts: [1500, 500, 200],
      paymentMethod: 'CREDIT_LINE',
      exceptionCode: 'CREDIT_LIMIT_EXCEEDED',
      exceptionMsg: 'Customer credit limit of ₹2,00,000 exceeded. Order exposure is ₹3,45,000. Finance Controller approval required.',
      severity: SalesExceptionSeverity.BLOCKING,
      notes: 'Credit Check Failed: Outstanding invoices overdue > 30 days. Placed in Credit Hold Queue.',
      daysAgo: 2,
    },
    {
      orderNumber: 'SO-HOLD-2026-002',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-HOLD-001',
      status: SalesOrderStatus.ON_HOLD,
      paymentStatus: SalesPaymentStatus.PENDING,
      allocationStatus: SalesAllocationStatus.NOT_STARTED,
      accountingStatus: SalesAccountingStatus.NOT_ELIGIBLE,
      productIndices: [0, 3],
      quantities: [15, 10],
      discounts: [500, 300],
      paymentMethod: 'CREDIT_LINE',
      exceptionCode: 'PAYMENT_PENDING_OVERDUE',
      exceptionMsg: 'Account on administrative hold due to 2 bounced dishonoured cheques.',
      severity: SalesExceptionSeverity.BLOCKING,
      notes: 'Administrative hold flagged by AR Finance controller.',
      daysAgo: 3,
    },

    // Scenario 4: B2B Dealers & Distributors (Confirmed, Allocated, Dispatched)
    {
      orderNumber: 'SO-DLR-2026-101',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-DEALER-001',
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [0, 2, 4],
      quantities: [25, 30, 20],
      discounts: [2500, 1500, 1000],
      paymentMethod: 'BANK_TRANSFER',
      carrier: delhivery,
      trackingNumber: 'DEL-B2B-109283',
      notes: 'Bulk consignment dispatched to Mahavir Industrial GIDC Ahmedabad',
      daysAgo: 3,
    },
    {
      orderNumber: 'SO-DLR-2026-102',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-DEALER-002',
      status: SalesOrderStatus.ALLOCATED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
      productIndices: [1, 8, 9],
      quantities: [40, 4, 15],
      discounts: [2000, 4000, 1500],
      paymentMethod: 'BANK_TRANSFER',
      notes: 'Inventory reserved at Bay 1-4. Ready for pallet packaging.',
      daysAgo: 1,
    },
    {
      orderNumber: 'SO-DIST-2026-201',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-DIST-001',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [3, 4, 7, 8],
      quantities: [30, 25, 20, 6],
      discounts: [3000, 2000, 1000, 5000],
      paymentMethod: 'RTGS',
      carrier: bluedart,
      trackingNumber: 'BD-LUD-991823',
      notes: 'Annual Distributor contract shipment delivered at Ludhiana Depot',
      daysAgo: 6,
    },
    {
      orderNumber: 'SO-DIST-2026-202',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-DIST-002',
      status: SalesOrderStatus.CONFIRMED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.PARTIALLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
      productIndices: [0, 1, 5],
      quantities: [20, 50, 30],
      discounts: [1500, 3000, 1000],
      paymentMethod: 'RTGS',
      notes: 'Direct B2B Dealer Booking - Awaiting full allocation of fasteners',
      daysAgo: 1,
    },

    // Scenario 5: Corporate & Institutional EPC Projects
    {
      orderNumber: 'SO-CORP-2026-301',
      channel: SalesOrderChannel.E_TRADE,
      channelCode: 'ETRADE_PORTAL',
      customerCode: 'CUST-CORP-001',
      status: SalesOrderStatus.DISPATCHED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [8, 9, 1],
      quantities: [10, 25, 80],
      discounts: [8000, 5000, 4000],
      paymentMethod: 'CORPORATE_PO',
      carrier: bluedart,
      trackingNumber: 'BD-LNT-009182',
      notes: 'Larsen & Toubro Metro EPC Phase 3 Site Delivery via Flatbed Trailer',
      daysAgo: 4,
    },
    {
      orderNumber: 'SO-CORP-2026-302',
      channel: SalesOrderChannel.E_TRADE,
      channelCode: 'ETRADE_PORTAL',
      customerCode: 'CUST-CORP-002',
      status: SalesOrderStatus.ALLOCATED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
      productIndices: [8, 9],
      quantities: [8, 15],
      discounts: [6000, 3000],
      paymentMethod: 'CORPORATE_PO',
      notes: 'Tata Steel Infrastructure Project allocation complete. QA Inspection signed off.',
      daysAgo: 2,
    },
    {
      orderNumber: 'SO-INST-2026-401',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-INST-001',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [1, 9],
      quantities: [60, 20],
      discounts: [4000, 2000],
      paymentMethod: 'TREASURY_CHEQUE',
      carrier: delhivery,
      trackingNumber: 'DEL-WR-092813',
      notes: 'Western Railway Zonal Engineering delivery complete. POD uploaded.',
      daysAgo: 8,
    },
    {
      orderNumber: 'SO-INST-2026-402',
      channel: SalesOrderChannel.E_TRADE,
      channelCode: 'ETRADE_PORTAL',
      customerCode: 'CUST-INST-002',
      status: SalesOrderStatus.CONFIRMED,
      paymentStatus: SalesPaymentStatus.AUTHORIZED,
      allocationStatus: SalesAllocationStatus.NOT_STARTED,
      accountingStatus: SalesAccountingStatus.NOT_ELIGIBLE,
      productIndices: [1, 8],
      quantities: [50, 5],
      discounts: [3000, 4000],
      paymentMethod: 'GOVT_PO',
      notes: 'NHAI Expressway Flyover Package 3 - PO Confirmed, Pending Stock Release',
      daysAgo: 0,
    },

    // Additional Operational Depth: Return & Partial Scenarios
    {
      orderNumber: 'SO-DLR-2026-103',
      channel: SalesOrderChannel.PHYSICAL,
      channelCode: 'DEALER_DIRECT',
      customerCode: 'CUST-DEALER-001',
      status: SalesOrderStatus.PARTIALLY_ALLOCATED,
      paymentStatus: SalesPaymentStatus.PENDING,
      allocationStatus: SalesAllocationStatus.PARTIALLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.NOT_ELIGIBLE,
      productIndices: [0, 5, 8],
      quantities: [10, 15, 2],
      discounts: [500, 0, 1000],
      paymentMethod: 'BANK_TRANSFER',
      notes: 'Order partially allocated; remaining balance awaiting incoming assembly run',
      daysAgo: 1,
    },
    {
      orderNumber: 'SO-AMZ-2026-8805',
      channel: SalesOrderChannel.AMAZON,
      channelCode: 'AMAZON_IN',
      customerCode: 'CUST-AMZ-001',
      status: SalesOrderStatus.PACKING,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.PENDING_REVIEW,
      amazonOrderId: '402-5566778-9900112',
      productIndices: [2, 6],
      quantities: [3, 5],
      discounts: [0, 0],
      paymentMethod: 'AMAZON_PAY',
      notes: 'Amazon Prime Order in Packing Station 2',
      daysAgo: 0,
    },
    {
      orderNumber: 'SO-POS-2026-004',
      channel: SalesOrderChannel.STORE_POS,
      channelCode: 'STORE_POS',
      customerCode: 'CUST-RETAIL-002',
      status: SalesOrderStatus.DELIVERED,
      paymentStatus: SalesPaymentStatus.PAID,
      allocationStatus: SalesAllocationStatus.FULLY_ALLOCATED,
      accountingStatus: SalesAccountingStatus.EXPORTED,
      productIndices: [3],
      quantities: [1],
      discounts: [0],
      paymentMethod: 'UPI',
      notes: 'Store POS - Immediate Takeaway',
      daysAgo: 0,
    },
  ];

  console.log(`📋 Generating ${orderScenarios.length} realistic sales orders across all channels...`);

  let orderCount = 0;
  for (const scen of orderScenarios) {
    const channel = channelMap.get(scen.channelCode);
    const customer = customerMap.get(scen.customerCode);
    if (!channel || !customer) {
      console.warn(`Skipping scenario ${scen.orderNumber}: Missing channel or customer`);
      continue;
    }

    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - scen.daysAgo);

    // Calculate lines
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const linesToCreate: any[] = [];

    scen.productIndices.forEach((prodIdx, i) => {
      const p = fgProducts[prodIdx % fgProducts.length];
      const meta = (p.metadata as any) || {};
      const unitPrice = Number(meta.sellingPrice || meta.rate || 1499);
      const qty = scen.quantities[i] || 1;
      const discount = scen.discounts[i] || 0;
      const taxable = Math.max(0, unitPrice * qty - discount);
      const taxRate = 18;
      const lineTax = Math.round((taxable * (taxRate / 100)) * 100) / 100;
      const lineTotal = taxable + lineTax;

      subtotal += unitPrice * qty;
      discountTotal += discount;
      taxTotal += lineTax;

      // Status of line based on order status
      let lineStatus: SalesOrderLineStatus = SalesOrderLineStatus.OPEN;
      let allocatedQty = 0;
      let pickedQty = 0;
      let packedQty = 0;
      let shippedQty = 0;

      if (scen.status === SalesOrderStatus.DELIVERED || scen.status === SalesOrderStatus.DISPATCHED) {
        lineStatus = SalesOrderLineStatus.FULFILLED;
        allocatedQty = qty;
        pickedQty = qty;
        packedQty = qty;
        shippedQty = qty;
      } else if (scen.status === SalesOrderStatus.READY_TO_DISPATCH || scen.status === SalesOrderStatus.PACKED) {
        lineStatus = SalesOrderLineStatus.ALLOCATED;
        allocatedQty = qty;
        pickedQty = qty;
        packedQty = qty;
      } else if (scen.status === SalesOrderStatus.ALLOCATED || scen.status === SalesOrderStatus.PACKING) {
        lineStatus = SalesOrderLineStatus.ALLOCATED;
        allocatedQty = qty;
        pickedQty = scen.status === SalesOrderStatus.PACKING ? qty : 0;
      } else if (scen.status === SalesOrderStatus.PARTIALLY_ALLOCATED) {
        lineStatus = SalesOrderLineStatus.PARTIALLY_ALLOCATED;
        allocatedQty = Math.max(1, Math.floor(qty / 2));
      }

      linesToCreate.push({
        productId: p.id,
        sku: p.sku,
        description: p.name,
        uomId: p.uomId,
        orderedQuantity: qty,
        allocatedQuantity: allocatedQty,
        pickedQuantity: pickedQty,
        packedQuantity: packedQty,
        shippedQuantity: shippedQty,
        returnedQuantity: 0,
        cancelledQuantity: 0,
        unitPrice,
        discountAmount: discount,
        taxRate,
        taxAmount: lineTax,
        lineTotal,
        status: lineStatus,
      });
    });

    const chargeTotal = 150; // Standard freight & handling charge
    const grandTotal = subtotal - discountTotal + taxTotal + chargeTotal;

    // Delete existing order if already present to ensure clean seed
    const existing = await prisma.salesOrder.findUnique({
      where: { orderNumber: scen.orderNumber },
    });
    if (existing) {
      await prisma.salesOrder.delete({ where: { id: existing.id } });
    }

    const createdOrder = await prisma.salesOrder.create({
      data: {
        orderNumber: scen.orderNumber,
        channel: scen.channel,
        channelId: channel.id,
        customerId: customer.id,
        warehouseLocationId: fgLocation.id,
        externalOrderId: scen.amazonOrderId || null,
        status: scen.status,
        paymentStatus: scen.paymentStatus,
        allocationStatus: scen.allocationStatus,
        accountingStatus: scen.accountingStatus,
        currency: 'INR',
        subtotal,
        discountTotal,
        taxTotal,
        chargeTotal,
        grandTotal,
        orderedAt: orderDate,
        promisedAt: new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        confirmedAt: ['CONFIRMED', 'ALLOCATED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'PACKED', 'PACKING'].includes(scen.status) ? orderDate : null,
        dispatchedAt: ['DISPATCHED', 'DELIVERED'].includes(scen.status) ? new Date(orderDate.getTime() + 1 * 24 * 60 * 60 * 1000) : null,
        deliveredAt: scen.status === 'DELIVERED' ? new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000) : null,
        notes: scen.notes,
        createdByActorId: adminUser.id,
        approvedByActorId: ['CONFIRMED', 'ALLOCATED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED'].includes(scen.status) ? adminUser.id : null,
        lines: {
          create: linesToCreate,
        },
        addresses: {
          create: [
            {
              kind: 'BILLING',
              name: customer.billingAddress?.contactPerson || customer.name,
              phone: customer.contactPhone,
              line1: customer.billingAddress?.line1 || 'Main Street, Central Commercial Area',
              line2: customer.billingAddress?.line2 || null,
              city: customer.billingAddress?.city || 'Bengaluru',
              state: customer.billingAddress?.state || 'Karnataka',
              postalCode: customer.billingAddress?.postalCode || '560001',
              country: 'IN',
              taxNumber: customer.taxNumber,
            },
            {
              kind: 'SHIPPING',
              name: customer.shippingAddress?.contactPerson || customer.name,
              phone: customer.contactPhone,
              line1: customer.shippingAddress?.line1 || customer.billingAddress?.line1 || 'Plot 10, Industrial Park',
              city: customer.shippingAddress?.city || customer.billingAddress?.city || 'Bengaluru',
              state: customer.shippingAddress?.state || customer.billingAddress?.state || 'Karnataka',
              postalCode: customer.shippingAddress?.postalCode || customer.billingAddress?.postalCode || '560001',
              country: 'IN',
              taxNumber: customer.taxNumber,
            },
          ],
        },
        charges: {
          create: [
            {
              code: 'FREIGHT',
              label: 'Standard Surface Express Freight',
              amount: chargeTotal,
              taxAmount: 0,
            },
          ],
        },
        taxes: {
          create: [
            {
              code: 'GST18',
              rate: 18,
              taxableAmount: subtotal - discountTotal,
              amount: taxTotal,
            },
          ],
        },
        payments: {
          create: [
            {
              method: scen.paymentMethod,
              amount: scen.paymentStatus === SalesPaymentStatus.PAID ? grandTotal : 0,
              status: scen.paymentStatus,
              paidAt: scen.paymentStatus === SalesPaymentStatus.PAID ? orderDate : null,
              provider: scen.paymentMethod === 'AMAZON_PAY' ? 'Amazon Payments' : scen.paymentMethod === 'UPI' ? 'PhonePe UPI' : 'HDFC Bank Corporate Netbanking',
              reference: `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`,
            },
          ],
        },
        approvals: {
          create: [
            {
              actorId: adminUser.id,
              decision: SalesApprovalDecision.APPROVED,
              reason: scen.status === SalesOrderStatus.ON_HOLD ? 'Initial credit check flagged limit breach' : 'Order credit & pricing terms verified and authorized',
              createdAt: orderDate,
            },
          ],
        },
        statusHistory: {
          create: [
            {
              fromStatus: 'DRAFT',
              toStatus: scen.status === SalesOrderStatus.ON_HOLD ? 'ON_HOLD' : 'CONFIRMED',
              actorId: adminUser.id,
              reason: scen.notes,
              createdAt: orderDate,
            },
          ],
        },
      },
      include: {
        lines: true,
      },
    });

    // Add External Reference if Amazon
    if (scen.amazonOrderId) {
      await prisma.salesOrderExternalReference.create({
        data: {
          salesOrderId: createdOrder.id,
          channel: SalesOrderChannel.AMAZON,
          externalId: scen.amazonOrderId,
          payload: {
            marketplace: 'Amazon.in',
            orderType: 'StandardOrder',
            buyerEmail: customer.contactEmail,
            fulfillmentChannel: 'AFN',
          },
        },
      });
    }

    // Add Exception if On Hold
    if (scen.exceptionCode && scen.exceptionMsg) {
      await prisma.salesOrderException.create({
        data: {
          salesOrderId: createdOrder.id,
          code: scen.exceptionCode,
          message: scen.exceptionMsg,
          severity: scen.severity || SalesExceptionSeverity.WARNING,
          status: SalesExceptionStatus.OPEN,
          createdAt: orderDate,
        },
      });
    }

    // Add Allocations for Allocated/Dispatched lines
    if (['ALLOCATED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'PARTIALLY_ALLOCATED'].includes(scen.status)) {
      for (const line of createdOrder.lines) {
        if (Number(line.allocatedQuantity) > 0) {
          await prisma.salesOrderAllocation.create({
            data: {
              salesOrderId: createdOrder.id,
              salesOrderLineId: line.id,
              productId: line.productId,
              uomId: line.uomId,
              locationId: fgLocation.id,
              quantity: line.allocatedQuantity,
              status: 'ACTIVE',
              createdById: adminUser.id,
              createdAt: orderDate,
            },
          });
        }
      }
    }

    // Add Fulfillment, Shipment & Package Items for Dispatched / Delivered orders
    if (['DISPATCHED', 'DELIVERED', 'READY_TO_DISPATCH'].includes(scen.status) && scen.carrier) {
      const fulfillment = await prisma.salesFulfillment.create({
        data: {
          fulfillmentNumber: `FUL-${scen.orderNumber}`,
          salesOrderId: createdOrder.id,
          warehouseLocationId: fgLocation.id,
          status: scen.status === 'DELIVERED' ? SalesFulfillmentStatus.COMPLETED : SalesFulfillmentStatus.DISPATCHED,
          priority: 'NORMAL',
          promisedShipAt: new Date(orderDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          createdByActorId: adminUser.id,
          createdAt: orderDate,
        },
      });

      // Package
      await prisma.salesPackage.create({
        data: {
          fulfillmentId: fulfillment.id,
          packageNumber: `PKG-${scen.orderNumber}-01`,
          packageType: 'CORRUGATED_BOX_HEAVY',
          barcode: `BAR-${scen.orderNumber}-01`,
          status: SalesPackageStatus.DISPATCHED,
          lengthCm: 60,
          widthCm: 40,
          heightCm: 30,
          grossWeightKg: 12.5,
          sealedAt: orderDate,
          createdByActorId: adminUser.id,
          createdAt: orderDate,
        },
      });

      // Shipment
      await prisma.salesShipment.create({
        data: {
          shipmentNumber: `SHP-${scen.orderNumber}`,
          salesOrderId: createdOrder.id,
          fulfillmentId: fulfillment.id,
          warehouseLocationId: fgLocation.id,
          mode: SalesShipmentMode.COURIER,
          status: scen.status === 'DELIVERED' ? SalesShipmentStatus.DELIVERED : SalesShipmentStatus.IN_TRANSIT,
          carrierId: scen.carrier.id,
          awbNumber: scen.trackingNumber || `AWB-${Math.floor(100000 + Math.random() * 900000)}`,
          handedOverAt: orderDate,
          deliveredAt: scen.status === 'DELIVERED' ? new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000) : null,
          expectedDeliveryAt: new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          routeNotes: `Handed over to ${scen.carrier.name} logistics crew.`,
          createdByActorId: adminUser.id,
          createdAt: orderDate,
        },
      });

      // Dispatch Document (Invoice & Shipping Label)
      await prisma.salesDispatchDocument.createMany({
        data: [
          {
            salesOrderId: createdOrder.id,
            shipmentId: null,
            type: SalesDispatchDocumentType.INVOICE,
            documentNumber: `INV-${scen.orderNumber}`,
            fileUrl: `/documents/invoices/INV-${scen.orderNumber}.pdf`,
            metadata: { gstin: customer.taxNumber, grandTotal },
            uploadedByActorId: adminUser.id,
            createdAt: orderDate,
          },
          {
            salesOrderId: createdOrder.id,
            shipmentId: null,
            type: SalesDispatchDocumentType.SHIPPING_LABEL,
            documentNumber: `LBL-${scen.orderNumber}`,
            fileUrl: `/documents/labels/LBL-${scen.orderNumber}.pdf`,
            metadata: { carrier: scen.carrier.name, tracking: scen.trackingNumber },
            uploadedByActorId: adminUser.id,
            createdAt: orderDate,
          },
        ],
      });
    }

    orderCount++;
  }

  console.log(`🎉 Successfully seeded ${orderCount} comprehensive Sales Orders!`);
}

main()
  .catch((e) => {
    console.error('❌ Error during sales seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
