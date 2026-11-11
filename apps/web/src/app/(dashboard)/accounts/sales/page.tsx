'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  ShoppingBag,
  BookOpen,
  Wallet,
  Search,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { salesApi } from '@/features/sales/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { RecordCustomerPaymentModal } from '@/features/accounts/components/RecordCustomerPaymentModal';
import { CustomerLedgerModal } from '@/features/accounts/components/CustomerLedgerModal';
import { SalesInvoice, CustomerCreditBalance, PaymentMode } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';
import { PaginationControls } from '@/components/PaginationControls';
import { showToast } from '@/components/toast-store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SalesAccountsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [activeTab, setActiveTab] = useState<'invoices' | 'orders' | 'ledgers'>('invoices');

  // Invoices filters & pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);

  // Confirmed Orders filters & pagination
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  // Customer Ledgers search
  const [customerSearch, setCustomerSearch] = useState('');

  // Modals state
  const [payingInvoice, setPayingInvoice] = useState<SalesInvoice | null>(null);
  const [viewLedgerCustomer, setViewLedgerCustomer] = useState<CustomerCreditBalance | null>(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = selectedEntityId || entities.data?.[0]?.id || '';

  const periods = useQuery({
    queryKey: ['accounts', 'periods', entityId],
    queryFn: () => accountsApi.periods(entityId),
    enabled: Boolean(entityId),
  });

  const invoices = useQuery({
    queryKey: ['accounts', 'ar', 'invoices', entityId, invoicePage],
    queryFn: () => accountsApi.arInvoices(entityId, invoicePage),
    enabled: Boolean(entityId),
  });

  const confirmedOrders = useQuery({
    queryKey: ['sales', 'orders', 'confirmed'],
    queryFn: () => salesApi.list({ limit: 100 }),
  });

  const customerCreditBalances = useQuery({
    queryKey: ['accounts', 'ar', 'customer-credit-balances', entityId],
    queryFn: () => accountsApi.customerCreditBalances(entityId),
    enabled: Boolean(entityId),
  });

  // Calculations for Invoices
  const allInvoices = invoices.data?.items || [];
  const filteredInvoices = allInvoices.filter((inv) => {
    const matchesSearch =
      !search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.salesOrderNumber && inv.salesOrderNumber.toLowerCase().includes(search.toLowerCase()));
    const matchesType = !typeFilter || inv.type === typeFilter;
    const matchesStatus = !statusFilter || inv.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalInvoicedCount = invoices.data?.total ?? allInvoices.length;
  const totalInvoicedAmount = allInvoices.reduce((sum, i) => sum + parseFloat(i.totalAmount || '0'), 0);
  const totalPaidAmount = allInvoices.reduce((sum, i) => sum + parseFloat(i.paidAmount || '0'), 0);
  const totalOutstandingAmount = allInvoices.reduce((sum, i) => sum + parseFloat(i.outstandingAmount || '0'), 0);

  const pendingInvoicesCount = allInvoices.filter((i) => parseFloat(i.paidAmount || '0') === 0).length;
  const partialInvoicesCount = allInvoices.filter(
    (i) => parseFloat(i.paidAmount || '0') > 0 && parseFloat(i.outstandingAmount || '0') > 0
  ).length;
  const paidInvoicesCount = allInvoices.filter((i) => parseFloat(i.outstandingAmount || '0') <= 0.009).length;

  const paginatedInvoices = filteredInvoices.slice((invoicePage - 1) * invoicePageSize, invoicePage * invoicePageSize);

  // Calculations for Confirmed Orders
  const rawOrders = confirmedOrders.data?.items || [];
  const validConfirmedOrders = rawOrders.filter((o) =>
    ['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED'].includes(o.status)
  );

  const filteredOrders = validConfirmedOrders.filter((ord) => {
    const matchesSearch =
      !orderSearch ||
      ord.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      (ord.addresses?.[0]?.name && ord.addresses[0].name.toLowerCase().includes(orderSearch.toLowerCase()));
    const matchesPayment = !orderPaymentFilter || ord.paymentStatus === orderPaymentFilter;
    return matchesSearch && matchesPayment;
  });

  const paginatedOrders = filteredOrders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);

  // Calculations for Customer Ledgers & Limits
  const allCustomerBalances = customerCreditBalances.data || [];
  const filteredCustomerBalances = allCustomerBalances.filter((c) => {
    return (
      !customerSearch ||
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.taxNumber && c.taxNumber.toLowerCase().includes(customerSearch.toLowerCase()))
    );
  });

  const customersWithDues = allCustomerBalances.filter((c) => parseFloat(c.outstandingBalance || '0') > 0);
  const customersExceeded = allCustomerBalances.filter((c) => c.isCreditExceeded);

  const handleRecordCustomerPayment = async (input: {
    paymentDate: string;
    amount: string;
    paymentMode: PaymentMode;
    reference: string;
    notes?: string;
  }) => {
    if (!payingInvoice) return;
    setIsSavingPayment(true);
    try {
      await accountsApi.recordCustomerReceipt({
        entityId,
        customerName: payingInvoice.customerName,
        customerId: payingInvoice.customerId || undefined,
        invoiceId: payingInvoice.id,
        salesOrderId: payingInvoice.salesOrderId || undefined,
        receiptDate: input.paymentDate,
        amount: input.amount,
        method: input.paymentMode,
        reference: input.reference,
        notes: input.notes,
      });

      await queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] });
      await queryClient.invalidateQueries({ queryKey: ['sales', 'orders'] });

      showToast({
        kind: 'success',
        title: 'Customer Payment Recorded',
        message: `Customer receipt of ${formatCurrency(input.amount)} recorded against Tax Bill ${payingInvoice.invoiceNumber}.`,
      });
      setPayingInvoice(null);
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Payment Recording Failed',
        message: err?.message || 'Customer receipt recording failed.',
      });
      throw err;
    } finally {
      setIsSavingPayment(false);
    }
  };


  return (
    <main className="flex-1 space-y-4 p-5 md:p-8">
      {/* Header */}
      <AccountsHeader
        title="Sales & Receivables (AR)"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        hideCompany={true}
      />

      {/* Compact 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Invoiced Receivables
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {invoices.isLoading ? '—' : formatCurrency(totalInvoicedAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {totalInvoicedCount} sales tax bill{totalInvoicedCount === 1 ? '' : 's'} registered
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Settled Collections
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {invoices.isLoading ? '—' : formatCurrency(totalPaidAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {paidInvoicesCount} settled in full
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Outstanding Dues to Collect
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {invoices.isLoading ? '—' : formatCurrency(totalOutstandingAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {pendingInvoicesCount} pending · {partialInvoicesCount} partial
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Credit Limit Risk
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {customerCreditBalances.isLoading ? '—' : `${customersExceeded.length} Exceeded`}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {customersWithDues.length} client{customersWithDues.length === 1 ? '' : 's'} with open balance
          </p>
        </div>
      </div>

      {/* Tabs and Toolbar Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        {/* View Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setActiveTab('invoices');
              setInvoicePage(1);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'invoices'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Sales Invoices & Bills
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === 'invoices' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {allInvoices.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('orders');
              setOrderPage(1);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'orders'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Confirmed Sales Orders
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === 'orders' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {validConfirmedOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ledgers')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'ledgers'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Customer Ledgers & Credit Limits
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === 'ledgers' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {allCustomerBalances.length}
            </span>
          </button>
        </div>

        {/* Tab-specific Filters Toolbar */}
        {activeTab === 'invoices' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search invoice, customer, order..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setInvoicePage(1);
                }}
              />
            </div>

            <select
              aria-label="Filter by Type"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setInvoicePage(1);
              }}
            >
              <option value="">All Channels</option>
              <option value="B2B">B2B Registered</option>
              <option value="B2C">B2C Retail</option>
              <option value="MARKETPLACE">Marketplace</option>
              <option value="POS">POS Walk-In</option>
            </select>

            <select
              aria-label="Filter by Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setInvoicePage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="POSTED">Posted</option>
            </select>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search order # or customer..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setOrderPage(1);
                }}
              />
            </div>

            <select
              aria-label="Filter by Payment Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
              value={orderPaymentFilter}
              onChange={(e) => {
                setOrderPaymentFilter(e.target.value);
                setOrderPage(1);
              }}
            >
              <option value="">All Payment Statuses</option>
              <option value="PENDING">Pending Collection</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid in Full</option>
            </select>
          </div>
        )}

        {activeTab === 'ledgers' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search client name, code, GSTIN..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-56 sm:w-64 transition"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: Sales Invoices & Bills */}
      {activeTab === 'invoices' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="p-3 text-left font-semibold">Bill / Invoice No.</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Linked Order</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Customer</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Channel</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Total Bill (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Collected (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Outstanding Due (₹)</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {invoices.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading sales bills and receivables…
                      </TableCell>
                    </TableRow>
                  ) : paginatedInvoices.length ? (
                    paginatedInvoices.map((inv) => {
                      const outstandingNum = parseFloat(inv.outstandingAmount || '0');
                      const paidNum = parseFloat(inv.paidAmount || '0');
                      const isFullyPaid = outstandingNum <= 0.009 && paidNum > 0;

                      return (
                        <TableRow
                          key={inv.id}
                          onClick={() => router.push(`/accounts/sales/invoices/${inv.id}`)}
                          className="hover:bg-muted/50 transition-colors cursor-pointer group"
                        >
                          <TableCell className="p-3 font-mono font-bold text-foreground">
                            <div className="flex items-center gap-1.5 font-mono group-hover:text-primary dark:group-hover:text-primary transition-colors">
                              <span>{inv.invoiceNumber}</span>
                              <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                            </div>
                          </TableCell>
                          <TableCell className="p-3 font-mono">
                            {inv.salesOrderId ? (
                              <Link
                                href={`/sales/orders/${inv.salesOrderId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:text-primary hover:underline font-semibold"
                              >
                                {inv.salesOrderNumber || 'View Order'}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="p-3 font-medium text-foreground">
                            {inv.customerName}
                            {inv.customerGstin && (
                              <span className="block text-[10px] font-mono text-muted-foreground">
                                {inv.customerGstin}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="p-3 font-mono text-muted-foreground">
                            {inv.invoiceDate.slice(0, 10)}
                          </TableCell>
                          <TableCell className="p-3">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                              {inv.type}
                            </span>
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono font-bold text-foreground">
                            {formatCurrency(inv.totalAmount)}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(inv.paidAmount)}
                          </TableCell>
                          <TableCell className={`p-3 text-right font-mono font-semibold ${
                            outstandingNum > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatCurrency(inv.outstandingAmount)}
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                isFullyPaid || inv.status === 'POSTED'
                                  ? 'bg-muted text-foreground border-border'
                                  : 'bg-muted text-foreground border-border'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                        No sales bills found matching current criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <PaginationControls
              page={invoicePage}
              pageSize={invoicePageSize}
              total={filteredInvoices.length}
              onPageChange={setInvoicePage}
              onPageSizeChange={setInvoicePageSize}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 2: Confirmed Sales Orders */}
      {activeTab === 'orders' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="p-3 text-left font-semibold">Order No.</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Customer</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Channel</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Order Date</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Ordered Lines</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Grand Total (₹)</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Accounts Bill Link</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Payment Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {confirmedOrders.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading confirmed sales orders…
                      </TableCell>
                    </TableRow>
                  ) : paginatedOrders.length ? (
                    paginatedOrders.map((ord) => {
                      const linkedBill = allInvoices.find((i) => i.salesOrderId === ord.id);
                      const customerName =
                        ord.addresses?.find((a) => a.kind === 'BILLING')?.name ||
                        ord.addresses?.find((a) => a.kind === 'SHIPPING')?.name ||
                        'Customer';

                      return (
                        <TableRow
                          key={ord.id}
                          onClick={() => router.push(linkedBill ? `/accounts/sales/invoices/${linkedBill.id}` : `/sales/orders/${ord.id}`)}
                          className="hover:bg-muted/50 transition-colors cursor-pointer group"
                        >
                          <TableCell className="p-3 font-mono font-bold text-foreground">
                            <div className="flex items-center gap-1.5 font-mono group-hover:text-primary dark:group-hover:text-primary transition-colors">
                              <span>{ord.orderNumber}</span>
                              <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                            </div>
                          </TableCell>
                          <TableCell className="p-3 font-medium text-foreground">
                            {customerName}
                          </TableCell>
                          <TableCell className="p-3">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                              {ord.channel}
                            </span>
                          </TableCell>
                          <TableCell className="p-3 font-mono text-muted-foreground">
                            {String(ord.orderedAt).slice(0, 10)}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono">
                            {ord.lines?.length || 0} line{(ord.lines?.length || 0) === 1 ? '' : 's'}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono font-bold text-foreground">
                            {formatCurrency(ord.grandTotal)}
                          </TableCell>
                          <TableCell className="p-3 font-mono">
                            {linkedBill ? (
                              <Link
                                href={`/accounts/sales/invoices/${linkedBill.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs"
                              >
                                {linkedBill.invoiceNumber}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="rounded-full bg-muted text-foreground px-2 py-0.5 text-[10px] font-semibold">
                                Auto-Generating Bill…
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                ord.paymentStatus === 'PAID'
                                  ? 'bg-muted text-foreground border-border'
                                  : ord.paymentStatus === 'PARTIALLY_PAID'
                                  ? 'bg-muted text-muted-foreground border-border'
                                  : 'bg-muted/60 text-muted-foreground border-border/80'
                              }`}
                            >
                              {ord.paymentStatus || 'PENDING'}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                        No confirmed sales orders found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <PaginationControls
              page={orderPage}
              pageSize={orderPageSize}
              total={filteredOrders.length}
              onPageChange={setOrderPage}
              onPageSizeChange={setOrderPageSize}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Customer Ledgers & Credit Limits */}
      {activeTab === 'ledgers' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold">Customer Directory & Running Ledgers</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track approved credit limits, amount to be taken from each customer, credit utilization and running ledger statements.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="p-3 text-left font-semibold">Customer</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Code / GSTIN</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Approved Credit Limit (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Total Invoiced (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Total Settled (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Outstanding Dues to Collect (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Available Credit (₹)</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Credit Utilization</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Credit Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {customerCreditBalances.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading customer ledgers and credit limits…
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomerBalances.length ? (
                    filteredCustomerBalances.map((cust) => {
                      const outstandingNum = parseFloat(cust.outstandingBalance || '0');

                      return (
                        <TableRow
                          key={cust.id}
                          onClick={() => setViewLedgerCustomer(cust)}
                          className="hover:bg-muted/50 transition-colors cursor-pointer group"
                        >
                          <TableCell className="p-3 font-semibold text-foreground">
                            <div className="flex items-center gap-1.5 group-hover:text-primary dark:group-hover:text-primary transition-colors">
                              <span>{cust.name}</span>
                              <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                            </div>
                            {cust.contactEmail && (
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {cust.contactEmail}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="p-3 font-mono">
                            <span className="font-bold text-foreground">{cust.code}</span>
                            {cust.taxNumber && (
                              <span className="block text-[10px] text-muted-foreground">{cust.taxNumber}</span>
                            )}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono font-bold text-foreground">
                            {formatCurrency(cust.creditLimit)}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono text-muted-foreground">
                            {formatCurrency(cust.totalInvoiced)}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(cust.totalPaid)}
                          </TableCell>
                          <TableCell className={`p-3 text-right font-mono font-bold ${
                            outstandingNum > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatCurrency(cust.outstandingBalance)}
                          </TableCell>
                          <TableCell className="p-3 text-right font-mono text-foreground">
                            {formatCurrency(cust.availableCredit)}
                          </TableCell>
                          <TableCell className="p-3">
                            <div className="w-28 space-y-1">
                              <div className="flex justify-between text-[10px] font-mono">
                                <span>{cust.utilizationPercent}%</span>
                                <span className="text-muted-foreground">of limit</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    cust.isCreditExceeded
                                      ? 'bg-rose-500'
                                      : cust.utilizationPercent > 80
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, cust.utilizationPercent)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            {cust.isCreditExceeded ? (
                              <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1 border border-rose-500/20">
                                <ShieldAlert className="h-3 w-3" />
                                Limit Exceeded
                              </span>
                            ) : cust.utilizationPercent > 80 ? (
                              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                High Usage
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                Good Standing
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                        No customers found matching search criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Customer Payment Modal */}
      {payingInvoice && (
        <RecordCustomerPaymentModal
          isOpen={Boolean(payingInvoice)}
          onClose={() => setPayingInvoice(null)}
          invoice={payingInvoice}
          onSubmit={handleRecordCustomerPayment}
          isSaving={isSavingPayment}
        />
      )}

      {/* Customer Running Ledger Modal */}
      {viewLedgerCustomer && (
        <CustomerLedgerModal
          isOpen={Boolean(viewLedgerCustomer)}
          onClose={() => setViewLedgerCustomer(null)}
          entityId={entityId}
          customer={viewLedgerCustomer}
        />
      )}
    </main>
  );
}
