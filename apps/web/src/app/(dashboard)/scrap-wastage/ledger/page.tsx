"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLossEvents, useLossAnalytics } from '@/features/loss-management/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import {
  LossEventDto,
  LossEventStatus,
  LossClassification,
  LossSourceType,
} from '@plinth/types';
import {
  Button,
  Input,
  Dialog,
  Card,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@plinth/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ToleranceBasisBadge } from '@/features/loss-management/components/ToleranceBasisBadge';
import { getLossScenarioMeta } from '@/features/loss-management/utils';
import {
  Trash2,
  Search,
  RefreshCw,
  Plus,
  Package,
  Building2,
  Calendar,
  Layers,
  ArrowUpDown,
  FileCheck2,
  AlertTriangle,
  FileSpreadsheet,
  ExternalLink,
  ChevronRight,
  Truck,
  Cog,
  ShieldAlert,
  RotateCcw,
  LayoutGrid,
  List,
  Eye,
  Scale,
  ShieldCheck,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { format } from 'date-fns';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function ScrapWastageLedgerPage() {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<LossEventStatus | ''>('');
  const [scenarioFilter, setScenarioFilter] = useState<string>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<LossSourceType | ''>('');
  const [classificationFilter, setClassificationFilter] = useState<LossClassification | ''>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'MATERIAL' | 'PRODUCT'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [sortField, setSortField] = useState<'reportedAt' | 'quantity' | 'lossNumber' | 'department'>('reportedAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LossEventDto | null>(null);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  const { data: eventsData, isLoading, error, refetch } = useLossEvents({
    status: statusFilter || undefined,
    classification: classificationFilter || undefined,
    sourceType: sourceTypeFilter || undefined,
    departmentId: departmentFilter || undefined,
  });

  const { data: analytics } = useLossAnalytics();
  const { data: departmentsData } = useDepartments('ACTIVE');
  const departments = departmentsData?.items ?? [];

  const rawEventsList = useMemo(() => {
    return Array.isArray(eventsData) ? eventsData : (eventsData?.items ?? []);
  }, [eventsData]);

  const filteredEvents = useMemo(() => {
    return rawEventsList.filter((entry) => {
      const scenario = getLossScenarioMeta(entry);

      if (scenarioFilter !== 'ALL' && scenario.number !== scenarioFilter) {
        return false;
      }

      if (itemTypeFilter === 'MATERIAL' && !entry.materialId) {
        return false;
      }
      if (itemTypeFilter === 'PRODUCT' && !entry.productId) {
        return false;
      }

      if (departmentFilter && entry.departmentId !== departmentFilter && entry.departmentName !== departmentFilter) {
        return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();

      return (
        entry.lossNumber.toLowerCase().includes(term) ||
        (entry.materialName && entry.materialName.toLowerCase().includes(term)) ||
        (entry.productName && entry.productName.toLowerCase().includes(term)) ||
        (entry.itemCode && entry.itemCode.toLowerCase().includes(term)) ||
        (entry.reason && entry.reason.toLowerCase().includes(term)) ||
        (entry.departmentName && entry.departmentName.toLowerCase().includes(term)) ||
        (entry.locationName && entry.locationName.toLowerCase().includes(term)) ||
        (entry.reportedByActorName && entry.reportedByActorName.toLowerCase().includes(term)) ||
        scenario.label.toLowerCase().includes(term)
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
      if (sortField === 'department') {
        const dA = a.departmentName || '';
        const dB = b.departmentName || '';
        return sortAsc ? dA.localeCompare(dB) : dB.localeCompare(dA);
      }
      return sortAsc
        ? a.lossNumber.localeCompare(b.lossNumber)
        : b.lossNumber.localeCompare(a.lossNumber);
    });
  }, [rawEventsList, scenarioFilter, itemTypeFilter, departmentFilter, searchTerm, sortField, sortAsc]);

  // Aggregate quantities
  const totalScrapQty = useMemo(() => {
    return filteredEvents.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
  }, [filteredEvents]);

  // Scenario counts
  const scenarioCounts = useMemo(() => {
    const counts = { ALL: rawEventsList.length, '01': 0, '02': 0, '03': 0, '04': 0 };
    for (const evt of rawEventsList) {
      const meta = getLossScenarioMeta(evt);
      if (meta.number === '01') counts['01']++;
      else if (meta.number === '02') counts['02']++;
      else if (meta.number === '03') counts['03']++;
      else if (meta.number === '04') counts['04']++;
    }
    return counts;
  }, [rawEventsList]);

  // Pagination calculation
  const totalItems = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedEvents = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, safePage, pageSize]);

  const exportToCSV = () => {
    if (!filteredEvents.length) return;
    const headers = [
      'Loss Number',
      'Reported Date',
      'Material / Product Item',
      'Item Code',
      'Item Type',
      'Quantity',
      'UOM',
      'Operational Scenario',
      'Why Put into Scrap (Reason)',
      'Department Origin',
      'Storage Location',
      'Source Type',
      'Status',
      'Classification',
      'Stock Ledger Reference',
      'Reported By',
    ];

    const rows = filteredEvents.map((evt) => {
      const sc = getLossScenarioMeta(evt);
      return [
        `"${evt.lossNumber}"`,
        `"${format(new Date(evt.reportedAt), 'yyyy-MM-dd HH:mm')}"`,
        `"${(evt.materialName || evt.productName || 'Unspecified').replace(/"/g, '""')}"`,
        `"${evt.itemCode || ''}"`,
        `"${evt.materialId ? 'RAW_MATERIAL' : 'FINISHED_PRODUCT'}"`,
        Number(evt.quantity),
        `"${evt.uomCode || 'units'}"`,
        `"${sc.label}"`,
        `"${(evt.reason || '').replace(/"/g, '""')}"`,
        `"${(evt.departmentName || 'Plant-wide').replace(/"/g, '""')}"`,
        `"${(evt.locationName || 'General').replace(/"/g, '""')}"`,
        `"${evt.sourceType}"`,
        `"${evt.status}"`,
        `"${evt.classification || 'PENDING'}"`,
        `"${evt.stockEffectRef || 'NOT_POSTED'}"`,
        `"${(evt.reportedByActorName || evt.reportedByActorId || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `scrap-wastage-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
              <span className="text-foreground font-semibold">Loss Events &amp; Scrap Ledger</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Loss Events &amp; Scrap Ledger
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-8.5 px-3 text-xs font-semibold shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
              Live Sync
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={!filteredEvents.length}
              className="h-8.5 px-3 text-xs font-semibold shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Export CSV
            </Button>

            <Link href="/scrap-wastage/abnormal-queue">
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 px-3 text-xs font-semibold shadow-2xs"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Abnormal Queue ({analytics?.abnormalCount ?? 0})
              </Button>
            </Link>

            <Link href="/scrap-wastage">
              <Button variant="outline" size="sm" className="h-8.5 px-3 text-xs font-semibold shadow-2xs">
                <Scale className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Dashboard
              </Button>
            </Link>

            <Link href="/scrap-wastage/new">
              <Button size="sm" className="h-8.5 px-3.5 text-xs font-bold shadow-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Report Scrap
              </Button>
            </Link>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. COMPACT 4-CARD METRIC SUMMARY STRIP                   */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Scrap Entries Listed
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {filteredEvents.length}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Total: {rawEventsList.length}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Scrapped Quantity
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {number.format(totalScrapQty)}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                units
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Within Tolerance
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {filteredEvents.filter((e) => e.classification === 'WITHIN_TOLERANCE').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                governed
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Abnormal &amp; Under Review
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {filteredEvents.filter((e) => e.classification === 'ABNORMAL' || e.status === 'REPORTED').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                actionable
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. UNIFIED SEGMENTED TOOLBAR (SCENARIOS, FILTERS, SEARCH) */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-3">
          
          {/* Row 1: 4 Operational Scenario Pills & View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-border-strong border-border pb-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setScenarioFilter('ALL');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  scenarioFilter === 'ALL'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                <span>All Origins</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${scenarioFilter === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
                  {scenarioCounts.ALL}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScenarioFilter('01');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  scenarioFilter === '01'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Way 1 · Inward QC</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${scenarioFilter === '01' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
                  {scenarioCounts['01']}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScenarioFilter('02');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  scenarioFilter === '02'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                <Cog className="w-3.5 h-3.5" />
                <span>Way 2 · WIP Run</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${scenarioFilter === '02' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
                  {scenarioCounts['02']}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScenarioFilter('03');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  scenarioFilter === '03'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Way 3 · Assembly QA</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${scenarioFilter === '03' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
                  {scenarioCounts['03']}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScenarioFilter('04');
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  scenarioFilter === '04'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Way 4 · RMA</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${scenarioFilter === '04' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
                  {scenarioCounts['04']}
                </span>
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono font-semibold text-muted-foreground hidden sm:inline-block">
                {totalItems} {totalItems === 1 ? 'entry' : 'entries'} found
              </span>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-background text-primary shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Tabular Ledger View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-background text-primary shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Incident Cards View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Search Input & Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search material, reason, loss #, dept..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8.5 h-8.5 text-xs rounded-xl shadow-2xs"
                />
              </div>

              {/* Item Type Pill */}
              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setItemTypeFilter('ALL');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    itemTypeFilter === 'ALL'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Types
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemTypeFilter('MATERIAL');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    itemTypeFilter === 'MATERIAL'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Materials
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemTypeFilter('PRODUCT');
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    itemTypeFilter === 'PRODUCT'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Products
                </button>
              </div>

              {/* Department Dropdown */}
              <select
                aria-label="Filter by department"
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setPage(1);
                }}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Departments</option>
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
                  setStatusFilter(e.target.value as LossEventStatus | '');
                  setPage(1);
                }}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="REPORTED">REPORTED</option>
                <option value="REVIEWED">REVIEWED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="POSTED">POSTED (Ledger)</option>
                <option value="REJECTED">REJECTED</option>
                <option value="INVESTIGATED">INVESTIGATED</option>
                <option value="REPLACED">REPLACED</option>
              </select>

              {/* Classification Dropdown */}
              <select
                aria-label="Filter by classification"
                value={classificationFilter}
                onChange={(e) => {
                  setClassificationFilter(e.target.value as LossClassification | '');
                  setPage(1);
                }}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Classifications</option>
                <option value="WITHIN_TOLERANCE">WITHIN_TOLERANCE</option>
                <option value="ABNORMAL">ABNORMAL</option>
              </select>

              {/* Source Type Dropdown */}
              <select
                aria-label="Filter by source type"
                value={sourceTypeFilter}
                onChange={(e) => {
                  setSourceTypeFilter(e.target.value as LossSourceType | '');
                  setPage(1);
                }}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="">All Sources</option>
                <option value="GRN_DISCREPANCY">GRN Dock</option>
                <option value="DEPARTMENT_EXECUTION_EXCEPTION">Shopfloor Exception</option>
                <option value="QC_REJECTION_NO_BATCH">QC Inspection</option>
                <option value="MANUAL_REPORT">Manual / RMA</option>
              </select>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-xl border border-input bg-background px-2.5 py-1">
                <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Sort:</span>
                <select
                  aria-label="Sort ledger records"
                  value={sortField}
                  onChange={(e) => {
                    setSortField(e.target.value as 'reportedAt' | 'quantity' | 'lossNumber' | 'department');
                    setPage(1);
                  }}
                  className="bg-transparent text-xs font-semibold text-ink focus:outline-hidden cursor-pointer pr-1"
                >
                  <option value="reportedAt">When Scrapped (Date)</option>
                  <option value="quantity">Scrapped Quantity</option>
                  <option value="lossNumber">Loss Number</option>
                  <option value="department">Department</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortAsc(!sortAsc)}
                  className="text-ink-placeholder hover:text-ink p-0.5"
                  title={sortAsc ? 'Ascending' : 'Descending'}
                >
                  <span className="text-[10px] font-mono font-bold">{sortAsc ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. MAIN LEDGER VIEW: TABULAR VIEW                        */}
        {/* ======================================================== */}
        {viewMode === 'table' && (
          <Card className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading scrap ledger entries...</span>
              </div>
            ) : error ? (
              <div className="p-12 text-center text-xs text-destructive space-y-2">
                <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
                <p>Failed to load scrap ledger records.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
                  Retry
                </Button>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground space-y-3">
                <Package className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="font-bold text-foreground text-sm">No scrap entries found</p>
                <p>No scrap or wastage entries match the current search or filters.</p>
                <Link href="/scrap-wastage/new">
                  <Button size="sm" className="text-xs mt-1 shadow-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Report Scrap Entry
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-border-strong border-border/80">
                      <TableHead className="p-3.5 font-bold text-foreground">Entry &amp; Item</TableHead>
                      <TableHead className="p-3.5 font-bold text-foreground">When Put Into Scrap</TableHead>
                      <TableHead className="p-3.5 font-bold text-foreground">Why Put Into Scrap (Reason)</TableHead>
                      <TableHead className="p-3.5 font-bold text-right text-foreground">Scrap Qty</TableHead>
                      <TableHead className="p-3.5 font-bold text-foreground">Origin &amp; Scenario</TableHead>
                      <TableHead className="p-3.5 font-bold text-foreground">Governance</TableHead>
                      <TableHead className="p-3.5 font-bold text-right text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEvents.map((entry) => {
                      const scenario = getLossScenarioMeta(entry);
                      const ScenarioIcon = scenario.icon;
                      const itemName = entry.materialName || entry.productName || 'Unspecified Item';
                      const itemType = entry.materialId ? 'Raw Material' : 'Finished / WIP Product';

                      return (
                        <TableRow
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className="hover:bg-muted/40 transition-colors cursor-pointer group"
                        >
                          {/* 1. Item & Loss # */}
                          <TableCell className="p-3.5">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-foreground text-xs group-hover:text-primary transition-colors">
                                  {entry.lossNumber}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-medium text-muted-foreground">
                                  {itemType}
                                </span>
                              </div>
                              <div className="font-bold text-foreground text-xs line-clamp-1">
                                {itemName}
                              </div>
                              {entry.itemCode && (
                                <div className="font-mono text-[11px] text-ink-placeholder">
                                  Code: {entry.itemCode}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* 2. When Put Into Scrap */}
                          <TableCell className="p-3.5 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-semibold text-ink">
                                <Calendar className="w-3.5 h-3.5 text-ink-placeholder" />
                                <span>{format(new Date(entry.reportedAt), 'MMM d, yyyy')}</span>
                              </div>
                              <div className="text-[11px] text-ink-placeholder font-mono">
                                {format(new Date(entry.reportedAt), 'HH:mm')} hrs
                              </div>
                              <div className="text-[11px] text-ink-placeholder truncate max-w-[130px]">
                                by {entry.reportedByActorName || 'Actor'}
                              </div>
                            </div>
                          </TableCell>

                          {/* 3. Reason */}
                          <TableCell className="p-3.5 max-w-xs">
                            <div className="space-y-1">
                              <p className="text-xs text-ink-secondary font-medium line-clamp-2 leading-relaxed">
                                {entry.reason}
                              </p>
                              {entry.appliedWastageRuleCode && (
                                <div className="text-[10px] font-mono text-ink-placeholder">
                                  Rule: {entry.appliedWastageRuleCode} v{entry.appliedWastageRuleVersion}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* 4. Scrap Quantity */}
                          <TableCell className="p-3.5 text-right whitespace-nowrap">
                            <div className="space-y-0.5">
                              <span className="font-mono text-sm font-black text-tone-red-text">
                                {Number(entry.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                              </span>
                              <span className="text-[11px] font-mono text-ink-placeholder ml-1">
                                {entry.uomCode || 'units'}
                              </span>
                              {entry.varianceFromExpected !== null && entry.varianceFromExpected !== undefined && (
                                <div className="text-[10px] font-mono text-ink-placeholder">
                                  Var: {Number(entry.varianceFromExpected) > 0 ? '+' : ''}{Number(entry.varianceFromExpected).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* 5. Origin & Scenario */}
                          <TableCell className="p-3.5 whitespace-nowrap">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${scenario.color}`}>
                                <ScenarioIcon className="w-3 h-3" />
                                <span>Way {scenario.number}: {scenario.shortLabel}</span>
                              </span>
                              <div className="text-[11px] text-ink-muted flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-ink-placeholder" />
                                <span className="truncate max-w-[140px]">{entry.departmentName || 'Plant-wide'}</span>
                              </div>
                            </div>
                          </TableCell>

                          {/* 6. Governance Status */}
                          <TableCell className="p-3.5 whitespace-nowrap">
                            <div className="space-y-1">
                              <StatusBadge status={entry.status} />
                              {entry.stockEffectRef && (
                                <div className="text-[10px] text-tone-green-text font-mono flex items-center gap-1">
                                  <FileCheck2 className="w-3 h-3" />
                                  <span>Ledger Posted</span>
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* 7. Action */}
                          <TableCell className="p-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedEntry(entry)}
                                className="h-7 px-2 text-[11px] font-semibold"
                                title="Quick Inspection"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Inspect
                              </Button>

                              <Link href={`/scrap-wastage/${entry.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] font-semibold"
                                  title="Open Full Detail Page"
                                >
                                  Details
                                  <ChevronRight className="w-3 h-3 ml-0.5" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        )}

        {/* ======================================================== */}
        {/* 4. MAIN LEDGER VIEW: INCIDENT CARDS GRID VIEW             */}
        {/* ======================================================== */}
        {viewMode === 'cards' && (
          <div className="space-y-4">
            {isLoading ? (
              <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading scrap incident cards...</span>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-16 text-center text-xs text-muted-foreground space-y-3 rounded-3xl border border-border bg-card">
                <Package className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="font-bold text-foreground text-sm">No incident cards found</p>
                <p>No scrap or wastage entries match the current search or filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedEvents.map((evt) => {
                  const scenario = getLossScenarioMeta(evt);
                  const ScenarioIcon = scenario.icon;

                  return (
                    <div
                      key={evt.id}
                      className="p-5 rounded-3xl border border-border bg-card shadow-xs hover:border-primary transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        {/* Top Meta Line */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${scenario.color}`}>
                            <ScenarioIcon className="w-3 h-3" />
                            <span>Way {scenario.number}: {scenario.shortLabel}</span>
                          </span>
                          <StatusBadge status={evt.status} />
                        </div>

                        {/* Title & Item Name */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold text-foreground">
                              {evt.lossNumber}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {format(new Date(evt.reportedAt), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-foreground mt-1 line-clamp-1">
                            {evt.materialName || evt.productName || 'Unspecified Item'}
                          </p>
                          {evt.itemCode && (
                            <p className="text-xs font-mono text-muted-foreground">
                              Code: {evt.itemCode}
                            </p>
                          )}
                        </div>

                        {/* Reason / Why Put Into Scrap */}
                        <div className="p-2.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            Reason for Scrap
                          </p>
                          <p className="text-xs text-foreground line-clamp-2 leading-relaxed font-medium">
                            {evt.reason}
                          </p>
                        </div>

                        {/* Metrics Strip */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="p-2.5 rounded-2xl bg-primary/5 border border-primary/20">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                              Scrapped Qty
                            </span>
                            <span className="font-mono text-base font-black text-foreground">
                              {number.format(Number(evt.quantity))} {evt.uomCode || 'units'}
                            </span>
                          </div>

                          <div className="p-2.5 rounded-2xl bg-muted/40 border border-border">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                              Governance
                            </span>
                            <div className="pt-0.5">
                              {evt.classification ? (
                                <ToleranceBasisBadge classification={evt.classification} />
                              ) : (
                                <span className="text-[11px] text-muted-foreground font-mono">Pending Check</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Department Info */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {evt.departmentName || 'Plant-wide'}
                          </span>
                          <span>by {evt.reportedByActorName || 'System'}</span>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedEntry(evt)}
                          className="flex-1 text-xs h-8 font-semibold"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Quick Inspect
                        </Button>
                        <Link href={`/scrap-wastage/${evt.id}`} className="flex-1">
                          <Button size="sm" className="w-full text-xs h-8 font-bold">
                            <span>Details</span>
                            <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* 5. COMPACT PAGINATION BAR                                */}
        {/* ======================================================== */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-3.5 shadow-xs">
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span>
                Showing <strong className="font-mono text-ink">{(safePage - 1) * pageSize + 1}</strong> to{' '}
                <strong className="font-mono text-ink">
                  {Math.min(safePage * pageSize, totalItems)}
                </strong>{' '}
                of <strong className="font-mono text-ink">{totalItems}</strong> entries
              </span>

              <div className="flex items-center gap-1.5 pl-3 border-l border-border">
                <span className="text-[11px]">Per page:</span>
                <select
                  aria-label="Items per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded-lg border border-border bg-muted px-2 text-xs font-semibold text-ink focus:outline-hidden cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="h-7.5 w-7.5 p-0 rounded-lg"
                title="First Page"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="h-7.5 px-2.5 rounded-lg text-xs gap-1 font-semibold"
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Prev</span>
              </Button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<Array<number | string>>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) => {
                    if (item === '...') {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-muted-foreground font-mono">
                          …
                        </span>
                      );
                    }
                    const pageNum = Number(item);
                    const isActive = pageNum === safePage;
                    return (
                      <button
                        key={`page-${pageNum}`}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className={`h-7.5 min-w-[30px] px-2 rounded-lg text-xs font-bold font-mono transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'border border-input text-foreground hover:bg-muted'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="h-7.5 px-2.5 rounded-lg text-xs gap-1 font-semibold"
              >
                <span>Next</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                className="h-7.5 w-7.5 p-0 rounded-lg"
                title="Last Page"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 6. QUICK INSPECTION MODAL                                */}
        {/* ======================================================== */}
        {selectedEntry && (
          <Dialog
            open={Boolean(selectedEntry)}
            onClose={() => setSelectedEntry(null)}
            title={`Scrap Ledger Entry: ${selectedEntry.lossNumber}`}
          >
            <div className="space-y-4 pt-1 text-xs">
              {/* Top Banner with Scenario and Status */}
              <div className="p-3 rounded-2xl bg-muted border border-border flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-ink-placeholder block">
                    Operational Origin
                  </span>
                  <span className="text-sm font-bold text-ink">
                    {getLossScenarioMeta(selectedEntry).label}
                  </span>
                </div>
                <StatusBadge status={selectedEntry.status} />
              </div>

              {/* Grid of Key Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl border border-border bg-surface">
                  <span className="text-[10px] uppercase text-ink-placeholder font-bold block">
                    Material / Product Item
                  </span>
                  <span className="font-bold text-ink text-xs block mt-0.5">
                    {selectedEntry.materialName || selectedEntry.productName || 'Unspecified'}
                  </span>
                  {selectedEntry.itemCode && (
                    <span className="text-[11px] font-mono text-ink-placeholder block">
                      Code: {selectedEntry.itemCode}
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-2xl border border-border bg-surface">
                  <span className="text-[10px] uppercase text-ink-placeholder font-bold block">
                    Scrapped Quantity
                  </span>
                  <span className="font-mono text-base font-black text-tone-red-text block mt-0.5">
                    {Number(selectedEntry.quantity).toLocaleString()} {selectedEntry.uomCode || 'units'}
                  </span>
                  {selectedEntry.varianceFromExpected !== null && selectedEntry.varianceFromExpected !== undefined && (
                    <span className="text-[10px] font-mono text-ink-placeholder">
                      Variance: {Number(selectedEntry.varianceFromExpected) > 0 ? '+' : ''}{Number(selectedEntry.varianceFromExpected).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Detailed Reason & Governance */}
              <div className="p-3.5 rounded-2xl border border-border bg-surface space-y-2">
                <span className="text-[10px] uppercase text-ink-placeholder font-bold block">
                  Reason for Scrap &amp; Root Cause
                </span>
                <p className="text-xs text-ink leading-relaxed font-medium">
                  {selectedEntry.reason}
                </p>
                {selectedEntry.appliedWastageRuleCode && (
                  <div className="pt-2 border-t border-border text-[11px] flex justify-between items-center text-ink-muted">
                    <span>Governed Wastage Rule:</span>
                    <strong className="font-mono text-ink">
                      {selectedEntry.appliedWastageRuleCode} v{selectedEntry.appliedWastageRuleVersion}
                    </strong>
                  </div>
                )}
              </div>

              {/* Department & Audit Info */}
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-1">
                  <span className="text-ink-placeholder block">Department Origin:</span>
                  <strong className="text-ink block">{selectedEntry.departmentName || 'Plant-wide'}</strong>
                </div>
                <div className="space-y-1">
                  <span className="text-ink-placeholder block">Storage Location:</span>
                  <strong className="text-ink block">{selectedEntry.locationName || 'General'}</strong>
                </div>
                <div className="space-y-1">
                  <span className="text-ink-placeholder block">Reported At:</span>
                  <strong className="text-ink block">{format(new Date(selectedEntry.reportedAt), 'PPpp')}</strong>
                </div>
                <div className="space-y-1">
                  <span className="text-ink-placeholder block">Reported By:</span>
                  <strong className="text-ink block">{selectedEntry.reportedByActorName || selectedEntry.reportedByActorId || 'System'}</strong>
                </div>
              </div>

              {/* Modal Action Footer */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setSelectedEntry(null)}>
                  Close
                </Button>
                <Link href={`/scrap-wastage/${selectedEntry.id}`}>
                  <Button size="sm" className="font-bold gap-1">
                    <span>Open Full Loss Record</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Dialog>
        )}

      </div>
    </main>
  );
}
