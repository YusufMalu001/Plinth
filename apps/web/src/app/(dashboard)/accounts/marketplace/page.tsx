'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Store,
  UploadCloud,
  RefreshCw,
  TrendingUp,
  Percent,
  Landmark,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { MarketplaceReconModal } from '@/features/accounts/components/MarketplaceReconModal';
import { formatCurrency } from '@/features/accounts/utils';

export default function MarketplaceReconPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const batches = useQuery({
    queryKey: ['accounts', 'marketplace-batches', entityId],
    queryFn: () => accountsApi.marketplaceBatches(entityId),
    enabled: Boolean(entityId),
  });

  const allBatches = batches.data || [];
  const filtered = allBatches.filter((b) => !channelFilter || b.channel === channelFilter);

  const totalGross = allBatches.reduce((sum, b) => sum + parseFloat(b.grossAmount || '0'), 0);
  const totalTcs = allBatches.reduce((sum, b) => sum + parseFloat(b.tcsAmount || '0'), 0);
  const totalTds = allBatches.reduce((sum, b) => sum + parseFloat(b.tdsAmount || '0'), 0);
  const totalPayout = allBatches.reduce((sum, b) => sum + parseFloat(b.netPayout || '0'), 0);

  const handleUploadBatch = async (batchData: any) => {
    await accountsApi.recordMarketplaceSettlement(batchData);
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'marketplace-batches'] });
  };

  const matchBatch = async (id: string) => {
    const bankReference = window.prompt('Enter the matched bank statement reference:');
    if (!bankReference?.trim()) return;
    await accountsApi.matchMarketplaceSettlement(id, bankReference.trim());
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'marketplace-batches'] });
  };
  const postBatch = async (id: string) => {
    await accountsApi.postMarketplaceSettlement(id);
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'marketplace-batches'] });
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Marketplace Accounting & MTR Reconciliation"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
          >
            <UploadCloud className="h-4 w-4" />
            Upload Channel File
          </Button>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Gross Channel Sales"
          value={formatCurrency(totalGross)}
          subtitle="All marketplace dispatches"
          icon={Store}
          variant="default"
        />
        <MetricCard
          title="GST TCS Receivable"
          value={formatCurrency(totalTcs)}
          subtitle="1% GST TCS (Ledger: 1080-TCS)"
          icon={Percent}
          variant="primary"
        />
        <MetricCard
          title="Income Tax TDS u/s 194-O"
          value={formatCurrency(totalTds)}
          subtitle="1% Section 194-O (Ledger: 1090-TDS)"
          icon={Landmark}
          variant="success"
        />
        <MetricCard
          title="Net Bank Payouts Realized"
          value={formatCurrency(totalPayout)}
          subtitle="Settlement clearing net sum"
          icon={TrendingUp}
          variant="default"
        />
      </div>

      {/* Batches Table */}
      <Card className="rounded-2xl border-border/80 shadow-none">
        <CardHeader className="border-border-strong border-border/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">Marketplace Ingestion Batches</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Channel report batches, raw hash verifications, and settlement variance analysis
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <select
                aria-label="Filter by Channel"
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
              >
                <option value="">All Channels</option>
                <option value="AMAZON">Amazon</option>
                <option value="E_TRADE">E-Trade</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="p-3 text-left font-semibold">Channel</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Report Type</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Period</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Source File Name</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Total Rows</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Gross Sales (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">TCS (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">TDS 194-O (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Net Payout (₹)</TableHead>
                  <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60 font-mono">
                {batches.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="p-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading marketplace batches…
                    </TableCell>
                  </TableRow>
                ) : filtered.length ? (
                  filtered.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="p-3 font-sans font-bold text-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground">
                          {b.channel}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 font-sans text-muted-foreground">{b.reportType}</TableCell>
                      <TableCell className="p-3 text-foreground font-bold">{b.period}</TableCell>
                      <TableCell className="p-3 text-muted-foreground truncate max-w-[150px]">{b.fileName}</TableCell>
                      <TableCell className="p-3 text-right text-muted-foreground">
                        {b.matchedRows} / {b.totalRows}
                        {b.varianceRows > 0 && (
                          <span className="ml-1 text-tone-amber-text font-bold">
                            ({b.varianceRows} var)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">{formatCurrency(b.grossAmount)}</TableCell>
                      <TableCell className="p-3 text-right text-primary">
                        {formatCurrency(b.tcsAmount)}
                      </TableCell>
                      <TableCell className="p-3 text-right text-tone-green-text">
                        {formatCurrency(b.tdsAmount)}
                      </TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">{formatCurrency(b.netPayout)}</TableCell>
                      <TableCell className="p-3 text-center font-sans">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            b.status === 'RECONCILED' || b.status === 'COMPLETED'
                              ? 'bg-muted text-foreground'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 text-right font-sans">
                        {b.status === 'PROCESSING' && <Button variant="outline" size="sm" className="mr-1 h-7 text-xs" onClick={() => void matchBatch(b.id)}>Match bank</Button>}
                        {b.status === 'RECONCILED' && <Button variant="outline" size="sm" className="mr-1 h-7 text-xs" onClick={() => void postBatch(b.id)}>Post</Button>}
                        <span className="text-xs text-muted-foreground">{(b as any).bankReference || '—'}</span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="p-8 text-center text-muted-foreground font-sans">
                      No marketplace report batches uploaded for this company.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Settlement Entry */}
      <MarketplaceReconModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entityId={entityId}
        onUploadBatch={handleUploadBatch}
      />
    </main>
  );
}
