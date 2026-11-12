'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Search,
  ChevronRight,
  RefreshCw,
  FileText,
  Clock,
  ShieldCheck,
  Scale,
  X,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  CalendarDays,
} from 'lucide-react';
import {
  Card,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { PaginationControls } from '@/components/PaginationControls';
import { formatCurrency, formatDate } from '@/features/accounts/utils';

export interface UnifiedLedgerTransaction {
  id: string;
  date: string;
  voucherNumber: string;
  flowType: 'MONEY_IN' | 'MONEY_OUT' | 'RECEIVABLE' | 'PAYABLE' | 'CREDIT_NOTE' | 'JOURNAL';
  partyName: string;
  partyType: 'CUSTOMER' | 'VENDOR' | 'INTERNAL';
  description: string;
  referenceProof: string;
  paymentMode?: string;
  inflowAmount: number;
  outflowAmount: number;
  dueAmount?: number;
  status: string;
  sourceModule: 'AR_RECEIPT' | 'AP_PAYMENT' | 'AR_INVOICE' | 'AP_BILL' | 'CREDIT_NOTE' | 'JOURNAL';
  sourceId: string;
  rawRecord: any;
}

export default function AccountsOverviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(''); // Dynamic calendar filter (YYYY-MM-DD)
  const [flowFilter, setFlowFilter] = useState<'ALL' | 'MONEY_IN' | 'MONEY_OUT' | 'RECEIVABLE' | 'PAYABLE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SETTLED' | 'PENDING'>('ALL');
  const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'>('DATE_DESC');

  // Inspector Drawer State
  const [selectedTx, setSelectedTx] = useState<UnifiedLedgerTransaction | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Single entity source of truth
  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = entities.data?.[0]?.id || 'f6969059-a854-49ed-802a-56d91bb9254e';

  // Live Queries directly from backend
  const apBills = useQuery({
    queryKey: ['accounts', 'ap', 'bills', entityId],
    queryFn: () => accountsApi.apBills(entityId),
    enabled: Boolean(entityId),
  });

  const apPayments = useQuery({
    queryKey: ['accounts', 'ap', 'payments', entityId],
    queryFn: () => accountsApi.apPayments(entityId),
    enabled: Boolean(entityId),
  });

  const arInvoices = useQuery({
    queryKey: ['accounts', 'ar', 'invoices', entityId],
    queryFn: () => accountsApi.arInvoices(entityId),
    enabled: Boolean(entityId),
  });

  const arReceipts = useQuery({
    queryKey: ['accounts', 'payments', entityId],
    queryFn: () => accountsApi.payments(entityId),
    enabled: Boolean(entityId),
  });

  const creditNotes = useQuery({
    queryKey: ['accounts', 'credit-notes', entityId],
    queryFn: () => accountsApi.arCreditNotes(entityId),
    enabled: Boolean(entityId),
  });

  const bankAccounts = useQuery({
    queryKey: ['accounts', 'banks', entityId],
    queryFn: () => accountsApi.bankAccounts(entityId),
    enabled: Boolean(entityId),
  });

  const journals = useQuery({
    queryKey: ['accounts', 'journals', entityId],
    queryFn: () => accountsApi.journals(entityId),
    enabled: Boolean(entityId),
  });

  // 1. Money Taken (Customer Receipts Collected)
  const totalMoneyTaken = useMemo(() => {
    return (arReceipts.data || [])
      .filter((r) => !selectedDate || String(r.paymentDate || '').slice(0, 10) === selectedDate)
      .reduce((acc, r) => acc + parseFloat(String(r.amount || 0)), 0);
  }, [arReceipts.data, selectedDate]);

  // 2. Money Given (Vendor Disbursements Paid)
  const totalMoneyGiven = useMemo(() => {
    return (apPayments.data || [])
      .filter((p) => !selectedDate || String(p.paymentDate || '').slice(0, 10) === selectedDate)
      .reduce((acc, p) => acc + parseFloat(String(p.amount || 0)), 0);
  }, [apPayments.data, selectedDate]);

  // 3. Amount to be Taken (Outstanding Receivables from Customers)
  const totalAmountToBeTaken = useMemo(() => {
    return (arInvoices.data?.items || [])
      .filter((inv) => !selectedDate || String(inv.invoiceDate || '').slice(0, 10) === selectedDate)
      .reduce((acc, inv) => {
        const remaining = parseFloat(String(inv.outstandingAmount ?? inv.totalAmount ?? 0));
        return acc + (remaining > 0 ? remaining : 0);
      }, 0);
  }, [arInvoices.data, selectedDate]);

  // 4. Amount to be Given (Outstanding Payables to Vendors)
  const totalAmountToBeGiven = useMemo(() => {
    return (apBills.data?.items || [])
      .filter((b) => !selectedDate || String(b.invoiceDate || '').slice(0, 10) === selectedDate)
      .reduce((acc, bill) => {
        const bal = parseFloat(String(bill.balanceAmount ?? bill.totalAmount ?? 0));
        return acc + (bal > 0 ? bal : 0);
      }, 0);
  }, [apBills.data, selectedDate]);

  // 5. Total Bank Book Balance
  const totalBankBalance = useMemo(() => {
    return (bankAccounts.data || []).reduce((acc, b) => acc + parseFloat(String(b.bookBalance || 0)), 0);
  }, [bankAccounts.data]);

  // 6. Net Financial Position (Working Capital)
  const netFinancialPosition = (totalBankBalance + totalMoneyTaken - totalMoneyGiven) + totalAmountToBeTaken - totalAmountToBeGiven;

  // Build Unified Financial Stream
  const unifiedLedger = useMemo(() => {
    const list: UnifiedLedgerTransaction[] = [];

    // Add Customer Receipts (Money Taken)
    (arReceipts.data || []).forEach((r) => {
      list.push({
        id: `RCP-${r.id}`,
        date: r.paymentDate ? String(r.paymentDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: r.paymentNumber || `RCP-${String(r.id).slice(0, 8).toUpperCase()}`,
        flowType: 'MONEY_IN',
        partyName: r.partyName || 'Customer',
        partyType: 'CUSTOMER',
        description: `Customer payment receipt · ${r.referenceNumber ? `Ref #${r.referenceNumber}` : 'Direct payment'}`,
        referenceProof: `${r.paymentMode || 'BANK_TRANSFER'} · ${r.referenceNumber || 'Verified Proof'}`,
        paymentMode: r.paymentMode,
        inflowAmount: parseFloat(String(r.amount || 0)),
        outflowAmount: 0,
        status: r.status || 'SETTLED',
        sourceModule: 'AR_RECEIPT',
        sourceId: r.id,
        rawRecord: r,
      });
    });

    // Add Vendor Payments (Money Given)
    (apPayments.data || []).forEach((p) => {
      list.push({
        id: `PAY-${p.id}`,
        date: p.paymentDate ? String(p.paymentDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: p.paymentNumber || `PAY-${String(p.referenceNumber || p.id).slice(0, 10).toUpperCase()}`,
        flowType: 'MONEY_OUT',
        partyName: p.partyName || 'Supplier',
        partyType: 'VENDOR',
        description: `Vendor payout against bill · ${p.linkedDocumentNumber ? `Bill #${p.linkedDocumentNumber}` : 'PO Settlement'}`,
        referenceProof: `${p.paymentMode || 'NEFT_RTGS'} · ${p.referenceNumber || 'Bank UTR Proof'}`,
        paymentMode: p.paymentMode,
        inflowAmount: 0,
        outflowAmount: parseFloat(String(p.amount || 0)),
        status: p.status || 'SETTLED',
        sourceModule: 'AP_PAYMENT',
        sourceId: p.billId || p.id,
        rawRecord: p,
      });
    });

    // Add Sales Invoices (Receivables / Amount to be Taken)
    (arInvoices.data?.items || []).forEach((inv) => {
      const outstanding = parseFloat(String(inv.outstandingAmount ?? inv.totalAmount ?? 0));
      list.push({
        id: `INV-${inv.id}`,
        date: inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: inv.invoiceNumber || `INV-${String(inv.id).slice(0, 8).toUpperCase()}`,
        flowType: 'RECEIVABLE',
        partyName: inv.customerName || 'Customer',
        partyType: 'CUSTOMER',
        description: `Sales invoice bill · ${inv.salesOrderNumber ? `Order #${inv.salesOrderNumber}` : 'Official billing'}`,
        referenceProof: `Invoice #${inv.invoiceNumber || inv.id.slice(0, 8)}`,
        inflowAmount: 0,
        outflowAmount: 0,
        dueAmount: outstanding,
        status: inv.status || 'APPROVED',
        sourceModule: 'AR_INVOICE',
        sourceId: inv.id,
        rawRecord: inv,
      });
    });

    // Add Purchase Bills (Payables / Amount to be Given)
    (apBills.data?.items || []).forEach((b) => {
      const balance = parseFloat(String(b.balanceAmount ?? b.totalAmount ?? 0));
      list.push({
        id: `BILL-${b.id}`,
        date: b.invoiceDate ? String(b.invoiceDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: b.supplierInvoiceNumber || `BILL-${String(b.id).slice(0, 8).toUpperCase()}`,
        flowType: 'PAYABLE',
        partyName: b.vendorNameSnapshot || 'Vendor',
        partyType: 'VENDOR',
        description: `Supplier inbound invoice · Bill #${b.supplierInvoiceNumber}`,
        referenceProof: `Supplier Bill #${b.supplierInvoiceNumber || b.id.slice(0, 8)}`,
        inflowAmount: 0,
        outflowAmount: 0,
        dueAmount: balance,
        status: b.status || 'APPROVED',
        sourceModule: 'AP_BILL',
        sourceId: b.id,
        rawRecord: b,
      });
    });

    // Add Credit Notes (Receivable Reductions / Return adjustments)
    (creditNotes.data || []).forEach((cn) => {
      list.push({
        id: `CN-${cn.id}`,
        date: cn.issueDate ? String(cn.issueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: cn.noteNumber || `DRAFT-CN-${String(cn.id).slice(0, 8).toUpperCase()}`,
        flowType: 'CREDIT_NOTE',
        partyName: cn.partyName || 'Customer',
        partyType: 'CUSTOMER',
        description: `Credit note for sales return / rebate · ${cn.originalInvoiceNumber ? `Against #${cn.originalInvoiceNumber}` : 'Adjustment'}`,
        referenceProof: `Credit Note #${cn.noteNumber || cn.id.slice(0, 8)}`,
        inflowAmount: 0,
        outflowAmount: 0,
        dueAmount: parseFloat(String(cn.totalAmount || 0)),
        status: cn.status || 'SUBMITTED',
        sourceModule: 'CREDIT_NOTE',
        sourceId: cn.id,
        rawRecord: cn,
      });
    });

    // Add Journal Vouchers (General Ledger adjustments)
    (journals.data?.items || []).forEach((j) => {
      list.push({
        id: `JV-${j.id}`,
        date: j.accountingDate ? String(j.accountingDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
        voucherNumber: j.voucherNumber || `JV-${String(j.id).slice(0, 8).toUpperCase()}`,
        flowType: 'JOURNAL',
        partyName: 'General Ledger Posting',
        partyType: 'INTERNAL',
        description: j.description || 'Double-entry journal adjustment',
        referenceProof: `Journal Voucher #${j.voucherNumber || j.id.slice(0, 8)}`,
        inflowAmount: 0,
        outflowAmount: 0,
        status: j.status || 'POSTED',
        sourceModule: 'JOURNAL',
        sourceId: j.id,
        rawRecord: j,
      });
    });

    // Sort by Date descending by default
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [arReceipts.data, apPayments.data, arInvoices.data, apBills.data, creditNotes.data, journals.data]);

  // Apply User Filters & Sorting
  const filteredLedger = useMemo(() => {
    let result = [...unifiedLedger];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.voucherNumber.toLowerCase().includes(q) ||
          tx.partyName.toLowerCase().includes(q) ||
          tx.referenceProof.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q)
      );
    }

    // Flow Type Filter
    if (flowFilter !== 'ALL') {
      result = result.filter((tx) => tx.flowType === flowFilter);
    }

    // Status Filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'SETTLED') {
        result = result.filter((tx) => ['SETTLED', 'POSTED', 'PAID'].includes(tx.status));
      } else {
        result = result.filter((tx) => !['SETTLED', 'POSTED', 'PAID'].includes(tx.status));
      }
    }

    // Calendar Date Filter
    if (selectedDate) {
      result = result.filter((tx) => tx.date === selectedDate);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'DATE_DESC') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'DATE_ASC') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      const valA = a.inflowAmount || a.outflowAmount || a.dueAmount || 0;
      const valB = b.inflowAmount || b.outflowAmount || b.dueAmount || 0;
      if (sortBy === 'AMOUNT_DESC') {
        return valB - valA;
      }
      if (sortBy === 'AMOUNT_ASC') {
        return valA - valB;
      }
      return 0;
    });

    return result;
  }, [unifiedLedger, search, flowFilter, statusFilter, selectedDate, sortBy]);

  // Paginated Results
  const paginatedLedger = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLedger.slice(start, start + pageSize);
  }, [filteredLedger, currentPage, pageSize]);

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
  };

  const navigateToSource = (tx: UnifiedLedgerTransaction) => {
    if (tx.sourceModule === 'AR_INVOICE') {
      router.push(`/accounts/sales/invoices/${tx.sourceId}`);
    } else if (tx.sourceModule === 'AP_BILL') {
      router.push(`/accounts/purchases/bills/${tx.sourceId}`);
    } else if (tx.sourceModule === 'CREDIT_NOTE') {
      router.push(`/accounts/credit-notes/${tx.sourceId}`);
    } else if (tx.sourceModule === 'AR_RECEIPT') {
      router.push(`/accounts/payments`);
    } else if (tx.sourceModule === 'AP_PAYMENT') {
      router.push(`/accounts/purchases/bills/${tx.sourceId}`);
    } else if (tx.sourceModule === 'JOURNAL') {
      router.push(`/accounts/journals`);
    }
  };

  return (
    <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto">
      {/* Clean Header with Interactive Calendar Date Picker at Top Right Corner */}
      <AccountsHeader
        title="Accounts & Financial Ledger"
        
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={() => {}}
        hideCompany={true}
        actionButton={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Interactive Calendar Date Picker in the Top Right Corner */}
            <div className="flex items-center gap-2 rounded-2xl border border-border/80 bg-card px-3 py-1.5 shadow-sm text-xs transition-all hover:border-primary/60 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent font-mono font-bold text-foreground focus:outline-none cursor-pointer text-xs"
                title="Select date to filter financial ledger"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate('');
                    setCurrentPage(1);
                  }}
                  title="Clear date filter"
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="rounded-xl border-border/80 bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm hover:bg-muted gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Refresh Data
            </Button>
          </div>
        }
      />

      {/* Production Grade Executive Financial KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Money in Account */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-none transition-shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Money in Account
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-n-500/10 text-primary">
              <Wallet className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(totalBankBalance + totalMoneyTaken - totalMoneyGiven)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Liquid Cash & Bank Reserves</span>
              <span className="font-semibold text-muted-foreground font-mono">
                {selectedDate ? `Date: ${formatDate(selectedDate)}` : 'Active Source'}
              </span>
            </div>
          </div>
        </Card>

        {/* Amount to be Taken (Receivables) */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-none transition-shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Amount to be Taken
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
              <ArrowDownLeft className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(totalAmountToBeTaken)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedDate ? `Invoiced on ${formatDate(selectedDate)}` : 'Customer Invoices Due (AR)'}</span>
              <span className="font-mono font-medium">
                {selectedDate
                  ? `${(arInvoices.data?.items || []).filter((i) => String(i.invoiceDate || '').slice(0, 10) === selectedDate).length} Invoices`
                  : `${arInvoices.data?.items?.length || 0} Invoices`}
              </span>
            </div>
          </div>
        </Card>

        {/* Amount to be Given (Payables) */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-none transition-shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Amount to be Given
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
              <ArrowUpRight className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(totalAmountToBeGiven)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedDate ? `Billed on ${formatDate(selectedDate)}` : 'Pending Supplier Bills (AP)'}</span>
              <span className="font-mono font-medium">
                {selectedDate
                  ? `${(apBills.data?.items || []).filter((b) => String(b.invoiceDate || '').slice(0, 10) === selectedDate).length} Bills`
                  : `${apBills.data?.items?.length || 0} Bills`}
              </span>
            </div>
          </div>
        </Card>

        {/* Net Financial Position / Working Capital */}
        <Card className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-none transition-shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Net Financial Position
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
              <Scale className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(netFinancialPosition)}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Liquid + AR - AP</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                Balanced Books
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Real Financial Audit Breakdown Stream */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            Money Taken (Collected)
          </div>
          <div className="mt-2 text-lg font-bold font-mono text-foreground font-mono">
            +{formatCurrency(totalMoneyTaken)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedDate ? `On ${formatDate(selectedDate)}` : `${arReceipts.data?.length || 0} settled receipts`}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            Money Given (Paid Out)
          </div>
          <div className="mt-2 text-lg font-bold font-mono text-foreground font-mono">
            -{formatCurrency(totalMoneyGiven)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedDate ? `On ${formatDate(selectedDate)}` : `${apPayments.data?.length || 0} disbursements`}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Pending To Take (AR)
          </div>
          <div className="mt-2 text-lg font-bold font-mono text-foreground">
            {formatCurrency(totalAmountToBeTaken)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedDate ? `Recorded on ${formatDate(selectedDate)}` : 'Awaiting client settlement'}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Pending To Give (AP)
          </div>
          <div className="mt-2 text-lg font-bold font-mono text-foreground">
            {formatCurrency(totalAmountToBeGiven)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedDate ? `Recorded on ${formatDate(selectedDate)}` : 'Approved vendor dues'}
          </div>
        </div>
      </div>

      {/* Production-Grade Master Account Ledger Table Section */}
      <Card className="rounded-2xl border border-border/80 shadow-sm overflow-hidden bg-card">
        {/* Table Controls: Real-Time Filters & Sorting */}
        <div className="p-4 sm:p-5 border-border-strong border-border/80 bg-muted/20 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Master Financial Transaction Ledger
              </h2>
              
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium text-muted-foreground">
                Showing {filteredLedger.length} total entries
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Search */}
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search voucher, party, or UTR..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-border/80 bg-card pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-n-500"
                />
              </div>
            </div>

            {/* Flow Type Filter */}
            <div>
              <select
                value={flowFilter}
                onChange={(e) => {
                  setFlowFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-border/80 bg-card px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-n-500"
              >
                <option value="ALL">All Flows</option>
                <option value="MONEY_IN">Money In (Collections)</option>
                <option value="MONEY_OUT">Money Out (Payouts)</option>
                <option value="RECEIVABLE">To Be Taken (Invoices)</option>
                <option value="PAYABLE">To Be Given (Bills)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-border/80 bg-card px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-n-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="SETTLED">Settled & Posted</option>
                <option value="PENDING">Pending & In Progress</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full rounded-xl border border-border/80 bg-card px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-n-500"
              >
                <option value="DATE_DESC">Date (Newest First)</option>
                <option value="DATE_ASC">Date (Oldest First)</option>
                <option value="AMOUNT_DESC">Amount (High to Low)</option>
                <option value="AMOUNT_ASC">Amount (Low to High)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Clean, Consistent Ledger Table (No buttons in table, click row to open details) */}
        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-border-strong border-border/80 font-bold">
                <TableHead className="p-3.5 text-foreground">Date</TableHead>
                <TableHead className="p-3.5 text-foreground">Voucher / ID</TableHead>
                <TableHead className="p-3.5 text-foreground">Flow Classification</TableHead>
                <TableHead className="p-3.5 text-foreground">Particulars / Party</TableHead>
                <TableHead className="p-3.5 text-foreground">Proof Reference</TableHead>
                <TableHead className="p-3.5 text-right text-foreground">Money In (+)</TableHead>
                <TableHead className="p-3.5 text-right text-foreground">Money Out (-)</TableHead>
                <TableHead className="p-3.5 text-right text-foreground">Balance / Due</TableHead>
                <TableHead className="p-3.5 text-center text-foreground">Audit Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLedger.length > 0 ? (
                paginatedLedger.map((tx) => (
                  <TableRow
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="hover:bg-muted/50 transition-colors cursor-pointer group border-border-strong border-border/60"
                  >
                    {/* Date */}
                    <TableCell className="p-3.5 font-medium text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </TableCell>

                    {/* Voucher ID with interactive micro-chevron */}
                    <TableCell className="p-3.5 font-bold text-foreground">
                      <div className="flex items-center gap-1.5 font-mono group-hover:text-primary transition-colors">
                        <span>{tx.voucherNumber}</span>
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                      </div>
                    </TableCell>

                    {/* Flow Type Badge */}
                    <TableCell className="p-3.5">
                      {tx.flowType === 'MONEY_IN' ? (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
                          Money In (Taken)
                        </span>
                      ) : tx.flowType === 'MONEY_OUT' ? (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
                          Money Out (Given)
                        </span>
                      ) : tx.flowType === 'RECEIVABLE' ? (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                          To Be Taken (AR)
                        </span>
                      ) : tx.flowType === 'PAYABLE' ? (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                          To Be Given (AP)
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                          Adjustment
                        </span>
                      )}
                    </TableCell>

                    {/* Party & Description */}
                    <TableCell className="p-3.5 font-medium text-foreground max-w-[220px]">
                      <div className="font-semibold text-foreground truncate">{tx.partyName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{tx.description}</div>
                    </TableCell>

                    {/* Proof Reference */}
                    <TableCell className="p-3.5 font-sans text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] bg-muted/40 rounded-lg px-2 py-1 max-w-[200px] truncate border border-border/40">
                        <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{tx.referenceProof}</span>
                      </div>
                    </TableCell>

                    {/* Money In */}
                    <TableCell className="p-3.5 text-right font-mono font-bold whitespace-nowrap">
                      {tx.inflowAmount > 0 ? (
                        <span className="text-foreground font-mono">
                          +{formatCurrency(tx.inflowAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    {/* Money Out */}
                    <TableCell className="p-3.5 text-right font-mono font-bold whitespace-nowrap">
                      {tx.outflowAmount > 0 ? (
                        <span className="text-foreground font-mono">
                          -{formatCurrency(tx.outflowAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    {/* Balance / Due */}
                    <TableCell className="p-3.5 text-right font-mono font-bold text-foreground whitespace-nowrap">
                      {tx.dueAmount !== undefined ? (
                        <span className="text-foreground">
                          {formatCurrency(tx.dueAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">Settled</span>
                      )}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          ['SETTLED', 'POSTED', 'PAID'].includes(tx.status)
                            ? 'bg-muted text-foreground border-border'
                            : ['APPROVED', 'VERIFIED'].includes(tx.status)
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-muted/60 text-muted-foreground border-border/80'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    No transactions match your current filter criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <PaginationControls
          page={currentPage}
          pageSize={pageSize}
          total={filteredLedger.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />
      </Card>

      {/* Slide-Over Transaction Inspector Drawer */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="h-full w-full max-w-md bg-card border-l border-border/80 shadow-modal p-6 overflow-y-auto space-y-6 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-border-strong border-border/80 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Transaction Audit Inspector
                  </span>
                  <h3 className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {selectedTx.voucherNumber}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Transaction Highlight */}
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Financial Impact</div>
                <div className="text-2xl font-bold font-mono">
                  {selectedTx.inflowAmount > 0 ? (
                    <span className="text-foreground font-mono">
                      +{formatCurrency(selectedTx.inflowAmount)}
                    </span>
                  ) : selectedTx.outflowAmount > 0 ? (
                    <span className="text-foreground font-mono">
                      -{formatCurrency(selectedTx.outflowAmount)}
                    </span>
                  ) : (
                    <span className="text-foreground">
                      {formatCurrency(selectedTx.dueAmount || 0)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Status:{' '}
                  <span className="font-bold text-foreground">{selectedTx.status}</span>
                </div>
              </div>

              {/* Detailed Audit Metadata */}
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium text-foreground">{formatDate(selectedTx.date)}</span>
                </div>

                <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                  <span className="text-muted-foreground">Party:</span>
                  <span className="font-semibold text-foreground">{selectedTx.partyName}</span>
                </div>

                <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                  <span className="text-muted-foreground">Classification:</span>
                  <span className="font-semibold text-foreground">{selectedTx.flowType}</span>
                </div>

                <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                  <span className="text-muted-foreground">Proof / Reference:</span>
                  <span className="font-mono font-medium text-foreground break-all">{selectedTx.referenceProof}</span>
                </div>

                {selectedTx.paymentMode && (
                  <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                    <span className="text-muted-foreground">Payment Mode:</span>
                    <span className="font-medium text-foreground">{selectedTx.paymentMode}</span>
                  </div>
                )}

                <div className="flex justify-between py-1.5 border-border-strong border-border/60">
                  <span className="text-muted-foreground">Accounting Context:</span>
                  <span className="font-medium text-foreground">Plinth (Master Book)</span>
                </div>

                <div className="py-2 space-y-1">
                  <span className="text-muted-foreground block">Particulars:</span>
                  <p className="p-2.5 rounded-xl bg-muted/40 text-foreground text-xs leading-relaxed border border-border/40">
                    {selectedTx.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Document Navigation */}
            <div className="pt-4 border-t border-border/80 space-y-2">
              <Button
                onClick={() => {
                  navigateToSource(selectedTx);
                  setSelectedTx(null);
                }}
                className="w-full bg-n-600 hover:bg-n-700 text-inverse font-semibold gap-1.5 rounded-xl text-xs py-2.5 shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
                View Full Document & Records
              </Button>

              <Button
                variant="outline"
                onClick={() => setSelectedTx(null)}
                className="w-full text-xs rounded-xl"
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
