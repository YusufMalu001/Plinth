"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAbnormalLossQueue } from '@/features/loss-management/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import {
  Button,
  Input,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@plinth/ui';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBadge } from '@/components/StatusBadge';
import { getLossScenarioMeta } from '@/features/loss-management/utils';
import {
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Search,
  RefreshCw,
  Scale,
  Building2,
  Calendar,
  FileSpreadsheet,
  Plus,
  ChevronRight,
  Layers,
  ArrowUpDown,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function AbnormalReviewQueuePage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<'reportedAt' | 'quantity' | 'variance' | 'lossNumber'>('reportedAt');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  const { data: queueData, isLoading, error, refetch } = useAbnormalLossQueue({
    departmentId: departmentFilter || undefined,
  });

  const { data: departmentsData } = useDepartments('ACTIVE');
  const departments = departmentsData?.items ?? [];

  const rawQueueList = useMemo(() => {
    return Array.isArray(queueData) ? queueData : (queueData?.items ?? []);
  }, [queueData]);

  const filteredItems = useMemo(() => {
    return rawQueueList.filter((item) => {
      if (statusFilter && item.status !== statusFilter) {
        return false;
      }
      if (departmentFilter && item.departmentId !== departmentFilter && item.departmentName !== departmentFilter) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      return (
        item.lossNumber.toLowerCase().includes(term) ||
        (item.materialName && item.materialName.toLowerCase().includes(term)) ||
        (item.productName && item.productName.toLowerCase().includes(term)) ||
        (item.itemCode && item.itemCode.toLowerCase().includes(term)) ||
        (item.reason && item.reason.toLowerCase().includes(term)) ||
        (item.departmentName && item.departmentName.toLowerCase().includes(term)) ||
        (item.reportedByActorName && item.reportedByActorName.toLowerCase().includes(term))
      );
    }).sort((a, b) => {
      if (sortField === 'reportedAt') {
        const dateA = new Date(a.reportedAt).getTime();
        const dateB = new Date(b.reportedAt).getTime();
        return sortAsc ? dateA - dateB : dateB - dateA;
      }
      if (sortField === 'quantity') {
        const qtyA = Number(a.quantity || 0);
        const qtyB = Number(b.quantity || 0);
        return sortAsc ? qtyA - qtyB : qtyB - qtyA;
      }
      if (sortField === 'variance') {
        const varA = Number(a.varianceFromExpected || 0);
        const varB = Number(b.varianceFromExpected || 0);
        return sortAsc ? varA - varB : varB - varA;
      }
      return sortAsc
        ? a.lossNumber.localeCompare(b.lossNumber)
        : b.lossNumber.localeCompare(a.lossNumber);
    });
  }, [rawQueueList, statusFilter, departmentFilter, searchTerm, sortField, sortAsc]);

  // Aggregate quantities
  const totalAbnormalQty = useMemo(() => {
    return filteredItems.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
  }, [filteredItems]);

  const inwardCount = useMemo(() => {
    return filteredItems.filter((i) => i.sourceType === 'GRN_DISCREPANCY' || Boolean(i.materialId)).length;
  }, [filteredItems]);

  const shopfloorCount = useMemo(() => {
    return filteredItems.filter((i) => i.sourceType !== 'GRN_DISCREPANCY' && !i.materialId).length;
  }, [filteredItems]);

  // Pagination calculation
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  return (
    <main className="flex-1 overflow-y-auto bg-muted/50 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="mx-auto max-w-[1680px] space-y-5">
        
        {/* ======================================================== */}
        {/* 1. STREAMLINED HEADER BAR WITH CLEAN 1-ROW ACTIONS       */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-border-strong border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link href="/scrap-wastage" className="hover:text-primary transition-colors font-medium">
                Scrap &amp; Wastage
              </Link>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-foreground font-semibold">Abnormal Review Queue</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Abnormal Loss Review &amp; Governance Queue
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-9 px-3 text-xs font-semibold shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
              Live Sync
            </Button>

            <Link href="/scrap-wastage/ledger">
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-semibold shadow-2xs">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Scrap Ledger
              </Button>
            </Link>

            <Link href="/scrap-wastage">
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-semibold shadow-2xs">
                <Scale className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Dashboard
              </Button>
            </Link>

            <Link href="/scrap-wastage/new">
              <Button size="sm" className="h-9 px-3.5 text-xs font-bold shadow-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Report Scrap
              </Button>
            </Link>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. COMPACT 4-CARD SUMMARY STRIP                          */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Abnormal Review
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {filteredItems.length}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Total: {rawQueueList.length}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Excess Scrapped Volume
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {number.format(totalAbnormalQty)}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                units
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Inward &amp; Dock Breaches
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Building2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {inwardCount}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                receiving
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Shopfloor &amp; QA Breaches
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {shopfloorCount}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                operations
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. SEARCH & FILTER TOOLBAR                               */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter by event #, material, reason, actor..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8.5 h-9 text-xs rounded-xl shadow-2xs"
                />
              </div>

              {/* Department Dropdown */}
              <select
                aria-label="Filter by department"
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Manufacturing Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>

              {/* Status Dropdown */}
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Review Statuses</option>
                <option value="REPORTED">REPORTED (Pending)</option>
                <option value="REVIEWED">REVIEWED</option>
                <option value="INVESTIGATED">INVESTIGATED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REPLACED">REPLACED</option>
              </select>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-1.5 h-9">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Sort:</span>
                <select
                  aria-label="Sort queue records"
                  value={sortField}
                  onChange={(e) => {
                    setSortField(e.target.value as 'reportedAt' | 'quantity' | 'variance' | 'lossNumber');
                    setPage(1);
                  }}
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer pr-1"
                >
                  <option value="reportedAt">When Reported</option>
                  <option value="quantity">Scrapped Quantity</option>
                  <option value="variance">Variance % Exceeded</option>
                  <option value="lossNumber">Loss Number</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortAsc(!sortAsc)}
                  className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  title={sortAsc ? 'Ascending' : 'Descending'}
                >
                  <span className="text-[10px] font-mono font-bold">{sortAsc ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. MAIN ABNORMAL REVIEW QUEUE TABLE                      */}
        {/* ======================================================== */}
        <Card className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Loading abnormal review queue...</span>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-xs text-destructive space-y-2">
              <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
              <p>Failed to load abnormal review queue.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
                Retry
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-16 text-center space-y-2.5">
              <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
              <h3 className="text-sm font-bold text-foreground">
                No Abnormal Variances Pending Review
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                All reported loss and wastage events are within approved tolerance thresholds.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 border-border-strong border-border">
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      Event Number
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      Item / Material
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">
                      Scrapped Qty
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      Sourced Tolerance Basis
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      Status
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      Reported By
                    </TableHead>
                    <TableHead className="p-3.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">
                      Review Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((item) => {
                    const scenario = getLossScenarioMeta(item);
                    const reporterName = item.reportedByActorName || (item.reportedByActorId ? `User (${item.reportedByActorId.slice(0, 8)}...)` : 'System');
                    const varianceVal = item.varianceFromExpected !== undefined && item.varianceFromExpected !== null ? Number(item.varianceFromExpected) : null;
                    const ruleLabel = item.appliedWastageRuleCode
                      ? `${item.appliedWastageRuleCode} (v${item.appliedWastageRuleVersion ?? 1})`
                      : item.appliedWastageRuleId
                      ? `Rule ${item.appliedWastageRuleId.slice(0, 8)}... (v${item.appliedWastageRuleVersion ?? 1})`
                      : 'Standard Wastage Rule (v1)';

                    return (
                      <TableRow
                        key={item.id}
                        className="hover:bg-muted/40 transition-colors cursor-pointer group"
                        onClick={() => router.push(`/scrap-wastage/${item.id}`)}
                      >
                        {/* 1. Event Number */}
                        <TableCell className="p-3.5">
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-foreground text-xs group-hover:text-primary transition-colors">
                              {item.lossNumber}
                            </span>
                            <span className="text-[10px] block text-muted-foreground">
                              {scenario.shortLabel}
                            </span>
                          </div>
                        </TableCell>

                        {/* 2. Item / Material */}
                        <TableCell className="p-3.5">
                          <div className="font-bold text-foreground text-xs line-clamp-1">
                            {item.materialName || item.productName || 'Unspecified Item'}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {item.itemCode ? `Code: ${item.itemCode}` : item.departmentName || 'Plant-wide'}
                          </div>
                        </TableCell>

                        {/* 3. Scrapped Qty */}
                        <TableCell className="p-3.5 text-right whitespace-nowrap">
                          <span className="font-mono text-sm font-black text-foreground">
                            {Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground ml-1">
                            {item.uomCode || 'units'}
                          </span>
                        </TableCell>

                        {/* 4. Sourced Tolerance Basis (Consistent, Clean Display) */}
                        <TableCell className="p-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25">
                                <AlertTriangle className="w-3 h-3" />
                                Abnormal Variance
                              </span>
                              {varianceVal !== null && (
                                <span className="font-mono font-bold text-xs text-foreground">
                                  {varianceVal > 0 ? '+' : ''}{varianceVal.toFixed(2)}%
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                              <Scale className="w-3 h-3 text-primary shrink-0" />
                              <span>Sourced via WastageRule: <strong className="text-foreground font-semibold">{ruleLabel}</strong></span>
                            </div>
                          </div>
                        </TableCell>

                        {/* 5. Status */}
                        <TableCell className="p-3.5 whitespace-nowrap">
                          <StatusBadge status={item.status} />
                        </TableCell>

                        {/* 6. Reported By */}
                        <TableCell className="p-3.5 whitespace-nowrap text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {reporterName}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            <span>{format(new Date(item.reportedAt), 'MMM d, yyyy')}</span>
                          </div>
                        </TableCell>

                        {/* 7. Review Action */}
                        <TableCell className="p-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/scrap-wastage/${item.id}`}>
                            <Button size="sm" className="h-8 px-3 text-xs font-semibold gap-1.5 shadow-xs">
                              <span>Review</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Consistent Standard Pagination Controls */}
          {totalItems > 0 && (
            <div className="border-t border-border/80 bg-card">
              <PaginationControls
                page={safePage}
                pageSize={pageSize}
                total={totalItems}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
