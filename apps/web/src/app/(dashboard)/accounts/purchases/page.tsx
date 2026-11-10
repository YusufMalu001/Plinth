'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  Wallet,
  FileText,
  ChevronRight,
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
} from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { AcceptedGrn, GrnPaymentStatus, PurchaseBill, PaymentMode } from '@/features/accounts/types';
import { formatCurrency, formatDate } from '@/features/accounts/utils';
import { PaginationControls } from '@/components/PaginationControls';
import { RecordBillPaymentModal } from '@/features/accounts/components/RecordBillPaymentModal';
import { useCurrentUser } from '@/features/auth/hooks';
import { showToast } from '@/components/toast-store';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PurchasesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [activeTab, setActiveTab] = useState<'bills' | 'grns'>('bills');

  // GRN filters & pagination
  const [grnSearch, setGrnSearch] = useState('');
  const [grnPaymentStatus, setGrnPaymentStatus] = useState<string>('');
  const [grnPage, setGrnPage] = useState(1);
  const [grnPageSize, setGrnPageSize] = useState(10);

  // Bills filters & pagination
  const [billSearch, setBillSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billPaymentStatus, setBillPaymentStatus] = useState('');
  const [billPage, setBillPage] = useState(1);
  const [billPageSize, setBillPageSize] = useState(10);

  const [payingBill, setPayingBill] = useState<PurchaseBill | null>(null);
  const [isSavingBillPayment, setIsSavingBillPayment] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = selectedEntityId || entities.data?.[0]?.id || '';

  const bills = useQuery({
    queryKey: ['accounts', 'ap', 'bills', entityId, billPage],
    queryFn: () => accountsApi.apBills(entityId, billPage),
    enabled: Boolean(entityId),
  });

  const acceptedGrns = useQuery({
    queryKey: ['accounts', 'ap', 'accepted-grns', entityId],
    queryFn: () => accountsApi.acceptedGrns(entityId),
    enabled: Boolean(entityId),
  });

  const openPeriods = useQuery({
    queryKey: ['accounts', 'periods', entityId],
    queryFn: () => accountsApi.periods(entityId),
    enabled: Boolean(entityId),
  });

  // Calculate bill metrics
  const allBills = bills.data?.items || [];
  const filteredBills = allBills.filter((item) => {
    const matchesSearch =
      !billSearch ||
      item.supplierInvoiceNumber.toLowerCase().includes(billSearch.toLowerCase()) ||
      item.vendorNameSnapshot.toLowerCase().includes(billSearch.toLowerCase());
    const matchesStatus = !statusFilter || item.status === statusFilter;
    const matchesPayment = !billPaymentStatus || item.paymentStatus === billPaymentStatus;
    const matchesDate = !selectedDate || (item.invoiceDate && item.invoiceDate.startsWith(selectedDate));
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });

  const totalBillsCount = bills.data?.total ?? 0;
  const totalBillsAmount = allBills.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
  const totalBillsPaid = allBills.reduce((sum, b) => sum + Number(b.paidAmount || 0), 0);
  const totalBillsOutstanding = allBills.reduce(
    (sum, b) => sum + Number(b.balanceAmount ?? (Number(b.totalAmount || 0) - Number(b.paidAmount || 0))),
    0
  );
  const pendingPaymentBillsCount = allBills.filter((b) => b.paymentStatus === 'PENDING' || !b.paymentStatus).length;
  const partialPaymentBillsCount = allBills.filter((b) => b.paymentStatus === 'PARTIALLY_PAID').length;
  const paidBillsCount = allBills.filter((b) => b.paymentStatus === 'PAID').length;

  const submittedBillsCount = allBills.filter((b) => b.status === 'SUBMITTED').length;
  const approvedBillsCount = allBills.filter((b) => b.status === 'APPROVED' || b.status === 'POSTED').length;

  const paginatedBills = filteredBills.slice((billPage - 1) * billPageSize, billPage * billPageSize);

  // Calculate GRN metrics
  const allGrns = acceptedGrns.data || [];
  const filteredGrns = allGrns.filter((grn: AcceptedGrn) => {
    const matchesSearch =
      !grnSearch ||
      `${grn.grnNumber} ${grn.poNumber} ${grn.vendorName}`.toLowerCase().includes(grnSearch.toLowerCase());
    const matchesStatus = !grnPaymentStatus || grn.paymentStatus === grnPaymentStatus;
    const matchesDate = !selectedDate || (grn.receivedAt && grn.receivedAt.startsWith(selectedDate));
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalGrnCount = allGrns.length;
  const pendingGrnCount = allGrns.filter((g) => g.paymentStatus === 'PENDING').length;
  const partialGrnCount = allGrns.filter((g) => g.paymentStatus === 'PARTIALLY_PAID').length;
  const paidGrnCount = allGrns.filter((g) => g.paymentStatus === 'PAID').length;

  const paginatedGrns = filteredGrns.slice((grnPage - 1) * grnPageSize, grnPage * grnPageSize);

  const permissions = new Set((user.data?.permissions || []).map((v) => v.toLowerCase()));
  const isAdmin = user.data?.role === 'admin';
  const can = (action: string) => isAdmin || permissions.has(`${action}:purchasebill`);

  const handleRecordBillPayment = async (input: {
    paymentDate: string;
    amount: string;
    paymentMode: PaymentMode;
    reference: string;
    notes?: string;
  }) => {
    if (!payingBill) return;
    setIsSavingBillPayment(true);
    try {
      await accountsApi.recordBillPayment(payingBill.id, input);
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
      showToast({
        kind: 'success',
        title: 'Payment Recorded',
        message: `Disbursement of ${formatCurrency(input.amount)} recorded against Supplier Bill ${payingBill.supplierInvoiceNumber}.`,
      });
      setPayingBill(null);
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Payment Failed',
        message: err?.message || 'Payment recording failed.',
      });
      throw err;
    } finally {
      setIsSavingBillPayment(false);
    }
  };

  return (
    <main className="flex-1 space-y-4 p-5 md:p-8">
      {/* Header without company card */}
      <AccountsHeader
        title="Purchases & Payables (AP)"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={openPeriods.data?.find((p) => p.status === 'OPEN')?.code}
        dateFilter={selectedDate}
        onDateChange={setSelectedDate}
        hideCompany={false}
        actionButton={
          can('create') && Boolean(entityId) && (
            <Link href="/accounts/purchases/bills/new">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs">
                <Plus className="h-4 w-4" />
                Capture Supplier Bill
              </Button>
            </Link>
          )
        }
      />

      {entities.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          <p className="font-semibold">Accounts setup could not be loaded.</p>
          <p className="mt-1">The GRN list is unavailable because the Accounts book request failed: {entities.error instanceof Error ? entities.error.message : 'Unknown error'}.</p>
        </div>
      )}
      {!entities.isLoading && !entities.isError && (entities.data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
          <p className="font-semibold">Synergy Accounts setup is not initialized.</p>
          <p className="mt-1">This installation uses one company: Synergy International. Complete its one-time accounting setup to load accepted GRNs.</p>
          <Link href="/accounts/setup" className="mt-2 inline-flex font-semibold text-primary underline">Open Synergy Setup</Link>
        </div>
      )}

      {/* Compact 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Invoiced Payables
            </span>
            <span className="rounded-lg p-1.5 border bg-synergy-500/10 text-synergy-700 dark:text-synergy-400 border-synergy-500/20">
              <Receipt className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {bills.isLoading ? '—' : formatCurrency(totalBillsAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {totalBillsCount} supplier bill{totalBillsCount === 1 ? '' : 's'} registered
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Settled Disbursements
            </span>
            <span className="rounded-lg p-1.5 border bg-muted text-foreground border border-border">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {bills.isLoading ? '—' : formatCurrency(totalBillsPaid)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {paidBillsCount} settled in full
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Outstanding AP Balance
            </span>
            <span
              className={`rounded-lg p-1.5 border ${
                totalBillsOutstanding > 0
                  ? 'bg-muted text-muted-foreground border-border'
                  : 'bg-muted text-foreground border-border'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
            </span>
          </div>
          <div
            className={`mt-1 text-xl font-bold font-mono tracking-tight ${
              totalBillsOutstanding > 0 ? 'text-foreground' : 'text-foreground'
            }`}
          >
            {bills.isLoading ? '—' : formatCurrency(totalBillsOutstanding)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {pendingPaymentBillsCount} pending · {partialPaymentBillsCount} partial
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Approved & Ready to Pay
            </span>
            <span
              className={`rounded-lg p-1.5 border ${
                submittedBillsCount > 0
                  ? 'bg-muted text-muted-foreground border border-border'
                  : 'bg-muted text-foreground border border-border'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {bills.isLoading ? '—' : approvedBillsCount}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {submittedBillsCount} invoice{submittedBillsCount === 1 ? '' : 's'} awaiting admin approval
          </p>
        </div>
      </div>

      {/* Tabs and Toolbar Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        {/* View Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setActiveTab('bills');
              setBillPage(1);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'bills'
                ? 'bg-synergy-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Supplier Bills Register
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === 'bills' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {totalBillsCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('grns');
              setGrnPage(1);
            }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'grns'
                ? 'bg-synergy-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Accepted Goods Receipts (PO Inbound)
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === 'grns' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {totalGrnCount}
            </span>
          </button>
        </div>

        {/* Filters Toolbar */}
        {activeTab === 'bills' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search invoice or vendor..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none w-48 sm:w-60 transition"
                value={billSearch}
                onChange={(e) => {
                  setBillSearch(e.target.value);
                  setBillPage(1);
                }}
              />
            </div>

            <select
              aria-label="Filter by Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none transition"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setBillPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved ({approvedBillsCount})</option>
              <option value="POSTED">Posted</option>
              <option value="SUBMITTED">Awaiting Review</option>
              <option value="DRAFT">Draft</option>
            </select>

            <select
              aria-label="Filter by Payment Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none transition"
              value={billPaymentStatus}
              onChange={(e) => {
                setBillPaymentStatus(e.target.value);
                setBillPage(1);
              }}
            >
              <option value="">All Payment Statuses</option>
              <option value="PENDING">Pending Payment ({pendingPaymentBillsCount})</option>
              <option value="PARTIALLY_PAID">Partially Paid ({partialPaymentBillsCount})</option>
              <option value="PAID">Fully Paid ({paidBillsCount})</option>
            </select>

            <select
              aria-label="Filter by Approval Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none transition"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setBillPage(1);
              }}
            >
              <option value="">All Approval Statuses</option>
              <option value="APPROVED">Approved &amp; Ready ({approvedBillsCount})</option>
              <option value="SUBMITTED">Awaiting Admin Approval ({submittedBillsCount})</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted to GL</option>
            </select>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search GRN, PO, supplier..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none w-48 sm:w-60 transition"
                value={grnSearch}
                onChange={(e) => {
                  setGrnSearch(e.target.value);
                  setGrnPage(1);
                }}
              />
            </div>

            <select
              aria-label="Filter by Payment Status"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-synergy-600 focus:outline-none transition"
              value={grnPaymentStatus}
              onChange={(e) => {
                setGrnPaymentStatus(e.target.value);
                setGrnPage(1);
              }}
            >
              <option value="">All Payment Statuses</option>
              <option value="PENDING">Pending Payment ({pendingGrnCount})</option>
              <option value="PARTIALLY_PAID">Partially Paid ({partialGrnCount})</option>
              <option value="PAID">Fully Paid ({paidGrnCount})</option>
              <option value="NO_VALUE">No Value</option>
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: Supplier Bills Register Table (Default) */}
      {activeTab === 'bills' && (
        <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Supplier Invoice No.</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead>Linked Order / GRN</TableHead>
                  <TableHead>Bill Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Invoiced Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead className="text-center">Payment Status</TableHead>
                  <TableHead className="text-center">Approval</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-synergy-600" />
                      Loading supplier invoices…
                    </TableCell>
                  </TableRow>
                ) : paginatedBills.length ? (
                  paginatedBills.map((bill) => {
                    const balanceNum = Number(bill.balanceAmount ?? (Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0)));
                    const isFullySettled = bill.paymentStatus === 'PAID' || balanceNum <= 0;

                    // Extract linked GRN and PO references from lines if present
                    const linkedGrn = bill.lines?.find((l) => l.grnLine?.grn)?.grnLine?.grn;
                    const linkedPo = bill.lines?.find((l) => l.poLine?.purchaseOrder)?.poLine?.purchaseOrder;

                    return (
                      <TableRow
                        key={bill.id}
                        onClick={() => router.push(`/accounts/purchases/bills/${bill.id}`)}
                        className="hover:bg-muted/50 transition-colors cursor-pointer group"
                      >
                        <TableCell className="p-4 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5 group-hover:text-synergy-600 dark:group-hover:text-synergy-400 transition-colors">
                            <FileText className="h-3.5 w-3.5 text-synergy-600 shrink-0" />
                            <span>{bill.supplierInvoiceNumber}</span>
                            <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-synergy-600 dark:text-synergy-400" />
                          </div>
                        </TableCell>
                        <TableCell className="p-4 font-medium text-foreground">
                          {bill.vendorNameSnapshot}
                        </TableCell>
                        <TableCell className="p-4 text-xs font-mono">
                          <div className="flex flex-col gap-0.5">
                            {linkedGrn ? (
                              <Link
                                href={`/accounts/purchases/grns/${linkedGrn.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-synergy-700 hover:underline inline-flex items-center gap-1 font-semibold"
                              >
                                <PackageCheck className="h-3 w-3" />
                                {linkedGrn.grnNumber}
                              </Link>
                            ) : null}
                            {linkedPo ? (
                              <span className="text-[11px] text-muted-foreground">
                                PO: {linkedPo.poNumber}
                              </span>
                            ) : null}
                            {!linkedGrn && !linkedPo && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-4 font-mono text-muted-foreground text-xs">
                          {formatDate(bill.invoiceDate)}
                        </TableCell>
                        <TableCell className="p-4 font-mono text-muted-foreground text-xs">
                          {formatDate(bill.dueDate)}
                        </TableCell>
                        <TableCell className="p-4 text-right font-mono font-semibold text-foreground">
                          {formatCurrency(bill.totalAmount)}
                        </TableCell>
                        <TableCell className="p-4 text-right font-mono font-semibold text-foreground">
                          {formatCurrency(bill.paidAmount || '0')}
                        </TableCell>
                        <TableCell
                          className={`p-4 text-right font-mono font-bold ${
                            isFullySettled
                              ? 'text-muted-foreground'
                              : 'text-foreground'
                          }`}
                        >
                          {formatCurrency(bill.balanceAmount ?? (Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0)))}
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <BillPaymentStatusBadge status={bill.paymentStatus} />
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              bill.status === 'APPROVED' || bill.status === 'POSTED'
                                ? 'bg-muted text-foreground border border-border'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            {billStatusLabel(bill.status)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="p-8 text-center text-muted-foreground">
                      No supplier invoices matching current criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination Controls */}
          <PaginationControls
            page={billPage}
            pageSize={billPageSize}
            total={filteredBills.length}
            onPageChange={setBillPage}
            onPageSizeChange={(nextSize) => {
              setBillPageSize(nextSize);
              setBillPage(1);
            }}
          />
        </Card>
      )}

      {/* Tab 2: Accepted Goods Receipts Table */}
      {activeTab === 'grns' && (
        <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>GRN Number</TableHead>
                  <TableHead>Purchase Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead className="text-right">Expected Value</TableHead>
                  <TableHead>Linked Supplier Bill</TableHead>
                  <TableHead>Debit Note Claim</TableHead>
                  <TableHead className="text-center">GRN Stage</TableHead>
                  <TableHead className="text-center">Settlement Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptedGrns.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-synergy-600" />
                      Loading accepted receipts…
                    </TableCell>
                  </TableRow>
                ) : acceptedGrns.isError ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                      Could not load accepted Goods Receipts: {acceptedGrns.error instanceof Error ? acceptedGrns.error.message : 'unknown API error'}
                    </TableCell>
                  </TableRow>
                ) : paginatedGrns.length ? (
                  paginatedGrns.map((grn: AcceptedGrn) => {
                    const linkedBill = grn.supplierBills?.[0];

                    return (
                      <TableRow
                        key={grn.id}
                        onClick={() => router.push(`/accounts/purchases/grns/${grn.id}`)}
                        className="hover:bg-muted/50 transition-colors cursor-pointer group"
                      >
                        <TableCell className="p-4">
                          <div className="font-mono font-bold text-foreground flex items-center gap-1.5 group-hover:text-synergy-600 dark:group-hover:text-synergy-400 transition-colors">
                            <PackageCheck className="h-3.5 w-3.5 text-synergy-600 shrink-0" />
                            <span>{grn.grnNumber}</span>
                            <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-synergy-600 dark:text-synergy-400" />
                          </div>
                        </TableCell>
                        <TableCell className="p-4 font-mono text-muted-foreground">
                          {grn.poNumber}
                        </TableCell>
                        <TableCell className="p-4 font-medium text-foreground">
                          {grn.vendorName}
                        </TableCell>
                        <TableCell className="p-4 font-mono text-muted-foreground">
                          {formatDate(grn.receivedAt)}
                        </TableCell>
                        <TableCell className="p-4 text-right font-mono font-semibold text-foreground">
                          {formatCurrency(grn.expectedAmount)}
                        </TableCell>
                        <TableCell className="p-4">
                          {linkedBill ? (
                            <Link
                              href={`/accounts/purchases/bills/${linkedBill.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-xs font-semibold text-synergy-700 dark:text-synergy-400 hover:underline inline-flex items-center gap-1"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {linkedBill.supplierInvoiceNumber}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">No Bill Linked</span>
                          )}
                        </TableCell>
                        <TableCell className="p-4">
                          {grn.debitNotes?.length ? grn.debitNotes.map(note => (
                            <Link
                              key={note.id}
                              href={`/debit-notes/${note.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="mb-1 block text-xs font-semibold text-synergy-700 hover:underline"
                            >
                              {note.debitNoteNumber} · {note.status.replaceAll('_', ' ')}
                            </Link>
                          )) : <span className="text-muted-foreground">No claim</span>}
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${'border-border bg-muted text-foreground'}`}>
                            {grn.status.replaceAll('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <GrnStatusBadge status={grn.paymentStatus} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                      No goods receipts matching current criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination Controls */}
          <PaginationControls
            page={grnPage}
            pageSize={grnPageSize}
            total={filteredGrns.length}
            onPageChange={setGrnPage}
            onPageSizeChange={(nextSize) => {
              setGrnPageSize(nextSize);
              setGrnPage(1);
            }}
          />
        </Card>
      )}

      {/* Record Bill Payment Modal */}
      {payingBill && (
        <RecordBillPaymentModal
          isOpen={Boolean(payingBill)}
          onClose={() => setPayingBill(null)}
          bill={payingBill}
          onSubmit={handleRecordBillPayment}
          isSaving={isSavingBillPayment}
        />
      )}
    </main>
  );
}

function billStatusLabel(status: string) {
  if (status === 'DRAFT') return 'Draft';
  if (status === 'SUBMITTED') return 'Awaiting approval';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'POSTED') return 'Posted';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

function BillPaymentStatusBadge({ status }: { status?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
      <CheckCircle2 className="h-3 w-3 text-primary" />
      {status === 'PAID' ? 'PAID' : status === 'PARTIALLY_PAID' ? 'PARTIAL' : 'PENDING'}
    </span>
  );
}

function GrnStatusBadge({ status }: { status: GrnPaymentStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
      <CheckCircle2 className="h-3 w-3 text-primary" />
      {status === 'PAID' ? 'PAID' : status === 'PARTIALLY_PAID' ? 'PARTIAL' : status === 'NO_VALUE' ? 'NO VALUE' : 'PENDING'}
    </span>
  );
}
