'use client';

import React, { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Wallet,
  Building2,
  AlertCircle,
  ExternalLink,
  FileText,
  Layers,
  Truck,
  TrendingUp,
  MapPin,
  Calendar,
  ShoppingBag,
  ShieldCheck,
  Lock,
  Pencil,
  PlusCircle,
  Printer,
} from 'lucide-react';
import { Button } from '@synergy/ui';
import Link from 'next/link';
import { accountsApi } from '@/features/accounts/api';
import { salesApi } from '@/features/sales/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { RecordCustomerPaymentModal } from '@/features/accounts/components/RecordCustomerPaymentModal';
import { DebitCreditNoteModal } from '@/features/accounts/components/DebitCreditNoteModal';
import { EditTaxInvoiceModal } from '@/features/accounts/components/EditTaxInvoiceModal';
import { formatCurrency, formatDate } from '@/features/accounts/utils';
import { numberToIndianWords, SYNERGY_COMPANY_INFO } from '@/features/purchases/utils';
import { useCurrentUser } from '@/features/auth/hooks';
import { SalesInvoice, CustomerCreditBalance } from '@/features/accounts/types';
import { showToast } from '@/components/toast-store';

function Amount({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-0.5 text-xs ${
        strong ? 'font-bold text-foreground' : muted ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function SalesInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [pending, setPending] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false);
  const [isEditInvoiceModalOpen, setIsEditInvoiceModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'order' | 'payments' | 'ledger' | 'audit'>('order');

  // Query invoice details from Accounts AR
  const invoiceQuery = useQuery({
    queryKey: ['accounts', 'ar', 'invoice', params.id],
    queryFn: () => accountsApi.arInvoice(params.id),
  });
  const invoice = invoiceQuery.data;

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoiceQuery.data?.invoiceNumber || 'Sales-Tax-Invoice',
  });

  // Query linked sales order details
  const salesOrderQuery = useQuery({
    queryKey: ['sales', 'order', invoice?.salesOrderId],
    queryFn: () => salesApi.get(invoice!.salesOrderId!),
    enabled: Boolean(invoice?.salesOrderId),
  });
  const salesOrder = salesOrderQuery.data;

  // Query customer details & credit balance
  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const creditExposureQuery = useQuery({
    queryKey: ['accounts', 'ar', 'customer-credit', invoice?.entityId],
    queryFn: () => accountsApi.customerCreditBalances(invoice?.entityId || 'synergy-international'),
    enabled: Boolean(invoice?.entityId),
  });

  const customerCredit = creditExposureQuery.data?.find(
    (c: CustomerCreditBalance) =>
      c.id === invoice?.customerId ||
      c.name.toLowerCase() === invoice?.customerName?.toLowerCase()
  );

  const fallbackCustomerCredit: CustomerCreditBalance = {
    id: invoice?.customerId || 'cust-direct',
    code: 'CUST',
    name: invoice?.customerName || 'Customer',
    taxNumber: invoice?.customerGstin || null,
    creditLimit: '0',
    totalInvoiced: invoice?.totalAmount || '0',
    totalPaid: invoice?.paidAmount || '0',
    outstandingBalance: invoice?.outstandingAmount || '0',
    availableCredit: '0',
    utilizationPercent: 0,
    isCreditExceeded: false,
    invoiceCount: 1,
    contactEmail: null,
    contactPhone: null,
  };

  const effectiveCredit = customerCredit || fallbackCustomerCredit;

  const shippingAddress = salesOrder?.addresses?.find((a) => a.kind === 'SHIPPING');

  const permissions = new Set((user.data?.permissions || []).map((p) => p.toLowerCase()));
  const isAdmin = user.data?.role === 'admin' || user.data?.role === 'super_admin';
  const can = (action: string) => isAdmin || permissions.has(`${action}:salesarinvoice`);

  const runAction = async (action: () => Promise<SalesInvoice>, successMessage: string) => {
    setPending(true);
    try {
      const updated = await action();
      if (updated) {
        queryClient.setQueryData(['accounts', 'ar', 'invoice', params.id], updated);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ar', 'invoice', params.id] }),
      ]);
      showToast({
        kind: 'success',
        title: 'Action Completed',
        message: successMessage,
      });
    } catch (error: any) {
      showToast({
        kind: 'error',
        title: 'Action Failed',
        message: error?.message || 'Could not complete this action.',
      });
    } finally {
      setPending(false);
    }
  };

  if (invoiceQuery.isLoading) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-synergy-600 border-t-transparent mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Loading sales bill &amp; tax invoice…</p>
      </main>
    );
  }

  if (invoiceQuery.isError || !invoice) {
    return (
      <main className="space-y-4 p-5 md:p-8 max-w-2xl mx-auto mt-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Could not load this sales tax invoice</h2>
        <p className="text-xs text-muted-foreground">
          {invoiceQuery.error instanceof Error ? invoiceQuery.error.message : 'Record not found.'}
        </p>
        <Link href="/accounts/sales">
          <Button variant="outline" size="sm" className="mt-2 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Sales &amp; Receivables
          </Button>
        </Link>
      </main>
    );
  }

  // Financial calculations
  const totalTaxable = parseFloat(invoice.taxableAmount || '0');
  const totalTax = parseFloat(invoice.taxAmount || '0');
  const grossTotal = parseFloat(invoice.totalAmount || '0');
  const paid = parseFloat(invoice.paidAmount || '0');
  const outstanding = Math.max(0, parseFloat(invoice.outstandingAmount || '0'));
  const isFullySettled = outstanding <= 0.009 && paid > 0;

  // Total quantity
  const totalQuantity = (invoice.lines || []).reduce(
    (sum: number, l: any) => sum + parseFloat(l.quantity || '0'),
    0
  );

  // Payments aggregated from direct order receipts and AR allocations
  const allRecordedPayments = [
    ...(invoice.payments || []).map((p: any) => ({
      id: p.id,
      date: p.paymentDate || p.createdAt,
      amount: parseFloat(p.amount || p.allocatedAmount || '0'),
      method: p.paymentMode || 'BANK_TRANSFER',
      reference: p.reference || 'Auto-Allocated',
      status: p.status || 'RECORDED',
      source: 'AR Allocation',
    })),
    ...(invoice.orderPayments || []).map((p: any) => ({
      id: p.id,
      date: p.paidAt || p.createdAt,
      amount: parseFloat(p.amount || '0'),
      method: p.method || 'ORDER_SETTLEMENT',
      reference: p.reference || 'Sales Order Payment',
      status: p.status || 'PAID',
      source: 'Order Payment',
    })),
  ];

  const uniquePayments = Array.from(
    new Map(allRecordedPayments.map((p) => [p.id || `${p.date}-${p.amount}`, p])).values()
  );

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Sales Tax Invoice Details"
        entities={entities.data || []}
        selectedEntityId={invoice.entityId}
        onSelectEntity={() => undefined}
        hideCompany
      />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/accounts/sales"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Sales &amp; Receivables Register
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* Workflow Transitions */}
          {invoice.status === 'SUBMITTED' && can('approve') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              onClick={() =>
                void runAction(
                  () => accountsApi.transitionArInvoice(invoice.id, 'approve', invoice.version || 1),
                  'Sales tax invoice approved. Ready to collect payment.'
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Invoice
            </Button>
          )}

          {invoice.status === 'APPROVED' && can('post') && (
            <Button
              size="sm"
              disabled={pending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm"
              onClick={() =>
                void runAction(
                  () => accountsApi.transitionArInvoice(invoice.id, 'post', invoice.version || 1),
                  'Sales invoice posted to General Ledger and Accounts Receivable.'
                )
              }
            >
              <Layers className="h-4 w-4" /> Post to Ledger
            </Button>
          )}

          {/* Admin Invoice Modification Guard */}
          {['DRAFT', 'APPROVED'].includes(invoice.status) && (
            isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditInvoiceModalOpen(true)}
                className="gap-1.5 text-xs font-semibold shadow-sm border-amber-300 bg-amber-50/60 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800"
              >
                <Pencil className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                <span>Modify Invoice (Admin)</span>
              </Button>
            ) : (
              <div
                title="Administrator authorization is required to edit or modify tax invoices."
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-80"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Edit Locked (Admin Only)</span>
              </div>
            )
          )}

          {/* Issue Credit Note */}
          {invoice.status !== 'CANCELLED' && can('create') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreditNoteModalOpen(true)}
              className="gap-1.5 text-xs font-semibold shadow-sm border-synergy-200 hover:bg-muted text-foreground dark:text-synergy-300 dark:border-synergy-900"
            >
              <PlusCircle className="h-4 w-4" /> Issue Credit Note
            </Button>
          )}

          {/* Record Customer Payment */}
          {outstanding > 0 && can('create') && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              onClick={() => setIsPaymentModalOpen(true)}
            >
              <Wallet className="h-4 w-4" /> Record Payment
            </Button>
          )}

          {/* Print / PDF Document */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handlePrint()}
            className="gap-1.5 text-xs font-semibold shadow-sm border-slate-300 hover:bg-slate-50 dark:border-border dark:hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Hero Banner (Same as Supplier Bill) */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-synergy-500/5 p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
                Accounts Tax Invoice
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold font-mono">
                {invoice.type || 'B2B'}
              </span>
              <span className="rounded-full bg-synergy-50 px-2 py-0.5 text-[10px] font-bold text-foreground dark:bg-synergy-950/50 dark:text-synergy-300">
                Direct Order Billing
              </span>
            </div>

            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {invoice.invoiceNumber}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground">{invoice.customerName}</span>
              {invoice.customerGstin && (
                <>
                  <span>·</span>
                  <span className="font-mono text-xs">GSTIN: {invoice.customerGstin}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold font-mono ${
                isFullySettled
                  ? 'bg-muted text-foreground border border-emerald-500/30'
                  : paid > 0
                  ? 'bg-muted text-foreground border border-amber-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {isFullySettled ? 'FULLY PAID' : paid > 0 ? 'PARTIALLY PAID' : 'PAYMENT DUE'}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                invoice.status === 'POSTED' || invoice.status === 'APPROVED'
                  ? 'bg-muted text-foreground border border-emerald-500/30'
                  : invoice.status === 'SUBMITTED'
                  ? 'bg-muted text-foreground border border-amber-500/30'
                  : 'bg-muted text-foreground border border-border'
              }`}
            >
              {invoice.status}
            </span>
          </div>
        </div>

        {/* Linked Document Cross-References Bar */}
        <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-border/60">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Linked References:
          </span>

          {invoice.salesOrderId && (
            <Link
              href={`/sales/orders/${invoice.salesOrderId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl hover:border-primary hover:text-primary transition"
            >
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>Sales Order:</span>
              <span className="font-bold text-foreground">
                {invoice.salesOrderNumber || invoice.salesOrderId}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl">
            <Truck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Dispatch Origin:</span>
            <span className="font-bold text-foreground">
              {salesOrder?.warehouseLocationId || 'Finished Goods Bay (Bay 1-4)'}
            </span>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Bill Date:</span>
            <span className="font-bold text-foreground">{formatDate(invoice.invoiceDate)}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1 text-xs font-mono font-medium shadow-2xl">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Due Date:</span>
            <span className="font-bold text-foreground">{formatDate(invoice.dueDate)}</span>
          </span>
        </div>

        {/* 4 Financial Highlight Metric Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Invoiced Gross Total
            </span>
            <p className="mt-1 text-xl font-bold font-mono text-foreground">
              {formatCurrency(grossTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatCurrency(totalTaxable)} taxable + {formatCurrency(totalTax)} Output GST
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Output GST (18%)
            </span>
            <p className="mt-1 text-xl font-bold font-mono text-primary">
              {formatCurrency(totalTax)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              CGST ({formatCurrency(totalTax / 2)}) + SGST ({formatCurrency(totalTax / 2)})
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Collected / Settled
            </span>
            <p className="mt-1 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(paid)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {grossTotal > 0
                ? `${Math.min(100, Math.round((paid / grossTotal) * 100))}% of bill amount received`
                : 'Settled'}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-4 shadow-sm ${
              outstanding > 0
                ? 'border-border bg-synergy-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Net Outstanding Balance
              </span>
              {outstanding > 0 ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  Due to Collect
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  Fully Settled
                </span>
              )}
            </div>
            <p className="mt-1 text-xl font-bold font-mono text-foreground">
              {formatCurrency(outstanding)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {outstanding > 0 ? 'Pending payment receipt from client' : 'All bill dues received in bank'}
            </p>
          </div>
        </div>
      </section>

      {/* Main Container: Document Preview & Lineage Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Primary: Bill Document Preview (Matches Supplier Bill and PO Document Design) */}
        <section
          aria-labelledby="sales-bill-preview-title"
          className="lg:col-span-7 min-w-0 rounded-3xl border border-border bg-slate-100/80 p-4 shadow-sm md:p-6 dark:bg-card print:border-0 print:bg-white print:p-0 print:shadow-none"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h2 id="sales-bill-preview-title" className="text-base font-bold text-foreground">
                Tax Invoice Document
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Formal Accounts Receivable Tax Invoice with complete Sales Order and Payment lineage.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePrint()}
              className="gap-1.5 text-xs font-semibold shadow-sm bg-white hover:bg-slate-50 dark:bg-card border-slate-200 dark:border-border"
            >
              <Printer className="h-3.5 w-3.5 text-foreground" /> Print / Download PDF
            </Button>
          </div>

          {/* Master ERP Document Sheet */}
          <div
            id="sales-bill-document"
            ref={printRef}
            className="mx-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-md md:p-7 dark:bg-card dark:text-foreground dark:border-border print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none w-full"
          >
            {/* Top Document Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-border pb-5">
              <div className="flex items-center gap-4">
                <Image
                  src="/synergy.png"
                  alt="Synergy International"
                  width={175}
                  height={53}
                  priority
                  className="h-auto w-32 object-contain"
                />
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Accounts Receivable · GST Tax Invoice
                  </p>
                  <h2 className="mt-0.5 text-xl md:text-2xl font-bold">Tax Invoice</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
                    Synergy International · Original for Recipient
                  </p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-500 dark:text-muted-foreground">Invoice Reference</p>
                <p className="font-mono font-bold text-base text-foreground">{invoice.invoiceNumber}</p>
                <p className="mt-1.5 text-slate-500 dark:text-muted-foreground">Bill Status</p>
                <p className="font-semibold text-foreground dark:text-synergy-300">
                  {invoice.status}
                </p>
              </div>
            </div>

            {/* Entity & Customer Profile Cards */}
            <div className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2 dark:border-border">
              {/* Supplier / Seller Info */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  Supplier / Seller (Billed From)
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {SYNERGY_COMPANY_INFO.name}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{SYNERGY_COMPANY_INFO.gstin}</span> · State Code: 23
                </p>
                <p className="text-slate-600 dark:text-muted-foreground text-[11px] leading-relaxed">
                  {SYNERGY_COMPANY_INFO.addressLine1} {SYNERGY_COMPANY_INFO.addressLine2} {SYNERGY_COMPANY_INFO.addressLine3}
                </p>
                <p className="text-slate-500 dark:text-muted-foreground text-[11px]">
                  Contact: {SYNERGY_COMPANY_INFO.phone} · {SYNERGY_COMPANY_INFO.email}
                </p>
              </div>

              {/* Billed Entity (Customer / Buyer) */}
              <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3.5 text-xs dark:bg-muted/20">
                <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                  Buyer / Customer (Billed To)
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-foreground">
                  {invoice.customerName}
                </p>
                <p className="text-slate-600 dark:text-muted-foreground">
                  GSTIN: <span className="font-mono font-semibold">{invoice.customerGstin || 'Unregistered'}</span>
                </p>
                {shippingAddress ? (
                  <p className="text-slate-600 dark:text-muted-foreground text-[11px] leading-relaxed">
                    {[shippingAddress.line1, shippingAddress.city, shippingAddress.state, shippingAddress.postalCode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="text-slate-600 dark:text-muted-foreground text-[11px]">
                    Place of Supply: Maharashtra (27)
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 dark:border-border/60">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Invoice Date</span>
                    <p className="font-semibold text-foreground">{formatDate(invoice.invoiceDate)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Due Date</span>
                    <p className="font-semibold text-foreground">{formatDate(invoice.dueDate)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Category</span>
                    <p className="font-semibold text-foreground">{invoice.type || 'B2B'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Terms</span>
                    <p className="font-semibold text-foreground">{salesOrder?.notes || 'Net 30 Days'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Document References Block: Sales Order, Origin, Mode */}
            <div className="border-b border-slate-200 py-3 px-3.5 bg-synergy-50/40 rounded-xl my-3.5 text-xs flex flex-wrap items-center justify-between gap-4 dark:bg-muted/10 dark:border-border">
              <div className="flex flex-wrap items-center gap-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Sales Order
                  </span>
                  <p className="font-mono font-bold text-foreground">
                    {invoice.salesOrderNumber || 'Direct Order Intake'}
                  </p>
                </div>
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Dispatch Origin
                  </span>
                  <p className="font-mono font-bold text-foreground">
                    {salesOrder?.warehouseLocationId || 'Finished Goods Bay 1-4'}
                  </p>
                </div>
                <div className="border-l border-slate-200 pl-4 dark:border-border">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
                    Transport &amp; Supply
                  </span>
                  <p className="font-medium text-foreground">
                    Road Transport / Maharashtra (27)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-muted-foreground">
                  Audit Version
                </span>
                <p className="font-mono font-semibold text-foreground">v{invoice.version || 1}</p>
              </div>
            </div>

            {/* Line Items Table with the exact signature navy header from Supplier Bill */}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-border print:overflow-visible">
              <table className="w-full min-w-[680px] text-left text-xs print:min-w-0 print:text-[9px]">
                <thead className="bg-synergy-800 text-white print:bg-slate-100 print:text-slate-900">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold w-7">#</th>
                    <th className="px-2.5 py-2 font-semibold">Item &amp; Description</th>
                    <th className="px-2.5 py-2 font-semibold font-mono">HSN/SAC</th>
                    <th className="px-2.5 py-2 font-semibold font-mono">Order No.</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Billed Qty</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Unit Rate (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-center">GST %</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Taxable (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Tax (₹)</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-border">
                  {(invoice.lines || []).map((line: any, idx: number) => {
                    const lineTax =
                      Number(line.taxAmount || 0) ||
                      (parseFloat(line.taxableAmount || '0') * (parseFloat(line.gstRate || '18') / 100));
                    const lineTotal =
                      Number(line.totalAmount || 0) ||
                      (parseFloat(line.taxableAmount || '0') + lineTax);

                    return (
                      <tr key={line.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-muted/10 transition">
                        <td className="px-2.5 py-2 font-mono text-slate-500">{line.lineNumber || idx + 1}</td>
                        <td className="px-2.5 py-2">
                          <p className="font-semibold text-foreground uppercase">{line.description}</p>
                          {line.itemId && (
                            <p className="font-mono text-[10px] text-slate-500 dark:text-muted-foreground">
                              ID: {line.itemId}
                            </p>
                          )}
                        </td>
                        <td className="px-2.5 py-2 font-mono">{line.hsnSacCode || '8483'}</td>
                        <td className="px-2.5 py-2 font-mono text-foreground">
                          {invoice.salesOrderNumber || '—'}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-right font-medium">
                          {line.quantity}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-right">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-2.5 py-2 text-center font-mono">{line.gstRate || 18}%</td>
                        <td className="px-2.5 py-2 font-mono text-right">{formatCurrency(line.taxableAmount)}</td>
                        <td className="px-2.5 py-2 font-mono text-right text-slate-600 dark:text-muted-foreground">
                          {formatCurrency(lineTax)}
                        </td>
                        <td className="px-2.5 py-2 font-mono font-bold text-right text-foreground">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 dark:border-border font-bold">
                  <tr>
                    <td colSpan={4} className="px-2.5 py-2 text-right uppercase text-slate-500 text-[10px]">
                      Total
                    </td>
                    <td className="px-2.5 py-2 font-mono text-right text-foreground">
                      {totalQuantity}
                    </td>
                    <td colSpan={2}></td>
                    <td className="px-2.5 py-2 font-mono text-right text-foreground">
                      {formatCurrency(totalTaxable)}
                    </td>
                    <td className="px-2.5 py-2 font-mono text-right text-slate-600 dark:text-muted-foreground">
                      {formatCurrency(totalTax)}
                    </td>
                    <td className="px-2.5 py-2 font-mono text-right text-foreground font-black">
                      {formatCurrency(grossTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Subtotal, Amount in Words & Signatory Summary (Exact Supplier Bill Design) */}
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_290px]">
              <div className="rounded-xl bg-slate-50 p-3.5 text-xs dark:bg-muted/20 space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-muted-foreground block">
                    Amount Chargeable (in words)
                  </span>
                  <p className="font-bold text-foreground text-xs sm:text-sm">
                    {numberToIndianWords(grossTotal)}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-border/60 text-[11px] text-slate-600 dark:text-muted-foreground space-y-1">
                  <p className="font-bold text-foreground">Company&apos;s Bank Details for RTGS / NEFT / IMPS:</p>
                  <p>• Bank Name: <strong className="text-foreground">HDFC Bank Ltd.</strong></p>
                  <p>• A/c No.: <strong className="text-foreground font-mono">50200062819401</strong></p>
                  <p>• Branch &amp; IFS Code: <strong className="text-foreground font-mono">Indore Main Branch · HDFC0000123</strong></p>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-border/60 text-[10px] text-slate-500 dark:text-muted-foreground space-y-0.5">
                  <p>• Declaration: We declare that this invoice shows the actual price of goods described and that all particulars are true and correct.</p>
                  <p>• Terms: Goods once sold will not be accepted back without authorized return authorization. Subject to Indore Jurisdiction.</p>
                </div>

                <div className="pt-4 flex items-end justify-between text-xs">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-400">Customer Acceptance</span>
                    <div className="mt-6 border-t border-slate-300 w-28 text-center text-[10px] text-slate-400">
                      Receiver&apos;s Sign
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-foreground dark:text-synergy-300 block">
                      for SYNERGY INTERNATIONAL
                    </span>
                    <div className="mt-6 border-t border-slate-300 w-36 text-center text-[10px] text-slate-500 font-medium">
                      Authorised Signatory
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculations Box */}
              <div className="space-y-1.5 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-border bg-slate-50/50 dark:bg-muted/10">
                <Amount label="Taxable Subtotal" value={formatCurrency(totalTaxable)} />
                <Amount label="CGST (9%)" value={formatCurrency(totalTax / 2)} />
                <Amount label="SGST (9%)" value={formatCurrency(totalTax / 2)} />
                <Amount label="Total Output GST (18%)" value={formatCurrency(totalTax)} />

                <div className="border-t border-slate-200 pt-1.5 dark:border-border font-bold">
                  <Amount label="Gross Invoiced Total" value={formatCurrency(grossTotal)} strong />
                </div>

                <div className="border-t border-slate-200 pt-1.5 dark:border-border text-emerald-600 dark:text-emerald-400">
                  <Amount label="Total Collected / Paid" value={formatCurrency(paid)} />
                </div>

                <div className="border-t border-slate-200 pt-1.5 dark:border-border font-bold text-sm">
                  <Amount label="Net Balance Due" value={formatCurrency(outstanding)} strong />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right / Secondary: Lineage & Connected Records Workspace (Matching Supplier Bill layout) */}
        <div className="lg:col-span-5 sticky top-6 min-w-0 space-y-4 print:hidden">
          {/* Tab Navigation Controls */}
          <div className="rounded-3xl border border-border bg-card p-3 shadow-sm space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-foreground" />
                <h3 className="text-sm font-bold text-foreground">Lineage &amp; Connected Records</h3>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">
                Connected Records
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('order')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeTab === 'order'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px]">Order</span>
                {invoice.lines?.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[9px] font-mono text-foreground dark:text-synergy-300">
                    {invoice.lines.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeTab === 'payments'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[11px]">Receipts</span>
                {uniquePayments.length > 0 && (
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-mono text-emerald-700 dark:text-emerald-300">
                    {uniquePayments.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeTab === 'ledger'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 text-foreground" />
                <span className="text-[11px]">Ledger</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-2 px-1 text-center font-semibold transition ${
                  activeTab === 'audit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-[11px]">Tax &amp; Audit</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Sales Order Contract & Billed Lines */}
          {activeTab === 'order' && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      <span className="font-mono font-bold text-base text-foreground">
                        {invoice.salesOrderNumber || 'Direct Order Intake'}
                      </span>
                      <span className="rounded-full bg-synergy-100 dark:bg-synergy-950/50 text-foreground dark:text-synergy-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        {salesOrder?.status || 'CONFIRMED'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sales Order contract for confirmed pricing, delivery, and billing
                    </p>
                  </div>
                  {invoice.salesOrderId && (
                    <Link
                      href={`/sales/orders/${invoice.salesOrderId}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                    >
                      View Full Order <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/20 p-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Client Name</span>
                    <p className="font-medium text-foreground">{invoice.customerName}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Payment Terms</span>
                    <p className="font-medium text-foreground">{salesOrder?.notes || 'Net 30 Days'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Channel</span>
                    <p className="font-medium text-foreground">{salesOrder?.channel || invoice.type || 'B2B'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Order Date</span>
                    <p className="font-medium text-foreground">
                      {salesOrder?.orderedAt ? formatDate(salesOrder.orderedAt) : formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                </div>

                {shippingAddress && (
                  <div className="p-3.5 rounded-2xl bg-muted/20 border border-border/70 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Delivery Destination
                    </span>
                    <p className="font-semibold text-foreground">{shippingAddress.name}</p>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {[shippingAddress.line1, shippingAddress.city, shippingAddress.state, shippingAddress.postalCode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                )}

                {/* Billed Lines Under this Order */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground">Billed Lines Under This Order</p>
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="p-2.5 font-semibold">Item</th>
                          <th className="p-2.5 font-semibold text-right">Qty</th>
                          <th className="p-2.5 font-semibold text-right">Rate</th>
                          <th className="p-2.5 font-semibold text-right">Taxable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(invoice.lines || []).map((line: any) => (
                          <tr key={line.id} className="hover:bg-muted/10 transition">
                            <td className="p-2.5 font-medium text-foreground max-w-[140px] truncate">
                              {line.description}
                            </td>
                            <td className="p-2.5 font-mono text-right">{line.quantity}</td>
                            <td className="p-2.5 font-mono text-right">{formatCurrency(line.unitPrice)}</td>
                            <td className="p-2.5 font-mono font-bold text-right text-foreground">
                              {formatCurrency(line.taxableAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Customer Receipts & Payments */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              {/* Financial Settlement Card */}
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Settlement Balance
                    </h4>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      isFullySettled
                        ? 'bg-muted text-foreground'
                        : paid > 0
                        ? 'bg-muted text-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isFullySettled ? 'FULLY PAID' : paid > 0 ? 'PARTIAL' : 'PENDING'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Invoiced Total</span>
                    <span className="font-mono font-medium">{formatCurrency(grossTotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Received to Date</span>
                    <span className="font-mono">{formatCurrency(paid)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
                    <span className={outstanding > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600'}>
                      Balance Outstanding
                    </span>
                    <span className={`font-mono ${outstanding > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600'}`}>
                      {formatCurrency(outstanding)}
                    </span>
                  </div>
                </div>

                {outstanding > 0 && can('create') && (
                  <Button
                    size="sm"
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
                    onClick={() => setIsPaymentModalOpen(true)}
                  >
                    <Wallet className="h-4 w-4" /> Record Customer Payment
                  </Button>
                )}
              </div>

              {/* Logged Payment Transactions */}
              {uniquePayments.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-foreground px-1">Recorded Receipts</p>
                  {uniquePayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-3xl border border-border bg-card p-4 text-xs shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(payment.amount)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground dark:text-synergy-300">
                          {payment.method.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border">
                        <div>
                          <span>Date:</span>{' '}
                          <span className="font-medium text-foreground">{formatDate(payment.date)}</span>
                        </div>
                        <div>
                          <span>Ref / UTR:</span>{' '}
                          <span className="font-mono font-medium text-foreground">{payment.reference}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-border bg-card p-8 text-center space-y-2">
                  <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">No Payments Recorded Yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Customer collections recorded via Accounts Receivable will appear in this settlement ledger.
                  </p>
                  {outstanding > 0 && can('create') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-xs gap-1.5"
                      onClick={() => setIsPaymentModalOpen(true)}
                    >
                      <Wallet className="h-3.5 w-3.5" /> Record First Payment
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Customer Credit & Dues */}
          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" /> Customer Credit &amp; Dues
                  </h3>
                  {invoice.customerId && (
                    <Link href={`/sales/customers/${invoice.customerId}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs rounded-xl gap-1 text-emerald-600"
                      >
                        Customer Ledger Profile <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-muted/20 border border-border/70 space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Approved Limit</span>
                      <span className="font-mono font-bold text-foreground block">
                        {formatCurrency(effectiveCredit.creditLimit)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-muted/20 border border-border/70 space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Dues</span>
                      <span className="font-mono font-bold text-amber-600 block">
                        {formatCurrency(effectiveCredit.outstandingBalance)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Credit Utilization:</span>
                      <span className="font-mono font-bold text-foreground">
                        {effectiveCredit.utilizationPercent}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          effectiveCredit.isCreditExceeded
                            ? 'bg-rose-500'
                            : effectiveCredit.utilizationPercent > 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, effectiveCredit.utilizationPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                      <span>Available Credit:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(effectiveCredit.availableCredit)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 p-3.5 space-y-1 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Risk Status</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          effectiveCredit.isCreditExceeded
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        {effectiveCredit.isCreditExceeded ? 'CREDIT EXCEEDED' : 'NORMAL RISK'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      Payment compliance is tracked automatically across all active orders and tax bills for {invoice.customerName}.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Tax & Audit Compliance */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground border-b border-border pb-3">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                  <span>GST Governance &amp; Tax Audit</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/70 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GSTIN Registered:</span>
                      <span className="font-mono font-bold text-foreground">
                        {invoice.customerGstin || 'Unregistered Consumer'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Place of Supply:</span>
                      <span className="font-medium text-foreground">Maharashtra (27)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax Type:</span>
                      <span className="font-medium text-foreground">Intra-State (CGST + SGST)</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/70 space-y-1.5">
                    <p className="font-bold text-foreground">Invoice Generation Audit</p>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>• Generated from Order: <span className="font-mono text-foreground">{invoice.salesOrderNumber || 'SO-Direct'}</span></p>
                      <p>• Creation Date: <span className="text-foreground">{formatDate(invoice.invoiceDate)}</span></p>
                      <p>• Current Status: <strong className="text-foreground dark:text-synergy-300">{invoice.status}</strong></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Recording Modal */}
      {isPaymentModalOpen && invoice && (
        <RecordCustomerPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          invoice={invoice}
          isSaving={isSavingPayment}
          onSubmit={async (input) => {
            setIsSavingPayment(true);
            try {
              await accountsApi.recordCustomerReceipt({
                entityId: invoice.entityId || 'synergy-international',
                customerName: invoice.customerName,
                customerId: invoice.customerId || undefined,
                invoiceId: invoice.id,
                salesOrderId: invoice.salesOrderId || undefined,
                receiptDate: input.paymentDate,
                amount: input.amount,
                method: input.paymentMode,
                reference: input.reference,
                notes: input.notes,
              });

              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] }),
                queryClient.invalidateQueries({ queryKey: ['accounts', 'ar', 'invoice', params.id] }),
              ]);

              showToast({
                kind: 'success',
                title: 'Customer Payment Recorded',
                message: `Customer receipt of ${formatCurrency(input.amount)} recorded against Tax Bill ${invoice.invoiceNumber}.`,
              });
              setIsPaymentModalOpen(false);
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
          }}
        />
      )}


      {/* Credit Note Issuance Modal */}
      {isCreditNoteModalOpen && invoice && (
        <DebitCreditNoteModal
          isOpen={isCreditNoteModalOpen}
          onClose={() => setIsCreditNoteModalOpen(false)}
          entityId={invoice.entityId || 'synergy-international'}
          defaultType="CREDIT"
          defaultPartyType="CUSTOMER"
          initialInvoice={invoice}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ar', 'invoice', params.id] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] });
          }}
        />
      )}

      {/* Admin Tax Invoice Modification Modal */}
      {isEditInvoiceModalOpen && invoice && (
        <EditTaxInvoiceModal
          isOpen={isEditInvoiceModalOpen}
          onClose={() => setIsEditInvoiceModalOpen(false)}
          invoice={invoice}
          onSuccess={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['accounts', 'ar', 'invoice', params.id] }),
              queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] }),
            ]);
          }}
        />
      )}
    </main>
  );
}
