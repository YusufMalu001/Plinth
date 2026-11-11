"use client";

import { StockItemName } from '@/features/inventory/components/StockItemName';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useStockLedger } from '../../../../features/inventory/hooks';
import { useProductionPlan } from '../../../../features/production/hooks';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { ForbiddenState } from '../../../../components/ForbiddenState';
import { PaginationControls } from '../../../../components/PaginationControls';
import { FilterPills } from '../../../../components/FilterPills';
import type { StockLedgerEntry, StockLedgerEntryType } from '../../../../features/inventory/api';
import {
  PageHeader,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Dialog,
} from '@plinth/ui';
import {
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  RefreshCw,
  History,
  ChevronDown,
  ChevronRight,
  Boxes,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Truck,
} from 'lucide-react';

const ENTRY_TYPES: { label: string; value: StockLedgerEntryType | '' }[] = [
  { label: 'All Movement Types', value: '' },
  { label: 'GRN Receipt (Inbound)', value: 'GRN_RECEIPT' },
  { label: 'Stock Issue (Production/Outbound)', value: 'ISSUE' },
  { label: 'Adjustment (+ Increase)', value: 'ADJUSTMENT_INCREASE' },
  { label: 'Adjustment (− Decrease)', value: 'ADJUSTMENT_DECREASE' },
  { label: 'Stock Reverted', value: 'STOCK_REVERTED' },
  { label: 'Reversal', value: 'REVERSAL' },
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  GRN_RECEIPT: 'Goods Receipt',
  FG_RECEIPT: '4. FG Deposited into Inventory',
  SFG_DEPOSIT: '2. SFG Deposited to Inventory',
  ASSEMBLY_ISSUE: '3. SFG Pulled for Assembly',
  ISSUE: '1. Stock Issue for Production',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  ADJUSTMENT_INCREASE: 'Adjustment (+)',
  ADJUSTMENT_DECREASE: 'Adjustment (−)',
  STOCK_REVERTED: 'Stock Reverted',
  RETURN_TO_VENDOR: 'Stock Reverted',
  REVERSAL: 'Reversal',
  PRODUCTION_RELEASE: 'Production Release',
  JOB_WORK_ISSUE: 'Job Work Issue (Vendor Custody)',
  JOB_WORK_RETURN: 'Job Work Return (Accepted)',
};

function movementTypeHref(entry: StockLedgerEntry, movementType: string): string | null {
  const sourceType = (entry.sourceType || '').toUpperCase();
  const sourceId = entry.sourceId || null;

  if (sourceType === 'JOB_WORK_CHALLAN' && sourceId) {
    return `/job-work/challans/${sourceId}`;
  }
  if (entry.jobWorkChallan?.id) {
    return `/job-work/challans/${entry.jobWorkChallan.id}`;
  }
  if (entry.note && (entry.note.includes('Delivery Challan JWC-') || entry.note.includes('challan JWC-'))) {
    const challanMatch = entry.note.match(/JWC-[0-9A-Za-z-]+/);
    if (challanMatch?.[0]) return `/job-work/challans/${challanMatch[0]}`;
  }
  if (sourceType === 'JOB_WORK_RETURN') {
    return entry.grnId ? `/receiving/goods-receipts/${entry.grnId}` : '/job-work';
  }
  if (entry.grnId) return `/receiving/goods-receipts/${entry.grnId}`;
  if (entry.adjustmentId || (sourceType === 'STOCK_ADJUSTMENT' && sourceId)) {
    return `/stock/adjustments/${entry.adjustmentId || sourceId}`;
  }
  if (entry.issueId || sourceType === 'STOCK_ISSUE') return '/stock/issues';
  if (sourceType === 'GOODS_RECEIPT' && sourceId) return `/receiving/goods-receipts/${sourceId}`;
  if (movementType === 'ADJUSTMENT' || movementType.startsWith('ADJUSTMENT_')) return '/stock/adjustments';
  if (movementType === 'ISSUE') return '/stock/issues';
  if (movementType === 'GRN_RECEIPT') return '/receiving/goods-receipts';
  return null;
}

