'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  RotateCcw,
  Plus,
  Send,
  Search,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Building2,
  ChevronRight
} from 'lucide-react';
import { PageHeader, Button, Card, Dialog } from '@plinth/ui';
import {
  useJobWorkOrders,
  useVendorCustodyBalances,
  useJobWorkAnalytics,
  useCustodyLedger,
  useJobWorkChallans
} from '@/features/job-work/hooks';
import { jobWorkApi } from '@/features/job-work/api';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { showToast } from '@/components/toast-store';

export default function JobWorkDashboardPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'orders' | 'challans' | 'balances' | 'ledger' | 'analytics'>(() => {
    const t = searchParams.get('tab');
    if (t === 'challans' || t === 'balances' || t === 'ledger' || t === 'analytics') return t;
    return 'orders';
  });
  const [search, setSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>(undefined);

  const { orders, total: totalOrders, loading: ordersLoading, refresh: refreshOrders } = useJobWorkOrders({
    search: search || undefined,
    vendorId: selectedVendorId
  });

  const { balances, loading: balancesLoading } = useVendorCustodyBalances(selectedVendorId);
  const { analytics, loading: analyticsLoading } = useJobWorkAnalytics();
  const { ledgerEntries, loading: ledgerLoading } = useCustodyLedger({
    vendorId: selectedVendorId
  });

  const { challans, loading: challansLoading } = useJobWorkChallans({
    vendorId: selectedVendorId
  });
  // Group challans strictly by vendor — one generic ledger entry per vendor
  const vendorChallanGroups = useMemo(() => {
    const groups = new Map<string, typeof challans>();
    for (const ch of challans) {
      const key = ch.vendorId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ch);
    }
    return Array.from(groups.entries()).map(([vendorId, group]) => {
      const latest = group.reduce((a, b) =>
        new Date(a.issuedAt) >= new Date(b.issuedAt) ? a : b
      );
      // Collect unique materials/products dispatched to this vendor
      const itemMap = new Map<string, { name: string; code: string; uom: string; qty: number }>();
      for (const ch of group) {
        const itemKey = ch.material?.id || ch.product?.id || 'unknown';
        const name = ch.material?.name || ch.product?.name || 'Raw Material';
        const code = ch.material?.code || ch.product?.sku || '—';
        const uom = ch.uom?.symbol || ch.uom?.code || 'Units';
        if (!itemMap.has(itemKey)) {
          itemMap.set(itemKey, { name, code, uom, qty: 0 });
        }
        itemMap.get(itemKey)!.qty += Number(ch.quantity || 0);
      }
      const items = Array.from(itemMap.values());
      return { vendorId, latest, group, items };
    });
  }, [challans]);

  // AI Scoring state for Outsourcing Partners
  const [scoringReport, setScoringReport] = useState<any | null>(null);
  const [scoringLoading, setScoringLoading] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any | null>(null);

  const fetchScoring = React.useCallback(async () => {
    try {
      setScoringLoading(true);
      const res = await jobWorkApi.getVendorScoring(selectedVendorId);
      setScoringReport(res?.data || res);
    } catch {
      // Fallback
    } finally {
      setScoringLoading(false);
    }
  }, [selectedVendorId]);

  React.useEffect(() => {
    fetchScoring();
  }, [fetchScoring]);

  const handleRecalculateScores = async () => {
    try {
      showToast({
        kind: 'info',
        title: 'Evaluating Job Work Partners',
        message: 'AI is scoring outsourcing partners on scrap yield, custody accuracy, and turnaround...',
      });
      await fetchScoring();
      showToast({
        kind: 'success',
        title: 'Scores Updated',
        message: 'Outsourcing Vendor Evaluation refreshed successfully.',
      });
    } catch {
      showToast({
        kind: 'error',
        title: 'Scoring Error',
        message: 'Unable to refresh AI vendor scorecards.',
      });
    }
  };

  const scoringMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (scoringReport?.evaluations) {
      scoringReport.evaluations.forEach((ev: any) => map.set(ev.vendorId, ev));
    }
    return map;
  }, [scoringReport]);


  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner & Actions with Standard Hierarchy */}
      <PageHeader
        title="Job Work & Outsourced Processing"
        description="Live vendor-held material custody ledger, outsourced processing orders, and delivery challans."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/job-work/challans/new">
              <Button
                variant="outline"
                size="sm"
                className="font-semibold gap-2 border-border bg-background shadow-xs text-foreground"
              >
                <Send className="h-4 w-4 text-primary" />
                Issue Material (Challan)
              </Button>
            </Link>
            <Link href="/receiving/goods-receipts/new">
              <Button
                variant="outline"
                size="sm"
                className="font-semibold gap-2 border-border bg-background shadow-xs text-foreground"
              >
                <RotateCcw className="h-4 w-4 text-tone-green-text" />
                Receive Goods (Normal GRN)
              </Button>
            </Link>
            <Link href="/job-work/new">
              <Button
                size="sm"
                className="font-bold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                <Plus className="h-4 w-4" />
                New Job Work Order
              </Button>
            </Link>
          </div>
        }
      />

      {/* Analytics KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Live Custody Stock</span>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {analyticsLoading ? '...' : `${analytics?.totalCustodyStockTons ?? 0} MT / Units`}
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Orders</span>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {analyticsLoading ? '...' : analytics?.activeOrders ?? 0}
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Allocated to JWs</span>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {analyticsLoading ? '...' : `${analytics?.totalAllocatedTons ?? 0} MT`}
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Shortage Debit Notes</span>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {analyticsLoading ? '...' : analytics?.openDebitNotesCount ?? 0}
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-border-strong border-border">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 text-xs font-bold border-border-strong-2 transition ${
            activeTab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Job Work Orders ({totalOrders})
        </button>
        <button
          onClick={() => setActiveTab('challans')}
          className={`px-4 py-2.5 text-xs font-bold border-border-strong-2 transition ${
            activeTab === 'challans'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Material Issue Challans ({challansLoading ? '…' : vendorChallanGroups.length})
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2.5 text-xs font-bold border-border-strong-2 transition ${
            activeTab === 'balances'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Vendor-Held Custody Ledger
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2.5 text-xs font-bold border-border-strong-2 transition ${
            activeTab === 'ledger'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Material Movement Audit Trail
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 text-xs font-bold border-border-strong-2 transition ${
            activeTab === 'analytics'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Vendor Performance & Scrap Yield
        </button>
      </div>

      {/* Tab 1: Orders List */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
              <input
                type="text"
                placeholder="Search orders, vendor, processing..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-background pl-10 pr-3.5 py-2 text-xs font-semibold text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {balances && balances.length > 0 && (
              <select
                value={selectedVendorId || ''}
                onChange={(e) => setSelectedVendorId(e.target.value || undefined)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">All Outsource Vendors</option>
                {Array.from(new Set(balances.map((b) => JSON.stringify({ id: b.vendorId, name: b.vendorName }))))
                  .map((str) => JSON.parse(str))
                  .map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-border-strong border-border">
                  <tr>
                    <th className="p-3.5">Order Number</th>
                    <th className="p-3.5">Vendor / Partner</th>
                    <th className="p-3.5">Nature of Processing</th>
                    <th className="p-3.5">Deposit Allocation</th>
                    <th className="p-3.5">Target Output</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ordersLoading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        <LoadingState message="Loading job work orders..." />
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        <EmptyState
                          title="No Job Work Orders"
                          description="Get started by creating an outsourcing order or issuing raw material."
                        />
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/30 transition">
                        <td className="p-3.5 font-mono font-bold text-primary">
                          <Link
                            href={`/job-work/${order.id}`}
                            className="hover:underline flex items-center gap-1.5 group"
                          >
                            <span>{order.orderNumber}</span>
                          </Link>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-foreground">{order.vendor?.name}</div>
                          <div className="text-[11px] text-muted-foreground">{order.vendor?.code}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-foreground">
                            {order.natureOfProcessing || 'General Processing'}
                          </div>
                          {order.product && (
                            <div className="text-[11px] text-muted-foreground">SKU: {order.product.sku}</div>
                          )}
                        </td>
                        <td className="p-3.5 font-bold text-foreground">
                          {order.rawMaterialInputQty} MT / Units
                        </td>
                        <td className="p-3.5 font-bold text-foreground">
                          {order.targetQuantity} {order.targetUom?.symbol || 'Units'}
                        </td>
                        <td className="p-3.5">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          {order.status === 'DRAFT' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await jobWorkApi.approveOrder(order.id);
                                refreshOrders();
                              }}
                              className="text-xs text-tone-green-text border-tone-green-solid/25 hover:bg-tone-green-bg font-bold"
                            >
                              Approve
                            </Button>
                          )}
                          {order.status !== 'CLOSED' && order.status !== 'DRAFT' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await jobWorkApi.closeOrder(order.id);
                                refreshOrders();
                              }}
                              className="text-xs font-bold"
                            >
                              Close
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {/* Tab: Material Issue Challans Ledger */}
      {activeTab === 'challans' && (
        <div className="space-y-4">

          {challansLoading ? (
            <Card className="p-12 text-center text-muted-foreground border-border bg-card shadow-xs rounded-2xl">
              <LoadingState message="Loading delivery challans..." />
            </Card>
          ) : challans.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground border-border bg-card shadow-xs rounded-2xl">
              <EmptyState
                title="No Material Issue Challans"
                description="No delivery challans have been issued yet. Click 'Issue Material (Challan)' to dispatch materials to vendor custody."
              />
            </Card>
          ) : (
            <div className="space-y-3.5">
              {vendorChallanGroups.map(({ vendorId, latest, group, items }) => {
                const historyHref = `/job-work/challans/history?vendorId=${vendorId}`;
                const orders = group
                  .filter((c) => c.jobWorkOrder?.orderNumber)
                  .reduce((acc, c) => {
                    if (!acc.find((o) => o.id === c.jobWorkOrderId)) {
                      acc.push({ id: c.jobWorkOrderId!, num: c.jobWorkOrder!.orderNumber });
                    }
                    return acc;
                  }, [] as { id: string; num: string }[]);

                const dateDisplay = group.length > 1 ? (() => {
                  const sorted = [...group].sort(
                    (a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
                  );
                  const fmt = (d: string) =>
                    new Date(d).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });
                  return `${fmt(sorted[0].issuedAt)} → ${fmt(sorted[sorted.length - 1].issuedAt)}`;
                })() : new Date(latest.issuedAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                });

                return (
                  <Card
                    key={vendorId}
                    className="p-5 sm:p-6 border-border bg-card hover:border-primary/40 hover:shadow-xs transition-all rounded-2xl"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Col 1-5: Vendor Identity (Fixed 5 cols on desktop) */}
                      <div className="md:col-span-5 flex items-center gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <Link
                            href={historyHref}
                            className="text-sm sm:text-base font-extrabold text-foreground hover:text-primary transition tracking-tight truncate block"
                            title={latest.vendor?.name}
                          >
                            {latest.vendor?.name}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono text-[11px]">{latest.vendor?.code}</span>
                            <span className="text-border">·</span>
                            <span className="text-[11px]">
                              {group.length} challan{group.length === 1 ? '' : 's'} across {items.length} material{items.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Col 6-7: Linked Orders (Fixed 2 cols on desktop) */}
                      <div className="md:col-span-2 space-y-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          Linked Order(s)
                        </span>
                        <div className="min-w-0">
                          {orders.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {orders.map((o) => (
                                <Link
                                  key={o.id}
                                  href={`/job-work/${o.id}`}
                                  className="font-mono font-bold text-primary hover:underline bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 text-xs transition"
                                >
                                  {o.num}
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic font-medium text-xs">General Deposit</span>
                          )}
                        </div>
                      </div>

                      {/* Col 8-10: Dispatch Timeline (Fixed 3 cols on desktop) */}
                      <div className="md:col-span-3 space-y-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          Dispatch Timeline
                        </span>
                        <div className="text-muted-foreground font-medium text-xs truncate" title={dateDisplay}>
                          {dateDisplay}
                        </div>
                      </div>

                      {/* Col 11-12: Action Button (Fixed 2 cols on desktop, aligned right) */}
                      <div className="md:col-span-2 flex items-center justify-end">
                        <Link href={historyHref}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-bold text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-2xs group"
                          >
                            <span>View Material Issues</span>
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Live Vendor Custody Balance */}
      {activeTab === 'balances' && (
        <div className="space-y-4">

          {balancesLoading ? (
            <Card className="p-12 text-center text-muted-foreground border-border bg-card shadow-xs rounded-2xl">
              <LoadingState message="Loading custody balances..." />
            </Card>
          ) : balances.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground border-border bg-card shadow-xs rounded-2xl">
              <EmptyState
                title="No Vendor-Held Balances"
                description="Issue material via Delivery Challan to build vendor deposit balance."
              />
            </Card>
          ) : (
            <div className="space-y-3.5">
              {balances.map((item, idx) => {
                const uom = item.uomSymbol || item.uomCode || '';
                const custodyHref = `/job-work/custody?vendorId=${item.vendorId}`;
                const matSubtitle = item.materials && item.materials.length > 1
                  ? `${item.materials.length} materials in custody`
                  : (item.materialName || item.productName || 'Raw Material');

                return (
                  <Card
                    key={item.vendorId || idx}
                    className="p-5 sm:p-6 border-border bg-card hover:border-primary/40 hover:shadow-xs transition-all rounded-2xl"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Col 1-5: Vendor Identity */}
                      <div className="md:col-span-5 flex items-center gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <Link
                            href={custodyHref}
                            className="text-sm sm:text-base font-extrabold text-foreground hover:text-primary transition tracking-tight truncate block"
                            title={item.vendorName}
                          >
                            {item.vendorName}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono text-[11px]">{item.vendorCode}</span>
                            <span className="text-border">·</span>
                            <span className="text-[11px] truncate max-w-[220px]" title={matSubtitle}>
                              {matSubtitle}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Col 6-7: Total Issued */}
                      <div className="md:col-span-2 space-y-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          Total Issued
                        </span>
                        <div className="font-mono font-bold text-foreground text-xs">
                          {Number(item.totalIssued).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {uom}
                        </div>
                      </div>

                      {/* Col 8-10: Current Balance */}
                      <div className="md:col-span-3 space-y-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          Current Balance
                        </span>
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-black border ${
                            item.currentBalance >= 0
                              ? 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25'
                              : 'bg-tone-red-bg text-tone-red-text border-tone-red-solid/25'
                          }`}>
                            {Number(item.currentBalance).toLocaleString('en-IN', { maximumFractionDigits: 4 })} {uom}
                          </span>
                        </div>
                      </div>

                      {/* Col 11-12: Actions */}
                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Link href={custodyHref}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-bold text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-2xs group"
                          >
                            <span>View Ledger</span>
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Material Movement Audit Trail */}
      {activeTab === 'ledger' && (
        <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-border-strong border-border">
                <tr>
                  <th className="p-3.5">Entry #</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">Item</th>
                  <th className="p-3.5">Reference / Source</th>
                  <th className="p-3.5">Event</th>
                  <th className="p-3.5">Movement Qty</th>
                  <th className="p-3.5">Running Custody Balance</th>
                  <th className="p-3.5">Date / Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledgerLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <LoadingState message="Loading custody audit ledger..." />
                    </td>
                  </tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <EmptyState title="No Movement Entries" description="All material transactions will be recorded here." />
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map((entry) => {
                    const isIssue = entry.entryType === 'RAW_MATERIAL_ISSUE';
                    const isReturn = entry.entryType === 'RETURN_PROCESSING';
                    const isAlloc = entry.entryType === 'PO_DEPOSIT_DEDUCTION';
                    const eventColor = isIssue
                      ? 'text-tone-green-text bg-tone-green-bg border-tone-green-solid/25'
                      : isReturn
                      ? 'text-tone-red-text bg-tone-red-bg border-tone-red-solid/25'
                      : isAlloc
                      ? 'text-tone-amber-text bg-tone-amber-bg border-tone-amber-solid/25'
                      : 'text-muted-foreground bg-muted/50 border-border';

                    // Build reference cell: challan link (issue) or order link (if linked)
                    const refNode = (() => {
                      if (entry.materialIssue?.challanNumber) {
                        return (
                          <div className="space-y-0.5">
                            <Link
                              href={`/job-work/challans/${entry.materialIssueId}`}
                              className="font-mono font-bold text-primary hover:underline text-xs block"
                            >
                              {entry.materialIssue.challanNumber}
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
                            className="font-mono font-bold text-primary hover:underline text-xs"
                          >
                            {entry.jobWorkOrder.orderNumber}
                          </Link>
                        );
                      }
                      return <span className="text-muted-foreground italic text-[11px]">General Deposit</span>;
                    })();

                    return (
                      <tr key={entry.id} className="hover:bg-muted/30 transition">
                        <td className="p-3.5 font-mono font-bold text-foreground text-xs">{entry.entryNumber}</td>
                        <td className="p-3.5">
                          <div className="font-semibold text-foreground">{entry.vendor?.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{entry.vendor?.code}</div>
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
                        <td className="p-3.5">
                          <span className={`font-black ${entry.direction === 'IN' ? 'text-tone-green-text' : 'text-tone-red-text'}`}>
                            {entry.direction === 'IN' ? '+' : '-'}{entry.quantity} {entry.uom?.symbol || ''}
                          </span>
                        </td>
                        <td className="p-3.5 font-black text-foreground">
                          {entry.runningBalance} {entry.uom?.symbol || ''}
                        </td>
                        <td className="p-3.5 text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 4: Vendor Performance Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-4 w-full">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRecalculateScores}
              disabled={scoringLoading}
              className="gap-2 border-border text-foreground hover:bg-muted text-xs font-semibold shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
              {scoringLoading ? 'Evaluating...' : 'Recalculate Vendor Scores'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <Card className="p-5 border-border bg-card shadow-xs rounded-2xl space-y-4">
              <h3 className="text-sm font-extrabold text-foreground">
                Vendor Quality & Scrap Yield Performance
              </h3>
              <div className="space-y-3">
                {analytics?.vendorPerformance.map((v) => {
                  const ev = scoringMap.get(v.vendorId);
                  return (
                    <div key={v.vendorId} className="p-3.5 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground">{v.vendorName}</span>
                        <div className="flex items-center gap-2">
                          {ev && (
                            <button
                              type="button"
                              onClick={() => setSelectedEvaluation(ev)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-border bg-muted/60 text-foreground hover:bg-muted transition cursor-pointer"
                              title="View Vendor Scorecard"
                            >
                              <Sparkles className="w-3 h-3 text-muted-foreground" />
                              {ev.score !== null ? `${ev.score}/100` : 'N/A'}
                            </button>
                          )}
                          <span className="text-xs font-bold text-muted-foreground">{v.ordersCount} Orders</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Total Issued:</span>
                          <div className="font-bold text-foreground">{v.totalIssued} MT</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Returned:</span>
                          <div className="font-bold text-foreground">{v.totalReturned} MT</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Scrap Rate:</span>
                          <div className="font-bold text-foreground">{v.scrapYieldPercent}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 border-border bg-card shadow-xs rounded-2xl space-y-4">
              <h3 className="text-sm font-extrabold text-foreground">
                Shortage & Discrepancy Reconciliation Rates
              </h3>
              <div className="space-y-3">
                {analytics?.vendorPerformance.map((v) => {
                  const ev = scoringMap.get(v.vendorId);
                  return (
                    <div key={v.vendorId} className="p-3.5 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-foreground">{v.vendorName}</span>
                        <div className="flex items-center gap-2">
                          {ev && (
                            <button
                              type="button"
                              onClick={() => setSelectedEvaluation(ev)}
                              className="text-[11px] font-semibold text-foreground hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              AI Audit
                            </button>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            v.shortageRatePercent > 5
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : 'bg-muted text-foreground border-border'
                          }`}>
                            {v.shortageRatePercent}% Shortage Rate
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className={`h-full ${v.shortageRatePercent > 5 ? 'bg-destructive' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, (100 - v.shortageRatePercent))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                        <span>Fulfillment Accuracy: {(100 - v.shortageRatePercent).toFixed(1)}%</span>
                        <span>Total Shortage: {v.totalIssued - v.totalReturned > 0 ? (v.totalIssued - v.totalReturned).toFixed(1) : 0} MT</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Vendor Scorecard Dialog for Outsourcing Partner */}
      {selectedEvaluation && (
        <Dialog
          open={Boolean(selectedEvaluation)}
          onClose={() => setSelectedEvaluation(null)}
          title={`Outsourcing Scorecard: ${selectedEvaluation.vendorName}`}
          className="max-w-2xl"
        >
          <div className="space-y-4 text-xs font-manrope">
            {/* Top Banner Ribbon */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Outsourcing Reliability Score
                </span>
                <div className="text-2xl font-black text-foreground mt-0.5 flex items-center gap-2">
                  <span>{selectedEvaluation.score !== null ? `${selectedEvaluation.score}/100` : 'N/A'}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Partner Classification
                </span>
                <span className="font-extrabold text-xs text-primary font-mono uppercase tracking-wider">
                  {selectedEvaluation.reliabilityRating}
                </span>
              </div>
            </div>

            {/* Sub-score KPI Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Scrap Yield Score
                </span>
                <div className="text-base font-black text-foreground mt-0.5">
                  {selectedEvaluation.scrapYieldScore ?? 85}%
                </div>
                <span className="text-[10px] text-muted-foreground">Raw material conversion</span>
              </div>

              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Quality Pass Rate
                </span>
                <div className="text-base font-black text-foreground mt-0.5">
                  {selectedEvaluation.qualityScore}%
                </div>
                <span className="text-[10px] text-muted-foreground">Return goods accepted</span>
              </div>

              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Custody Accuracy
                </span>
                <div className="text-base font-black text-foreground mt-0.5">
                  {selectedEvaluation.discrepancyScore}%
                </div>
                <span className="text-[10px] text-muted-foreground">Discrepancy & shortage</span>
              </div>

              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Punctuality
                </span>
                <div className="text-base font-black text-foreground mt-0.5">
                  {selectedEvaluation.punctualityScore}%
                </div>
                <span className="text-[10px] text-muted-foreground">Challan fulfillment</span>
              </div>
            </div>

            {/* AI Analytical Summary */}
            {selectedEvaluation.summary && (
              <div className="space-y-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                  Outsource Intelligence Audit
                </span>
                <p className="p-3 rounded-xl bg-muted/40 border border-border text-foreground leading-relaxed text-xs">
                  {selectedEvaluation.summary}
                </p>
              </div>
            )}

            {/* Strengths & Growth Areas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedEvaluation.strengths && selectedEvaluation.strengths.length > 0 && (
                <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
                  <span className="font-bold text-foreground text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" /> Partner Strengths
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                    {selectedEvaluation.strengths.map((str: string, idx: number) => (
                      <li key={idx}>{str}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedEvaluation.areasForImprovement && selectedEvaluation.areasForImprovement.length > 0 && (
                <div className="p-3.5 rounded-xl bg-card border border-border space-y-1.5">
                  <span className="font-bold text-foreground text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" /> Yield & Custody Concerns
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                    {selectedEvaluation.areasForImprovement.map((imp: string, idx: number) => (
                      <li key={idx}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actionable Strategic Recommendation */}
            {selectedEvaluation.recommendation && (
              <div className="p-3.5 rounded-xl bg-card border border-border space-y-1">
                <span className="font-bold text-foreground text-[11px] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" /> Outsourcing Allocation Guidance
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  {selectedEvaluation.recommendation}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedEvaluation(null)}
                className="text-xs"
              >
                Close Audit
              </Button>
            </div>
          </div>
        </Dialog>
      )}

    </div>
  );
}
