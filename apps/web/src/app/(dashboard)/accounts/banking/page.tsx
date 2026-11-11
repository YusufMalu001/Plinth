'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeftRight,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { BankReconModal } from '@/features/accounts/components/BankReconModal';
import { JournalEntryModal } from '@/features/accounts/components/JournalEntryModal';
import { formatCurrency } from '@/features/accounts/utils';

export default function BankingPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isContraModalOpen, setIsContraModalOpen] = useState(false);

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

  const chart = useQuery({
    queryKey: ['accounts', 'chart', entityId],
    queryFn: () => accountsApi.chart(entityId),
    enabled: Boolean(entityId),
  });

  const bankAccounts = useQuery({
    queryKey: ['accounts', 'banks', entityId],
    queryFn: () => accountsApi.bankAccounts(entityId),
    enabled: Boolean(entityId),
  });

  const activeBankId = selectedBankId || bankAccounts.data?.[0]?.id || '';
  const activeBank = bankAccounts.data?.find((b) => b.id === activeBankId);

  const statementRows = useQuery({
    queryKey: ['accounts', 'bank-statements', activeBankId],
    queryFn: () => accountsApi.bankStatementRows(activeBankId),
    enabled: Boolean(activeBankId),
  });

  const totalBookBalance = (bankAccounts.data || []).reduce(
    (sum, b) => sum + parseFloat(b.bookBalance || '0'),
    0
  );
  const totalBankBalance = (bankAccounts.data || []).reduce(
    (sum, b) => sum + parseFloat(b.bankBalance || '0'),
    0
  );
  const totalUnreconciled = (bankAccounts.data || []).reduce(
    (sum, b) => sum + (b.unreconciledCount || 0),
    0
  );

  const handleImportStatement = async (_bId: string, _fileName: string) => {
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'banks'] });
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'bank-statements'] });
  };

  const handleCreateContra = async (contraData: any) => {
    await accountsApi.createJournal(contraData, crypto.randomUUID());
    await queryClient.invalidateQueries({ queryKey: ['accounts'] });
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Bank & Contra Workbench (BRS)"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <div className="flex gap-2">
            <Button
              onClick={() => setIsImportModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <UploadCloud className="h-4 w-4" />
              Import Statement
            </Button>
            <Button
              onClick={() => setIsContraModalOpen(true)}
              variant="outline"
              className="font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Contra Transfer
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total GL Book Balance"
          value={formatCurrency(totalBookBalance)}
          subtitle="General ledger bank accounts"
          icon={Building}
          variant="primary"
        />
        <MetricCard
          title="Bank Statement Balance"
          value={formatCurrency(totalBankBalance)}
          subtitle="Feed from bank portals"
          icon={Building2}
          variant="success"
        />
        <MetricCard
          title="BRS Reconciliation Variance"
          value={formatCurrency(totalBankBalance - totalBookBalance)}
          subtitle="Cheques in transit / uncredited"
          icon={Clock}
          variant={totalBankBalance !== totalBookBalance ? 'warning' : 'success'}
        />
        <MetricCard
          title="Unmatched Statement Lines"
          value={totalUnreconciled}
          subtitle="Awaiting reconciliation review"
          icon={AlertCircle}
          variant={totalUnreconciled > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Bank Accounts Switcher Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(bankAccounts.data || []).map((b) => (
          <Card
            key={b.id}
            onClick={() => setSelectedBankId(b.id)}
            className={`rounded-2xl border p-5 cursor-pointer transition-all ${
              activeBankId === b.id
                ? 'border-border bg-muted/30 dark:bg-muted shadow-md ring-1 ring-ring'
                : 'border-border/80 bg-card hover:border-border'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-foreground ">
                  {b.accountType}
                </span>
                <h3 className="text-sm font-bold text-foreground mt-2">{b.bankName}</h3>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  A/C: {b.accountNumber} · IFSC: {b.ifscCode}
                </p>
              </div>
              <span className="rounded-xl p-2 bg-muted text-muted-foreground">
                <Building className="h-4 w-4" />
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block">Book Balance:</span>
                <span className="font-bold text-foreground">{formatCurrency(b.bookBalance)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block">Unreconciled:</span>
                <span
                  className={`font-bold ${
                    b.unreconciledCount > 0 ? 'text-foreground dark:text-muted-foreground' : 'text-primary dark:text-primary'
                  }`}
                >
                  {b.unreconciledCount} items
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Statement Reconciliation Lines */}
      {activeBank && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  Statement Rows & BRS Matches: {activeBank.bankName}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A/C: {activeBank.accountNumber} · GL Code: {activeBank.glAccountCode}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-primary dark:text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded-xl">
                  <Sparkles className="h-3.5 w-3.5" />
                  Auto-Match Active
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="p-3 text-left font-semibold">Txn Date</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Value Date</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Description / Particulars</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Bank Reference No.</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Withdrawal Dr (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Deposit Cr (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Closing Bank (₹)</TableHead>
                  <TableHead className="p-3 text-center font-semibold">BRS Status</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Matched Voucher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60 font-mono">
                {statementRows.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading statement transactions…
                    </TableCell>
                  </TableRow>
                ) : statementRows.data?.length ? (
                  statementRows.data.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="p-3 text-muted-foreground">{r.transactionDate}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">{r.valueDate}</TableCell>
                      <TableCell className="p-3 font-sans font-medium text-foreground max-w-[220px] truncate">
                        {r.description}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground">{r.referenceNo}</TableCell>
                      <TableCell className="p-3 text-right font-bold text-destructive dark:text-destructive">
                        {parseFloat(r.withdrawal) > 0 ? formatCurrency(r.withdrawal) : '—'}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-primary dark:text-primary">
                        {parseFloat(r.deposit) > 0 ? formatCurrency(r.deposit) : '—'}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">
                        {formatCurrency(r.balance)}
                      </TableCell>
                      <TableCell className="p-3 text-center font-sans">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.matchStatus === 'MATCHED'
                              ? 'bg-primary/10 text-primary dark:text-primary'
                              : 'bg-muted text-foreground dark:text-muted-foreground'
                          }`}
                        >
                          {r.matchStatus === 'MATCHED' ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {r.matchStatus}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 font-sans text-xs">
                        {r.matchedVoucherNumber ? (
                          <span className="font-mono font-bold text-muted-foreground ">
                            {r.matchedVoucherNumber}
                          </span>
                        ) : (
                          <Button variant="outline" size="sm" className="h-6 text-[11px] rounded-lg px-2">
                            Match Voucher
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground font-sans">
                      No statement transactions imported for this bank account yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Modal */}
      <BankReconModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        bankAccounts={bankAccounts.data || []}
        onImportStatement={handleImportStatement}
      />

      {/* Contra Transfer Journal Modal */}
      <JournalEntryModal
        isOpen={isContraModalOpen}
        onClose={() => setIsContraModalOpen(false)}
        entityId={entityId}
        periods={periods.data || []}
        chart={chart.data || []}
        onSubmit={handleCreateContra}
      />
    </main>
  );
}
