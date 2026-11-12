'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenCheck,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Scale,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { JournalEntryModal } from '@/features/accounts/components/JournalEntryModal';
import { formatCurrency, localToday } from '@/features/accounts/utils';
import { useCurrentUser } from '@/features/auth/hooks';

export default function JournalsPage() {
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeVoucherId, setActiveVoucherId] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [showReversalForm, setShowReversalForm] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = selectedEntityId || entities.data?.[0]?.id || '';

  const chart = useQuery({
    queryKey: ['accounts', 'chart', entityId],
    queryFn: () => accountsApi.chart(entityId),
    enabled: Boolean(entityId),
  });

  const periods = useQuery({
    queryKey: ['accounts', 'periods', entityId],
    queryFn: () => accountsApi.periods(entityId),
    enabled: Boolean(entityId),
  });

  const journals = useQuery({
    queryKey: ['accounts', 'journals', entityId, page],
    queryFn: () => accountsApi.journals(entityId, page),
    enabled: Boolean(entityId),
  });

  const voucherDetail = useQuery({
    queryKey: ['accounts', 'journal', activeVoucherId],
    queryFn: () => accountsApi.journal(activeVoucherId),
    enabled: Boolean(activeVoucherId),
  });

  const activeVoucher = voucherDetail.data;
  const allVouchers = journals.data?.items || [];
  const totalCount = journals.data?.total ?? 0;
  const postedCount = allVouchers.filter((v) => v.status === 'POSTED').length;
  const draftCount = allVouchers.filter((v) => v.status === 'DRAFT' || v.status === 'SUBMITTED').length;

  const permissions = new Set((user.data?.permissions || []).map((v) => v.toLowerCase()));
  const isAdmin = user.data?.role === 'admin';
  const can = (action: string) => isAdmin || permissions.has(`${action}:journalvoucher`);

  const executeAction = async (action: () => Promise<unknown>, successMsg: string) => {
    setActionPending(true);
    setNotification(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setNotification({ type: 'success', message: successMsg });
      setShowReversalForm(false);
      setReversalReason('');
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Operation failed.' });
    } finally {
      setActionPending(false);
    }
  };

  const handleCreateJournal = async (journalData: any) => {
    await executeAction(
      () => accountsApi.createJournal(journalData, crypto.randomUUID()),
      'Draft journal voucher created. Submit it for maker-checker approval.'
    );
  };

  const filteredVouchers = allVouchers.filter((v) => {
    const matchesSearch =
      !search ||
      (v.voucherNumber && v.voucherNumber.toLowerCase().includes(search.toLowerCase())) ||
      v.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || v.status === statusFilter;
    const matchesKind = !kindFilter || v.kind === kindFilter;
    return matchesSearch && matchesStatus && matchesKind;
  });

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Journal Vouchers & Double Entry"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          can('create') && (
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <Plus className="h-4 w-4" />
              New Journal Entry
            </Button>
          )
        }
      />

      {/* Notifications */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-2xl p-4 text-xs font-medium border ${
            notification.type === 'success'
              ? 'border-tone-green-solid/25 bg-tone-green-bg text-tone-green-text'
              : 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Journal Vouchers"
          value={journals.isLoading ? '—' : totalCount}
          subtitle="Registered in this book"
          icon={BookOpenCheck}
          variant="default"
        />
        <MetricCard
          title="Posted & Immutable"
          value={journals.isLoading ? '—' : postedCount}
          subtitle="Reflected in General Ledger"
          icon={ShieldCheck}
          variant="success"
        />
        <MetricCard
          title="Awaiting Maker / Checker"
          value={journals.isLoading ? '—' : draftCount}
          subtitle="Draft & submitted vouchers"
          icon={AlertCircle}
          variant={draftCount > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          title="Active Open Periods"
          value={periods.data?.filter((p) => p.status === 'OPEN').length ?? 0}
          subtitle="Eligible for financial posting"
          icon={Scale}
          variant="primary"
        />
      </div>

      {/* Main Grid: Vouchers List + Active Voucher Detail */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Left: Vouchers Table Card */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-border-strong border-border/70 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-bold">Voucher Register</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chronological financial journal entries with payload hashes
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    placeholder="Search voucher or memo..."
                    className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-44 sm:w-52"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  aria-label="Filter by Status"
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="POSTED">Posted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="DRAFT">Draft</option>
                  <option value="REVERSED">Reversed</option>
                </select>

                <select
                  aria-label="Filter by Kind"
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="">All Voucher Types</option>
                  <option value="JOURNAL">General Journal</option>
                  <option value="OPENING">Opening Entry</option>
                  <option value="CONTRA">Contra Entry</option>
                  <option value="REVERSAL">Reversal Entry</option>
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
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Description</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {journals.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading journal register…
                      </TableCell>
                    </TableRow>
                  ) : filteredVouchers.length ? (
                    filteredVouchers.map((v) => (
                      <TableRow
                        key={v.id}
                        className={`hover:bg-muted/50 transition-colors cursor-pointer group ${
                          activeVoucherId === v.id ? 'bg-n-50/70' : ''
                        }`}
                        onClick={() => setActiveVoucherId(v.id)}
                      >
                        <TableCell className="p-3 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5 font-mono group-hover:text-primary transition-colors">
                            <span>{v.voucherNumber || 'Draft'}</span>
                            <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                          </div>
                        </TableCell>
                        <TableCell className="p-3 font-mono text-muted-foreground">
                          {v.accountingDate.slice(0, 10)}
                        </TableCell>
                        <TableCell className="p-3">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-foreground border border-border">
                            {v.kind}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 max-w-[180px] truncate text-muted-foreground font-medium">
                          {v.description}
                        </TableCell>
                        <TableCell className="p-3 text-center">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                              v.status === 'POSTED'
                                ? 'bg-muted text-foreground border-border'
                                : 'bg-muted text-foreground border-border'
                            }`}
                          >
                            {v.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                        No journal vouchers recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border/70 p-4 text-xs">
              <span className="text-muted-foreground">
                Showing {filteredVouchers.length} of {totalCount} entries
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-xl text-xs h-8"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!journals.data || page * journals.data.limit >= journals.data.total}
                  onClick={() => setPage(page + 1)}
                  className="rounded-xl text-xs h-8"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Active Voucher Inspector */}
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-border-strong border-border/70 p-5">
            <CardTitle className="text-base font-bold">Voucher Inspector</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Maker-checker verification and double-entry debits & credits
            </p>
          </CardHeader>

          <CardContent className="p-5">
            {activeVoucher ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-mono font-bold text-base text-foreground">
                      {activeVoucher.voucherNumber || 'Draft Voucher'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Date: {activeVoucher.accountingDate.slice(0, 10)} · Kind: {activeVoucher.kind} · Version:{' '}
                      v{activeVoucher.version}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      activeVoucher.status === 'POSTED'
                        ? 'bg-muted text-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {activeVoucher.status}
                  </span>
                </div>

                <div className="rounded-xl bg-muted/30 p-3 text-xs border border-border">
                  <span className="font-semibold text-muted-foreground">Narration:</span>
                  <p className="mt-1 text-foreground">{activeVoucher.description}</p>
                </div>

                {/* Lines Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table className="w-full text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="p-2.5 text-left font-semibold">Account</TableHead>
                        <TableHead className="p-2.5 text-right font-semibold">Debit (₹)</TableHead>
                        <TableHead className="p-2.5 text-right font-semibold">Credit (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60 font-mono">
                      {activeVoucher.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="p-2.5 font-sans font-medium text-foreground">
                            {l.account?.code} - {l.account?.name}
                            {l.memo && <span className="block text-[10px] text-muted-foreground">{l.memo}</span>}
                          </TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-foreground">
                            {parseFloat(l.debit) > 0 ? formatCurrency(l.debit) : '—'}
                          </TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-foreground">
                            {parseFloat(l.credit) > 0 ? formatCurrency(l.credit) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Workflow Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/70">
                  {activeVoucher.status === 'DRAFT' && can('submit') && (
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-xl"
                      disabled={actionPending}
                      onClick={() =>
                        void executeAction(
                          () => accountsApi.submit(activeVoucher.id, activeVoucher.version),
                          'Journal submitted for independent approval.'
                        )
                      }
                    >
                      Submit for Review
                    </Button>
                  )}

                  {activeVoucher.status === 'SUBMITTED' && can('approve') && (
                    <Button
                      size="sm"
                      className="bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse text-xs rounded-xl"
                      disabled={actionPending}
                      onClick={() =>
                        void executeAction(
                          () => accountsApi.approve(activeVoucher.id, activeVoucher.version),
                          'Journal approved. Ready for immutable posting.'
                        )
                      }
                    >
                      Approve Voucher
                    </Button>
                  )}

                  {activeVoucher.status === 'APPROVED' && can('post') && (
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-xl"
                      disabled={actionPending}
                      onClick={() =>
                        void executeAction(
                          () => accountsApi.post(activeVoucher.id, activeVoucher.version),
                          'Balanced journal posted to General Ledger.'
                        )
                      }
                    >
                      Post to Books
                    </Button>
                  )}

                  {activeVoucher.status === 'POSTED' && can('reverse') && !activeVoucher.reversalOfId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-tone-red-text hover:bg-tone-red-solid text-xs rounded-xl"
                      onClick={() => setShowReversalForm(!showReversalForm)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      {showReversalForm ? 'Cancel Reversal' : 'Draft Reversal'}
                    </Button>
                  )}
                </div>

                {/* Reversal Form */}
                {showReversalForm && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const openP = periods.data?.find((p) => p.status === 'OPEN')?.id;
                      if (!openP) return;
                      void executeAction(
                        () =>
                          accountsApi.reversal(activeVoucher.id, {
                            periodId: openP,
                            accountingDate: localToday(),
                            reason: reversalReason,
                          }),
                        'Reversal draft created. It must now be submitted and approved.'
                      );
                    }}
                    className="rounded-2xl border border-tone-red-solid/25 bg-tone-red-bg p-4 space-y-3"
                  >
                    <h4 className="text-xs font-bold text-tone-red-text">
                      Approved Reversal Request
                    </h4>
                    <textarea
                      required
                      rows={2}
                      placeholder="Explain the audit reason for reversing this posted voucher..."
                      className="w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        className="bg-tone-red-solid hover:bg-[color:var(--tone-red-text)] text-inverse text-xs rounded-xl"
                        disabled={actionPending || reversalReason.trim().length < 5}
                      >
                        Create Reversal Voucher
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <BookOpenCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                Select any journal voucher from the register to inspect debits, credits, and maker-checker history.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Journal Entry Modal */}
      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entityId={entityId}
        periods={periods.data || []}
        chart={chart.data || []}
        onSubmit={handleCreateJournal}
      />
    </main>
  );
}
