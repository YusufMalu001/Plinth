'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { PageHeader, Button, Card } from '@plinth/ui';
import { jobWorkApi } from '@/features/job-work/api';
import type { JobWorkMaterialIssueDto } from '@plinth/types';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';

export default function ChallanHistoryPage() {
  const searchParams = useSearchParams();
  const vendorId   = searchParams.get('vendorId') ?? '';
  const materialId = searchParams.get('materialId') ?? '';
  const productId  = searchParams.get('productId') ?? '';

  const [challans, setChallans] = useState<JobWorkMaterialIssueDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const loadData = React.useCallback(() => {
    if (!vendorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    jobWorkApi
      .getChallans({ vendorId, limit: 200 })
      .then((res) => {
        const filtered = (res.items || []).filter((ch) => {
          const matMatch = materialId
            ? ch.material?.id === materialId || ch.materialId === materialId
            : true;
          const prodMatch = productId
            ? ch.product?.id === productId || ch.productId === productId
            : true;
          if (!materialId && !productId) return true;
          return materialId ? matMatch : prodMatch;
        });
        filtered.sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
        setChallans(filtered);
      })
      .catch((err) => setError(err?.message ?? 'Failed to load delivery challans.'))
      .finally(() => setLoading(false));
  }, [vendorId, materialId, productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate breakdown of all materials/products dispatched
  const materialSummary = useMemo(() => {
    const map = new Map<string, { name: string; code: string; uom: string; qty: number }>();
    for (const ch of challans) {
      const key = ch.material?.id || ch.product?.id || 'unknown';
      const name = ch.material?.name || ch.product?.name || 'Raw Material';
      const code = ch.material?.code || ch.product?.sku || '—';
      const uom = ch.uom?.symbol || ch.uom?.code || 'Units';
      if (!map.has(key)) {
        map.set(key, { name, code, uom, qty: 0 });
      }
      map.get(key)!.qty += Number(ch.quantity || 0);
    }
    return Array.from(map.values());
  }, [challans]);

  const latestChallan = challans[challans.length - 1];
  const vendorName = latestChallan?.vendor?.name ?? challans[0]?.vendor?.name ?? 'Outsource Vendor';
  const vendorCode = latestChallan?.vendor?.code ?? challans[0]?.vendor?.code ?? '';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          href="/job-work?tab=challans"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft size={13} /> Job Work &amp; Outsourced Processing
        </Link>
        <span className="text-border">/</span>
        <Link href="/job-work?tab=challans" className="hover:text-foreground transition-colors">
          Material Issue Challans
        </Link>
        <span className="text-border">/</span>
        <span className="font-mono font-medium text-foreground">
          {vendorCode || vendorName}
        </span>
      </nav>

      {/* Page Header */}
      <PageHeader
        title="Delivery Challan History"
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
                Issue Material
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

      {/* KPI Metric Summary Cards (3 cards — Dispatched Material card removed because vendor receives multiple materials) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        {/* Card 1: Outsource Partner */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Outsource Consignee
            </span>
            <div className="rounded-xl bg-primary/10 p-2 text-primary border border-primary/20">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-black text-foreground truncate" title={vendorName}>
              {vendorName}
            </div>
            <p className="mt-0.5 text-xs font-mono text-muted-foreground">
              {vendorCode || 'No vendor code'}
            </p>
          </div>
        </Card>

        {/* Card 2: Total Dispatches */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Dispatches
            </span>
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {loading ? '…' : challans.length}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Across {materialSummary.length} item{materialSummary.length === 1 ? '' : 's'}
            </p>
          </div>
        </Card>

        {/* Card 3: Dispatched Materials Breakdown */}
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Dispatched Materials
            </span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {loading ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : materialSummary.length === 0 ? (
              <div className="text-xs text-muted-foreground">None</div>
            ) : (
              materialSummary.map((m, idx) => (
                <div key={idx} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground truncate" title={m.name}>
                    {m.name}
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    +{m.qty.toLocaleString('en-IN', { maximumFractionDigits: 4 })} {m.uom}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Delivery Challans Audit Table */}
      <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              Delivery Challans
            </h2>
          </div>
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {challans.length} record{challans.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-b border-border">
              <tr>
                <th className="p-3.5">#</th>
                <th className="p-3.5">Challan Number</th>
                <th className="p-3.5">Dispatched Material / Item</th>
                <th className="p-3.5">Dispatched Qty</th>
                <th className="p-3.5">Cumulative Total</th>
                <th className="p-3.5">Linked Order</th>
                <th className="p-3.5">Transport &amp; Vehicle</th>
                <th className="p-3.5">Issued At</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    <LoadingState message="Loading delivery challans history..." />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-destructive font-semibold">
                    {error}
                  </td>
                </tr>
              ) : challans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    <EmptyState
                      title="No Delivery Challans Found"
                      description="No material dispatches recorded yet for this vendor."
                    />
                  </td>
                </tr>
              ) : (
                (() => {
                  // Track cumulative running totals per material so multi-material dispatches calculate cleanly
                  const runningPerMaterial = new Map<string, number>();

                  return challans.map((ch, idx) => {
                    const itemKey = ch.material?.id || ch.product?.id || 'unknown';
                    const itemName = ch.material?.name || ch.product?.name || 'Raw Material';
                    const itemCode = ch.material?.code || ch.product?.sku || '—';
                    const rowUom = ch.uom?.symbol || ch.uom?.code || 'Units';
                    const prevRunning = runningPerMaterial.get(itemKey) || 0;
                    const newRunning = prevRunning + Number(ch.quantity || 0);
                    runningPerMaterial.set(itemKey, newRunning);

                    return (
                      <tr key={ch.id} className="hover:bg-muted/30 transition">
                        <td className="p-3.5 text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="p-3.5">
                          <Link
                            href={`/job-work/challans/${ch.id}`}
                            className="font-mono font-bold text-primary hover:underline inline-flex items-center gap-1 group text-xs"
                          >
                            <span>{ch.challanNumber}</span>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          {ch.issuedBy?.name && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              by {ch.issuedBy.name}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 font-medium text-foreground">
                          <div>{itemName}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{itemCode}</div>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-foreground">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{Number(ch.quantity || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}{' '}
                            {rowUom}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-semibold text-foreground">
                          {newRunning.toLocaleString('en-IN', { maximumFractionDigits: 4 })} {rowUom}
                        </td>
                        <td className="p-3.5">
                          {ch.jobWorkOrder?.orderNumber ? (
                            <Link
                              href={`/job-work/${ch.jobWorkOrderId}`}
                              className="font-mono font-bold text-primary hover:underline text-xs"
                            >
                              {ch.jobWorkOrder.orderNumber}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">
                              General Deposit
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-foreground">
                            {ch.vehicleNumber || '—'}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {ch.transporterName || 'Self Transport'}
                          </div>
                        </td>
                        <td className="p-3.5 text-muted-foreground whitespace-nowrap text-xs">
                          {new Date(ch.issuedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                          <span className="text-[11px] text-muted-foreground/60 block font-mono">
                            {new Date(ch.issuedAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <Link href={`/job-work/challans/${ch.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs font-bold text-primary shadow-2xs hover:bg-primary/5"
                            >
                              View Challan
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
            {challans.length > 0 && (
              <tfoot className="border-t border-border bg-muted/40 font-bold">
                <tr>
                  <td colSpan={3} className="p-3.5 text-foreground text-xs uppercase tracking-wider font-extrabold">
                    Total ({challans.length})
                  </td>
                  <td colSpan={2} className="p-3.5 text-xs">
                    <div className="space-y-0.5">
                      {materialSummary.map((m, idx) => (
                        <div key={idx} className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          +{m.qty.toLocaleString('en-IN', { maximumFractionDigits: 4 })} {m.uom} ({m.name})
                        </div>
                      ))}
                    </div>
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