export interface GroupedLedgerRow {
  id: string;
  isProductionRelease: boolean;
  isAssemblyRelease?: boolean;
  productionPlanId?: string | null;
  productionPlanNumber?: string | null;
  productionPlanStatus?: string | null;
  assemblyBatchId?: string | null;
  assemblyBatchNumber?: string | null;
  assemblyBatchStatus?: string | null;
  productName?: string | null;
  productSku?: string | null;
  batchIdentity?: string | null;
  postedAt: string;
  postedByActorName?: string | null;
  movementType: string;
  materials: StockLedgerEntry[];
  totalDelta: number;
  entry: StockLedgerEntry;
}

function ProductionDetailsModal({
  planId,
  productionTitle,
  materials,
  onClose,
}: {
  planId?: string | null;
  productionTitle: string;
  materials: StockLedgerEntry[];
  onClose: () => void;
}) {
  const { data: plan } = useProductionPlan(planId || '');

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Production Stock Release Details"
      description={`Bill of Materials & Raw Material Disbursements for ${productionTitle}`}
      className="max-w-4xl max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-6 pt-2">
        {/* Production Overview Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/70 text-xs">
          <div>
            <span className="text-muted-foreground block">Production Plan</span>
            <span className="font-mono font-semibold text-foreground text-sm">
              {plan?.planNumber || (planId ? `PLAN-${planId.slice(0, 8)}` : 'General Production Issue')}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Target Product</span>
            <span className="font-medium text-foreground text-sm truncate block">
              {plan?.product?.sku ? `[${plan.product.sku}] ${plan.product.name}` : productionTitle}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Batch Identity</span>
            <span className="font-mono font-medium text-foreground text-sm">
              {plan?.batchIdentity || 'Standard Batch'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Materials Released</span>
            <span className="font-bold text-primary text-sm">
              {materials.length} Items Issued
            </span>
          </div>
        </div>

        {/* BOM Requirements vs Issued Section if plan is loaded */}
        {plan && plan.bomVersion?.lines && plan.bomVersion.lines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Standard Bill of Materials (BOM: {plan.bomVersion.bomNumber})</span>
            </div>
            <div className="rounded-lg border border-border/80 overflow-hidden text-xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-12 text-center">Seq</TableHead>
                    <TableHead>Component / Material</TableHead>
                    <TableHead className="text-right">BOM Std Qty</TableHead>
                    <TableHead className="text-right">Issued Qty</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.bomVersion.lines.map((line, idx) => {
                    const matchedLedger = materials.find((m) =>
                      m.materialId === line.materialId ||
                      (line.material?.code && m.material?.code === line.material.code) ||
                      (m.note && m.note.includes(line.material?.code || ''))
                    );
                    const issuedQty = matchedLedger
                      ? Math.abs(Number(matchedLedger.quantityDelta ?? matchedLedger.quantity ?? 0))
                      : 0;

                    return (
                      <TableRow key={line.id || idx}>
                        <TableCell className="text-center font-mono text-muted-foreground">
                          {line.sequence ?? idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {line.material?.name || line.componentProduct?.name || line.note || 'Component Item'}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {line.material?.code || line.componentProduct?.sku || '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {Number(line.quantity).toLocaleString()} {line.uom?.symbol || ''}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-foreground">
                          {issuedQty > 0 ? `${issuedQty.toLocaleString()} ${line.uom?.symbol || ''}` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {issuedQty > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Issued
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Pending</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Complete Materials Issued Ledger Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Boxes className="h-3.5 w-3.5 text-primary" />
              <span>All Stock Ledger Movement Lines Issued ({materials.length})</span>
            </div>
            {planId && (
              <Link
                href={`/manufacturing/execution`}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>Open Workstation</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead>Material / Component</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">Issued Delta</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                  <TableHead>Movement Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((mat) => {
                  const isProd = Boolean(mat.product);
                  const code = isProd ? mat.product?.sku : mat.material?.code || '—';
                  const name = isProd ? mat.product?.name : mat.material?.name || 'Raw Material';
                  const delta = Number(mat.quantityDelta ?? mat.quantity ?? 0);
                  const before = mat.quantityBefore !== null && mat.quantityBefore !== undefined ? Number(mat.quantityBefore) : null;
                  const after = mat.quantityAfter !== null && mat.quantityAfter !== undefined ? Number(mat.quantityAfter) : null;
                  const uom = mat.uom?.code || mat.uom?.symbol || '';

                  return (
                    <TableRow key={mat.id} className="text-xs hover:bg-muted/30">
                      <TableCell>
                        <div className="font-mono font-medium text-foreground flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <span>{code}</span>
                        </div>
                        <div className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                          <StockItemName name={name} item={mat.product || mat.material} context={mat.note} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {before !== null ? `${before.toLocaleString()} ${uom}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-foreground">
                        {delta !== 0 ? (delta > 0 ? `+${delta.toLocaleString()}` : `${delta.toLocaleString()}`) : '—'} {uom}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-foreground">
                        {after !== null ? `${after.toLocaleString()} ${uom}` : '—'}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground max-w-[180px] truncate">
                        {mat.note || 'Production material issue line'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export default function StockLedgerPage() {
  const [search, setSearch] = useState('');
  const [entryType, setEntryType] = useState<StockLedgerEntryType | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [activeModalRow, setActiveModalRow] = useState<GroupedLedgerRow | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useStockLedger({
    entryType: entryType || undefined,
    limit: 500,
  });

  useEffect(() => {
    setPage(1);
  }, [search, entryType]);

  const toggleRowExpanded = (rowId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const rawItems = data?.items ?? [];

  // Group raw production issue items and assembly issue items into consolidated rows
  const groupedRows: GroupedLedgerRow[] = useMemo(() => {
    const rows: GroupedLedgerRow[] = [];
    const prodIssueGroups = new Map<string, StockLedgerEntry[]>();
    const assemblyIssueGroups = new Map<string, StockLedgerEntry[]>();

    for (const entry of rawItems) {
      const isIssue = (entry.movementType || entry.entryType) === 'ISSUE' || (entry.movementType || entry.entryType) === 'RELEASE';
      const isAssemblyIssue =
        entry.sourceType === 'ASSEMBLY_BATCH' ||
        entry.sourceType === 'ASSEMBLY_ISSUE' ||
        Boolean(entry.assemblyBatch) ||
        (entry.note && entry.note.toLowerCase().includes('assembly'));

      const isProductionIssue =
        isIssue &&
        !isAssemblyIssue &&
        (entry.sourceType === 'PRODUCTION' ||
          entry.sourceType === 'PRODUCTION_MATERIAL_ISSUE' ||
          entry.sourceType === 'PRODUCTION_PLAN' ||
          Boolean(entry.productionPlan) ||
          (entry.note && (entry.note.toLowerCase().includes('production') || entry.note.toLowerCase().includes('plan-'))));

      if (isAssemblyIssue && isIssue) {
        // Form a grouping key based on assembly batch ID or number
        const batchKey =
          entry.assemblyBatch?.id ||
          entry.sourceId ||
          entry.correlationId ||
          entry.note?.match(/ASY-[\w-]+/i)?.[0] ||
          entry.id;

        const current = assemblyIssueGroups.get(batchKey) ?? [];
        current.push(entry);
        assemblyIssueGroups.set(batchKey, current);
      } else if (isProductionIssue) {
        // Form a grouping key based on production plan ID, issue ID, or correlation ID
        const planKey =
          entry.productionPlan?.id ||
          entry.correlationId ||
          entry.sourceId ||
          entry.issueId ||
          entry.note?.match(/PLAN-[\w-]+/i)?.[0] ||
          entry.id;

        const current = prodIssueGroups.get(planKey) ?? [];
        current.push(entry);
        prodIssueGroups.set(planKey, current);
      } else {
        // Normal single row
        const delta = Number(entry.quantityDelta ?? entry.quantity ?? 0);
        rows.push({
          id: entry.id,
          isProductionRelease: false,
          isAssemblyRelease: false,
          postedAt: entry.postedAt,
          postedByActorName: entry.postedByActor?.name || entry.postedByActor?.email || entry.postedBy || null,
          movementType: entry.movementType || entry.entryType || 'UNKNOWN',
          materials: [entry],
          totalDelta: delta,
          entry,
        });
      }
    }

    // Convert grouped production issues into consolidated parent rows
    for (const [key, entries] of prodIssueGroups.entries()) {
      const first = entries[0];
      const plan = first.productionPlan;
      const totalDelta = entries.reduce((sum, e) => sum + Number(e.quantityDelta ?? e.quantity ?? 0), 0);
      const planNumber = plan?.planNumber || first.note?.match(/PLAN-[\w-]+/i)?.[0] || `PLAN-${key.slice(0, 8)}`;
      const prodName = plan?.product?.name || first.product?.name || null;
      const prodSku = plan?.product?.sku || first.product?.sku || null;

      rows.push({
        id: `prod-group-${key}`,
        isProductionRelease: true,
        isAssemblyRelease: false,
        productionPlanId: plan?.id || first.correlationId || (first.sourceType === 'PRODUCTION_PLAN' ? first.sourceId : null),
        productionPlanNumber: planNumber,
        productionPlanStatus: plan?.status || 'IN_PROGRESS',
        productName: prodName,
        productSku: prodSku,
        batchIdentity: plan?.batchIdentity || null,
        postedAt: first.postedAt,
        postedByActorName: first.postedByActor?.name || first.postedByActor?.email || first.postedBy || null,
        movementType: 'ISSUE',
        materials: entries,
        totalDelta,
        entry: first,
      });
    }

    // Convert grouped assembly issues into consolidated parent rows
    for (const [key, entries] of assemblyIssueGroups.entries()) {
      const first = entries[0];
      const batch = first.assemblyBatch;
      const totalDelta = entries.reduce((sum, e) => sum + Number(e.quantityDelta ?? e.quantity ?? 0), 0);
      const batchNumber = batch?.batchNumber || first.note?.match(/ASY-[\w-]+/i)?.[0] || `ASY-${key.slice(0, 8)}`;
      const prodName = batch?.product?.name || first.productionPlan?.product?.name || first.product?.name || 'Finished Product Assembly';
      const prodSku = batch?.product?.sku || first.productionPlan?.product?.sku || first.product?.sku || null;

      rows.push({
        id: `assembly-group-${key}`,
        isProductionRelease: false,
        isAssemblyRelease: true,
        assemblyBatchId: batch?.id || first.sourceId,
        assemblyBatchNumber: batchNumber,
        assemblyBatchStatus: batch?.status || 'IN_ASSEMBLY',
        productName: prodName,
        productSku: prodSku,
        postedAt: first.postedAt,
        postedByActorName: first.postedByActor?.name || first.postedByActor?.email || first.postedBy || null,
        movementType: 'ASSEMBLY_ISSUE',
        materials: entries,
        totalDelta,
        entry: first,
      });
    }

    // Sort by postedAt descending
    return rows.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }, [rawItems]);

  const filteredItems = useMemo(() => {
    return groupedRows.filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      if (row.isProductionRelease) {
        const prodMatch = `${row.productionPlanNumber ?? ''} ${row.productSku ?? ''} ${row.productName ?? ''} ${row.batchIdentity ?? ''}`.toLowerCase();
        const matMatch = row.materials.some((m) =>
          `${m.material?.code ?? ''} ${m.material?.name ?? ''} ${m.note ?? ''}`.toLowerCase().includes(q)
        );
        return prodMatch.includes(q) || matMatch;
      }
      if (row.isAssemblyRelease) {
        const asyMatch = `${row.assemblyBatchNumber ?? ''} ${row.productSku ?? ''} ${row.productName ?? ''}`.toLowerCase();
        const compMatch = row.materials.some((m) =>
          `${m.material?.code ?? ''} ${m.material?.name ?? ''} ${m.product?.sku ?? ''} ${m.product?.name ?? ''} ${m.note ?? ''}`.toLowerCase().includes(q)
        );
        return asyMatch.includes(q) || compMatch;
      }
      const entry = row.entry;
      const itemStr = `${entry.product?.sku ?? ''} ${entry.product?.name ?? ''} ${entry.material?.code ?? ''} ${entry.material?.name ?? ''}`.toLowerCase();
      const planStr = `${entry.productionPlan?.planNumber ?? ''} ${entry.productionPlan?.product?.name ?? ''} ${entry.productionPlan?.product?.sku ?? ''}`.toLowerCase();
      const batchStr = `${entry.assemblyBatch?.batchNumber ?? ''} ${entry.assemblyBatch?.product?.name ?? ''} ${entry.assemblyBatch?.product?.sku ?? ''}`.toLowerCase();
      const fgStr = `${entry.fgReceipt?.receiptNumber ?? ''} ${entry.fgReceipt?.product?.name ?? ''} ${entry.fgReceipt?.product?.sku ?? ''}`.toLowerCase();
      const jwStr = `${entry.jobWorkChallan?.challanNumber ?? ''} ${entry.jobWorkChallan?.vendor?.name ?? ''} ${entry.jobWorkChallan?.vendor?.code ?? ''} ${entry.jobWorkChallan?.jobWorkOrder?.orderNumber ?? ''} ${entry.jobWorkReturn?.returnNumber ?? ''}`.toLowerCase();
      const sourceStr = `${entry.grnId ?? ''} ${entry.adjustmentId ?? ''} ${entry.issueId ?? ''} ${entry.transferId ?? ''} ${entry.sourceId ?? ''} ${entry.sourceType ?? ''} ${entry.note ?? ''}`.toLowerCase();
      return itemStr.includes(q) || planStr.includes(q) || batchStr.includes(q) || fgStr.includes(q) || jwStr.includes(q) || sourceStr.includes(q);
    });
  }, [groupedRows, search]);

  if (isLoading) return <LoadingState message="Loading movements ledger..." />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return <ForbiddenState />;
    return <ErrorState error={error as Error} retry={refetch} />;
  }

  // Metric cards — use real movement type values stored in the modern ledger
  const totalEntries = data?.total ?? rawItems.length;
  const inboundCount = rawItems.filter((e) => {
    const t = (e as any).movementType || e.entryType;
    return t === 'RECEIPT' || t === 'GRN_RECEIPT';
  }).length;
  const outboundCount = rawItems.filter((e) => {
    const t = (e as any).movementType || e.entryType;
    return t === 'ISSUE' || t === 'RESERVATION' || t === 'RELEASE';
  }).length;
  const transferCount = rawItems.filter((e) => {
    const t = (e as any).movementType || e.entryType;
    return t === 'TRANSFER_OUT' || t === 'TRANSFER_IN';
  }).length;
  const adjustmentCount = rawItems.filter((e) => {
    const t = (e as any).movementType || e.entryType;
    return t === 'ADJUSTMENT' || t === 'ADJUSTMENT_INCREASE' || t === 'ADJUSTMENT_DECREASE';
  }).length;

  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex-1 p-6 lg:p-8 overflow-y-auto bg-muted/20 w-full">
      <div className="w-full space-y-6">

        {/* Page Header */}
        <PageHeader
          title="Stock Movements & Ledger"
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="gap-2 rounded-full shadow-xs"
              >
                <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* Metric Cards Ribbon */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Journal Entries</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {totalEntries.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inbound Receipts</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-primary font-mono">
              {inboundCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop Floor Issues</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground font-mono">
              {outboundCount.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfers & Adjustments</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-primary font-mono">
              {(adjustmentCount + transferCount).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search ledger by item name, Production Plan, GRN #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterPills
              label="Movement:"
              options={ENTRY_TYPES.map((t) => ({
                label: t.label,
                value: t.value,
              }))}
              value={entryType}
              onChange={(val) => setEntryType(val as StockLedgerEntryType | '')}
              size="sm"
            />
          </div>
        </div>

        {/* Standard @plinth/ui Table Card */}
        <Card className="shadow-xs overflow-hidden border border-border/80">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No Ledger Entries Found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search || entryType
                  ? 'No movements match your filter query.'
                  : 'Ledger records will appear automatically as inventory operations are performed.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">Date &amp; Time</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Movement Type</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="text-right">Total Balance</TableHead>
                    <TableHead>Posted By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((row) => {
                    const isExpanded = Boolean(expandedRows[row.id]);

                    if (row.isProductionRelease) {
                      // Consolidated Production Stock Release Row
                      const matCount = row.materials.length;

                      return (
                        <React.Fragment key={row.id}>
                          <TableRow
                            onClick={() => setActiveModalRow(row)}
                            className="hover:bg-muted/50 cursor-pointer bg-muted/20 border-l-4 border-l-primary transition-colors"
                          >
                            {/* Timestamp */}
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => toggleRowExpanded(row.id, e)}
                                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title={isExpanded ? "Collapse materials" : "Expand materials breakdown"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-primary" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                  )}
                                </button>
                                <span>{row.postedAt ? new Date(row.postedAt).toLocaleString('en-IN') : '—'}</span>
                              </div>
                            </TableCell>

                            {/* Production item name */}
                            <TableCell>
                              <span className="font-medium text-foreground text-sm">
                                {row.productName || 'Production Stock Release'}
                              </span>
                            </TableCell>

                            {/* Movement Type Badge */}
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                                <Boxes className="h-3 w-3" />
                                <span>1. Stock Issue for Production ({matCount} Materials)</span>
                              </span>
                            </TableCell>

                            {/* Before */}
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              —
                            </TableCell>

                            {/* Delta */}
                            <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                              {row.totalDelta !== 0 ? `${row.totalDelta.toLocaleString()} items` : `${matCount} materials`}
                            </TableCell>

                            {/* After */}
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              —
                            </TableCell>


                            {/* Posted By */}
                            <TableCell className="text-xs text-muted-foreground">
                              {row.postedByActorName || 'Production Dispatch'}
                            </TableCell>
                          </TableRow>

                          {/* Inline Expandable Row showing all issued BOM materials */}
                          {isExpanded && (
                            <TableRow className="bg-muted/15 border-b border-border/80">
                              <TableCell colSpan={7} className="p-0">
                                <div className="p-4 pl-12 pr-6 space-y-3 bg-muted/10 border-l-4 border-l-primary/50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Layers className="h-4 w-4 text-primary" />
                                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                        Materials Issued Under {row.productionPlanNumber}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        ({row.materials.length} components)
                                      </span>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setActiveModalRow(row)}
                                      className="h-7 text-xs gap-1.5"
                                    >
                                      <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                                      <span>Full BOM Breakdown</span>
                                    </Button>
                                  </div>

                                  <div className="rounded-lg border border-border/80 bg-card overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/30 text-xs">
                                          <TableHead>Material Code</TableHead>
                                          <TableHead>Material Name</TableHead>
                                          <TableHead className="text-right">Before</TableHead>
                                          <TableHead className="text-right">Issued Qty</TableHead>
                                          <TableHead className="text-right">After</TableHead>
                                          <TableHead>Note / Reason</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.materials.map((mat) => {
                                          const isProd = Boolean(mat.product);
                                          const code = isProd ? mat.product?.sku : mat.material?.code || '—';
                                          const name = isProd ? mat.product?.name : mat.material?.name || 'Item';
                                          const delta = Number(mat.quantityDelta ?? mat.quantity ?? 0);
                                          const before = mat.quantityBefore !== null && mat.quantityBefore !== undefined ? Number(mat.quantityBefore) : null;
                                          const after = mat.quantityAfter !== null && mat.quantityAfter !== undefined ? Number(mat.quantityAfter) : null;
                                          const uom = mat.uom?.code || mat.uom?.symbol || '';

                                          return (
                                            <TableRow key={mat.id} className="text-xs hover:bg-muted/20">
                                              <TableCell className="font-mono font-medium text-foreground">
                                                {code}
                                              </TableCell>
                                              <TableCell className="text-muted-foreground">
                                                <StockItemName name={name} item={mat.product || mat.material} context={mat.note} />
                                              </TableCell>
                                              <TableCell className="text-right font-mono text-muted-foreground">
                                                {before !== null ? `${before.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-right font-mono font-bold text-foreground">
                                                {delta !== 0 ? `${delta.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-right font-mono font-semibold text-foreground">
                                                {after !== null ? `${after.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                                                {mat.note || 'BOM raw material issue'}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    }

                    if (row.isAssemblyRelease) {
                      // Consolidated Assembly Pull Row (Stage 3)
                      const compCount = row.materials.length;

                      return (
                        <React.Fragment key={row.id}>
                          <TableRow
                            onClick={() => setActiveModalRow(row)}
                            className="hover:bg-muted/50 cursor-pointer bg-muted/20 border-l-4 border-l-primary transition-colors"
                          >
                            {/* Timestamp */}
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => toggleRowExpanded(row.id, e)}
                                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title={isExpanded ? "Collapse components" : "Expand components breakdown"}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-primary" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-primary" />
                                  )}
                                </button>
                                <span>{row.postedAt ? new Date(row.postedAt).toLocaleString('en-IN') : '—'}</span>
                              </div>
                            </TableCell>

                            {/* Assembly item name */}
                            <TableCell>
                              <span className="font-medium text-foreground text-sm">
                                {row.productName || 'Assembly Component Pull'}
                              </span>
                            </TableCell>

                            {/* Movement Type Badge */}
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                                <ArrowUpFromLine className="h-3 w-3" />
                                <span>3. SFG Pulled for Assembly ({compCount} Components)</span>
                              </span>
                            </TableCell>

                            {/* Before */}
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              —
                            </TableCell>

                            {/* Delta */}
                            <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                              {row.totalDelta !== 0 ? `${row.totalDelta.toLocaleString()} items` : `${compCount} components`}
                            </TableCell>

                            {/* After */}
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              —
                            </TableCell>


                            {/* Posted By */}
                            <TableCell className="text-xs text-muted-foreground">
                              {row.postedByActorName || 'Assembly Line Supervisor'}
                            </TableCell>
                          </TableRow>

                          {/* Inline Expandable Row showing all pulled components */}
                          {isExpanded && (
                            <TableRow className="bg-muted/15 border-b border-border/80">
                              <TableCell colSpan={7} className="p-0">
                                <div className="p-4 pl-12 pr-6 space-y-3 bg-muted/10 border-l-4 border-l-primary/50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Boxes className="h-4 w-4 text-primary" />
                                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                        Components Pulled for {row.assemblyBatchNumber} ({row.productSku || row.productName})
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        ({row.materials.length} components)
                                      </span>
                                    </div>
                                    <Link
                                      href={`/assembly`}
                                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                                    >
                                      <span>Open Assembly Batch</span>
                                      <ExternalLink className="h-3 w-3" />
                                    </Link>
                                  </div>

                                  <div className="rounded-lg border border-border/80 bg-card overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/30 text-xs">
                                          <TableHead>Component Code</TableHead>
                                          <TableHead>Component Name</TableHead>
                                          <TableHead className="text-right">Before</TableHead>
                                          <TableHead className="text-right">Pulled Qty</TableHead>
                                          <TableHead className="text-right">After</TableHead>
                                          <TableHead>Movement Note</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.materials.map((mat) => {
                                          const isProd = Boolean(mat.product);
                                          const code = isProd ? mat.product?.sku : mat.material?.code || '—';
                                          const name = isProd ? mat.product?.name : mat.material?.name || 'Component';
                                          const delta = Number(mat.quantityDelta ?? mat.quantity ?? 0);
                                          const before = mat.quantityBefore !== null && mat.quantityBefore !== undefined ? Number(mat.quantityBefore) : null;
                                          const after = mat.quantityAfter !== null && mat.quantityAfter !== undefined ? Number(mat.quantityAfter) : null;
                                          const uom = mat.uom?.code || mat.uom?.symbol || '';

                                          return (
                                            <TableRow key={mat.id} className="text-xs hover:bg-muted/20">
                                              <TableCell className="font-mono font-medium text-foreground">
                                                {code}
                                              </TableCell>
                                              <TableCell className="text-muted-foreground">
                                                <StockItemName name={name} item={mat.product || mat.material} context={mat.note} />
                                              </TableCell>
                                              <TableCell className="text-right font-mono text-muted-foreground">
                                                {before !== null ? `${before.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-right font-mono font-bold text-foreground">
                                                {delta !== 0 ? `${delta.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-right font-mono font-semibold text-foreground">
                                                {after !== null ? `${after.toLocaleString()} ${uom}` : '—'}
                                              </TableCell>
                                              <TableCell className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                                                {mat.note || 'Assembly batch component pull'}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    }

                    // Standard Individual Movement Row
                    const entry = row.entry;
                    let movementType = entry.movementType || entry.entryType || 'UNKNOWN';

                    // Contextual movement classification for the 4 official lifecycle stages:
                    const noteLower = (entry.note || '').toLowerCase();
                    const srcType = (entry.sourceType || '').toUpperCase();
                    if (
                      srcType === 'FG_RECEIPT' ||
                      noteLower.includes('fg receipt') ||
                      noteLower.includes('finished good') ||
                      noteLower.includes('finished goods') ||
                      (entry.product && movementType === 'GRN_RECEIPT' && !entry.grnId && !noteLower.includes('semi-finished'))
                    ) {
                      movementType = 'FG_RECEIPT';
                    } else if (
                      srcType === 'PRODUCTION_BATCH_COMPLETION' ||
                      (srcType === 'PRODUCTION_PLAN' && (movementType === 'RECEIPT' || movementType === 'GRN_RECEIPT')) ||
                      noteLower.includes('semi-finished') ||
                      noteLower.includes('sfg') ||
                      noteLower.includes('stage completion') ||
                      noteLower.includes('wip')
                    ) {
                      movementType = 'SFG_DEPOSIT';
                    } else if (
                      srcType === 'ASSEMBLY_BATCH' ||
                      noteLower.includes('assembly') ||
                      noteLower.includes('kit') ||
                      entry.materialIssueLineId
                    ) {
                      movementType = 'ASSEMBLY_ISSUE';
                    } else if (
                      srcType === 'JOB_WORK_CHALLAN' ||
                      Boolean(entry.jobWorkChallan) ||
                      (noteLower.includes('job work') && (noteLower.includes('issue') || noteLower.includes('challan') || noteLower.includes('vendor')))
                    ) {
                      movementType = 'JOB_WORK_ISSUE';
                    } else if (
                      srcType === 'JOB_WORK_RETURN' ||
                      Boolean(entry.jobWorkReturn) ||
                      (noteLower.includes('job work') && noteLower.includes('return'))
                    ) {
                      movementType = 'JOB_WORK_RETURN';
                    }

                    const isProduct = Boolean(entry.product);
                    const name = isProduct ? entry.product?.name : entry.material?.name || 'Item';
                    const delta = Number(entry.quantityDelta ?? entry.quantity ?? 0);
                    const isPositive = delta > 0;
                    const totalBefore = entry.totalBalanceBefore != null ? Number(entry.totalBalanceBefore) : (entry.quantityBefore != null ? Number(entry.quantityBefore) : null);
                    const totalAfter = entry.totalBalanceAfter != null ? Number(entry.totalBalanceAfter) : (entry.quantityAfter != null ? Number(entry.quantityAfter) : null);
                    const movementHref = movementTypeHref(entry, movementType);

                    return (
                      <TableRow key={entry.id} className="hover:bg-muted/40">
                        {/* Timestamp */}
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {entry.postedAt ? new Date(entry.postedAt).toLocaleString('en-IN') : '—'}
                        </TableCell>

                        {/* Item name */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-medium text-foreground text-sm"><StockItemName name={name} item={entry.product || entry.material} context={entry.note} /></span>
                            {entry.note && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[340px]" title={entry.note}>
                                {entry.note}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {/* Movement Type */}
                        <TableCell>
                          {movementHref ? (
                            <Link
                              href={movementHref}
                              title="Open movement record"
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-shadow hover:ring-2 ${
                                movementType === 'JOB_WORK_ISSUE'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:ring-amber-500/20'
                                  : 'bg-primary/10 text-primary border border-primary/20 hover:ring-primary/20'
                              }`}
                            >
                              {movementType === 'JOB_WORK_ISSUE' ? (
                                <Truck className="h-3 w-3" />
                              ) : isPositive ? (
                                <ArrowDownToLine className="h-3 w-3" />
                              ) : (
                                <ArrowUpFromLine className="h-3 w-3" />
                              )}
                              <span>{ENTRY_TYPE_LABELS[movementType] || movementType}</span>
                            </Link>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                movementType === 'JOB_WORK_ISSUE'
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                  : 'bg-primary/10 text-primary border border-primary/20'
                              }`}
                            >
                              {movementType === 'JOB_WORK_ISSUE' ? (
                                <Truck className="h-3 w-3" />
                              ) : isPositive ? (
                                <ArrowDownToLine className="h-3 w-3" />
                              ) : (
                                <ArrowUpFromLine className="h-3 w-3" />
                              )}
                              <span>{ENTRY_TYPE_LABELS[movementType] || movementType}</span>
                            </span>
                          )}
                        </TableCell>

                        {/* Before */}
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {totalBefore !== null ? totalBefore.toLocaleString() : '—'}
                        </TableCell>

                        {/* Delta */}
                        <TableCell className="text-right font-mono font-bold text-sm text-foreground">
                          {isPositive ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                        </TableCell>

                        {/* Total Balance */}
                        <TableCell className="text-right font-mono font-semibold text-foreground text-sm">
                          {totalAfter !== null ? totalAfter.toLocaleString() : '—'}
                        </TableCell>

                        {/* User / Actor */}
                        <TableCell className="text-xs text-muted-foreground">
                          {row.postedByActorName || 'System Auto-Post'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="p-4 border-t border-border/80 bg-card">
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={filteredItems.length}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
            />
          </div>
        </Card>

        {/* Modal Dialog for Production Release Details */}
        {activeModalRow && (
          <ProductionDetailsModal
            planId={activeModalRow.productionPlanId}
            productionTitle={activeModalRow.productionPlanNumber || activeModalRow.productName || 'Production Stock Release'}
            materials={activeModalRow.materials}
            onClose={() => setActiveModalRow(null)}
          />
        )}

      </div>
    </div>
  );
}
