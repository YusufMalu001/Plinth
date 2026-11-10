'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  ArrowLeft,
  RefreshCw,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt,
  Building2,
  Calendar,
  FileText,
  PackageCheck,
  ShieldCheck,
  Tag,
  Hash,
  Wallet,
  Coins,
  Plus,
  Info,
  ReceiptText,
  Printer,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AcceptedGrnDetail, GrnPaymentStatus } from '@/features/accounts/types';
import { formatCurrency, formatDate } from '@/features/accounts/utils';
import { CreateGrnDebitNoteModal } from '@/features/accounts/components/CreateGrnDebitNoteModal';
import { useCurrentUser } from '@/features/auth/hooks';
import { showToast } from '@/components/toast-store';
import { GoodsReceiptPDF } from '@/components/GoodsReceiptPDF';
import type { Grn } from '@/features/goods-receipt/api';

export default function AcceptedGrnAccountsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const [isCreatingDebitNote, setIsCreatingDebitNote] = useState(false);

  const grn = useQuery({
    queryKey: ['accounts', 'ap', 'accepted-grn', id],
    queryFn: () => accountsApi.acceptedGrn(id),
    enabled: Boolean(id),
  });

  const permissions = new Set((user.data?.permissions || []).map((v) => v.toLowerCase()));
  const canCreateDebitNote = user.data?.role === 'admin' || permissions.has('create:debitnote');
  const canSubmitDebitNote = user.data?.role === 'admin' || permissions.has('submit:debitnote');
  const canApproveDebitNote = user.data?.role === 'admin' || permissions.has('approve:debitnote');

  const handleCreateDebitNote = async (reason: string) => {
    setIsCreatingDebitNote(true);
    try {
      await accountsApi.createGrnDebitNote(id, reason, 'GRN_DISCREPANCY');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'accepted-grn', id] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'accepted-grns'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['purchases', 'vendor-history'] }),
        queryClient.invalidateQueries({ queryKey: ['vendors'] }),
      ]);
      showToast({
        kind: 'success',
        title: 'Debit Note Created',
        message: 'Debit note claim created and linked to this GRN. Review and submit it from the claim record.',
      });
    } catch (e: any) {
      showToast({
        kind: 'error',
        title: 'Claim Failed',
        message: e?.message || 'Could not create the debit note claim.',
      });
      throw e;
    } finally {
      setIsCreatingDebitNote(false);
    }
  };

  const handleDebitNoteAction = async (noteId: string, action: 'submit' | 'approve') => {
    try {
      if (action === 'submit') await accountsApi.submitGrnDebitNote(noteId);
      else await accountsApi.approveGrnDebitNote(noteId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'accepted-grn', id] }),
        queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'accepted-grns'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-scoring'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['purchases', 'vendor-history'] }),
        queryClient.invalidateQueries({ queryKey: ['vendors'] }),
      ]);
      showToast({
        kind: 'success',
        title: action === 'submit' ? 'Debit Note Submitted' : 'Debit Note Approved',
        message: action === 'submit' ? 'Debit note submitted for approval.' : 'Debit note approved for supplier follow-up.',
      });
    } catch (e: any) {
      showToast({
        kind: 'error',
        title: 'Action Failed',
        message: e?.message || `Could not ${action} this debit note.`,
      });
    }
  };

  if (grn.isLoading) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">Loading Goods Receipt details…</p>
      </main>
    );
  }

  if (grn.isError || !grn.data) {
    return (
      <main className="space-y-4 p-8 max-w-2xl mx-auto mt-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Could not load this accepted GRN</h2>
        <p className="text-xs text-muted-foreground">
          {grn.error instanceof Error ? grn.error.message : 'The receipt may have been removed or is not in a signed-off state.'}
        </p>
        <Link
          href="/accounts/purchases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Purchases & Payables
        </Link>
      </main>
    );
  }

  return (
    <AcceptedGrnDetailView
      grn={grn.data}
      canCreateDebitNote={canCreateDebitNote}
      canSubmitDebitNote={canSubmitDebitNote}
      canApproveDebitNote={canApproveDebitNote}
      onDebitNoteAction={handleDebitNoteAction}
      isCreatingDebitNote={isCreatingDebitNote}
      onCreateDebitNote={handleCreateDebitNote}
    />
  );
}

