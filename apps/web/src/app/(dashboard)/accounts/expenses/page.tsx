'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Paperclip,
  Tag,
  Trash2,
  X,
  ExternalLink,
  Download,
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
import { formatCurrency } from '@/features/accounts/utils';
import { PaginationControls } from '@/components/PaginationControls';
import { MiscellaneousExpense } from '@/features/accounts/types';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { showToast } from '@/components/toast-store';

const categoryLabels: Record<string, { label: string; color: string }> = {
  TRANSPORTATION: { label: 'Transportation', color: 'bg-muted text-foreground border-border' },
  ELECTRICIAN_MAINTENANCE: { label: 'Electrician & Repairs', color: 'bg-muted text-foreground border-border' },
  LABOUR_WAGES: { label: 'Labour & Wages', color: 'bg-muted text-foreground border-border' },
  WAREHOUSE_OPERATIONS: { label: 'Warehouse Ops', color: 'bg-muted text-foreground border-border' },
  UTILITIES_ELECTRICITY: { label: 'Utilities & Power', color: 'bg-muted text-foreground border-border' },
  OFFICE_SUPPLIES: { label: 'Office Supplies', color: 'bg-muted text-foreground border-border' },
  FUEL_CONVEYANCE: { label: 'Fuel & Conveyance', color: 'bg-muted text-foreground border-border' },
  TEA_REFRESHMENTS: { label: 'Tea & Refreshments', color: 'bg-muted text-foreground border-border' },
  FREIGHT_COURIER: { label: 'Freight & Courier', color: 'bg-muted text-foreground border-border' },
  PROFESSIONAL_LEGAL: { label: 'Professional / Legal', color: 'bg-muted text-foreground border-border' },
  MISCELLANEOUS: { label: 'Miscellaneous', color: 'bg-muted text-foreground border-border' },
};

