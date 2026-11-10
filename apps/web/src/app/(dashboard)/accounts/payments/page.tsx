'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Search,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { PaymentReceiptModal } from '@/features/accounts/components/PaymentReceiptModal';
import { PaymentRecord, PaymentType, SalesInvoice } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<PaymentType>('VENDOR_PAYMENT');
  const [viewPayment, setViewPayment] = useState<PaymentRecord | null>(null);

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

  const bankAccounts = useQuery({
    queryKey: ['accounts', 'banks', entityId],
    queryFn: () => accountsApi.bankAccounts(entityId),
    enabled: Boolean(entityId),
  });

  const payments = useQuery({
    queryKey: ['accounts', 'payments', entityId],
    queryFn: () => accountsApi.payments(entityId),
    enabled: Boolean(entityId),
  });

  const invoices = useQuery({
    queryKey: ['accounts', 'ar', 'invoices', entityId],
    queryFn: () => accountsApi.arInvoices(entityId),
    enabled: Boolean(entityId),
  });
  const openInvoices: SalesInvoice[] = invoices.data?.items || [];

  const allPayments = payments.data || [];
  const filtered = allPayments.filter((p) => {
    const matchesSearch =
      !search ||
      p.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.partyName.toLowerCase().includes(search.toLowerCase()) ||
      p.referenceNumber.toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || p.paymentType === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalDisbursed = allPayments
    .filter((p) => p.paymentType === 'VENDOR_PAYMENT' || p.paymentType === 'DIRECT_EXPENSE')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const totalCollected = allPayments
    .filter((p) => p.paymentType === 'CUSTOMER_RECEIPT' || p.paymentType === 'ADVANCE')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  const handleCreatePayment = async (paymentData: any) => {
    if (paymentData.paymentType !== 'CUSTOMER_RECEIPT') throw new Error('Only customer receipts are connected to the AR ledger in this rollout.');
    const method = paymentData.paymentMode === 'UPI' ? 'UPI' : paymentData.paymentMode === 'CHEQUE' ? 'CHEQUE' : paymentData.paymentMode === 'CASH' ? 'CASH' : 'BANK_TRANSFER';
    await accountsApi.createArReceipt({
      entityId: paymentData.entityId,
      customerName: paymentData.partyName,
      customerId: paymentData.customerId,
      invoiceId: paymentData.invoiceId,
      receiptDate: paymentData.paymentDate,
      amount: paymentData.amount,
      method,
      reference: paymentData.referenceNumber,
    });
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'payments'] });
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Payments, Receipts & Allocations"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setModalType('VENDOR_PAYMENT');
                setIsModalOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <ArrowUpRight className="h-4 w-4" />
              Vendor Payout
            </Button>
            <Button
              onClick={() => {
                setModalType('CUSTOMER_RECEIPT');
                setIsModalOpen(true);
              }}
              variant="outline"
              className="font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <ArrowDownLeft className="h-4 w-4" />
              Customer Receipt
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Vendor Disbursements"
          value={formatCurrency(totalDisbursed)}
          subtitle="Cleared AP supplier payments"
          icon={ArrowUpRight}
          variant="primary"
        />
        <MetricCard
          title="Customer Collections"
          value={formatCurrency(totalCollected)}
          subtitle="Realized bank collections"
          icon={ArrowDownLeft}
          variant="success"
        />
        <MetricCard
          title="Active Bank Accounts"
          value={bankAccounts.data?.length ?? 0}
          subtitle="Connected liquidity accounts"
          icon={Building2}
          variant="default"
        />
        <MetricCard
          title="Payment Vouchers"
          value={allPayments.length}
          subtitle="Audited financial settlements"
          icon={CreditCard}
          variant="default"
        />
      </div>

      {/* Register Table */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-b border-border/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">Payments & Receipts Register</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vouchers with UTR bank references, payment modes, and document allocations
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  placeholder="Search voucher, party, or UTR..."
                  className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                aria-label="Filter by Type"
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="VENDOR_PAYMENT">Vendor Payment</option>
                <option value="CUSTOMER_RECEIPT">Customer Receipt</option>
                <option value="DIRECT_EXPENSE">Direct Expense</option>
                <option value="ADVANCE">Advance</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="p-3 text-left font-semibold">Voucher No.</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Party Name</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Bank Account</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Mode & Ref</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Amount (₹)</TableHead>
                  <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60 font-mono">
                {payments.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading payment vouchers…
                    </TableCell>
                  </TableRow>
                ) : filtered.length ? (
                  filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      onClick={() => setViewPayment(p)}
                      className="hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <TableCell className="p-3 font-bold text-foreground">
                        <div className="flex items-center gap-1.5 font-mono group-hover:text-primary dark:group-hover:text-primary transition-colors">
                          <span>{p.paymentNumber}</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                        </div>
                      </TableCell>
                      <TableCell className="p-3 font-sans font-medium text-foreground">{p.partyName}</TableCell>
                      <TableCell className="p-3 font-sans">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                            p.paymentType === 'CUSTOMER_RECEIPT'
                              ? 'bg-muted text-foreground border-border'
                              : 'bg-muted text-foreground border-border'
                          }`}
                        >
                          {p.paymentType === 'CUSTOMER_RECEIPT' ? 'Receipt' : 'Payment'}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">{p.paymentDate.slice(0, 10)}</TableCell>
                      <TableCell className="p-3 font-sans text-muted-foreground truncate max-w-[140px]">
                        {p.bankAccountName}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">
                        {p.paymentMode} · {p.referenceNumber}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">{formatCurrency(p.amount)}</TableCell>
                      <TableCell className="p-3 text-center font-sans">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          {p.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                      No payment or receipt vouchers recorded.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Creation Modal */}
      <PaymentReceiptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entityId={entityId}
        bankAccounts={bankAccounts.data || []}
        invoices={openInvoices}
        defaultType={modalType}
        onSubmit={handleCreatePayment}
      />

      {/* View Modal */}
      {viewPayment && (
        <PaymentReceiptModal
          isOpen={Boolean(viewPayment)}
          onClose={() => setViewPayment(null)}
          entityId={entityId}
          bankAccounts={bankAccounts.data || []}
          invoices={openInvoices}
          onSubmit={async () => {}}
          viewPayment={viewPayment}
        />
      )}
    </main>
  );
}