interface AcceptedGrnDetailViewProps {
  grn: AcceptedGrnDetail;
  canCreateDebitNote: boolean;
  canSubmitDebitNote: boolean;
  canApproveDebitNote: boolean;
  onDebitNoteAction: (noteId: string, action: 'submit' | 'approve') => Promise<void>;
  isCreatingDebitNote: boolean;
  onCreateDebitNote: (reason: string) => Promise<void>;
}

function AcceptedGrnDetailView({
  grn,
  canCreateDebitNote,
  canSubmitDebitNote,
  canApproveDebitNote,
  onDebitNoteAction,
  isCreatingDebitNote,
  onCreateDebitNote,
}: AcceptedGrnDetailViewProps) {
  const [isDebitNoteModalOpen, setIsDebitNoteModalOpen] = useState(false);
  const grnDocumentRef = useRef<HTMLDivElement>(null);
  const printGrn = useReactToPrint({
    contentRef: grnDocumentRef,
    documentTitle: `${grn.grnNumber}-receipt`,
  });
  const hasClaimableDiscrepancy = grn.lines.some(line => Number(line.shortQuantity || 0) > 0 || line.rejectedQuantity > 0 || line.damagedQuantity > 0);
  const expectedTotal = Number(grn.expectedAmount || 0);
  const paidTotal = Number(grn.paidAmount || 0);
  const balanceTotal = Number(grn.balanceAmount || 0);
  const percentPaid = expectedTotal > 0 ? Math.min(100, Math.round((paidTotal / expectedTotal) * 100)) : 100;
  const isFullyPaid = grn.paymentStatus === 'PAID' || balanceTotal <= 0;

  const totalAcceptedUnits = grn.lines.reduce((sum, line) => sum + Number(line.acceptedQuantity || 0), 0);
  const primaryBill = grn.supplierInvoices?.[0];
  const billCaptureReady = grn.status === 'FINALIZED';
  const documentGrn = {
    ...grn,
    vendor: {
      ...grn.vendor,
      name: grn.vendor.legalName || grn.vendor.name,
      gstin: grn.vendor.gstin || grn.vendor.taxNumber,
    },
    po: {
      ...grn.po,
      createdAt: (grn.po as typeof grn.po & { createdAt?: string }).createdAt,
    },
    location: grn.location,
    documents: grn.documents || [],
    lines: grn.lines.map((line) => ({
      ...line,
      grnId: grn.id,
      expectedQuantity: line.expectedQuantity,
      product: { id: line.id, sku: line.sku || '', name: line.description },
      material: null,
      uom: { id: line.id, code: line.uom, symbol: line.uom },
      poLine: {
        id: line.poLineId || line.id,
        quantity: Number(line.expectedQuantity || 0),
        needDate: grn.receivedAt,
        unitPrice: line.unitPrice,
      },
      status: 'VERIFIED',
      measurements: [],
      discrepancies: line.discrepancies || [],
    })),
  } as unknown as Grn;

  return (
    <>
      <main className="flex-1 space-y-6 p-5 md:p-8">
        {/* Breadcrumb & Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/accounts/purchases"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground  hover:underline transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Purchases & Payables
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {grn.grnNumber}
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary dark:text-primary border border-primary/20">
                <ShieldCheck className="h-3.5 w-3.5" />
                {grn.status.replaceAll('_', ' ')}
              </span>
              <PaymentStatusBadge status={grn.paymentStatus} />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Inbound Receipt for{' '}
            <strong className="text-foreground">{grn.po?.poNumber || 'Job Work Order'}</strong> · Supplier:{' '}
            <strong className="text-foreground">{grn.vendor?.legalName || grn.vendor?.name || 'Vendor'}</strong>
            {grn.vendor.code && (
              <span className="ml-1.5 font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {grn.vendor.code}
              </span>
            )}
          </p>
        </div>

        {/* Top Action Bar */}
        <div className="flex items-center gap-2.5">
          {canCreateDebitNote && hasClaimableDiscrepancy && (
            <Button
              variant="outline"
              onClick={() => setIsDebitNoteModalOpen(true)}
              disabled={grn.operationalDebitNotes.length > 0}
              className="font-semibold gap-1.5 rounded-xl text-xs px-4 py-2"
            >
              <ReceiptText className="h-4 w-4" />
              {grn.operationalDebitNotes.length > 0 ? 'Claim Already Created' : 'Create Debit Note Claim'}
            </Button>
          )}

          {primaryBill ? (
            <div className="flex items-center gap-2">
              <Link href={`/accounts/purchases/bills/${primaryBill.id}`}>
                <Button
                  className="font-semibold gap-1.5 rounded-xl text-xs px-4 py-2 bg-primary hover:bg-primary/90 text-white shadow-sm"
                >
                  <FileText className="h-4 w-4" />
                  Open Supplier Bill ({primaryBill.supplierInvoiceNumber})
                </Button>
              </Link>
            </div>
          ) : billCaptureReady ? (
            <Link href={`/accounts/purchases/bills/new?grnId=${grn.id}`}>
              <Button className="font-semibold gap-1.5 shadow-sm rounded-xl text-xs px-4 py-2 bg-primary hover:bg-primary/90 text-white">
                <Plus className="h-4 w-4" /> Record Supplier Invoice
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {!primaryBill && grn.billCreationIssue && (
        <Card className="rounded-2xl border-rose-200 bg-rose-50/70 shadow-none dark:border-rose-900/50 dark:bg-rose-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-300" />
            <div>
              <p className="text-sm font-semibold text-foreground">Supplier bill draft could not be created automatically</p>
              <p className="mt-1 text-xs text-muted-foreground">{grn.billCreationIssue}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!primaryBill && grn.status !== 'FINALIZED' && (
        <Card className="rounded-2xl border-synergy-200 bg-synergy-50/60 shadow-none dark:border-synergy-900/50 dark:bg-synergy-950/20">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground dark:text-synergy-300" />
              <div>
                <p className="text-sm font-semibold text-foreground">Supplier bill draft is waiting for GRN finalization</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This receipt is currently {grn.status.replaceAll('_', ' ').toLowerCase()}. Complete receiving sign-off and inventory posting; Accounts will then receive the supplier bill draft automatically.
                </p>
              </div>
            </div>
            <Link href={`/receiving/goods-receipts/${grn.id}`} className="shrink-0">
              <Button className="gap-1.5 rounded-xl text-xs font-semibold">
                <PackageCheck className="h-4 w-4" /> Continue GRN approval
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}



      {/* KPI Financial Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Expected Amount */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Expected Payable</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted dark:bg-muted text-muted-foreground border border-border dark:border-border">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatCurrency(grn.expectedAmount)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Accepted quantity × PO unit price
            </p>
          </CardContent>
        </Card>

        {/* Payments Recorded */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Payments Recorded</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/10 text-primary border border-primary/20 dark:border-emerald-900/40">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-primary dark:text-primary font-mono">
              {formatCurrency(grn.paidAmount)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {grn.accountsPayments.length} disbursement{grn.accountsPayments.length === 1 ? '' : 's'} logged
            </p>
          </CardContent>
        </Card>

        {/* Remaining Balance */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Remaining Balance</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                  isFullyPaid
                    ? 'bg-primary/10 dark:bg-primary/10 text-primary border-primary/20 dark:border-emerald-900/40'
                    : 'bg-muted/40 dark:bg-muted/40 text-foreground border-border dark:border-border'
                }`}
              >
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <p
              className={`mt-2 text-2xl font-bold tracking-tight font-mono ${
                isFullyPaid
                  ? 'text-foreground'
                  : 'text-foreground dark:text-muted-foreground'
              }`}
            >
              {formatCurrency(grn.balanceAmount)}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
              {isFullyPaid ? 'Settled in full' : `${formatCurrency(grn.balanceAmount)} pending payment`}
            </p>
          </CardContent>
        </Card>

        {/* Settlement Progress */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Settlement Progress</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground border border-border">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {percentPaid}%
              </p>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {grn.lines.length} Line item{grn.lines.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${percentPaid}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Receipt and Purchase Order Details Card */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-b border-border/70 p-5 bg-muted/20">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-bold">Receipt & Purchase Order Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {/* Supplier */}
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                Supplier
              </span>
              <p className="font-bold text-foreground text-sm">
                {grn.vendor.legalName || grn.vendor.name}
              </p>
              {grn.vendor.code && (
                <span className="inline-block text-[11px] font-mono text-muted-foreground">
                  Vendor Code: {grn.vendor.code}
                </span>
              )}
            </div>

            {/* PO Number / Job Work Reference */}
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                {grn.po?.poNumber?.startsWith('JWO-') ? 'Job Work Order' : 'Purchase Order'}
              </span>
              <p className="font-bold font-mono text-foreground text-sm">{grn.po?.poNumber || '—'}</p>
              <p className="text-[11px] text-muted-foreground">
                Status:{' '}
                <span className="font-semibold text-foreground">
                  {grn.po?.status ? String(grn.po.status).replaceAll('_', ' ') : 'APPROVED'}
                </span>
              </p>
            </div>
            {/* PO Terms */}
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                PO Payment Terms
              </span>
              <p className="font-bold text-foreground text-sm">
                {grn.po?.paymentTerms || 'Standard Terms'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Total PO Value: {formatCurrency(grn.po?.totalAmount || 0)}
              </p>
            </div>

            {/* Receiving Dates */}
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Receipt Timestamps
              </span>
              <p className="text-foreground text-xs">
                Received: <strong className="font-semibold">{formatDate(grn.receivedAt)}</strong>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Signed Off: {formatDate(grn.signedOffAt)} · Finalized: {formatDate(grn.finalizedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Use the same official GRN document component as Goods Receiving. */}
      <Card className="overflow-hidden rounded-2xl border-border/80 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 bg-muted/20 p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-bold">Goods Receipt Note Document</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Official GRN {grn.grnNumber} · Receiving record</p>
            </div>
          </div>
          <Button variant="default" size="sm" onClick={() => printGrn()} className="gap-1.5 bg-primary text-xs font-semibold text-white">
            <Printer className="h-3.5 w-3.5" /> Print GRN
          </Button>
        </CardHeader>
        <CardContent className="max-h-[80vh] overflow-auto bg-muted/30 p-3 sm:p-6">
          <GoodsReceiptPDF grn={documentGrn} ref={grnDocumentRef} />
        </CardContent>
      </Card>

      {/* Accepted Line Items Table */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-b border-border/70 p-5 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm font-bold">Accepted Items Breakdown</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Valued at accepted quantity × agreed PO rate
              </p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {grn.lines.length} Line item{grn.lines.length === 1 ? '' : 's'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="p-3.5 font-semibold text-left">Item Description</TableHead>
                  <TableHead className="p-3.5 font-semibold text-center">Received</TableHead>
                  <TableHead className="p-3.5 font-semibold text-center">Accepted</TableHead>
                  <TableHead className="p-3.5 font-semibold text-center">Rejected / Damaged</TableHead>
                  <TableHead className="p-3.5 font-semibold text-right">PO Rate</TableHead>
                  <TableHead className="p-3.5 font-semibold text-right">Expected Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {grn.lines.map((line) => (
                  <TableRow key={line.id} className="hover:bg-muted/20 transition">
                    <TableCell className="p-3.5">
                      <div className="font-semibold text-foreground">{line.description}</div>
                      {line.sku && (
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          SKU: {line.sku}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-3.5 text-center font-mono">
                      {line.receivedQuantity} {line.uom}
                    </TableCell>
                    <TableCell className="p-3.5 text-center">
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary dark:text-primary">
                        {line.acceptedQuantity} {line.uom}
                      </span>
                    </TableCell>
                    <TableCell className="p-3.5 text-center font-mono">
                      {line.rejectedQuantity + line.damagedQuantity > 0 ? (
                        <span className="inline-flex rounded-full bg-destructive/100/10 px-2 py-0.5 text-xs font-bold text-destructive">
                          {line.rejectedQuantity + line.damagedQuantity}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="p-3.5 text-right font-mono text-muted-foreground">
                      {formatCurrency(line.unitPrice)}
                    </TableCell>
                    <TableCell className="p-3.5 text-right font-mono font-bold text-foreground">
                      {formatCurrency(line.expectedPayable)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Table Footer Totals */}
          <div className="flex flex-wrap items-center justify-between border-t border-border/70 bg-muted/20 px-5 py-3 text-xs">
            <span className="text-muted-foreground font-medium">
              Total Accepted Units: <strong className="text-foreground">{totalAcceptedUnits}</strong>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Total Receipt Expected Value:</span>
              <span className="font-mono text-sm font-bold text-foreground">
                {formatCurrency(grn.expectedAmount)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claims from the procurement debit-note workflow, displayed against the same GRN. */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-b border-border/70 p-5">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-foreground" />
            <div>
              <CardTitle className="text-sm font-bold">Supplier Debit Note Claims</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">The claim is linked to this GRN and appears here as the Accounts record.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {grn.operationalDebitNotes.length ? (
            <div className="divide-y divide-border/60">
              {grn.operationalDebitNotes.map(note => (
                <div key={note.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <span className="font-mono text-sm font-bold text-foreground">{note.debitNoteNumber}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{note.reason || 'GRN discrepancy claim'} · Created {formatDate(note.createdAt || grn.receivedAt)}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-mono font-semibold">Claim {formatCurrency(note.totalAmount)}</span>
                    <span className="rounded-full bg-muted px-2.5 py-1 font-bold text-foreground">{note.status.replaceAll('_', ' ')}</span>
                    {(note.status === 'DRAFT' || note.status === 'CHANGES_REQUESTED') && canSubmitDebitNote && <Button size="sm" variant="outline" onClick={() => void onDebitNoteAction(note.id, 'submit')}>Submit</Button>}
                    {note.status === 'SUBMITTED' && canApproveDebitNote && <Button size="sm" onClick={() => void onDebitNoteAction(note.id, 'approve')}>Approve</Button>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-xs text-muted-foreground">
              {hasClaimableDiscrepancy ? 'No financial claim has been created yet.' : 'No shortage, rejected, or damaged quantity is recorded on this receipt.'}
            </div>
          )}
          {hasClaimableDiscrepancy && (
            <div className="border-t border-border/70 bg-muted/20 p-4 text-[11px] text-muted-foreground">
              Claim amounts are tracked separately from the accepted-goods payable to avoid deducting the discrepancy twice. Confirm the supplier credit or settlement before treating a claim as recovered.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Section: Payment History and Supplier Invoices */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment History */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="text-sm font-bold">Supplier Bill Payment History</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Disbursements logged against the AP Supplier Bill for this received stock
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {grn.accountsPayments.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-3 font-semibold">Date</TableHead>
                      <TableHead className="p-3 font-semibold">Reference / UTR</TableHead>
                      <TableHead className="p-3 font-semibold">Mode</TableHead>
                      <TableHead className="p-3 font-semibold">Recorded By</TableHead>
                      <TableHead className="p-3 font-semibold text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {grn.accountsPayments.map((payment) => (
                      <TableRow key={payment.id} className="hover:bg-muted/20 transition">
                        <TableCell className="p-3 font-mono">
                          {formatDate(payment.paymentDate)}
                        </TableCell>
                        <TableCell className="p-3">
                          <span className="font-mono font-semibold text-foreground">
                            {payment.reference}
                          </span>
                          {payment.notes && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                              {payment.notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="p-3">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                            {payment.paymentMode.replaceAll('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-muted-foreground text-[11px]">
                          {payment.recordedBy.name || payment.recordedBy.email}
                        </TableCell>
                        <TableCell className="p-3 text-right font-mono font-bold text-primary dark:text-primary">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">No payments recorded yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm mx-auto">
                    In Synergy ERP, vendor disbursements are recorded against the Supplier Bill. Once payment is logged against the bill, settlement reflects here immediately.
                  </p>
                </div>
                {primaryBill && (
                  <Link href={`/accounts/purchases/bills/${primaryBill.id}`}>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-white text-xs rounded-xl shadow-sm px-4 gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Open Supplier Bill to Disburse Payment
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked Supplier Invoices */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-sm font-bold">Linked Supplier Bill</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Accounts Payable invoice generated for vendor settlement
                </p>
              </div>
            </div>
            {!primaryBill && billCaptureReady && (
              <Link href={`/accounts/purchases/bills/new?grnId=${grn.id}`}>
                <Button size="sm" className="h-7 text-xs rounded-lg px-2.5 bg-primary hover:bg-primary/90 text-white">
                  <Plus className="h-3 w-3 mr-1" /> Record Supplier Invoice
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {grn.supplierInvoices.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-3 font-semibold">Bill No.</TableHead>
                      <TableHead className="p-3 font-semibold">Due Date</TableHead>
                      <TableHead className="p-3 font-semibold text-right">Invoiced</TableHead>
                      <TableHead className="p-3 font-semibold text-right">Paid</TableHead>
                      <TableHead className="p-3 font-semibold text-right">Balance</TableHead>
                      <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                      <TableHead className="p-3 text-right font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {grn.supplierInvoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-muted/20 transition">
                        <TableCell className="p-3 font-mono font-bold">
                          <Link href={`/accounts/purchases/bills/${inv.id}`} className="hover:underline text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {inv.supplierInvoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="p-3 font-mono text-muted-foreground">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="p-3 text-right font-mono font-semibold">
                          {formatCurrency(inv.amount)}
                        </TableCell>
                        <TableCell className="p-3 text-right font-mono text-primary dark:text-primary font-semibold">
                          {formatCurrency(inv.paidAmount || '0')}
                        </TableCell>
                        <TableCell className="p-3 text-right font-mono font-bold text-foreground dark:text-muted-foreground">
                          {formatCurrency(inv.balanceAmount || inv.amount)}
                        </TableCell>
                        <TableCell className="p-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              inv.paymentStatus === 'PAID'
                                ? 'bg-primary/10 text-primary dark:text-primary border border-primary/20'
                                : inv.paymentStatus === 'PARTIALLY_PAID'
                                ? 'bg-muted text-foreground dark:text-muted-foreground border border-border'
                                : 'bg-muted text-foreground dark:text-muted-foreground border border-border'
                            }`}
                          >
                            {inv.paymentStatus || 'PENDING'}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <Link href={`/accounts/purchases/bills/${inv.id}`}>
                            <Button size="sm" className="h-6 text-[11px] px-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold gap-1">
                              <FileText className="h-3 w-3" />
                              View Bill
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {billCaptureReady ? 'Supplier bill draft has not been linked yet' : 'Waiting for GRN approval'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm mx-auto">
                    {billCaptureReady
                      ? 'The finalized GRN is ready for Accounts to capture the supplier invoice.'
                      : 'This GRN is visible to Accounts while receiving is in progress. Bill capture opens after approval.'}
                  </p>
                </div>
                {billCaptureReady && (
                  <Link href={`/accounts/purchases/bills/new?grnId=${grn.id}`}>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-white text-xs rounded-xl shadow-sm px-4">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Record Supplier Invoice
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Information Banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-foreground">Accounts AP Settlement Note:</span>{' '}
          In Synergy ERP, vendor payments are recorded and tracked on the <strong>Supplier Bill</strong>. Payments disbursed against the bill automatically reflect here on the Goods Receipt Note for full vendor reconciliation and audit readiness.
        </div>
      </div>

      </main>

      <CreateGrnDebitNoteModal
        isOpen={isDebitNoteModalOpen && canCreateDebitNote && hasClaimableDiscrepancy && grn.operationalDebitNotes.length === 0}
        grn={grn}
        onClose={() => setIsDebitNoteModalOpen(false)}
        onSubmit={onCreateDebitNote}
        isSaving={isCreatingDebitNote}
      />
    </>
  );
}

function PaymentStatusBadge({ status }: { status: GrnPaymentStatus }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary dark:text-primary border border-primary/20">
        <CheckCircle2 className="h-3.5 w-3.5" />
        PAID
      </span>
    );
  }
  if (status === 'PARTIALLY_PAID') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground dark:text-muted-foreground border border-border">
        <Clock className="h-3.5 w-3.5" />
        PARTIALLY PAID
      </span>
    );
  }
  if (status === 'NO_VALUE') {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground border border-border">
        NO VALUE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground dark:text-muted-foreground border border-border">
      <AlertCircle className="h-3.5 w-3.5" />
      PENDING
    </span>
  );
}