export default function MiscellaneousExpensesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Bill preview modal state
  const [selectedBill, setSelectedBill] = useState<MiscellaneousExpense | null>(null);

  // Delete confirmation modal state
  const [expenseToDelete, setExpenseToDelete] = useState<MiscellaneousExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const expensesQuery = useQuery({
    queryKey: ['accounts', 'expenses', entityId, search, categoryFilter, paymentStatusFilter, selectedDate, page, pageSize],
    queryFn: () =>
      accountsApi.expenses({
        entityId,
        search,
        category: categoryFilter || undefined,
        paymentStatus: paymentStatusFilter || undefined,
        date: selectedDate || undefined,
        page,
        limit: pageSize,
      }),
    enabled: Boolean(entityId),
  });

  const expenseData = expensesQuery.data;
  const items = expenseData?.items || [];
  const summary = expenseData?.summary || { totalAmount: 0, paidAmount: 0, pendingAmount: 0, categoryCount: 0 };
  const total = expenseData?.total || 0;

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await accountsApi.deleteExpense(expenseToDelete.id);
      showToast({
        kind: 'success',
        title: 'Expense Deleted',
        message: `Expense voucher ${expenseToDelete.expenseNumber} was deleted successfully.`,
      });
      setExpenseToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'expenses'] });
    } catch (err: any) {
      setDeleteError(err?.message || 'Could not delete expense.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="flex-1 space-y-4 p-5 md:p-8">
      {/* Header */}
      <AccountsHeader
        title="Miscellaneous Expenses & Petty Cash"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        dateFilter={selectedDate}
        onDateChange={setSelectedDate}
        actionButton={
          <Link href="/accounts/expenses/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs">
              <Plus className="h-4 w-4" />
              Record Expense
            </Button>
          </Link>
        }
      />

      {/* Compact 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Total Expenses
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
            {expensesQuery.isLoading ? '—' : formatCurrency(summary.totalAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {total} expense record{total === 1 ? '' : 's'} registered
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Settled &amp; Disbursed
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
            {expensesQuery.isLoading ? '—' : formatCurrency(summary.paidAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Cash, UPI &amp; bank disbursements
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Pending Reimbursements
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
            {expensesQuery.isLoading ? '—' : formatCurrency(summary.pendingAmount)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Awaiting cash settlement
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Active Categories
            </span>
            <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
            {expensesQuery.isLoading ? '—' : summary.categoryCount}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Expense heads active in ledger
          </p>
        </div>
      </div>

      {/* Toolbar Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Expenses Register
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search expense, payee, ref..."
              className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            aria-label="Filter by Category"
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            <option value="TRANSPORTATION">Transportation</option>
            <option value="ELECTRICIAN_MAINTENANCE">Electrician &amp; Repairs</option>
            <option value="LABOUR_WAGES">Labour &amp; Wages</option>
            <option value="WAREHOUSE_OPERATIONS">Warehouse Operations</option>
            <option value="UTILITIES_ELECTRICITY">Utilities &amp; Power</option>
            <option value="OFFICE_SUPPLIES">Office Supplies</option>
            <option value="FUEL_CONVEYANCE">Fuel &amp; Conveyance</option>
            <option value="TEA_REFRESHMENTS">Tea &amp; Refreshments</option>
            <option value="FREIGHT_COURIER">Freight &amp; Courier</option>
            <option value="PROFESSIONAL_LEGAL">Professional / Legal</option>
            <option value="MISCELLANEOUS">Miscellaneous</option>
          </select>

          <select
            aria-label="Filter by Payment Status"
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
            value={paymentStatusFilter}
            onChange={(e) => {
              setPaymentStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Payment Statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
      </div>

      {/* Expenses Register Table */}
      <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Voucher No.</TableHead>
                <TableHead>Expense Title / Purpose</TableHead>
                <TableHead>Payee / Contractor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payment Mode</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-center">Bill</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expensesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-primary" />
                    Loading expenses register…
                  </TableCell>
                </TableRow>
              ) : items.length ? (
                items.map((exp: MiscellaneousExpense) => {
                  const cat = categoryLabels[exp.category] || { label: exp.category, color: 'bg-muted text-foreground' };
                  return (
                    <TableRow
                      key={exp.id}
                      onClick={() => router.push(`/accounts/expenses/${exp.id}`)}
                      className="hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <TableCell className="p-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{exp.expenseNumber}</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                        </div>
                      </TableCell>
                      <TableCell className="p-4 font-medium text-foreground max-w-56 truncate" title={exp.title}>
                        {exp.title}
                      </TableCell>
                      <TableCell className="p-4 text-foreground">
                        <span className="font-semibold">{exp.payeeName}</span>
                        {exp.payeeContact && (
                          <span className="block text-[10px] text-muted-foreground font-mono">
                            {exp.payeeContact}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="p-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${cat.color}`}>
                          {cat.label}
                        </span>
                      </TableCell>
                      <TableCell className="p-4 font-mono text-muted-foreground">
                        {exp.expenseDate ? exp.expenseDate.slice(0, 10) : '—'}
                      </TableCell>
                      <TableCell className="p-4 font-mono text-xs">
                        <span className="font-semibold text-foreground">{exp.paymentMode}</span>
                        {exp.referenceNumber && (
                          <span className="block text-[10px] text-muted-foreground truncate max-w-28" title={exp.referenceNumber}>
                            Ref: {exp.referenceNumber}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="p-4 text-right font-mono">
                        {formatCurrency(exp.amount)}
                      </TableCell>
                      <TableCell className="p-4 text-right font-mono text-muted-foreground">
                        {Number(exp.taxAmount) > 0 ? formatCurrency(exp.taxAmount) : '—'}
                      </TableCell>
                      <TableCell className="p-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(exp.totalAmount)}
                      </TableCell>
                      <TableCell className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {exp.receiptUrl ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBill(exp);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-tone-grey-bg border border-border transition-all cursor-pointer shadow-xs active:scale-95"
                            title={exp.receiptFileName ? `View ${exp.receiptFileName}` : 'Click to view attached bill'}
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>Bill</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="p-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            exp.paymentStatus === 'PAID'
                              ? 'bg-muted text-foreground border-border'
                              : 'bg-muted/60 text-muted-foreground border-border/80'
                          }`}
                        >
                          {exp.paymentStatus}
                        </span>
                      </TableCell>
                      <TableCell className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpenseToDelete(exp);
                            }}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-tone-red-text hover:bg-tone-red-solid rounded-lg transition-colors inline-flex items-center justify-center"
                            title="Delete Expense Voucher"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-2">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-foreground">No miscellaneous expenses recorded</p>
                      <p className="text-[11px] text-muted-foreground">
                        Record day-to-day warehouse repairs, electrician services, transportation, or labour disbursements to maintain the petty cash ledger.
                      </p>
                      <div className="pt-2">
                        <Link href="/accounts/expenses/new">
                          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs h-8 px-3">
                            <Plus className="h-3.5 w-3.5" />
                            Record First Expense
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      {/* Bill Document Pop-up Modal */}
      {selectedBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedBill(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-modal space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-border-strong border-border/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-muted p-2 text-foreground border border-border">
                  <Paperclip className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Attached Bill / Receipt Document
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Voucher <span className="font-mono font-bold text-foreground">{selectedBill.expenseNumber}</span> · {selectedBill.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedBill.receiptUrl && (
                  <>
                    <a
                      href={selectedBill.receiptUrl}
                      download={selectedBill.receiptFileName || `bill_${selectedBill.expenseNumber}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                      title="Download Bill"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </a>
                    <a
                      href={selectedBill.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                      title="Open in New Tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Open in Tab</span>
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBill(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close bill preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Bill Info Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs rounded-xl bg-muted/30 p-3 border border-border/60">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Payee</span>
                <span className="font-semibold text-foreground truncate block">{selectedBill.payeeName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Amount</span>
                <span className="font-mono font-bold text-primary block">{formatCurrency(selectedBill.totalAmount)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">File Name</span>
                <span className="font-mono text-foreground truncate block" title={selectedBill.receiptFileName || 'bill'}>
                  {selectedBill.receiptFileName || 'Document'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">File Size</span>
                <span className="font-mono text-muted-foreground block">
                  {selectedBill.receiptFileSize ? `${(selectedBill.receiptFileSize / 1024).toFixed(1)} KB` : '—'}
                </span>
              </div>
            </div>

            {/* Bill Preview Content (Scrollable) */}
            <div className="flex-1 overflow-auto rounded-xl border border-border/80 bg-background/50 p-2 min-h-[300px] flex items-center justify-center">
              {selectedBill.receiptUrl ? (
                selectedBill.receiptFileType?.startsWith('image/') ||
                selectedBill.receiptUrl.startsWith('data:image/') ||
                /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(selectedBill.receiptUrl) ? (
                  <img
                    src={selectedBill.receiptUrl}
                    alt={selectedBill.receiptFileName || 'Expense Bill'}
                    className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
                  />
                ) : selectedBill.receiptFileType === 'application/pdf' || /\.pdf(\?.*)?$/i.test(selectedBill.receiptUrl) ? (
                  <iframe
                    src={selectedBill.receiptUrl}
                    className="w-full h-[60vh] rounded-lg border-accent"
                    title={selectedBill.receiptFileName || 'Bill PDF Preview'}
                  />
                ) : (
                  <div className="p-8 text-center space-y-3">
                    <FileText className="h-12 w-12 text-primary mx-auto" />
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {selectedBill.receiptFileName || 'Document Attached'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This file format cannot be previewed directly in this window.
                      </p>
                    </div>
                    <div className="pt-2 flex justify-center gap-2">
                      <a
                        href={selectedBill.receiptUrl}
                        download={selectedBill.receiptFileName || `bill_${selectedBill.expenseNumber}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-inverse hover:bg-primary/90 shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Document
                      </a>
                      <a
                        href={selectedBill.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open in New Tab
                      </a>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-xs text-muted-foreground">No file attached to this expense.</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-border/70">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedBill(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanent Expense Deletion from Table */}
      <ConfirmDeleteDialog
        open={Boolean(expenseToDelete)}
        title="Delete Expense Voucher"
        message={
          <>
            Are you sure you want to permanently delete expense voucher{' '}
            <strong className="font-mono text-foreground">{expenseToDelete?.expenseNumber}</strong> (
            {expenseToDelete?.title})? This will remove the transaction from the petty cash ledger and cannot be undone.
          </>
        }
        error={deleteError}
        isDeleting={isDeleting}
        confirmText="Delete Voucher"
        loadingText="Deleting…"
        onClose={() => {
          if (!isDeleting) {
            setExpenseToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </main>
  );
}
