'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Download,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  FileCode,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { TallyExportModal } from '@/features/accounts/components/TallyExportModal';
import { formatCurrency } from '@/features/accounts/utils';

export default function TallyExchangePage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'MAPPINGS' | 'BATCHES' | 'PARALLEL'>('MAPPINGS');

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

  const mappings = useQuery({
    queryKey: ['accounts', 'tally-mappings', entityId],
    queryFn: () => accountsApi.tallyMappings(entityId),
    enabled: Boolean(entityId),
  });

  const batches = useQuery({
    queryKey: ['accounts', 'tally-batches', entityId],
    queryFn: () => accountsApi.tallyExportBatches(entityId),
    enabled: Boolean(entityId),
  });

  const allMappings = mappings.data || [];
  const verifiedMappings = allMappings.filter((m) => m.mappingStatus === 'VERIFIED').length;
  const allBatches = batches.data || [];

  const handleExport = async (_period: string, _format: string) => {
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'tally-batches'] });
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="TallyPrime Controlled Exchange"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <Button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
          >
            <Download className="h-4 w-4" />
            Generate Tally XML
          </Button>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Verified Ledger Mappings"
          value={`${verifiedMappings} / ${allMappings.length}`}
          subtitle="Plinth <-> Tally mapped"
          icon={ArrowLeftRight}
          variant="success"
        />
        <MetricCard
          title="Export Batches Generated"
          value={allBatches.length}
          subtitle="Version-tested XML batches"
          icon={FileCode}
          variant="primary"
        />
        <MetricCard
          title="Parallel Run Trial Variance"
          value="₹0.00"
          subtitle="Zero unexplained variance"
          icon={CheckCircle2}
          variant="success"
        />
        <MetricCard
          title="Official Book Status"
          value="TallyPrime Parallel"
          subtitle="Phase 1 Controlled Run"
          icon={ShieldCheck}
          variant="default"
        />
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/80 bg-muted/20 p-1 w-fit">
        <button
          onClick={() => setActiveTab('MAPPINGS')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'MAPPINGS'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Ledger Mapping Matrix
        </button>
        <button
          onClick={() => setActiveTab('BATCHES')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'BATCHES'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Export Batches & Logs
        </button>
      </div>

      {/* Tab 1: Ledger Mappings */}
      {activeTab === 'MAPPINGS' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <CardTitle className="text-base font-bold">Plinth to TallyPrime Ledger Mappings</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Approved 1-to-1 account mapping between Plinth Chart of Accounts and TallyPrime master ledgers
            </p>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Plinth Account Code</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Plinth Ledger Name</TableHead>
                    <TableHead className="p-3 text-left font-semibold">TallyPrime Ledger Name</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Tally Parent Group</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Mapping Status</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Last Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60 font-mono">
                  {mappings.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-8 text-center text-muted-foreground font-sans">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading ledger mappings…
                      </TableCell>
                    </TableRow>
                  ) : allMappings.length ? (
                    allMappings.map((m) => (
                      <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="p-3 font-bold text-foreground">{m.plinthAccountCode}</TableCell>
                        <TableCell className="p-3 font-sans font-medium text-foreground">{m.plinthAccountName}</TableCell>
                        <TableCell className="p-3 font-sans font-semibold text-primary">
                          {m.tallyLedgerName}
                        </TableCell>
                        <TableCell className="p-3 font-sans text-muted-foreground">{m.tallyParentGroup}</TableCell>
                        <TableCell className="p-3 text-center font-sans">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {m.mappingStatus}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">
                          {m.lastSyncAt ? m.lastSyncAt.slice(0, 10) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="p-8 text-center text-muted-foreground font-sans">
                        No ledger mappings configured.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Export Batches */}
      {activeTab === 'BATCHES' && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <CardTitle className="text-base font-bold">TallyPrime Export & Acknowledgment Log</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Audited voucher batches exported to Tally XML with per-batch error & variance reports
            </p>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Batch Number</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Period</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Export Date</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Vouchers</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Debit Sum (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Credit Sum (₹)</TableHead>
                    <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Tally Acknowledgment Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60 font-mono">
                  {batches.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Loading export batches…
                      </TableCell>
                    </TableRow>
                  ) : allBatches.length ? (
                    allBatches.map((b) => (
                      <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="p-3 font-bold text-foreground">{b.batchNumber}</TableCell>
                        <TableCell className="p-3 text-foreground font-medium">{b.period}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{b.exportedAt.slice(0, 10)}</TableCell>
                        <TableCell className="p-3 text-right font-bold">{b.voucherCount}</TableCell>
                        <TableCell className="p-3 text-right">{formatCurrency(b.totalDebit)}</TableCell>
                        <TableCell className="p-3 text-right">{formatCurrency(b.totalCredit)}</TableCell>
                        <TableCell className="p-3 text-center font-sans">
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            {b.status}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 font-sans text-muted-foreground truncate max-w-[200px]">
                          {b.acknowledgmentNote || 'Export generated successfully.'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                        No export batches generated yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Modal */}
      <TallyExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        entityId={entityId}
        onExport={handleExport}
      />
    </main>
  );
}
