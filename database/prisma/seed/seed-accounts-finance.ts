import { 
  PrismaClient, 
  Prisma, 
  ExpenseCategory, 
  ExpensePaymentStatus, 
  ExpensePaymentMode, 
  DebitNoteWorkflowStatus, 
  PurchaseBillKind, 
  PurchaseBillStatus, 
  PurchaseBillMatchStatus 
} from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const ADMIN_ID = 'f1efe583-de31-4706-bf5f-3578f8ae801f';
const ENTITY_CODE = 'PLINTH-IN';

async function main() {
  console.log('🚀 Starting Finance & Accounts Full Data Seeding...');

  // 1. Clean up existing partial accounts records using TRUNCATE CASCADE
  console.log('🧹 Cleaning existing finance tables for clean idempotent run...');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_allocations" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_receipts" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_credit_notes" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_invoice_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_invoices" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_proforma_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_proformas" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_marketplace_batches" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_mappings" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sales_ar_events" CASCADE;`);
  
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_note_documents" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_note_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "debit_notes" CASCADE;`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "purchase_bill_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "purchase_bills" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "miscellaneous_expenses" CASCADE;`);

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "journal_lines" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "journal_vouchers" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_sequences" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ledger_accounts" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_periods" CASCADE;`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "accounting_entities" CASCADE;`);

  // 2. Setup Accounting Entity (PLINTH-IN)
  console.log('🏢 Creating primary Accounting Entity: PLINTH-IN...');
  const entityId = randomUUID();
  const entity = await prisma.accountingEntity.create({
    data: {
      id: entityId,
      code: ENTITY_CODE,
      legalName: 'Plinth Industrial Technologies Private Limited',
      baseCurrency: 'INR',
      gstin: '29AAACP1234F1Z8',
      stateCode: '29',
      status: 'ACTIVE',
      createdById: ADMIN_ID,
    },
  });
  console.log(`✅ Entity created: ${entity.code} (${entity.id})`);

  // 3. Setup Accounting Periods (FY 2026-27 Monthly Periods)
  console.log('📅 Creating Accounting Periods for FY2026-27...');
  const periodsData = [
    { code: '2026-04', fiscalYear: 'FY2026-27', startsOn: new Date('2026-04-01T00:00:00.000Z'), endsOn: new Date('2026-04-30T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-05', fiscalYear: 'FY2026-27', startsOn: new Date('2026-05-01T00:00:00.000Z'), endsOn: new Date('2026-05-31T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-06', fiscalYear: 'FY2026-27', startsOn: new Date('2026-06-01T00:00:00.000Z'), endsOn: new Date('2026-06-30T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-07', fiscalYear: 'FY2026-27', startsOn: new Date('2026-07-01T00:00:00.000Z'), endsOn: new Date('2026-07-31T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-08', fiscalYear: 'FY2026-27', startsOn: new Date('2026-08-01T00:00:00.000Z'), endsOn: new Date('2026-08-31T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-09', fiscalYear: 'FY2026-27', startsOn: new Date('2026-09-01T00:00:00.000Z'), endsOn: new Date('2026-09-30T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-10', fiscalYear: 'FY2026-27', startsOn: new Date('2026-10-01T00:00:00.000Z'), endsOn: new Date('2026-10-31T23:59:59.999Z'), status: 'CLOSED' },
    { code: '2026-11', fiscalYear: 'FY2026-27', startsOn: new Date('2026-11-01T00:00:00.000Z'), endsOn: new Date('2026-11-30T23:59:59.999Z'), status: 'OPEN' },
    { code: '2026-12', fiscalYear: 'FY2026-27', startsOn: new Date('2026-12-01T00:00:00.000Z'), endsOn: new Date('2026-12-31T23:59:59.999Z'), status: 'OPEN' },
    { code: '2027-01', fiscalYear: 'FY2026-27', startsOn: new Date('2027-01-01T00:00:00.000Z'), endsOn: new Date('2027-01-31T23:59:59.999Z'), status: 'OPEN' },
    { code: '2027-02', fiscalYear: 'FY2026-27', startsOn: new Date('2027-02-01T00:00:00.000Z'), endsOn: new Date('2027-02-28T23:59:59.999Z'), status: 'OPEN' },
    { code: '2027-03', fiscalYear: 'FY2026-27', startsOn: new Date('2027-03-01T00:00:00.000Z'), endsOn: new Date('2027-03-31T23:59:59.999Z'), status: 'OPEN' },
  ];

  const periodMap = new Map<string, string>();
  for (const p of periodsData) {
    const created = await prisma.accountingPeriod.create({
      data: {
        entityId,
        code: p.code,
        fiscalYear: p.fiscalYear,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        status: p.status as any,
      },
    });
    periodMap.set(p.code, created.id);
  }
  console.log(`✅ Created ${periodMap.size} accounting periods.`);
  const currentPeriodId = periodMap.get('2026-11')!;

  // 4. Setup Chart of Accounts (Ledger Accounts)
  console.log('📚 Creating Standard Chart of Accounts (Ledger Accounts)...');
  const chartDefinitions = [
    // Current Assets - Bank & Cash
    { code: '1110', name: 'HDFC Bank Primary Current A/c - 50200012345678', type: 'ASSET', isControl: false, tallyLedger: 'HDFC Bank A/c' },
    { code: '1120', name: 'ICICI Bank Operating A/c - 000205012345', type: 'ASSET', isControl: false, tallyLedger: 'ICICI Bank A/c' },
    { code: '1150', name: 'Petty Cash Impress A/c', type: 'ASSET', isControl: false, tallyLedger: 'Cash' },
    // Current Assets - Receivables
    { code: '1200', name: 'Accounts Receivable (Trade Debtors Control)', type: 'ASSET', isControl: true, tallyLedger: 'Sundry Debtors' },
    { code: '1210', name: 'Marketplace Escrow Amazon Seller Services', type: 'ASSET', isControl: false, tallyLedger: 'Amazon Escrow Receivable' },
    { code: '1220', name: 'Marketplace Escrow E-Trade Portal', type: 'ASSET', isControl: false, tallyLedger: 'E-Trade Escrow Receivable' },
    // Inventory Assets
    { code: '1310', name: 'Raw Material Inventory Valuation', type: 'ASSET', isControl: true, tallyLedger: 'Stock-in-Hand (Raw Material)' },
    { code: '1320', name: 'Finished Goods Inventory Valuation', type: 'ASSET', isControl: true, tallyLedger: 'Stock-in-Hand (Finished Goods)' },
    // Current Assets - GST Input Tax Credits
    { code: '1410', name: 'Input CGST Ledger 9%', type: 'ASSET', isControl: false, tallyLedger: 'Input CGST' },
    { code: '1420', name: 'Input SGST Ledger 9%', type: 'ASSET', isControl: false, tallyLedger: 'Input SGST' },
    { code: '1430', name: 'Input IGST Ledger 18%', type: 'ASSET', isControl: false, tallyLedger: 'Input IGST' },
    // Liabilities - Payables
    { code: '2100', name: 'Accounts Payable (Trade Creditors Control)', type: 'LIABILITY', isControl: true, tallyLedger: 'Sundry Creditors' },
    { code: '2150', name: 'Job-Work Accrued Processing Liabilities', type: 'LIABILITY', isControl: false, tallyLedger: 'Job Work Charges Payable' },
    // Liabilities - GST Outputs & Statutory
    { code: '2210', name: 'Output CGST Ledger 9%', type: 'LIABILITY', isControl: false, tallyLedger: 'Output CGST' },
    { code: '2220', name: 'Output SGST Ledger 9%', type: 'LIABILITY', isControl: false, tallyLedger: 'Output SGST' },
    { code: '2230', name: 'Output IGST Ledger 18%', type: 'LIABILITY', isControl: false, tallyLedger: 'Output IGST' },
    { code: '2310', name: 'TDS Payable u/s 194C/194J', type: 'LIABILITY', isControl: false, tallyLedger: 'TDS Payable' },
    { code: '2320', name: 'GST TCS Payable', type: 'LIABILITY', isControl: false, tallyLedger: 'TCS on GST' },
    // Equity
    { code: '3100', name: 'Equity Share Capital', type: 'EQUITY', isControl: false, tallyLedger: 'Share Capital' },
    { code: '3200', name: 'Retained Earnings & Reserves', type: 'EQUITY', isControl: false, tallyLedger: 'Retained Earnings' },
    // Revenue / Income
    { code: '4100', name: 'Domestic B2B Sales Revenue - Structural Hardware', type: 'INCOME', isControl: true, tallyLedger: 'Sales - Domestic B2B' },
    { code: '4200', name: 'Marketplace Sales Revenue - Amazon India', type: 'INCOME', isControl: false, tallyLedger: 'Sales - Amazon' },
    { code: '4300', name: 'Counter POS Retail Sales Revenue', type: 'INCOME', isControl: false, tallyLedger: 'Sales - Retail POS' },
    // Direct & Operating Expenses
    { code: '5100', name: 'Raw Material Purchases - Steel, Fasteners & Seals', type: 'EXPENSE', isControl: true, tallyLedger: 'Purchases - Raw Materials' },
    { code: '5200', name: 'Job-Work & Machining Processing Charges', type: 'EXPENSE', isControl: false, tallyLedger: 'Job Work Expenses' },
    { code: '5300', name: 'Inward Freight & Logistics Charges', type: 'EXPENSE', isControl: false, tallyLedger: 'Freight Inward' },
    { code: '6100', name: 'Outward Logistics, Freight & Dispatch Courier', type: 'EXPENSE', isControl: false, tallyLedger: 'Freight Outward' },
    { code: '6200', name: 'Factory Electricity & Power Utilities', type: 'EXPENSE', isControl: false, tallyLedger: 'Electricity Charges' },
    { code: '6300', name: 'Direct Factory Labour Wages & Overtime', type: 'EXPENSE', isControl: false, tallyLedger: 'Wages & Salaries' },
    { code: '6400', name: 'Plant Equipment Maintenance & Consumables', type: 'EXPENSE', isControl: false, tallyLedger: 'Repairs & Maintenance' },
    { code: '6500', name: 'Administrative, Office Stationery & Refreshments', type: 'EXPENSE', isControl: false, tallyLedger: 'Office Expenses' },
    { code: '6600', name: 'Marketplace Platform Commission & Fulfillment Fees', type: 'EXPENSE', isControl: false, tallyLedger: 'Marketplace Commission' },
  ];

  const accountMap = new Map<string, string>();
  for (const def of chartDefinitions) {
    const acct = await prisma.ledgerAccount.create({
      data: {
        entityId,
        code: def.code,
        name: def.name,
        type: def.type,
        isControl: def.isControl,
        status: 'ACTIVE',
        tallyLedger: def.tallyLedger,
      },
    });
    accountMap.set(def.code, acct.id);
  }
  console.log(`✅ Created ${accountMap.size} Ledger Accounts.`);

  // 5. Seed sales_ar_mappings for automatic AR integration
  console.log('🔗 Configuring AR mappings...');
  const arMappings = [
    { key: 'ar_debtors_account', accountId: accountMap.get('1200')! },
    { key: 'ar_sales_b2b_account', accountId: accountMap.get('4100')! },
    { key: 'ar_sales_amazon_account', accountId: accountMap.get('4200')! },
    { key: 'ar_sales_pos_account', accountId: accountMap.get('4300')! },
    { key: 'ar_cgst_output_account', accountId: accountMap.get('2210')! },
    { key: 'ar_sgst_output_account', accountId: accountMap.get('2220')! },
    { key: 'ar_igst_output_account', accountId: accountMap.get('2230')! },
    { key: 'ar_bank_primary_account', accountId: accountMap.get('1110')! },
  ];
  for (const m of arMappings) {
    await prisma.$executeRaw`
      INSERT INTO "sales_ar_mappings" ("id", "entityId", "mappingKey", "accountId", "createdById", "createdAt")
      VALUES (${randomUUID()}, ${entityId}, ${m.key}, ${m.accountId}, ${ADMIN_ID}, CURRENT_TIMESTAMP)
      ON CONFLICT ("entityId", "mappingKey") DO UPDATE SET "accountId"=EXCLUDED."accountId";
    `;
  }

  // 6. Seed Opening & Ongoing Journal Vouchers (Balanced Double Entry)
  console.log('📖 Seeding Journal Vouchers & Double Entry Ledger...');
  const openingJournalId = randomUUID();
  await prisma.journalVoucher.create({
    data: {
      id: openingJournalId,
      entityId,
      periodId: currentPeriodId,
      voucherNumber: 'JV-2026-OPEN-001',
      accountingDate: new Date('2026-11-01T00:00:00.000Z'),
      description: 'Opening Capital & Banking Balances for FY2026-27 Q3 Operations',
      kind: 'OPENING',
      status: 'DRAFT',
      idempotencyKey: `JV-IDEMP-${randomUUID()}`,
      payloadHash: `hash-${randomUUID()}`,
      createdById: ADMIN_ID,
      lines: {
        create: [
          {
            lineNumber: 1,
            accountId: accountMap.get('1110')!, // HDFC Bank Debit
            debit: new Prisma.Decimal('5000000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Opening balance in HDFC Current Account',
          },
          {
            lineNumber: 2,
            accountId: accountMap.get('1120')!, // ICICI Bank Debit
            debit: new Prisma.Decimal('2500000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Opening balance in ICICI Operating Account',
          },
          {
            lineNumber: 3,
            accountId: accountMap.get('1150')!, // Petty Cash Debit
            debit: new Prisma.Decimal('100000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Petty cash impress balance',
          },
          {
            lineNumber: 4,
            accountId: accountMap.get('1310')!, // Raw Material Stock Debit
            debit: new Prisma.Decimal('3400000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Opening raw material inventory stock value',
          },
          {
            lineNumber: 5,
            accountId: accountMap.get('1320')!, // Finished Goods Stock Debit
            debit: new Prisma.Decimal('2000000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Opening finished goods warehouse value',
          },
          {
            lineNumber: 6,
            accountId: accountMap.get('3100')!, // Equity Share Capital Credit
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal('10000000.00'),
            memo: 'Subscribed equity share capital',
          },
          {
            lineNumber: 7,
            accountId: accountMap.get('3200')!, // Retained Earnings Credit
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal('3000000.00'),
            memo: 'Accumulated retained earnings reserves',
          },
        ],
      },
    },
  });
  await prisma.journalVoucher.update({
    where: { id: openingJournalId },
    data: {
      status: 'POSTED',
      approvedById: ADMIN_ID,
      approvedAt: new Date('2026-11-01T10:00:00.000Z'),
      postedById: ADMIN_ID,
      postedAt: new Date('2026-11-01T10:00:00.000Z'),
    },
  });

  // Contra Voucher - Cash withdrawal from Bank to Petty Cash
  const contraJournalId = randomUUID();
  await prisma.journalVoucher.create({
    data: {
      id: contraJournalId,
      entityId,
      periodId: currentPeriodId,
      voucherNumber: 'CN-2026-001',
      accountingDate: new Date('2026-11-05T00:00:00.000Z'),
      description: 'Cash withdrawal from HDFC Bank to replenish factory petty cash',
      kind: 'CONTRA',
      status: 'DRAFT',
      idempotencyKey: `JV-IDEMP-${randomUUID()}`,
      payloadHash: `hash-${randomUUID()}`,
      createdById: ADMIN_ID,
      lines: {
        create: [
          {
            lineNumber: 1,
            accountId: accountMap.get('1150')!, // Petty Cash Dr
            debit: new Prisma.Decimal('50000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Petty cash replenished via Cheque #492011',
          },
          {
            lineNumber: 2,
            accountId: accountMap.get('1110')!, // HDFC Bank Cr
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal('50000.00'),
            memo: 'Cheque #492011 drawn on HDFC Bank',
          },
        ],
      },
    },
  });
  await prisma.journalVoucher.update({
    where: { id: contraJournalId },
    data: {
      status: 'POSTED',
      approvedById: ADMIN_ID,
      approvedAt: new Date('2026-11-05T12:00:00.000Z'),
      postedById: ADMIN_ID,
      postedAt: new Date('2026-11-05T12:00:00.000Z'),
    },
  });

  // General Adjustment Journal - Factory Machine Maintenance Accrual
  const adjJournalId = randomUUID();
  await prisma.journalVoucher.create({
    data: {
      id: adjJournalId,
      entityId,
      periodId: currentPeriodId,
      voucherNumber: 'JV-2026-002',
      accountingDate: new Date('2026-11-10T00:00:00.000Z'),
      description: 'CNC Machine Monthly Preventive Servicing & Spares Accrual',
      kind: 'JOURNAL',
      status: 'DRAFT',
      idempotencyKey: `JV-IDEMP-${randomUUID()}`,
      payloadHash: `hash-${randomUUID()}`,
      createdById: ADMIN_ID,
      lines: {
        create: [
          {
            lineNumber: 1,
            accountId: accountMap.get('6400')!, // Maintenance Dr
            debit: new Prisma.Decimal('45000.00'),
            credit: new Prisma.Decimal('0.00'),
            memo: 'Preventive calibration and seal replacement',
          },
          {
            lineNumber: 2,
            accountId: accountMap.get('2100')!, // Sundry Creditors Cr
            debit: new Prisma.Decimal('0.00'),
            credit: new Prisma.Decimal('45000.00'),
            memo: 'Provision for Shree CNC Machining calibration bill',
          },
        ],
      },
    },
  });
  await prisma.journalVoucher.update({
    where: { id: adjJournalId },
    data: {
      status: 'POSTED',
      approvedById: ADMIN_ID,
      approvedAt: new Date('2026-11-10T16:00:00.000Z'),
      postedById: ADMIN_ID,
      postedAt: new Date('2026-11-10T16:00:00.000Z'),
    },
  });
  console.log('✅ Journal Vouchers seeded successfully.');

  // 7. Seed Purchases & Payables (AP Bills) linked to Real POs, GRNs & Vendors
  console.log('📦 Seeding AP Bills (Purchases & Payables)...');
  const pos = await prisma.purchaseOrder.findMany({
    include: {
      lines: true,
    },
    take: 10,
  });

  const grns = await prisma.goodsReceiptNote.findMany({
    include: {
      po: true,
      lines: true,
    },
    take: 10,
  });

  let billCounter = 1;
  const createdBills = [];
  for (const grn of grns) {
    const po = grn.po;
    if (!po) continue;
    const vendor = await prisma.vendor.findUnique({ where: { id: po.vendorId } });
    if (!vendor) continue;

    const invoiceNum = `BILL-${po.poNumber.slice(-4)}-${String(billCounter).padStart(3, '0')}`;
    const invoiceDate = grn.receivedAt || new Date('2026-11-08T00:00:00.000Z');
    const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Calculate line sums
    let subtotal = 0;
    const billLines = [];
    let lineNum = 1;
    for (const line of grn.lines) {
      const unitPrice = 120.00;
      const accepted = Number(line.acceptedQuantity) || 50;
      const amount = accepted * unitPrice;
      const isKarnataka = (vendor.taxNumber?.startsWith('29') ?? true);
      const gstRate = 18.00;
      const cgst = isKarnataka ? (amount * 0.09) : 0;
      const sgst = isKarnataka ? (amount * 0.09) : 0;
      const igst = !isKarnataka ? (amount * 0.18) : 0;
      subtotal += amount;

      billLines.push({
        lineNumber: lineNum++,
        poLineId: line.poLineId,
        grnLineId: line.id,
        description: `Material received on GRN ${grn.grnNumber}`,
        hsnSacCode: '7306',
        quantity: new Prisma.Decimal(accepted.toFixed(4)),
        unitPrice: new Prisma.Decimal(unitPrice.toFixed(4)),
        gstRate: new Prisma.Decimal(gstRate.toFixed(2)),
        taxableAmount: new Prisma.Decimal(amount.toFixed(2)),
        cgstAmount: new Prisma.Decimal(cgst.toFixed(2)),
        sgstAmount: new Prisma.Decimal(sgst.toFixed(2)),
        igstAmount: new Prisma.Decimal(igst.toFixed(2)),
        debitAccountId: accountMap.get('5100')!,
      });
    }

    if (subtotal === 0) {
      subtotal = 15000;
      billLines.push({
        lineNumber: 1,
        description: `Steel Pipes and Structural Inward Delivery for ${po.poNumber}`,
        hsnSacCode: '7306',
        quantity: new Prisma.Decimal('100.0000'),
        unitPrice: new Prisma.Decimal('150.0000'),
        gstRate: new Prisma.Decimal('18.00'),
        taxableAmount: new Prisma.Decimal('15000.00'),
        cgstAmount: new Prisma.Decimal('1350.00'),
        sgstAmount: new Prisma.Decimal('1350.00'),
        igstAmount: new Prisma.Decimal('0.00'),
        debitAccountId: accountMap.get('5100')!,
      });
    }

    const billStatus: PurchaseBillStatus = billCounter % 3 === 0 ? PurchaseBillStatus.POSTED : billCounter % 3 === 1 ? PurchaseBillStatus.APPROVED : PurchaseBillStatus.DRAFT;
    const matchStatus: PurchaseBillMatchStatus = billCounter % 2 === 0 ? PurchaseBillMatchStatus.MATCHED : PurchaseBillMatchStatus.REVIEWED_WITH_EXCEPTIONS;

    // Create initially as DRAFT to satisfy Postgres trigger accounts_guard_purchase_bill
    const bill = await prisma.purchaseBill.create({
      data: {
        entityId,
        vendorId: vendor.id,
        vendorNameSnapshot: vendor.name,
        vendorGstinSnapshot: vendor.taxNumber || '29AAAPL1234A1Z1',
        supplierInvoiceNumber: invoiceNum,
        normalizedInvoiceNumber: invoiceNum.toLowerCase().replace(/[^a-z0-9]/g, ''),
        invoiceDate,
        dueDate,
        kind: PurchaseBillKind.STOCK,
        currency: 'INR',
        status: PurchaseBillStatus.DRAFT,
        matchStatus,
        matchFindings: [
          { rule: 'PO_MATCH', status: 'PASS', remarks: `Matched with ${po.poNumber}` },
          { rule: 'GRN_QUANTITY', status: 'PASS', remarks: `Verified against ${grn.grnNumber}` },
          { rule: 'PRICE_TOLERANCE', status: 'PASS', remarks: '0% deviation within approved price tolerance' },
        ],
        resolutionNote: 'Automated 3-way match verified against Gate GRN and PO line items',
        idempotencyKey: `BILL-IDEMP-${randomUUID()}`,
        payloadHash: `hash-${randomUUID()}`,
        createdById: ADMIN_ID,
        lines: {
          create: billLines,
        },
      },
    });

    // If target status is SUBMITTED, APPROVED, or POSTED, transition version
    if (billStatus !== PurchaseBillStatus.DRAFT) {
      await prisma.purchaseBill.update({
        where: { id: bill.id },
        data: {
          status: billStatus,
          version: 2,
          submittedById: ADMIN_ID,
          submittedAt: new Date('2026-11-09T09:00:00.000Z'),
          approvedById: ADMIN_ID,
          approvedAt: new Date('2026-11-09T11:00:00.000Z'),
          resolvedById: ADMIN_ID,
        },
      });
    }

    createdBills.push(bill);
    billCounter++;
  }
  console.log(`✅ Seeded ${createdBills.length} Purchase Bills with 3-Way GRN matching.`);

  // 8. Seed Debit Notes (Shortages, QC Rejections, Rework Charges on Real POs/GRNs)
  console.log('📝 Seeding Real-time Debit Notes on POs, GRNs & Job-Works...');
  const debitNotesData = [
    {
      number: 'DN-2026-001',
      reason: 'Dimensional tolerance defect & surface dent on steel flanges rejected during inward QC inspection',
      taxable: '18500.00',
      tax: '3330.00',
      total: '21830.00',
      status: DebitNoteWorkflowStatus.APPROVED,
      evidence: { qcReportNumber: 'QC-INW-2026-081', rejectedPcs: 14, inspectionDate: '2026-11-06' },
    },
    {
      number: 'DN-2026-002',
      reason: 'Short supply variance against delivery challan and PO packing slip during gate inward weighing',
      taxable: '12400.00',
      tax: '2232.00',
      total: '14632.00',
      status: DebitNoteWorkflowStatus.SUBMITTED,
      evidence: { weighbridgeReceipt: 'WB-BLR-9921', shortageKg: 85, verifiedBy: 'Security & Store' },
    },
    {
      number: 'DN-2026-003',
      reason: 'Rework and de-burring charges incurred in-house due to poor thread tapping on batch #JWO-882',
      taxable: '8900.00',
      tax: '1602.00',
      total: '10502.00',
      status: DebitNoteWorkflowStatus.APPROVED,
      evidence: { reworkJobCard: 'RW-2026-11-04', machineHours: 6.5, operatorCost: 8900 },
    },
    {
      number: 'DN-2026-004',
      reason: 'Powder coating flaking and blistering on sheet metal enclosures JWO-2026-PIONEER-002',
      taxable: '24600.00',
      tax: '4428.00',
      total: '29028.00',
      status: DebitNoteWorkflowStatus.RECORDED,
      evidence: { visualInspectionNote: 'Adhesion peel-off > 35%', correctiveActionId: 'CA-REWORK-007' },
    },
    {
      number: 'DN-2026-005',
      reason: 'Material hardness failing ASTM A105 standard as per Metallurgical spectrometer test certificate',
      taxable: '42000.00',
      tax: '7560.00',
      total: '49560.00',
      status: DebitNoteWorkflowStatus.DRAFT,
      evidence: { labCertNo: 'LAB-SPECTRO-2026-44', failedParam: 'Rockwell Hardness B-Scale' },
    },
    {
      number: 'DN-2026-006',
      reason: 'Delay penalty liquidated damages of 0.5% per week as per agreed Purchase Order delivery terms',
      taxable: '15000.00',
      tax: '0.00',
      total: '15000.00',
      status: DebitNoteWorkflowStatus.APPROVED,
      evidence: { promisedDate: '2026-10-15', actualDeliveryDate: '2026-11-05', delayedWeeks: 3 },
    },
  ];

  const allVendors = await prisma.vendor.findMany({ take: 10 });
  for (let i = 0; i < debitNotesData.length; i++) {
    const item = debitNotesData[i];
    const vendor = allVendors[i % allVendors.length];
    const po = pos[i % pos.length];
    const grn = grns[i % grns.length];

    await prisma.debitNote.create({
      data: {
        debitNoteNumber: item.number,
        vendorId: vendor.id,
        poId: po?.id,
        grnId: grn?.id,
        invoiceNumber: `INV-SUPP-${vendor.code}-${100 + i}`,
        currency: 'INR',
        status: item.status,
        reason: item.reason,
        taxableAmount: new Prisma.Decimal(item.taxable),
        taxAmount: new Prisma.Decimal(item.tax),
        totalAmount: new Prisma.Decimal(item.total),
        evidence: item.evidence,
        createdBy: ADMIN_ID,
        approvedBy: item.status === DebitNoteWorkflowStatus.APPROVED ? ADMIN_ID : undefined,
        submittedAt: item.status !== DebitNoteWorkflowStatus.DRAFT ? new Date('2026-11-09T10:00:00.000Z') : undefined,
        approvedAt: item.status === DebitNoteWorkflowStatus.APPROVED ? new Date('2026-11-10T14:30:00.000Z') : undefined,
        lines: {
          create: [
            {
              description: item.reason,
              expectedQuantity: new Prisma.Decimal('10.0000'),
              receivedQuantity: new Prisma.Decimal('10.0000'),
              acceptedQuantity: new Prisma.Decimal('0.0000'),
              rejectedQuantity: new Prisma.Decimal('10.0000'),
              damagedQuantity: new Prisma.Decimal('0.0000'),
              shortQuantity: new Prisma.Decimal('0.0000'),
              unitPrice: new Prisma.Decimal((Number(item.taxable) / 10).toFixed(2)),
              taxableAmount: new Prisma.Decimal(item.taxable),
              taxRate: new Prisma.Decimal('18.00'),
              taxAmount: new Prisma.Decimal(item.tax),
              totalAmount: new Prisma.Decimal(item.total),
            },
          ],
        },
        documents: {
          create: [
            {
              fileName: `${item.number}-inspection-report.pdf`,
              fileUrl: `/uploads/debit-notes/${item.number}.pdf`,
              createdBy: ADMIN_ID,
            },
          ],
        },
      },
    });
  }
  console.log(`✅ Seeded ${debitNotesData.length} Realtime Debit Notes.`);

  // 9. Seed Sales Invoices, Pro Formas, & Credit Notes (Sales AR)
  console.log('🛍️ Seeding Sales Invoices & Pro Formas (AR)...');
  const salesOrders = await prisma.salesOrder.findMany({
    include: {
      lines: true,
    },
    take: 25,
  });

  const customers = await prisma.customer.findMany({ take: 20 });
  const custMap = new Map<string, any>();
  for (const c of customers) {
    custMap.set(c.id, c);
  }

  let invIdx = 1;
  const postedInvoices = [];
  for (const so of salesOrders) {
    const cust = so.customerId ? custMap.get(so.customerId) : null;
    const custName = cust?.name || 'Institutional Client';
    const custGstin = cust?.taxNumber || '29AAACG1234A1Z5';

    const invNum = `INV-2026-${String(invIdx).padStart(5, '0')}`;
    const pfNum = `PF-2026-${String(invIdx).padStart(5, '0')}`;
    const issueDate = so.orderedAt || new Date('2026-11-05T00:00:00.000Z');
    const dueDate = new Date(issueDate.getTime() + 15 * 24 * 60 * 60 * 1000);
    const subtotal = Number(so.subtotal) || 12500;
    const discount = Number(so.discountTotal) || 0;
    const taxTotal = Number(so.taxTotal) || (subtotal * 0.18);
    const totalAmount = Number(so.grandTotal) || (subtotal - discount + taxTotal);

    // Seed Pro Forma for every sales order
    const pfId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "sales_ar_proformas" (
        "id", "entityId", "salesOrderId", "proFormaNumber", "issueDate", "customerName", "customerGstin", "currency", "status", "subtotal", "discountTotal", "taxTotal", "totalAmount", "createdById", "updatedAt"
      ) VALUES (
        ${pfId}, ${entityId}, ${so.id}, ${pfNum}, ${issueDate}, ${custName}, ${custGstin}, 'INR', 'DRAFT', ${subtotal}, ${discount}, ${taxTotal}, ${totalAmount}, ${ADMIN_ID}, CURRENT_TIMESTAMP
      );
    `;

    // Seed Pro Forma lines
    let pfLineNum = 1;
    for (const line of so.lines) {
      const lineQty = Number(line.orderedQuantity);
      const linePrice = Number(line.unitPrice);
      const lineGross = lineQty * linePrice;
      const lineTax = lineGross * 0.18;
      const lineDisc = Number(line.discountAmount) || 0;

      await prisma.$executeRaw`
        INSERT INTO "sales_ar_proforma_lines" (
          "id", "proFormaId", "salesOrderLineId", "lineNumber", "description", "sku", "quantity", "unitPrice", "discountAmount", "taxRate", "taxableAmount", "taxAmount"
        ) VALUES (
          ${randomUUID()}, ${pfId}, ${line.id}, ${pfLineNum++}, ${line.description || 'Industrial Pipe Fitting'}, ${line.sku || 'PLN-SKU-01'}, ${lineQty}, ${linePrice}, ${lineDisc}, 18.00, ${lineGross}, ${lineTax}
        );
      `;
    }

    // Seed Sales Invoice initially as DRAFT
    const invId = randomUUID();
    const invStatus = invIdx % 4 === 0 ? 'DRAFT' : invIdx % 4 === 1 ? 'APPROVED' : 'POSTED';
    const isPaid = invStatus === 'POSTED' && invIdx % 2 === 0;
    const paidAmount = isPaid ? totalAmount : 0;

    await prisma.$executeRaw`
      INSERT INTO "sales_ar_invoices" (
        "id", "entityId", "periodId", "customerId", "customerNameSnapshot", "customerGstinSnapshot", "invoiceNumber", "invoiceDate", "dueDate", "currency", "channel", "sourceType", "sourceKey", "salesOrderId", "status", "subtotal", "discountTotal", "taxTotal", "totalAmount", "paidAmount", "creditedAmount", "createdById", "approvedById", "postedById", "version", "idempotencyKey", "payloadHash", "createdAt", "updatedAt"
      ) VALUES (
        ${invId}, ${entityId}, ${currentPeriodId}, ${so.customerId}, ${custName}, ${custGstin}, ${invNum}, ${issueDate}, ${dueDate}, 'INR', ${so.channel}, 'SALES_ORDER', ${so.orderNumber}, ${so.id}, 'DRAFT', ${subtotal}, ${discount}, ${taxTotal}, ${totalAmount}, 0.00, 0.00, ${ADMIN_ID}, ${ADMIN_ID}, null, 1, ${`INV-IDEMP-${randomUUID()}`}, ${`hash-${randomUUID()}`}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `;

    // Seed Invoice lines while in DRAFT
    let invLineNum = 1;
    for (const line of so.lines) {
      const lineQty = Number(line.orderedQuantity);
      const linePrice = Number(line.unitPrice);
      const lineGross = lineQty * linePrice;
      const lineTax = lineGross * 0.18;
      const lineDisc = Number(line.discountAmount) || 0;

      await prisma.$executeRaw`
        INSERT INTO "sales_ar_invoice_lines" (
          "id", "invoiceId", "salesOrderLineId", "lineNumber", "description", "sku", "quantity", "unitPrice", "discountAmount", "taxRate", "taxableAmount", "taxAmount", "revenueAccountId"
        ) VALUES (
          ${randomUUID()}, ${invId}, ${line.id}, ${invLineNum++}, ${line.description || 'Industrial Pipe Fitting'}, ${line.sku || 'PLN-SKU-01'}, ${lineQty}, ${linePrice}, ${lineDisc}, 18.00, ${lineGross}, ${lineTax}, ${accountMap.get('4100')!}
        );
      `;
    }

    // Now transition to target status incrementing version
    if (invStatus !== 'DRAFT') {
      await prisma.$executeRaw`
        UPDATE "sales_ar_invoices"
        SET "status" = ${invStatus},
            "version" = 2,
            "postedById" = ${invStatus === 'POSTED' ? ADMIN_ID : null},
            "paidAmount" = ${paidAmount},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${invId};
      `;
    }

    if (invStatus === 'POSTED') {
      postedInvoices.push({ id: invId, customerId: so.customerId, customerName: custName, totalAmount, salesOrderId: so.id });
    }
    invIdx++;
  }
  console.log(`✅ Seeded ${salesOrders.length} Sales Pro Formas and ${invIdx - 1} AR Invoices.`);

  // 10. Seed Customer Receipts & Allocations
  console.log('💵 Seeding Customer Receipts & Allocations...');
  let receiptCounter = 1;
  for (const inv of postedInvoices.slice(0, 8)) {
    const rcptId = randomUUID();
    const receiptNum = `RCPT-2026-${String(receiptCounter).padStart(4, '0')}`;
    const bankAcctId = accountMap.get('1110')!;

    await prisma.$executeRaw`
      INSERT INTO "sales_ar_receipts" (
        "id", "entityId", "customerId", "customerNameSnapshot", "salesOrderId", "receiptDate", "amount", "currency", "method", "reference", "status", "bankAccountId", "idempotencyKey", "payloadHash", "createdById", "approvedById", "createdAt", "updatedAt"
      ) VALUES (
        ${rcptId}, ${entityId}, ${inv.customerId}, ${inv.customerName || 'Trade Customer'}, ${inv.salesOrderId}, CURRENT_DATE, ${inv.totalAmount}, 'INR', 'NEFT', ${receiptNum}, 'POSTED', ${bankAcctId}, ${`RCPT-IDEMP-${randomUUID()}`}, ${`hash-${randomUUID()}`}, ${ADMIN_ID}, ${ADMIN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `;

    // Seed Allocation against invoice
    await prisma.$executeRaw`
      INSERT INTO "sales_ar_allocations" (
        "id", "receiptId", "invoiceId", "amount", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${rcptId}, ${inv.id}, ${inv.totalAmount}, CURRENT_TIMESTAMP
      );
    `;
    receiptCounter++;
  }
  console.log(`✅ Seeded ${receiptCounter - 1} Customer AR Receipts with Allocations.`);

  // 11. Seed Credit Notes (Returns & Price Adjustments)
  console.log('📄 Seeding Sales Credit Notes (AR)...');
  let cnCounter = 1;
  for (const inv of postedInvoices.slice(8, 12)) {
    const cnId = randomUUID();
    const cnNum = `CN-2026-${String(cnCounter).padStart(4, '0')}`;
    const taxableAmount = 2500.00;
    const taxAmount = 450.00;
    const totalAmount = 2950.00;

    // Create a real salesFinancialReturn row to satisfy foreign key
    const returnId = randomUUID();
    await prisma.salesFinancialReturn.create({
      data: {
        id: returnId,
        salesOrderId: inv.salesOrderId,
        status: 'APPROVED',
        currency: 'INR',
        requestedAt: new Date('2026-11-10T10:00:00.000Z'),
        occurredAt: new Date('2026-11-10T12:00:00.000Z'),
        creditedNetAmount: new Prisma.Decimal(taxableAmount.toFixed(2)),
        taxCreditAmount: new Prisma.Decimal(taxAmount.toFixed(2)),
        sourceReference: `RET-${cnNum}`,
        createdByActorId: ADMIN_ID,
        completedByActorId: ADMIN_ID,
      },
    });

    await prisma.$executeRaw`
      INSERT INTO "sales_ar_credit_notes" (
        "id", "entityId", "invoiceId", "sourceReturnId", "creditNoteNumber", "creditDate", "taxableAmount", "taxAmount", "totalAmount", "status", "createdById", "approvedById", "version", "createdAt", "updatedAt"
      ) VALUES (
        ${cnId}, ${entityId}, ${inv.id}, ${returnId}, ${cnNum}, CURRENT_DATE, ${taxableAmount}, ${taxAmount}, ${totalAmount}, 'POSTED', ${ADMIN_ID}, ${ADMIN_ID}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `;
    cnCounter++;
  }
  console.log(`✅ Seeded ${cnCounter - 1} AR Credit Notes.`);

  // 12. Seed Miscellaneous Expenses across All Categories
  console.log('💸 Seeding Miscellaneous Expenses across all categories...');
  const expenseEntries = [
    {
      expenseNumber: 'EXP-2026-001',
      category: ExpenseCategory.TRANSPORTATION,
      title: 'Factory Chassis Local Transport',
      expenseDate: new Date('2026-11-02T10:00:00.000Z'),
      amount: '8500.00',
      description: 'Tempo truck freight for delivering fabricated chassis to Peenya plant',
      payeeName: 'Sri Balaji Local Logistics',
      paymentMode: ExpensePaymentMode.UPI,
      referenceNumber: 'UPI-BALAJI-449102',
      expenseAccountId: accountMap.get('6100')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/trans-001.pdf',
    },
    {
      expenseNumber: 'EXP-2026-002',
      category: ExpenseCategory.ELECTRICIAN_MAINTENANCE,
      title: '3-Phase Busbar Electrical Rewiring',
      expenseDate: new Date('2026-11-03T11:30:00.000Z'),
      amount: '4200.00',
      description: 'Factory 3-phase busbar rewiring and replacement of 63A MCB switches',
      payeeName: 'Kumar Electrical Works',
      paymentMode: ExpensePaymentMode.CASH,
      referenceNumber: 'VOUCHER-ELEC-881',
      expenseAccountId: accountMap.get('6400')!,
      paidThroughAccountId: accountMap.get('1150')!,
      receiptUrl: '/receipts/elec-002.pdf',
    },
    {
      expenseNumber: 'EXP-2026-003',
      category: ExpenseCategory.LABOUR_WAGES,
      title: 'Weekend Assembly Line Overtime',
      expenseDate: new Date('2026-11-05T18:00:00.000Z'),
      amount: '18500.00',
      description: 'Overtime wages for weekend night-shift assembly line workers (10 persons)',
      payeeName: 'Assembly Line Floor Team',
      paymentMode: ExpensePaymentMode.BANK_TRANSFER,
      referenceNumber: 'WAGES-OT-WK44',
      expenseAccountId: accountMap.get('6300')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/wages-003.pdf',
    },
    {
      expenseNumber: 'EXP-2026-004',
      category: ExpenseCategory.UTILITIES_ELECTRICITY,
      title: 'BESCOM High Tension Factory Power',
      expenseDate: new Date('2026-11-07T09:00:00.000Z'),
      amount: '38200.00',
      description: 'BESCOM High Tension Industrial Power Consumption Bill for October 2026',
      payeeName: 'Bangalore Electricity Supply Co (BESCOM)',
      paymentMode: ExpensePaymentMode.BANK_TRANSFER,
      referenceNumber: 'BESCOM-HT-9920192',
      expenseAccountId: accountMap.get('6200')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/bescom-004.pdf',
    },
    {
      expenseNumber: 'EXP-2026-005',
      category: ExpenseCategory.OFFICE_SUPPLIES,
      title: 'Barcoded Thermal Labels and Ribbons',
      expenseDate: new Date('2026-11-08T14:15:00.000Z'),
      amount: '6300.00',
      description: 'Barcoded thermal sticker rolls (50 qty) and resin ribbons for factory labeling',
      payeeName: 'Apex Barcode Solutions',
      paymentMode: ExpensePaymentMode.UPI,
      referenceNumber: 'UPI-APEX-771822',
      expenseAccountId: accountMap.get('6500')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/supplies-005.pdf',
    },
    {
      expenseNumber: 'EXP-2026-006',
      category: ExpenseCategory.FUEL_CONVEYANCE,
      title: 'Diesel Fuel for Backup Generator',
      expenseDate: new Date('2026-11-09T16:45:00.000Z'),
      amount: '3400.00',
      description: 'Diesel fuel refill for 50kVA emergency factory backup DG generator',
      payeeName: 'Indian Oil Corporation Dealer Peenya',
      paymentMode: ExpensePaymentMode.PETTY_CASH,
      referenceNumber: 'IOCL-BILL-33104',
      expenseAccountId: accountMap.get('6400')!,
      paidThroughAccountId: accountMap.get('1150')!,
      receiptUrl: '/receipts/fuel-006.pdf',
    },
    {
      expenseNumber: 'EXP-2026-007',
      category: ExpenseCategory.FREIGHT_COURIER,
      title: 'Urgent Express NABL Lab Sample Courier',
      expenseDate: new Date('2026-11-10T12:00:00.000Z'),
      amount: '2800.00',
      description: 'Urgent express air courier charges for metallurgical test coupons to NABL lab',
      payeeName: 'Blue Dart Express Ltd',
      paymentMode: ExpensePaymentMode.BANK_TRANSFER,
      referenceNumber: 'AWB-BLD-88291039',
      expenseAccountId: accountMap.get('6100')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/courier-007.pdf',
    },
    {
      expenseNumber: 'EXP-2026-008',
      category: ExpenseCategory.TEA_REFRESHMENTS,
      title: 'Shop Floor Monthly Canteen Refreshments',
      expenseDate: new Date('2026-11-11T17:30:00.000Z'),
      amount: '2250.00',
      description: 'Monthly tea, coffee, milk and biscuits canteen provision for shop floor staff',
      payeeName: 'Sri Sai Canteen Services',
      paymentMode: ExpensePaymentMode.PETTY_CASH,
      referenceNumber: 'CANTEEN-NOV-01',
      expenseAccountId: accountMap.get('6500')!,
      paidThroughAccountId: accountMap.get('1150')!,
      receiptUrl: '/receipts/canteen-008.pdf',
    },
    {
      expenseNumber: 'EXP-2026-009',
      category: ExpenseCategory.WAREHOUSE_OPERATIONS,
      title: 'Forklift Hydraulic Oil Servicing',
      expenseDate: new Date('2026-11-12T13:00:00.000Z'),
      amount: '7500.00',
      description: 'Hydraulic fluid replacement and mast lubrication on Godrej 3-ton warehouse forklift',
      payeeName: 'Godrej Material Handling Spares',
      paymentMode: ExpensePaymentMode.UPI,
      referenceNumber: 'UPI-GMH-55104',
      expenseAccountId: accountMap.get('6400')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/warehouse-009.pdf',
    },
    {
      expenseNumber: 'EXP-2026-010',
      category: ExpenseCategory.PROFESSIONAL_LEGAL,
      title: 'Factory Inspector License Renewal Filing',
      expenseDate: new Date('2026-11-13T10:00:00.000Z'),
      amount: '12000.00',
      description: 'Statutory compliance legal consultation and annual industrial safety audit fee',
      payeeName: 'Apex Legal & Industrial Consultants',
      paymentMode: ExpensePaymentMode.BANK_TRANSFER,
      referenceNumber: 'LEGAL-INV-9901',
      expenseAccountId: accountMap.get('6500')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/legal-010.pdf',
    },
    {
      expenseNumber: 'EXP-2026-011',
      category: ExpenseCategory.MISCELLANEOUS,
      title: 'Plant Fire Extinguisher Refill & Tagging',
      expenseDate: new Date('2026-11-14T11:00:00.000Z'),
      amount: '5500.00',
      description: 'Annual hydrostatic pressure testing and dry chemical powder refill for 12 extinguishers',
      payeeName: 'Ceasefire Industries Services',
      paymentMode: ExpensePaymentMode.BANK_TRANSFER,
      referenceNumber: 'FIRE-INV-2026-88',
      expenseAccountId: accountMap.get('6400')!,
      paidThroughAccountId: accountMap.get('1110')!,
      receiptUrl: '/receipts/fire-011.pdf',
    },
  ];

  for (const exp of expenseEntries) {
    await prisma.miscellaneousExpense.create({
      data: {
        entityId,
        expenseNumber: exp.expenseNumber,
        category: exp.category,
        title: exp.title,
        expenseDate: exp.expenseDate,
        amount: new Prisma.Decimal(exp.amount),
        taxAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal(exp.amount),
        description: exp.description,
        payeeName: exp.payeeName,
        paymentStatus: ExpensePaymentStatus.PAID,
        paymentMode: exp.paymentMode,
        referenceNumber: exp.referenceNumber,
        receiptUrl: exp.receiptUrl,
        expenseAccountId: exp.expenseAccountId,
        paidThroughAccountId: exp.paidThroughAccountId,
        status: 'RECORDED',
        createdById: ADMIN_ID,
      },
    });
  }
  console.log(`✅ Seeded ${expenseEntries.length} Miscellaneous Expenses.`);

  // 13. Seed Marketplace Settlements (Amazon & E-Trade Recon)
  console.log('📊 Seeding Marketplace Reconciliation Batches...');
  const batches = [
    {
      channel: 'AMAZON',
      externalBatchId: 'AMZ-STMT-2026-W44',
      settlementDate: new Date('2026-11-06T00:00:00.000Z'),
      gross: 345000.00,
      fees: 48300.00,
      tcs: 3450.00,
      tds: 3450.00,
      net: 289800.00,
      bankRef: 'CMS/AMZN/20261106/001920',
      status: 'POSTED',
    },
    {
      channel: 'AMAZON',
      externalBatchId: 'AMZ-STMT-2026-W45',
      settlementDate: new Date('2026-11-13T00:00:00.000Z'),
      gross: 412000.00,
      fees: 57680.00,
      tcs: 4120.00,
      tds: 4120.00,
      net: 346080.00,
      bankRef: 'CMS/AMZN/20261113/008819',
      status: 'MATCHED',
    },
    {
      channel: 'E_TRADE',
      externalBatchId: 'ETRADE-SETTLE-NOV-01',
      settlementDate: new Date('2026-11-08T00:00:00.000Z'),
      gross: 180000.00,
      fees: 18000.00,
      tcs: 1800.00,
      tds: 1800.00,
      net: 158400.00,
      bankRef: 'NEFT/ETRADE/20261108/771029',
      status: 'POSTED',
    },
    {
      channel: 'E_TRADE',
      externalBatchId: 'ETRADE-SETTLE-NOV-02',
      settlementDate: new Date('2026-11-14T00:00:00.000Z'),
      gross: 220000.00,
      fees: 22000.00,
      tcs: 2200.00,
      tds: 2200.00,
      net: 193600.00,
      bankRef: 'NEFT/ETRADE/20261114/881902',
      status: 'EXCEPTION',
    },
  ];

  for (const b of batches) {
    await prisma.$executeRaw`
      INSERT INTO "sales_ar_marketplace_batches" (
        "id", "entityId", "channel", "externalBatchId", "settlementDate", "grossAmount", "feesAmount", "gstTcsAmount", "incomeTdsAmount", "netPayoutAmount", "bankReference", "status", "createdById", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${entityId}, ${b.channel}, ${b.externalBatchId}, ${b.settlementDate}, ${b.gross}, ${b.fees}, ${b.tcs}, ${b.tds}, ${b.net}, ${b.bankRef}, ${b.status}, ${ADMIN_ID}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `;
  }
  console.log(`✅ Seeded ${batches.length} Marketplace Reconciliation Batches.`);

  console.log('🎉 FINANCE & ACCOUNTS FULL SEEDING COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
