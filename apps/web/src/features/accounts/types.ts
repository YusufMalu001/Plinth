export type AccountingEntityStatus = 'CONFIGURING' | 'ACTIVE' | 'ARCHIVED';

export interface AccountingEntity {
  id: string;
  code: string;
  legalName: string;
  gstin: string;
  stateCode: string;
  status: AccountingEntityStatus;
  baseCurrency?: string;
  createdById: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED';

export interface AccountingPeriod {
  id: string;
  entityId: string;
  code: string;
  fiscalYear: string;
  startsOn: string;
  endsOn: string;
  status: PeriodStatus;
  closedAt?: string;
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface LedgerAccount {
  id: string;
  entityId: string;
  code: string;
  name: string;
  type: AccountType;
  status: 'ACTIVE' | 'INACTIVE';
  isControl: boolean;
  tallyLedger?: string;
  currentBalance?: string;
}

export type VoucherKind = 'JOURNAL' | 'OPENING' | 'CONTRA' | 'REVERSAL';
export type VoucherStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REVERSED';

export interface JournalLine {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  memo?: string;
  partyType?: 'VENDOR' | 'CUSTOMER' | 'BANK';
  partyId?: string;
  costCenterId?: string;
  account?: Pick<LedgerAccount, 'code' | 'name' | 'type'>;
}

export interface JournalVoucher {
  id: string;
  entityId: string;
  periodId: string;
  voucherNumber?: string;
  kind: VoucherKind;
  status: VoucherStatus;
  accountingDate: string;
  description: string;
  sourceModule?: string;
  sourceId?: string;
  sourceRevision?: number;
  idempotencyKey?: string;
  payloadHash?: string;
  version: number;
  createdById: string;
  approvedById?: string;
  postedById?: string;
  reversalOfId?: string;
  submittedAt?: string;
  approvedAt?: string;
  postedAt?: string;
  lines: JournalLine[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
  openingBalance?: string;
  closingBalance?: string;
  isControl?: boolean;
}

export type PurchaseBillKind = 'STOCK' | 'SERVICE' | 'CAPITAL' | 'LOGISTICS';
export type PurchaseBillStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'CANCELLED';
export type PurchaseBillMatchStatus = 'UNMATCHED' | 'MATCHED' | 'EXCEPTION' | 'REVIEWED_WITH_EXCEPTIONS';

export interface PurchaseBillLine {
  id: string;
  lineNumber: number;
  description: string;
  hsnSacCode?: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  poLineId?: string;
  grnLineId?: string;
  debitAccountId?: string;
  debitAccount?: Pick<LedgerAccount, 'code' | 'name'>;
  poLine?: { id: string; purchaseOrder: { id: string; poNumber: string; status: string; orderDate?: string } };
  grnLine?: { id: string; grn: { id: string; grnNumber: string; status: string; receivedDate?: string } };
  product?: { id: string; sku: string; name: string; uom?: { code: string; name: string } };
  material?: { id: string; code: string; name: string; uom?: { code: string; name: string } };
}

export interface PurchaseBillDebitNote {
  id: string;
  debitNoteNumber: string;
  status: string;
  totalAmount: string;
  reason?: string;
  createdAt?: string;
}

export interface PurchaseBillPayment {
  id: string;
  paymentDate: string;
  amount: string;
  paymentMode: string;
  reference: string;
  notes?: string | null;
  createdAt: string;
  recordedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface PurchaseBill {
  id: string;
  entityId: string;
  vendorId: string;
  vendorNameSnapshot: string;
  vendorGstinSnapshot?: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kind: PurchaseBillKind;
  status: PurchaseBillStatus;
  matchStatus: PurchaseBillMatchStatus;
  matchFindings: Array<{ code: string; severity: 'BLOCKING' | 'REVIEW' | 'WARNING'; lineNumber?: number; message: string }>;
  resolutionNote?: string;
  version: number;
  createdById: string;
  submittedById?: string;
  approvedById?: string;
  resolvedById?: string;
  lines: PurchaseBillLine[];
  vendor?: {
    id: string;
    code: string;
    name: string;
    legalName?: string;
    taxNumber?: string;
    paymentTerms?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    currency?: string;
    address?: any;
  };
  entity?: {
    id: string;
    code: string;
    legalName: string;
    gstin: string;
    stateCode: string;
  };
  totalTaxable?: string;
  totalCgst?: string;
  totalSgst?: string;
  totalIgst?: string;
  totalTax?: string;
  grossTotal?: string;
  debitNoteClaimTotal?: string;
  pendingDebitNoteClaimTotal?: string;
  debitNoteDeduction?: string;
  netPayable?: string;
  totalAmount?: string;
  paidAmount?: string;
  balanceAmount?: string;
  paymentStatus?: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'NO_VALUE';
  payments?: PurchaseBillPayment[];
  debitNotes?: PurchaseBillDebitNote[];
  primaryPoNumber?: string | null;
  primaryGrnNumber?: string | null;
  relatedPurchaseOrders?: Array<{ id: string; poNumber: string; status: string; date?: string }>;
  relatedGrns?: Array<{ id: string; grnNumber: string; status: string; receivedDate?: string }>;
  createdByUser?: { id: string; name: string | null; email: string } | null;
  submittedByUser?: { id: string; name: string | null; email: string } | null;
  approvedByUser?: { id: string; name: string | null; email: string } | null;
  relatedReceipts?: Array<{
    id: string;
    grnNumber: string;
    payments: Array<{ id: string; paymentDate: string; amount: string; paymentMode: string; reference: string }>;
    debitNotes: Array<{ id: string; debitNoteNumber: string; status: string; totalAmount: string }>;
  }>;
}

export interface ReceiptLineCandidate {
  id: string;
  grnNumber: string;
  vendorId?: string;
  poNumber: string;
  poLineId?: string;
  acceptedQuantity: string;
  unitPrice?: string;
  item: string;
  receivedDate?: string;
}

export type GrnPaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'NO_VALUE';
export interface AcceptedGrnLine {
  id: string;
  description: string;
  sku?: string | null;
  uom: string;
  expectedQuantity?: number | null;
  acceptedQuantity: string;
  unitPrice: string;
  taxRate?: string;
  expectedPayable: string;
  billedQuantity?: string;
  remainingBillableQuantity?: string;
  poLineId?: string | null;
  receivedQuantity?: number;
  rejectedQuantity?: number;
  damagedQuantity?: number;
  shortQuantity?: number;
  discrepancies?: Array<{ id: string; type: string; quantity: number; status: string }>;
}
export interface AccountsGrnDebitNote {
  id: string;
  debitNoteNumber: string;
  status: string;
  totalAmount: string;
  reason?: string;
  createdAt?: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
}
export interface AcceptedGrn {
  id: string;
  grnNumber: string;
  status: string;
  receivedAt: string;
  signedOffAt?: string | null;
  finalizedAt?: string | null;
  vendorId: string;
  vendorName: string;
  poId: string;
  poNumber: string;
  expectedAmount: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: GrnPaymentStatus;
  lineCount: number;
  lines: AcceptedGrnLine[];
  debitNotes?: AccountsGrnDebitNote[];
  supplierBills?: Array<{
    id: string;
    supplierInvoiceNumber: string;
    status: string;
    totalAmount?: string;
    paidAmount?: string;
    balanceAmount?: string;
    paymentStatus?: GrnPaymentStatus;
  }>;
}
export interface GrnPaymentInput {
  paymentDate: string;
  amount: string;
  paymentMode: PaymentMode;
  reference: string;
  notes?: string;
}
export interface GrnPaymentRecord extends GrnPaymentInput {
  id: string;
  createdAt: string;
  recordedBy: { id: string; name?: string | null; email: string };
}
export interface AcceptedGrnDetail extends AcceptedGrn {
  billCreationIssue?: string | null;
  receivedByActorId: string;
  verifiedByActorId?: string | null;
  signedOffByActorId?: string | null;
  finalizedByActorId?: string | null;
  po: { id: string; poNumber: string; status: string; paymentTerms?: string | null; totalAmount: string };
  vendor: { id: string; name: string; legalName?: string | null; code: string; taxNumber?: string | null; gstin?: string | null; address?: unknown };
  location?: { id: string; code: string; name: string } | null;
  documents?: Array<{ id: string; fileName: string; fileUrl: string; documentType?: string; createdAt: string }>;
  createdAt?: string;
  verifiedAt?: string | null;
  supplierInvoices: Array<{
    id: string;
    supplierInvoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    status: string;
    matchStatus: string;
    amount: string;
    paidAmount?: string;
    balanceAmount?: string;
    paymentStatus?: GrnPaymentStatus;
  }>;
  lines: Array<AcceptedGrnLine & { receivedQuantity: number; rejectedQuantity: number; damagedQuantity: number; poLineId?: string | null }>;
  accountsPayments: GrnPaymentRecord[];
  operationalDebitNotes: AccountsGrnDebitNote[];
}

export type InvoiceType = 'B2B' | 'B2C' | 'EXPORT' | 'MARKETPLACE' | 'POS' | 'SERVICE';
export type InvoiceStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ISSUED' | 'POSTED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface SalesInvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  hsnSacCode?: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  itemId?: string;
  salesOrderLineId?: string;
}

export interface SalesInvoice {
  id: string;
  version?: number;
  entityId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  type: InvoiceType;
  status: InvoiceStatus;
  customerName: string;
  customerId?: string | null;
  customerGstin?: string;
  placeOfSupply: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
  proFormaId?: string;
  proFormaNumber?: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  availableReceiptAmount?: string;
  payments?: Array<{
    id: string;
    paymentDate: string;
    amount: string;
    allocatedAmount?: string;
    paymentMode: string;
    reference: string;
    status: string;
    createdAt?: string;
  }>;
  orderPayments?: Array<{
    id: string;
    amount: string | number;
    method: string;
    reference?: string | null;
    status: string;
    paidAt?: string | null;
  }>;
  lines: SalesInvoiceLine[];
  notes?: string;
  eWayBillNumber?: string;
  irn?: string;
}

export interface CustomerCreditBalance {
  id: string;
  code: string;
  name: string;
  taxNumber: string | null;
  creditLimit: string;
  totalInvoiced: string;
  totalPaid: string;
  outstandingBalance: string;
  availableCredit: string;
  utilizationPercent: number;
  isCreditExceeded: boolean;
  invoiceCount: number;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface CustomerLedgerEntry {
  entryDate: string;
  reference: string;
  entryType: 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE';
  debit: string | number;
  credit: string | number;
  settled: string | number;
  sourceId: string;
  balance: string | number;
}

export interface ProFormaInvoice {
  id: string;
  entityId: string;
  proFormaNumber: string;
  issueDate: string;
  validUntil: string;
  customerName: string;
  customerGstin?: string;
  placeOfSupply: string;
  salesOrderId?: string;
  salesOrderNumber?: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'EXPIRED';
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  lines: SalesInvoiceLine[];
  termsAndConditions?: string;
}

export type NoteType = 'DEBIT' | 'CREDIT';
export type NoteParty = 'CUSTOMER' | 'VENDOR';
export type NoteStatus = 'DRAFT' | 'RECORDED' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'CANCELLED';

export interface DebitCreditNote {
  id: string;
  version?: number;
  entityId: string;
  noteNumber: string;
  noteType: NoteType;
  partyType: NoteParty;
  partyName: string;
  partyGstin?: string;
  issueDate: string;
  originalInvoiceNumber?: string;
  originalInvoiceDate?: string;
  reasonCode: 'RETURN' | 'PRICE_DIFFERENCE' | 'SHORTAGE' | 'DISCOUNT' | 'DEFICIENCY' | 'OTHER';
  reasonDescription: string;
  status: NoteStatus;
  adjustGst: boolean;
  restockInventory: boolean;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  allocatedAmount?: string;
  unallocatedAmount?: string;
}

export interface DebitCreditNoteDetail extends DebitCreditNote {
  placeOfSupply?: string;
  originalInvoiceTotal?: string;
  invoiceId?: string;
  sourceReturnId?: string;
  voucherNumber?: string;
  journalVoucherId?: string;
  currency?: string;
  lines?: Array<{
    id: string;
    lineNumber?: number;
    description: string;
    hsnSacCode?: string;
    quantity: string | number;
    unitPrice: string | number;
    gstRate: string | number;
    taxableAmount: string | number;
    cgstAmount?: string | number;
    sgstAmount?: string | number;
    igstAmount?: string | number;
    totalAmount: string | number;
  }>;
  creator?: { id: string; name?: string | null; email: string; role?: string };
  approver?: { id: string; name?: string | null; email: string; role?: string };
}

export type PaymentType = 'VENDOR_PAYMENT' | 'CUSTOMER_RECEIPT' | 'DIRECT_EXPENSE' | 'ADVANCE';
export type PaymentMode = 'NEFT_RTGS' | 'UPI' | 'CHEQUE' | 'CASH' | 'INTERNAL_TRANSFER' | 'BANK_TRANSFER' | 'CARD' | 'MARKETPLACE';

export interface PaymentRecord {
  id: string;
  version?: number;
  entityId: string;
  paymentNumber: string;
  paymentType: PaymentType;
  paymentDate: string;
  partyName: string;
  partyId?: string;
  bankAccountId: string;
  bankAccountName: string;
  paymentMode: PaymentMode;
  referenceNumber: string;
  amount: string;
  unallocatedAmount: string;
  status: 'DRAFT' | 'APPROVED' | 'EXECUTED' | 'RECONCILED' | 'CANCELLED' | 'RECORDED' | 'VERIFIED' | 'POSTED';
  description?: string;
  allocations: Array<{
    documentType: 'BILL' | 'INVOICE' | 'NOTE';
    documentNumber: string;
    documentDate: string;
    originalAmount: string;
    allocatedAmount: string;
  }>;
}

export interface BankAccount {
  id: string;
  entityId: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  accountType: 'CURRENT' | 'SAVINGS' | 'OVERDRAFT';
  glAccountId: string;
  glAccountCode?: string;
  bookBalance: string;
  bankBalance: string;
  unreconciledCount: number;
  status?: 'ACTIVE' | 'INACTIVE';
  lastReconciledDate?: string;
}

export interface BankStatementRow {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  valueDate: string;
  description: string;
  referenceNo: string;
  withdrawal: string;
  deposit: string;
  balance: string;
  matchStatus: 'MATCHED' | 'UNMATCHED' | 'MANUALLY_RECONCILED' | 'IGNORED';
  matchedVoucherId?: string;
  matchedVoucherNumber?: string;
  confidence?: number;
}

export interface MarketplaceBatch {
  id: string;
  entityId: string;
  channel: 'AMAZON' | 'E_TRADE';
  reportType: 'DAILY_SALES' | 'MONTHLY_MTR' | 'SETTLEMENT' | 'SELLER_FEES';
  period: string;
  fileName: string;
  fileHash: string;
  uploadedAt: string;
  totalRows: number;
  matchedRows: number;
  varianceRows: number;
  rejectedRows: number;
  grossAmount: string;
  tcsAmount: string;
  tdsAmount: string;
  feesAmount: string;
  netPayout: string;
  status: 'PROCESSING' | 'RECONCILED' | 'VARIANCE_FLAGGED' | 'COMPLETED';
}

export interface GstWorkpaperSummary {
  period: string;
  entityGstin: string;
  gstr1: {
    b2bTaxable: string;
    b2bTax: string;
    b2csTaxable: string;
    b2csTax: string;
    cdnrTaxable: string;
    cdnrTax: string;
    hsnTotalValue: string;
    totalTaxable: string;
    totalOutputTax: string;
    status: 'DRAFT' | 'READY_FOR_REVIEW' | 'LOCKED';
  };
  gstr2b: {
    matchedItc: string;
    missingIn2bItc: string;
    ineligibleItc: string;
    totalEligibleItc: string;
    totalSuppliersMatched: number;
    totalSuppliersPending: number;
    status: 'RECONCILED' | 'VARIANCE_FOUND';
  };
  gstr3b: {
    outwardTaxable: string;
    outwardIgst: string;
    outwardCgst: string;
    outwardSgst: string;
    eligibleItcIgst: string;
    eligibleItcCgst: string;
    eligibleItcSgst: string;
    netPayableTax: string;
  };
}

export interface TallyMapping {
  id: string;
  synergyAccountCode: string;
  synergyAccountName: string;
  tallyLedgerName: string;
  tallyParentGroup: string;
  mappingStatus: 'VERIFIED' | 'PENDING' | 'DISCREPANCY';
  lastSyncAt?: string;
}

export interface TallyExportBatch {
  id: string;
  batchNumber: string;
  exportedAt: string;
  period: string;
  voucherCount: number;
  totalDebit: string;
  totalCredit: string;
  format: 'XML_TALLY_PRIME' | 'JSON';
  status: 'GENERATED' | 'ACKNOWLEDGED' | 'RECONCILED' | 'ERROR';
  acknowledgmentNote?: string;
}

export type ExpenseCategory =
  | 'TRANSPORTATION'
  | 'ELECTRICIAN_MAINTENANCE'
  | 'LABOUR_WAGES'
  | 'WAREHOUSE_OPERATIONS'
  | 'UTILITIES_ELECTRICITY'
  | 'OFFICE_SUPPLIES'
  | 'FUEL_CONVEYANCE'
  | 'TEA_REFRESHMENTS'
  | 'FREIGHT_COURIER'
  | 'PROFESSIONAL_LEGAL'
  | 'MISCELLANEOUS';

export type ExpensePaymentStatus = 'PAID' | 'PENDING';

export type ExpensePaymentMode =
  | 'CASH'
  | 'PETTY_CASH'
  | 'UPI'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'CREDIT';

export interface MiscellaneousExpense {
  id: string;
  expenseNumber: string;
  entityId: string;
  category: ExpenseCategory;
  title: string;
  description?: string | null;
  amount: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  expenseDate: string;
  payeeName: string;
  payeeContact?: string | null;
  paymentStatus: ExpensePaymentStatus;
  paymentMode: ExpensePaymentMode;
  referenceNumber?: string | null;
  paidThroughAccountId?: string | null;
  paidThroughAccount?: { id: string; code: string; name: string; type: string } | null;
  expenseAccountId?: string | null;
  expenseAccount?: { id: string; code: string; name: string; type: string } | null;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  receiptFileType?: string | null;
  receiptFileSize?: number | null;
  status: string;
  journalVoucherId?: string | null;
  notes?: string | null;
  createdById: string;
  createdBy?: { id: string; name?: string | null; email?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseListResponse {
  items: MiscellaneousExpense[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    categoryCount: number;
  };
}

export interface CreateExpensePayload {
  entityId: string;
  category: ExpenseCategory;
  title: string;
  description?: string;
  amount: string | number;
  taxAmount?: string | number;
  expenseDate: string;
  payeeName: string;
  payeeContact?: string;
  paymentStatus?: ExpensePaymentStatus;
  paymentMode?: ExpensePaymentMode;
  referenceNumber?: string;
  paidThroughAccountId?: string;
  expenseAccountId?: string;
  receiptUrl?: string;
  receiptFileName?: string;
  receiptFileType?: string;
  receiptFileSize?: number;
  notes?: string;
}
