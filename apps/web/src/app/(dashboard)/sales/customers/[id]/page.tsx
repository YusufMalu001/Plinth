'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CreditCard,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  User,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@synergy/ui';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { useSalesCustomer } from '../../../../../features/sales/hooks';
import { salesApi } from '../../../../../features/sales/api';
import { accountsApi } from '@/features/accounts/api';
import { useQuery } from '@tanstack/react-query';

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [activeTab, setActiveTab] = useState<'orders' | 'invoices' | 'ledger' | 'addresses' | 'profile'>('orders');

  // Fetch Customer Master
  const { data: customer, isLoading: isLoadingCustomer } = useSalesCustomer(id);

  // Fetch Customer Orders
  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['sales', 'customer-orders', id],
    queryFn: () => salesApi.list({ customerId: id, limit: 100 }),
    enabled: Boolean(id),
  });

  const orders = ordersData?.items || [];

  // Fetch Accounting Entity
  const entitiesQuery = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });
  const entityId = entitiesQuery.data?.[0]?.id || 'synergy-international';

  // Fetch Accounts Live Credit Exposure & Balances
  const creditBalancesQuery = useQuery({
    queryKey: ['accounts', 'ar', 'customer-credit', entityId],
    queryFn: () => accountsApi.customerCreditBalances(entityId),
    enabled: Boolean(entityId),
  });

  const creditData = creditBalancesQuery.data?.find(
    (c) => c.id === id || c.name.toLowerCase() === customer?.name?.toLowerCase()
  );

  // Fetch Accounts AR Customer Financial Ledger
  const ledgerQuery = useQuery({
    queryKey: ['accounts', 'ar', 'customer-ledger', entityId, id],
    queryFn: () => accountsApi.customerLedger(entityId, id),
    enabled: Boolean(entityId && id),
  });

  const ledgerEntries = ledgerQuery.data || [];

  // Fetch Accounts Invoices
  const invoicesQuery = useQuery({
    queryKey: ['accounts', 'ar', 'invoices', entityId],
    queryFn: () => accountsApi.arInvoices(entityId, 1),
    enabled: Boolean(entityId),
  });

  const customerInvoices = (invoicesQuery.data?.items || []).filter(
    (inv: any) =>
      inv.customerId === id ||
      inv.customerName?.toLowerCase() === customer?.name?.toLowerCase()
  );

  // Aggregate Customer Financials
  const financials = useMemo(() => {
    let totalSpent = 0;
    orders.forEach((o) => {
      totalSpent += Number(o.grandTotal || 0);
    });

    const creditLimit = Number(creditData?.creditLimit ?? customer?.creditLimit ?? 0);
    const totalInvoiced = Number(creditData?.totalInvoiced ?? 0);
    const totalPaid = Number(creditData?.totalPaid ?? 0);
    const outstanding = Number(creditData?.outstandingBalance ?? 0);
    const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : 0;
    const utilizationPercent =
      creditLimit > 0 ? Math.min(100, Math.round((outstanding / creditLimit) * 100)) : 0;
    const isCreditExceeded = creditLimit > 0 && outstanding > creditLimit;

    // Credit Health Score Calculation (0-100)
    let score = 95;
    let label = 'EXCELLENT';
    let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800';

    if (creditLimit <= 0) {
      score = 75;
      label = 'STANDARD CASH';
      badgeClass = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800';
    } else if (isCreditExceeded) {
      score = 35;
      label = 'CREDIT HOLD';
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800';
    } else if (utilizationPercent > 80) {
      score = 62;
      label = 'HIGH UTILIZATION';
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
    } else if (utilizationPercent > 50) {
      score = 82;
      label = 'GOOD';
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800';
    }

    return {
      totalOrders: orders.length,
      totalSpent,
      creditLimit,
      totalInvoiced,
      totalPaid,
      outstanding,
      availableCredit,
      utilizationPercent,
      isCreditExceeded,
      creditScore: {
        score,
        label,
        badgeClass,
      },
    };
  }, [orders, customer, creditData]);

  // Extract metadata
  const billingMeta = customer?.billingAddress && typeof customer.billingAddress === 'object'
    ? (customer.billingAddress as any)
    : {};
  const shippingMeta = customer?.shippingAddress && typeof customer.shippingAddress === 'object'
    ? (customer.shippingAddress as any)
    : {};

  const customerType = customer?.customerType || billingMeta.customerType || 'DEALER';
  const paymentTerms = customer?.paymentTerms || billingMeta.paymentTerms || 'NET_30';
  const priceTier = customer?.priceTier || billingMeta.priceTier || 'STANDARD';
  const contactPerson = customer?.contactPerson || billingMeta.contactPerson;

  if (isLoadingCustomer) {
    return (
      <div className="flex-1 p-8 text-center text-muted-foreground">
        Loading customer account details...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex-1 p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-foreground">Customer Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The requested customer or dealer account could not be found.
        </p>
        <Button onClick={() => router.push('/sales/customers')}>
          Back to Directory
        </Button>
      </div>
    );
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'DEALER':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'DISTRIBUTOR':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      case 'RETAIL':
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
      case 'CORPORATE':
        return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
      default:
        return 'bg-slate-500/10 text-slate-700 border-slate-500/30';
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Back & Action Bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/sales/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Customer Directory
        </Link>
      </div>

      {/* Hero 360 Header Card */}
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-black px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                {customer.code}
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${getTypeBadgeColor(
                  customerType
                )}`}
              >
                {customerType}
              </span>
              <StatusBadge status={customer.status as any} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-foreground">
              {customer.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {contactPerson && (
                <div className="flex items-center gap-1 font-medium text-foreground/80">
                  <User className="h-3.5 w-3.5 text-primary" /> Attn: {contactPerson}
                </div>
              )}
              {customer.contactPhone && (
                <div className="flex items-center gap-1 font-mono">
                  <Phone className="h-3.5 w-3.5 text-primary" /> {customer.contactPhone}
                </div>
              )}
              {customer.contactEmail && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-primary" /> {customer.contactEmail}
                </div>
              )}
              {customer.taxNumber && (
                <div className="flex items-center gap-1 font-mono">
                  <FileText className="h-3.5 w-3.5 text-primary" /> GSTIN: {customer.taxNumber}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={() => router.push(`/sales/orders/new`)}
              className="font-bold shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>+ Create Sales Order</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 4-Bento Financial & Credit Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Credit Limit & Utilization */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Approved Credit Limit
            </span>
            <CreditCard className="h-4 w-4 text-synergy-600" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-black text-foreground font-mono">
              {financials.creditLimit > 0 ? formatCurrency(financials.creditLimit) : 'No Limit'}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Available Credit:</span>
              <strong className="font-mono text-foreground font-semibold">
                {financials.creditLimit > 0 ? formatCurrency(financials.availableCredit) : 'Unlimited'}
              </strong>
            </div>
            {financials.creditLimit > 0 && (
              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    financials.isCreditExceeded
                      ? 'bg-rose-600'
                      : financials.utilizationPercent > 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, financials.utilizationPercent)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Health Score */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Credit Score &amp; Rating
            </span>
            {financials.isCreditExceeded ? (
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-foreground">
                {financials.creditScore.score}
              </span>
              <span className="text-xs text-muted-foreground font-semibold">/ 100</span>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${financials.creditScore.badgeClass}`}
              >
                {financials.creditScore.label}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Invoiced & Outstanding Dues */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Outstanding Dues
            </span>
            <Wallet className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-black text-foreground font-mono">
              {formatCurrency(financials.outstanding)}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Total Paid:</span>
              <strong className="font-mono text-emerald-600 font-semibold">
                {formatCurrency(financials.totalPaid)}
              </strong>
            </div>
          </CardContent>
        </Card>

        {/* Total Purchased Orders */}
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Purchased Orders
            </span>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-black text-foreground font-mono">
              {financials.totalOrders}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Total Orders Value:</span>
              <strong className="font-mono text-foreground font-semibold">
                {formatCurrency(financials.totalSpent)}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-border flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`pb-3 px-4 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Purchased Orders ({orders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 px-4 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'invoices'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="h-3.5 w-3.5" /> Tax Invoices &amp; Credit Notes ({customerInvoices.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 px-4 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'ledger'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" /> Customer Ledger ({ledgerEntries.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('addresses')}
          className={`pb-3 px-4 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'addresses'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" /> Registered Addresses
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-4 text-xs font-bold transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-3.5 w-3.5" /> Commercial Profile &amp; KYC
        </button>
      </div>

      {/* Tab Content 1: Orders History */}
      {activeTab === 'orders' && (
        <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
          <CardHeader className="bg-card/40 border-b border-border pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> Customer Purchase &amp; Sales Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Order #</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-24">Channel</TableHead>
                  <TableHead className="text-right w-24">Lines</TableHead>
                  <TableHead className="text-right w-32">Grand Total</TableHead>
                  <TableHead className="text-center w-28">Order Status</TableHead>
                  <TableHead className="text-center w-28">Payment</TableHead>
                  <TableHead className="text-right w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingOrders ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                      Loading customer orders...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                      No sales orders found for this customer account.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((ord: any) => (
                    <TableRow key={ord.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-mono font-bold text-foreground">
                        {ord.orderNumber}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(ord.orderedAt || ord.createdAt).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                          {ord.channel || 'DIRECT'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {ord.lines?.length || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-foreground">
                        {formatCurrency(ord.grandTotal)}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={ord.status} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                            ord.paymentStatus === 'PAID'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {ord.paymentStatus || 'PENDING'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/sales/orders/${ord.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md hover:bg-muted text-primary hover:underline"
                        >
                          <span>View Order</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab Content 2: Tax Invoices & Credit Notes */}
      {activeTab === 'invoices' && (
        <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
          <CardHeader className="bg-card/40 border-b border-border pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Accounts AR Tax Invoices &amp; Credit Notes
            </CardTitle>
            <Link href="/accounts/sales">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold">
                <span>Open Accounts AR Workbench</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Invoice / Document #</TableHead>
                  <TableHead className="w-28">Issue Date</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="text-right w-32">Total Amount</TableHead>
                  <TableHead className="text-right w-32">Paid Amount</TableHead>
                  <TableHead className="text-right w-32">Outstanding</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                  <TableHead className="text-right w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                      Loading Accounts bills...
                    </TableCell>
                  </TableRow>
                ) : customerInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                      No tax invoices or bills generated in Accounts yet for this customer.
                    </TableCell>
                  </TableRow>
                ) : (
                  customerInvoices.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-mono font-bold text-foreground">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {inv.type || 'TAX_INVOICE'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-foreground">
                        {formatCurrency(inv.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-emerald-600">
                        {formatCurrency(inv.paidAmount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-700 dark:text-amber-400">
                        {formatCurrency(inv.outstandingAmount || inv.totalAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                            inv.status === 'POSTED' || inv.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-synergy-500/10 text-synergy-700 dark:text-synergy-400'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/accounts/sales/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md text-primary hover:underline"
                        >
                          <span>View Tax Bill</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab Content 3: Customer Financial Running Ledger */}
      {activeTab === 'ledger' && (
        <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
          <CardHeader className="bg-card/40 border-b border-border pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Customer Account Ledger &amp; Transaction Statement
            </CardTitle>
            <div className="text-xs font-mono font-bold text-foreground">
              Net Balance: {formatCurrency(financials.outstanding)}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-36">Document / Ref</TableHead>
                  <TableHead className="w-28">Type</TableHead>
                  <TableHead className="text-right w-32">Debit (₹)</TableHead>
                  <TableHead className="text-right w-32">Credit (₹)</TableHead>
                  <TableHead className="text-right w-36">Running Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                      Loading customer ledger transactions...
                    </TableCell>
                  </TableRow>
                ) : ledgerEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                      No accounting ledger entries posted for this customer yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  ledgerEntries.map((row: any, idx: number) => {
                    const debit = Number(row.debit || 0);
                    const credit = Number(row.credit || 0);
                    const balance = Number(row.balance || 0);

                    return (
                      <TableRow key={idx} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.entryDate).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-foreground text-xs">
                          {row.reference}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                              row.entryType === 'INVOICE'
                                ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                : row.entryType === 'RECEIPT'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-purple-500/10 text-purple-700 dark:text-purple-400'
                            }`}
                          >
                            {row.entryType === 'INVOICE' ? (
                              <ArrowUpRight className="h-2.5 w-2.5" />
                            ) : (
                              <ArrowDownLeft className="h-2.5 w-2.5" />
                            )}
                            {row.entryType}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-foreground">
                          {debit > 0 ? formatCurrency(debit) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600">
                          {credit > 0 ? formatCurrency(credit) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-foreground">
                          {formatCurrency(balance)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab Content 4: Addresses */}
      {activeTab === 'addresses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="bg-card/40 border-b border-border pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Primary Billing Address
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-2 text-xs">
              <p className="font-bold text-foreground text-sm">
                {billingMeta.name || customer.name}
              </p>
              <p className="text-muted-foreground">{billingMeta.line1 || '—'}</p>
              {billingMeta.line2 && <p className="text-muted-foreground">{billingMeta.line2}</p>}
              <p className="text-muted-foreground">
                {[billingMeta.city, billingMeta.state, billingMeta.postalCode].filter(Boolean).join(', ')}
              </p>
              <p className="text-muted-foreground font-mono">
                Country: {billingMeta.country || 'India'}
              </p>
              {billingMeta.taxNumber && (
                <div className="pt-2 border-t border-border font-mono font-bold text-foreground">
                  GSTIN: {billingMeta.taxNumber}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="bg-card/40 border-b border-border pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Truck className="h-4 w-4 text-blue-500" /> Default Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-2 text-xs">
              <p className="font-bold text-foreground text-sm">
                {shippingMeta.name || billingMeta.name || customer.name}
              </p>
              <p className="text-muted-foreground">{shippingMeta.line1 || billingMeta.line1 || '—'}</p>
              {shippingMeta.line2 && <p className="text-muted-foreground">{shippingMeta.line2}</p>}
              <p className="text-muted-foreground">
                {[shippingMeta.city || billingMeta.city, shippingMeta.state || billingMeta.state, shippingMeta.postalCode || billingMeta.postalCode].filter(Boolean).join(', ')}
              </p>
              <p className="text-muted-foreground font-mono">
                Country: {shippingMeta.country || 'India'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Content 5: Profile & KYC */}
      {activeTab === 'profile' && (
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="bg-card/40 border-b border-border pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Master Data &amp; Accounting Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Customer Account Code</span>
                <p className="font-mono font-bold text-foreground text-sm">{customer.code}</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Account Classification</span>
                <p className="font-bold text-foreground text-sm">{customerType}</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Payment Terms</span>
                <p className="font-bold text-foreground text-sm">{paymentTerms.replace('_', ' ')}</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Approved Credit Limit</span>
                <p className="font-mono font-bold text-foreground text-sm">
                  {financials.creditLimit > 0 ? formatCurrency(financials.creditLimit) : 'Unlimited / None'}
                </p>
                <p className="text-[10px] text-muted-foreground">Authorized strictly by Accounts &amp; Finance</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Price / Discount Tier</span>
                <p className="font-bold text-foreground text-sm">{priceTier}</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">GSTIN / Tax ID</span>
                <p className="font-mono font-bold text-foreground text-sm">
                  {customer.taxNumber || 'Unregistered'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Primary Contact Person</span>
                <p className="font-bold text-foreground text-sm">{contactPerson || '—'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Operating Currency</span>
                <p className="font-mono font-bold text-foreground text-sm">
                  {customer.currency || 'INR'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold">Credit Risk Status</span>
                <p className="font-bold text-foreground text-sm">
                  {financials.isCreditExceeded ? 'HOLD - EXCEEDED' : 'GOOD STANDING'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
