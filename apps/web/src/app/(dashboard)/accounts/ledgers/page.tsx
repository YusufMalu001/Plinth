'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookMarked,
  Printer,
  Building,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { formatCurrency, localToday } from '@/features/accounts/utils';

export default function LedgersPage() {
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [fromDate, setFromDate] = useState('2026-09-01');
  const [toDate, setToDate] = useState(localToday());
  const [viewMode, setViewMode] = useState<'GL' | 'PARTY'>('GL');

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
    queryKey: ['accounts', 'journals', entityId],
    queryFn: () => accountsApi.journals(entityId),
    enabled: Boolean(entityId),
  });

  const accountsList = chart.data || [];
  const activeAccountId = selectedAccountId || accountsList[0]?.id || '';
  const selectedAccount = accountsList.find((a) => a.id === activeAccountId);

  // Derive statement lines for the selected account from posted journals
  const statementLines = (journals.data?.items || [])
    .filter((v) => v.status === 'POSTED')
    .flatMap((v) =>
      v.lines
        .filter((l) => l.accountId === activeAccountId)
        .map((l) => ({
          voucherId: v.id,
          voucherNumber: v.voucherNumber || 'JV-POSTED',
          date: v.accountingDate.slice(0, 10),
          description: v.description,
          memo: l.memo,
          debit: parseFloat(l.debit || '0'),
          credit: parseFloat(l.credit || '0'),
        }))
    );

  const totalDebits = statementLines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredits = statementLines.reduce((sum, l) => sum + l.credit, 0);
  const netClosingBalance =
    selectedAccount?.type === 'ASSET' || selectedAccount?.type === 'EXPENSE'
      ? totalDebits - totalCredits
      : totalCredits - totalDebits;

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="General Ledger & Party Ledgers"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print Ledger
            </Button>
          </div>
        }
      />

      {/* Account Selection and Filter Bar */}
      <Card className="rounded-2xl border-border/80 shadow-none p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground">Select Ledger Account</label>
              <select
                className="mt-1 block min-w-64 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={activeAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {accountsList.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">From Date</label>
              <input
                type="date"
                className="mt-1 block rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">To Date</label>
              <input
                type="date"
                className="mt-1 block rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'GL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('GL')}
              className="text-xs rounded-xl"
            >
              General Ledger
            </Button>
            <Button
              variant={viewMode === 'PARTY' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('PARTY')}
              className="text-xs rounded-xl"
            >
              Party Sub-Ledgers
            </Button>
          </div>
        </div>
      </Card>

      {/* Metrics Row */}
      {selectedAccount && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Account Classification"
            value={selectedAccount.type}
            subtitle={`Code: ${selectedAccount.code}`}
            icon={BookMarked}
            variant="default"
          />
          <MetricCard
            title="Total Period Debits"
            value={formatCurrency(totalDebits)}
            subtitle="Debit transactions"
            icon={ArrowDownLeft}
            variant="primary"
          />
          <MetricCard
            title="Total Period Credits"
            value={formatCurrency(totalCredits)}
            subtitle="Credit transactions"
            icon={ArrowUpRight}
            variant="success"
          />
          <MetricCard
            title="Net Closing Balance"
            value={formatCurrency(netClosingBalance)}
            subtitle={selectedAccount.isControl ? 'Control account (Subledger backed)' : 'General Ledger Balance'}
            icon={Building}
            variant={netClosingBalance < 0 ? 'warning' : 'default'}
          />
        </div>
      )}

      {/* Statement Table */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-b border-border/70 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">
                Account Statement: {selectedAccount?.name || 'Ledger'}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono">
                {selectedAccount?.code} · {fromDate} to {toDate}
              </p>
            </div>
            {selectedAccount?.tallyLedger && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-foreground ">
                Tally Mapped: {selectedAccount.tallyLedger}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Voucher Ref</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Transaction Particulars</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Memo</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Debit (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Credit (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Running Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60 font-mono">
                <TableRow className="bg-muted/20 font-semibold">
                  <TableCell className="p-3">{fromDate}</TableCell>
                  <TableCell className="p-3">—</TableCell>
                  <TableCell className="p-3 font-sans">Opening Balance B/F</TableCell>
                  <TableCell className="p-3">—</TableCell>
                  <TableCell className="p-3 text-right">₹0.00</TableCell>
                  <TableCell className="p-3 text-right">₹0.00</TableCell>
                  <TableCell className="p-3 text-right">₹0.00</TableCell>
                </TableRow>

                {statementLines.length ? (
                  statementLines.map((l, i) => (
                    <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="p-3 text-muted-foreground">{l.date}</TableCell>
                      <TableCell className="p-3 font-bold text-foreground">{l.voucherNumber}</TableCell>
                      <TableCell className="p-3 font-sans font-medium text-foreground">{l.description}</TableCell>
                      <TableCell className="p-3 font-sans text-muted-foreground">{l.memo || '—'}</TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">
                        {l.debit > 0 ? formatCurrency(l.debit) : '—'}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">
                        {l.credit > 0 ? formatCurrency(l.credit) : '—'}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-muted-foreground ">
                        {formatCurrency(totalDebits - totalCredits)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="p-8 text-center text-muted-foreground font-sans">
                      No transactions recorded for this account in the selected date range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 p-4 text-xs font-mono font-bold">
            <span className="font-sans">Closing Balance:</span>
            <div className="flex gap-6">
              <span>Total Dr: {formatCurrency(totalDebits)}</span>
              <span>Total Cr: {formatCurrency(totalCredits)}</span>
              <span className="text-muted-foreground ">
                Net: {formatCurrency(netClosingBalance)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
