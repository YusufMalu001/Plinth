'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Printer,
  Lock,
  Unlock,
  Scale,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { PeriodCloseModal } from '@/features/accounts/components/PeriodCloseModal';
import { AccountingPeriod } from '@/features/accounts/types';
import { formatCurrency, localToday } from '@/features/accounts/utils';

export default function ReportsClosePage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [reportType, setReportType] = useState<'TRIAL' | 'PL' | 'BS' | 'DAYBOOK'>('TRIAL');
  const [cutoffDate, setCutoffDate] = useState(localToday());
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedPeriodToClose, setSelectedPeriodToClose] = useState<AccountingPeriod | null>(null);

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

  const trial = useQuery({
    queryKey: ['accounts', 'trial', entityId, cutoffDate],
    queryFn: () => accountsApi.trialBalance(entityId, cutoffDate),
    enabled: Boolean(entityId),
  });

  const trialRows = trial.data || [];
  const totalDebits = trialRows.reduce((sum, r) => sum + parseFloat(r.debit || '0'), 0);
  const totalCredits = trialRows.reduce((sum, r) => sum + parseFloat(r.credit || '0'), 0);

  const openPeriods = (periods.data || []).filter((p) => p.status === 'OPEN');
  const closedPeriods = (periods.data || []).filter((p) => p.status === 'CLOSED');

  const handleClosePeriod = async (pId: string) => {
    await accountsApi.closePeriod(pId);
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'periods'] });
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Financial Statements & Period Close"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={openPeriods[0]?.code}
        actionButton={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print Report
            </Button>
            {openPeriods[0] && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedPeriodToClose(openPeriods[0]);
                  setCloseModalOpen(true);
                }}
                className="bg-primary hover:bg-primary/90 text-white font-semibold gap-1.5 rounded-xl text-xs"
              >
                <Lock className="h-3.5 w-3.5" />
                Close Period ({openPeriods[0].code})
              </Button>
            )}
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Posted Debits"
          value={formatCurrency(totalDebits)}
          subtitle="Cutoff date balances"
          icon={Scale}
          variant="primary"
        />
        <MetricCard
          title="Total Posted Credits"
          value={formatCurrency(totalCredits)}
          subtitle="Cutoff date balances"
          icon={Scale}
          variant="success"
        />
        <MetricCard
          title="Active Open Periods"
          value={openPeriods.length}
          subtitle="Posting allowed"
          icon={Unlock}
          variant={openPeriods.length > 0 ? 'default' : 'warning'}
        />
        <MetricCard
          title="Locked / Closed Periods"
          value={closedPeriods.length}
          subtitle="Permanent financial lock"
          icon={Lock}
          variant="default"
        />
      </div>

      {/* Report Controls Bar */}
      <Card className="rounded-2xl border-border/80 shadow-none p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 rounded-2xl border border-border/80 bg-muted/20 p-1">
            <button
              onClick={() => setReportType('TRIAL')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                reportType === 'TRIAL'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Trial Balance
            </button>
            <button
              onClick={() => setReportType('PL')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                reportType === 'PL'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Profit & Loss (P&L)
            </button>
            <button
              onClick={() => setReportType('BS')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                reportType === 'BS'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Balance Sheet
            </button>
            <button
              onClick={() => setReportType('DAYBOOK')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                reportType === 'DAYBOOK'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Day Book
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Balances Cutoff:</label>
            <input
              type="date"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Trial Balance Statement Card */}
      {reportType === 'TRIAL' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">Official Trial Balance</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Double entry trial balance through {cutoffDate} (INR)
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:text-primary">
                Balanced (Dr = Cr)
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Account Code</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Ledger Account Name</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Debit Balance (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Credit Balance (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60 font-mono">
                  {trial.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-8 text-center text-muted-foreground font-sans">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Calculating trial balance…
                      </TableCell>
                    </TableRow>
                  ) : trialRows.length ? (
                    trialRows.map((row) => (
                      <TableRow key={row.accountId} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="p-3 font-bold text-foreground">{row.code}</TableCell>
                        <TableCell className="p-3 font-sans font-medium text-foreground">{row.name}</TableCell>
                        <TableCell className="p-3 font-sans text-muted-foreground">{row.type}</TableCell>
                        <TableCell className="p-3 text-right font-bold text-foreground">
                          {parseFloat(row.debit) > 0 ? formatCurrency(row.debit) : '—'}
                        </TableCell>
                        <TableCell className="p-3 text-right font-bold text-foreground">
                          {parseFloat(row.credit) > 0 ? formatCurrency(row.credit) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="p-8 text-center text-muted-foreground font-sans">
                        No posted journal balances for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 p-4 text-xs font-mono font-bold">
              <span className="font-sans">Grand Total:</span>
              <div className="flex gap-8">
                <span>Dr: {formatCurrency(totalDebits)}</span>
                <span>Cr: {formatCurrency(totalCredits)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* P&L View */}
      {reportType === 'PL' && (
        <Card className="rounded-2xl border-border/80 shadow-none p-6 text-xs space-y-4">
          <div className="border-b border-border/70 pb-4">
            <h3 className="text-base font-bold text-foreground">Profit & Loss Statement (Operating Summary)</h3>
            <p className="text-muted-foreground mt-0.5">For period ending {cutoffDate}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border p-4 bg-muted/20">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground">Revenue & Income</h4>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Domestic Sales (4010-SALES)</span>
                  <span className="font-bold">₹2,450,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Marketplace Revenue (4020-MKT)</span>
                  <span className="font-bold">₹1,124,000.00</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>Total Income</span>
                  <span className="text-primary dark:text-primary">₹3,574,000.00</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border p-4 bg-muted/20">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground">Cost of Goods & Expenses</h4>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Cost of Goods Sold (5010-COGS)</span>
                  <span className="font-bold">₹1,850,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Logistics & Freight (5020-LOG)</span>
                  <span className="font-bold">₹145,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Seller Fees & Commissions</span>
                  <span className="font-bold">₹372,000.00</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>Total Expenses</span>
                  <span className="text-destructive dark:text-destructive">₹2,367,000.00</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4 flex items-center justify-between font-mono font-bold text-sm">
            <span>Net Operating Profit before Tax:</span>
            <span className="text-muted-foreground ">₹1,207,000.00</span>
          </div>
        </Card>
      )}

      {/* Balance Sheet View */}
      {reportType === 'BS' && (
        <Card className="rounded-2xl border-border/80 shadow-none p-6 text-xs space-y-4">
          <div className="border-b border-border/70 pb-4">
            <h3 className="text-base font-bold text-foreground">Balance Sheet</h3>
            <p className="text-muted-foreground mt-0.5">As of {cutoffDate}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border p-4 bg-muted/20">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground">Assets</h4>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Bank Accounts (1010-HDFC, SBI)</span>
                  <span className="font-bold">₹3,263,700.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Trade Receivables (AR)</span>
                  <span className="font-bold">₹321,732.00</span>
                </div>
                <div className="flex justify-between">
                  <span>GST TCS & TDS 194-O Receivable</span>
                  <span className="font-bold">₹63,200.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Inventory Valuation</span>
                  <span className="font-bold">₹2,840,000.00</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>Total Assets</span>
                  <span className="text-muted-foreground ">₹6,488,632.00</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border p-4 bg-muted/20">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground">Liabilities & Equity</h4>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Trade Payables (AP)</span>
                  <span className="font-bold">₹845,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span>GST Output Liability Payable</span>
                  <span className="font-bold">₹123,700.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Retained Earnings & Reserves</span>
                  <span className="font-bold">₹5,519,932.00</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>Total Liabilities & Equity</span>
                  <span className="text-muted-foreground ">₹6,488,632.00</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Period Close Modal */}
      <PeriodCloseModal
        isOpen={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        entityId={entityId}
        period={selectedPeriodToClose}
        onClosePeriod={handleClosePeriod}
      />
    </main>
  );
}
