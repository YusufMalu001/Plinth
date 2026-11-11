'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Layers,
  Plus,
  Send,
  Truck,
  RotateCcw,
  Scale
} from 'lucide-react';
import { PageHeader, Button, Card } from '@plinth/ui';
import { jobWorkApi } from '@/features/job-work/api';
import type { JobWorkCustodyLedgerDto, VendorCustodyBalanceDto } from '@plinth/types';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';

export default function VendorCustodyLedgerDetailPage() {
  const searchParams = useSearchParams();
  const vendorId = searchParams.get('vendorId') ?? '';

  const [entries, setEntries] = useState<JobWorkCustodyLedgerDto[]>([]);
  const [balance, setBalance] = useState<VendorCustodyBalanceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    if (!vendorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ledgerRes, balancesRes] = await Promise.all([
        jobWorkApi.getCustodyLedger({ vendorId, limit: 200 }),
        jobWorkApi.getVendorCustodyBalances(vendorId)
      ]);
      setEntries(ledgerRes.items || []);
      setBalance(balancesRes?.[0] || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load vendor custody ledger.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const vendorName = balance?.vendorName || entries[0]?.vendor?.name || 'Outsource Vendor';
  const vendorCode = balance?.vendorCode || entries[0]?.vendor?.code || '';
  const uom = balance?.uomSymbol || balance?.uomCode || entries[0]?.uom?.symbol || 'Units';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/job-work?tab=balances"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft size={13} /> Job Work &amp; Outsourced Processing
        </Link>
        <span className="text-border">/</span>
        <Link href="/job-work?tab=balances" className="hover:text-foreground transition-colors">
          Vendor-Held Custody Ledger
        </Link>
        <span className="text-border">/</span>
        <span className="font-mono font-medium text-foreground">
          {vendorCode || vendorName}
        </span>
      </nav>

      {/* Page Header */}
      <PageHeader
        title={`${vendorName} — Custody Ledger`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="font-semibold gap-1.5 border-border bg-background shadow-xs text-foreground text-xs"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href={`/job-work/challans/new?vendorId=${vendorId}`}>
              <Button
                variant="outline"
                size="sm"
                className="font-semibold gap-1.5 border-border bg-background shadow-xs text-foreground text-xs"
              >
                <Send className="h-3.5 w-3.5 text-primary" />
                Issue More Material
              </Button>
            </Link>
            <Link href="/job-work/new">
              <Button
                size="sm"
                className="font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                New Order
              </Button>
            </Link>
          </div>
        }
      />

      {/* 4-Card Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {/* Card 1: Total Issued */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Issued
            </span>
            <div className="rounded-xl bg-primary/10 p-2 text-primary border border-primary/20">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground font-mono">
              {loading ? '…' : Number(balance?.totalIssued || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
              <span className="text-xs font-bold text-muted-foreground ml-1.5 font-sans">
                {uom}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dispatched under Rule 55 challans
            </p>
          </div>
        </Card>

        {/* Card 2: Allocated to JWs */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Allocated to JWs
            </span>
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {loading ? '…' : Number(balance?.totalAllocated || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
              <span className="text-xs font-bold text-muted-foreground ml-1.5 font-sans">
                {uom}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reserved for active processing orders
            </p>
          </div>
        </Card>

        {/* Card 3: Consumed in Output */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Consumed in Output
            </span>
            <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Scale className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              {loading ? '…' : Number(balance?.totalConsumed || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
              <span className="text-xs font-bold text-muted-foreground ml-1.5 font-sans">
                {uom}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Consumed across returned batches
            </p>
          </div>
        </Card>

        {/* Card 4: Current Net Custody Balance */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Current Vendor Balance
            </span>
            <div className={`rounded-xl p-2 border ${
              (balance?.currentBalance ?? 0) >= 0
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
            }`}>
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-black font-mono ${
              (balance?.currentBalance ?? 0) >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600'
            }`}>
              {loading ? '…' : Number(balance?.currentBalance || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
              <span className="text-xs font-bold text-muted-foreground ml-1.5 font-sans">
                {uom}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Physical material currently in custody
            </p>
          </div>
        </Card>
      </div>

      {/* Custody Movement Entries Table */}
      <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Custody Movements</h2>
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {entries.length} record{entries.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-b border-border">
              <tr>
                <th className="p-3.5">Entry #</th>
                <th className="p-3.5">Item</th>
                <th className="p-3.5">Reference / Source</th>
                <th className="p-3.5">Event</th>
                <th className="p-3.5">Movement Qty</th>
                <th className="p-3.5">Running Custody Balance</th>
                <th className="p-3.5">Date / Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <LoadingState message="Loading custody ledger entries..." />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-destructive font-semibold">
                    {error}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <EmptyState
                      title="No Custody Entries"
                      description="No custody ledger transactions recorded yet for this vendor."
                    />
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isIssue = entry.entryType === 'RAW_MATERIAL_ISSUE';
                  const isReturn = entry.entryType === 'RETURN_PROCESSING';
                  const isAlloc = entry.entryType === 'PO_DEPOSIT_DEDUCTION';
                  const eventColor = isIssue
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : isReturn
                    ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : isAlloc
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-muted-foreground bg-muted/50 border-border';

                  const refNode = (() => {
                    if (entry.materialIssue?.challanNumber) {
                      return (
                        <div className="space-y-0.5">
                          <Link
                            href={`/job-work/challans/${entry.materialIssueId}`}
                            className="font-mono font-bold text-primary hover:underline text-xs flex items-center gap-1 group"
                          >
                            <span>{entry.materialIssue.challanNumber}</span>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          {entry.jobWorkOrder?.orderNumber && (
                            <Link
                              href={`/job-work/${entry.jobWorkOrderId}`}
                              className="font-mono text-muted-foreground hover:text-primary hover:underline text-[10px] block"
                            >
                              {entry.jobWorkOrder.orderNumber}
                            </Link>
                          )}
                        </div>
                      );
                    }
                    if (entry.jobWorkOrder?.orderNumber) {
                      return (
                        <Link
                          href={`/job-work/${entry.jobWorkOrderId}`}
                          className="font-mono font-bold text-primary hover:underline text-xs flex items-center gap-1 group"
                        >
                          <span>{entry.jobWorkOrder.orderNumber}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      );
                    }
                    return <span className="text-muted-foreground italic text-[11px]">General Deposit</span>;
                  })();

                  const rowUom = entry.uom?.symbol || entry.uom?.code || '';

                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition">
                      <td className="p-3.5 font-mono font-bold text-foreground text-xs">
                        {entry.entryNumber}
                      </td>
                      <td className="p-3.5 text-foreground font-medium">
                        <div>{entry.material?.name || entry.product?.name || entry.product?.sku}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {entry.material?.code || entry.product?.sku}
                        </div>
                      </td>
                      <td className="p-3.5">{refNode}</td>
                      <td className="p-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${eventColor}`}>
                          {entry.entryType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className={`font-black ${entry.direction === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {entry.direction === 'IN' ? '+' : '-'}{Number(entry.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {rowUom}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-black text-foreground">
                        {Number(entry.runningBalance).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {rowUom}
                      </td>
                      <td className="p-3.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                        <span className="text-[11px] text-muted-foreground/60 block font-mono">
                          {new Date(entry.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
