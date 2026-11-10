import { fetchApi } from '../api/client';
import {
  AccountingEntity,
  AccountingPeriod,
  LedgerAccount,
  JournalVoucher,
  TrialBalanceRow,
  PurchaseBill,
  AcceptedGrn,
  AcceptedGrnDetail,
  GrnPaymentInput,
  ReceiptLineCandidate,
  SalesInvoice,
  ProFormaInvoice,
  DebitCreditNote,
  DebitCreditNoteDetail,
  PaymentRecord,
  BankAccount,
  BankStatementRow,
  MarketplaceBatch,
  GstWorkpaperSummary,
  TallyMapping,
  TallyExportBatch,
  CustomerCreditBalance,
  CustomerLedgerEntry,
  ExpenseListResponse,
  MiscellaneousExpense,
  CreateExpensePayload,
} from './types';

export * from './types';

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const keyed = (body: unknown, key = crypto.randomUUID()) => ({ ...json(body), headers: { 'Idempotency-Key': key } });

export const accountsApi = {
  // --- Legal Entities & Setup ---
  entities: async (): Promise<AccountingEntity[]> => {
    const data = await fetchApi<AccountingEntity[]>('/accounts/entities');
    return Array.isArray(data) ? data : [];
  },
  initializeSynergyBook: () =>
    fetchApi<AccountingEntity>('/accounts/entities/initialize-synergy', json({})),
  activateEntity: (id: string, verificationReference: string) =>
    fetchApi<AccountingEntity>(`/accounts/entities/${id}/activate`, json({ verificationReference })),

  // --- Fiscal Periods ---
  periods: async (entityId: string): Promise<AccountingPeriod[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<AccountingPeriod[]>(`/accounts/periods?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  createPeriod: (body: { entityId: string; code: string; fiscalYear: string; startsOn: string; endsOn: string }) =>
    fetchApi<AccountingPeriod>('/accounts/periods', json(body)),
  closePeriod: (id: string) => fetchApi<AccountingPeriod>(`/accounts/periods/${id}/close`, json({ expectedStatus: 'OPEN' })),

  // --- Chart of Accounts ---
  chart: async (entityId: string): Promise<LedgerAccount[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<LedgerAccount[]>(`/accounts/chart?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  createAccount: (body: { entityId: string; code: string; name: string; type: string; isControl: boolean; tallyLedger?: string }) =>
    fetchApi<LedgerAccount>('/accounts/chart', json(body)),

  // --- Journals & Ledger ---
  journals: async (entityId: string, page = 1): Promise<{ items: JournalVoucher[]; total: number; page: number; limit: number }> => {
    if (!entityId) return { items: [], total: 0, page: 1, limit: 25 };
    try {
      const data = await fetchApi<{ items: JournalVoucher[]; total: number; page: number; limit: number }>(
        `/accounts/journals?entityId=${encodeURIComponent(entityId)}&page=${page}`
      );
      return data || { items: [], total: 0, page: 1, limit: 25 };
    } catch {
      return { items: [], total: 0, page: 1, limit: 25 };
    }
  },
  journal: (id: string) => fetchApi<JournalVoucher>(`/accounts/journals/${id}`),
  createJournal: (
    body: {
      entityId: string;
      periodId: string;
      accountingDate: string;
      kind: 'JOURNAL' | 'OPENING' | 'CONTRA';
      description: string;
      lines: Array<{ accountId: string; debit: string; credit: string; memo?: string }>;
    },
    key?: string
  ) => fetchApi<JournalVoucher>('/accounts/journals', keyed(body, key)),
  submit: (id: string, version: number) => fetchApi<JournalVoucher>(`/accounts/journals/${id}/submit`, json({ version })),
  approve: (id: string, version: number) => fetchApi<JournalVoucher>(`/accounts/journals/${id}/approve`, json({ version })),
  post: (id: string, version: number) => fetchApi<JournalVoucher>(`/accounts/journals/${id}/post`, json({ version })),
  reversal: (id: string, body: { periodId: string; accountingDate: string; reason: string }) =>
    fetchApi<JournalVoucher>(`/accounts/journals/${id}/reversal`, keyed(body)),

  // --- Reports & Trial Balance ---
  trialBalance: async (entityId: string, through: string): Promise<TrialBalanceRow[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<TrialBalanceRow[]>(`/accounts/reports/trial-balance?entityId=${encodeURIComponent(entityId)}&through=${encodeURIComponent(through)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  // --- Purchases & Payables (AP) ---
  apVendors: async () => {
    try {
      const data = await fetchApi<Array<{ id: string; code: string; name: string; legalName?: string; taxNumber?: string; paymentTerms?: string }>>('/accounts/ap/vendors');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  apReceiptLines: async (entityId: string): Promise<ReceiptLineCandidate[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<ReceiptLineCandidate[]>(`/accounts/ap/receipt-lines?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  apBills: async (entityId: string, page = 1): Promise<{ items: PurchaseBill[]; total: number; page: number; limit: number }> => {
    if (!entityId) return { items: [], total: 0, page: 1, limit: 25 };
    try {
      const data = await fetchApi<{ items: PurchaseBill[]; total: number; page: number; limit: number }>(
        `/accounts/ap/bills?entityId=${encodeURIComponent(entityId)}&page=${page}`
      );
      return data || { items: [], total: 0, page: 1, limit: 25 };
    } catch {
      return { items: [], total: 0, page: 1, limit: 25 };
    }
  },
  apPayments: async (entityId: string): Promise<Array<{
    id: string;
    paymentNumber: string;
    paymentType: string;
    paymentDate: string;
    partyName: string;
    partyId: string;
    amount: string;
    paymentMode: string;
    referenceNumber: string;
    notes?: string;
    status: string;
    linkedDocumentNumber?: string;
    billId?: string;
  }>> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<Array<any>>(`/accounts/ap/payments?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  createApBill: (body: unknown, key: string) => fetchApi<PurchaseBill>('/accounts/ap/bills', keyed(body, key)),
  updateApBill: (id: string, body: unknown) => fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  apBill: (id: string) => fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}`),
  submitApBill: (id: string, version: number) => fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}/submit`, json({ version })),
  resolveApBill: (id: string, version: number, note: string) =>
    fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}/resolve`, json({ version, note })),
  reopenApBill: (id: string, version: number, reason: string) =>
    fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}/reopen`, json({ version, reason })),
  approveApBill: (id: string, version: number) => fetchApi<PurchaseBill>(`/accounts/ap/bills/${id}/approve`, json({ version })),
  recordBillPayment: (
    billId: string,
    body: {
      paymentDate: string;
      amount: string;
      paymentMode: string;
      reference: string;
      notes?: string;
    },
    key = crypto.randomUUID()
  ) => fetchApi<PurchaseBill>(`/accounts/ap/bills/${billId}/payments`, keyed(body, key)),
  acceptedGrns: async (entityId: string): Promise<AcceptedGrn[]> => {
    if (!entityId) return [];
    const data = await fetchApi<AcceptedGrn[]>(`/accounts/ap/grns?entityId=${encodeURIComponent(entityId)}`);
    return Array.isArray(data) ? data : [];
  },
  acceptedGrn: (id: string) => fetchApi<AcceptedGrnDetail>(`/accounts/ap/grns/${id}`),
  recordGrnPayment: (id: string, body: GrnPaymentInput, key = crypto.randomUUID()) =>
    fetchApi<AcceptedGrnDetail>(`/accounts/ap/grns/${id}/payments`, keyed(body, key)),
  createGrnDebitNote: (grnId: string, reason: string, reasonCategory = 'SHORTAGE') =>
    fetchApi<Record<string, unknown>>(`/debit-notes/from-grn/${grnId}`, json({ reason, reasonCategory })),
  updateGrnDebitNote: (id: string, body: { reason?: string; lines: Array<{ id: string; unitPrice: number; taxRate?: number; reason?: string }> }) =>
    fetchApi<Record<string, unknown>>(`/debit-notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createBillDebitNote: (
    billId: string,
    body: {
      reason: string;
      reasonCode?: string;
      reasonCategory?: string;
      taxableAmount?: string | number;
      taxAmount?: string | number;
      totalAmount?: string | number;
      restockInventory?: boolean;
      lines?: Array<{
        description: string;
        quantity: number | string;
        unitPrice: number | string;
        taxRate?: number | string;
        taxableAmount: number | string;
        taxAmount?: number | string;
        totalAmount: number | string;
        reason?: string;
        productId?: string;
        materialId?: string;
      }>;
    }
  ) => fetchApi<Record<string, unknown>>(`/debit-notes/from-bill/${billId}`, json(body)),
  submitGrnDebitNote: (id: string) =>
    fetchApi<Record<string, unknown>>(`/debit-notes/${id}/submit`, json({})),
  approveGrnDebitNote: (id: string) =>
    fetchApi<Record<string, unknown>>(`/debit-notes/${id}/approve`, json({})),
  sendDebitNoteToVendor: (id: string, body?: { email?: string; notes?: string }) =>
    fetchApi<Record<string, unknown>>(`/debit-notes/${id}/send-to-vendor`, json(body || {})),

  // --- Sales & Receivables (AR) ---
  arInvoices: async (entityId: string, page = 1): Promise<{ items: SalesInvoice[]; total: number; page: number; limit: number }> => {
    if (!entityId) return { items: [], total: 0, page: 1, limit: 25 };
    return fetchApi<{ items: SalesInvoice[]; total: number; page: number; limit: number }>(
      `/accounts/ar/invoices?entityId=${encodeURIComponent(entityId)}&page=${page}`
    );
  },
  arInvoice: (id: string) => fetchApi<SalesInvoice>(`/accounts/ar/invoices/${id}`),
  transitionArInvoice: (id: string, action: 'submit' | 'approve' | 'post', version: number) =>
    fetchApi<SalesInvoice>(`/accounts/ar/invoices/${id}/${action}`, json({ version })),
  arMappings: (entityId: string) => fetchApi<Array<{ id: string; mappingKey: string; accountId: string; code: string; name: string }>>(`/accounts/ar/mappings?entityId=${encodeURIComponent(entityId)}`),
  saveArMapping: (key: string, body: { entityId: string; accountId: string }) => fetchApi(`/accounts/ar/mappings/${key}`, { method: 'PUT', body: JSON.stringify(body) }),

  // --- Pro Formas ---
  proFormas: async (entityId: string): Promise<ProFormaInvoice[]> => {
    if (!entityId) return [];
    return fetchApi<ProFormaInvoice[]>(`/accounts/pro-formas?entityId=${encodeURIComponent(entityId)}`);
  },
  updateProForma: (id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>) =>
    fetchApi<{ id: string; totalAmount: string; status: string }>(`/accounts/pro-formas/${id}`, json({ lines })),

  updateArInvoice: (id: string, body: { lines: any[]; notes?: string }) =>
    fetchApi<SalesInvoice>(`/accounts/ar/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),

  // --- Debit & Credit Notes ---
  notes: async (entityId: string): Promise<DebitCreditNote[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<DebitCreditNote[]>(`/accounts/notes?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  arCreditNotes: async (entityId: string): Promise<DebitCreditNote[]> => {
    if (!entityId) return [];
    return fetchApi<DebitCreditNote[]>(`/accounts/ar/credit-notes?entityId=${encodeURIComponent(entityId)}`);
  },
  arCreditNote: (id: string) => fetchApi<DebitCreditNoteDetail>(`/accounts/ar/credit-notes/${id}`),
  createArCreditNote: (body: { entityId: string; invoiceId: string; reasonCode?: string; reasonDescription?: string; taxableAmount: string; taxAmount: string; totalAmount: string; creditDate?: string }) =>
    fetchApi<DebitCreditNote>('/accounts/ar/credit-notes', json(body)),
  transitionArCreditNote: (id: string, action: 'submit' | 'approve' | 'post', version: number) =>
    fetchApi<DebitCreditNote>(`/accounts/ar/credit-notes/${id}/${action}`, json({ version })),

  // --- Payments & Receipts ---
  payments: async (entityId: string): Promise<PaymentRecord[]> => {
    if (!entityId) return [];
    return fetchApi<PaymentRecord[]>(`/accounts/ar/receipts?entityId=${encodeURIComponent(entityId)}`);
  },
  createArReceipt: (body: { entityId: string; customerName: string; customerId?: string; invoiceId?: string; salesOrderId?: string; receiptDate: string; amount: string; method: string; reference: string; notes?: string }) =>
    fetchApi<PaymentRecord>('/accounts/ar/receipts', keyed(body)),
  recordCustomerReceipt: (body: { entityId: string; customerName: string; customerId?: string; invoiceId?: string; salesOrderId?: string; receiptDate: string; amount: string; method: string; reference: string; notes?: string }) =>
    fetchApi<PaymentRecord>('/accounts/ar/receipts', keyed(body)),
  customerCreditBalances: async (entityId: string): Promise<CustomerCreditBalance[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<CustomerCreditBalance[]>(`/accounts/ar/customers/credit-balances?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  customerLedger: async (entityId: string, customerId: string): Promise<CustomerLedgerEntry[]> => {
    if (!entityId || !customerId) return [];
    try {
      const data = await fetchApi<CustomerLedgerEntry[]>(`/accounts/ar/customers/${encodeURIComponent(customerId)}/ledger?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  verifyArReceipt: (id: string, version: number) => fetchApi<PaymentRecord>(`/accounts/ar/receipts/${id}/verify`, json({ version })),
  postArReceipt: (id: string, version: number) => fetchApi<PaymentRecord>(`/accounts/ar/receipts/${id}/post`, json({ version })),

  // --- Bank Accounts & BRS ---
  bankAccounts: async (entityId: string): Promise<BankAccount[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<BankAccount[]>(`/accounts/bank-accounts?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  bankStatementRows: async (bankAccountId: string): Promise<BankStatementRow[]> => {
    if (!bankAccountId) return [];
    try {
      const data = await fetchApi<BankStatementRow[]>(`/accounts/bank-accounts/${bankAccountId}/statements`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  // --- Marketplace Settlements ---
  marketplaceBatches: async (entityId: string): Promise<MarketplaceBatch[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<MarketplaceBatch[]>(`/accounts/marketplace/batches?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  recordMarketplaceSettlement: (body: { entityId: string; channel: 'AMAZON' | 'E_TRADE'; externalBatchId: string; settlementDate: string; grossAmount: string; feesAmount: string; gstTcsAmount: string; incomeTdsAmount: string; netPayoutAmount: string }) =>
    fetchApi('/accounts/marketplace/batches', json(body)),
  matchMarketplaceSettlement: (id: string, bankReference: string) => fetchApi(`/accounts/marketplace/batches/${id}/match`, json({ bankReference })),
  postMarketplaceSettlement: (id: string) => fetchApi(`/accounts/marketplace/batches/${id}/post`, json({})),

  // --- GST Workpapers ---
  gstWorkpaper: async (entityId: string, period: string): Promise<GstWorkpaperSummary | null> => {
    if (!entityId) return null;
    try {
      return await fetchApi<GstWorkpaperSummary>(
        `/accounts/gst/workpaper?entityId=${encodeURIComponent(entityId)}&period=${encodeURIComponent(period)}`
      );
    } catch {
      return null;
    }
  },

  // --- Tally Exchange ---
  tallyMappings: async (entityId: string): Promise<TallyMapping[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<TallyMapping[]>(`/accounts/tally/mappings?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },
  tallyExportBatches: async (entityId: string): Promise<TallyExportBatch[]> => {
    if (!entityId) return [];
    try {
      const data = await fetchApi<TallyExportBatch[]>(`/accounts/tally/batches?entityId=${encodeURIComponent(entityId)}`);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  // --- Miscellaneous Expenses ---
  expenses: async (params: {
    entityId: string;
    search?: string;
    category?: string;
    paymentStatus?: string;
    date?: string;
    page?: number;
    limit?: number;
  }): Promise<ExpenseListResponse> => {
    const { entityId, search, category, paymentStatus, date, page = 1, limit = 25 } = params;
    if (!entityId) {
      return { items: [], total: 0, page: 1, limit, summary: { totalAmount: 0, paidAmount: 0, pendingAmount: 0, categoryCount: 0 } };
    }
    const query = new URLSearchParams({
      entityId,
      page: String(page),
      limit: String(limit),
    });
    if (search) query.set('search', search);
    if (category) query.set('category', category);
    if (paymentStatus) query.set('paymentStatus', paymentStatus);
    if (date) query.set('date', date);

    try {
      const data = await fetchApi<ExpenseListResponse>(`/accounts/expenses?${query.toString()}`);
      return data || { items: [], total: 0, page: 1, limit, summary: { totalAmount: 0, paidAmount: 0, pendingAmount: 0, categoryCount: 0 } };
    } catch {
      return { items: [], total: 0, page: 1, limit, summary: { totalAmount: 0, paidAmount: 0, pendingAmount: 0, categoryCount: 0 } };
    }
  },
  expense: (id: string): Promise<MiscellaneousExpense> =>
    fetchApi<MiscellaneousExpense>(`/accounts/expenses/${id}`),
  createExpense: (body: CreateExpensePayload): Promise<MiscellaneousExpense> =>
    fetchApi<MiscellaneousExpense>('/accounts/expenses', json(body)),
  updateExpense: (id: string, body: Partial<CreateExpensePayload>): Promise<MiscellaneousExpense> =>
    fetchApi<MiscellaneousExpense>(`/accounts/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteExpense: (id: string): Promise<{ success: boolean }> =>
    fetchApi<{ success: boolean }>(`/accounts/expenses/${id}`, { method: 'DELETE' }),
};
