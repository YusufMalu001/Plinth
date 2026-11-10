"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  useLossEvents,
  useIssueReplacementChallan,
  useApproveLossEvent
} from '@/features/loss-management/hooks';
import { useProcurementSelectors } from '@/features/purchases/hooks';
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
} from '@synergy/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { IssueReplacementChallanModal } from '@/features/loss-management/components/IssueReplacementChallanModal';
import {
  UploadReceivedChallanModal,
  ReceivedChallanData
} from '@/features/loss-management/components/UploadReceivedChallanModal';
import {
  RefreshCw,
  Search,
  FileText,
  Plus,
  UploadCloud,
  Eye,
  X,
  CheckCircle2,
  Truck,
  Building2,
  Layers,
  Trash2,
  FileSpreadsheet,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowRight,
  Scale,
  Boxes,
} from 'lucide-react';

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const LOCAL_STORAGE_RECEIVED_CHALLANS_KEY = 'synergy_received_replacement_challans';

export default function ReplacementChallansPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'ISSUED' | 'RECEIVED'>('ALL');
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  const { data: allEventsData, isLoading, error, refetch } = useLossEvents();
  const { data: selectors } = useProcurementSelectors();
  const issueChallanMutation = useIssueReplacementChallan();
  const approveLossMutation = useApproveLossEvent();

  // Local state for uploaded received challans
  const [receivedChallans, setReceivedChallans] = useState<ReceivedChallanData[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_RECEIVED_CHALLANS_KEY);
      if (saved) {
        setReceivedChallans(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveReceivedChallan = (challan: ReceivedChallanData) => {
    const updated = [challan, ...receivedChallans];
    setReceivedChallans(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_RECEIVED_CHALLANS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
    setSuccessToast(`Received Challan ${challan.challanNumber} recorded successfully.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const allEventsList = Array.isArray(allEventsData) ? allEventsData : (allEventsData?.items ?? []);

  const handleIssueChallanSubmit = async (payload: {
    lossEventId: string;
    dispatchLocationId: string;
    targetDepartmentId?: string;
    replacementQuantity?: number;
    rejectedQuantity?: number;
    rejectionReason?: string;
    notes?: string;
    documentUrls?: string[];
  }) => {
    const targetEvent = allEventsList.find((e) => e.id === payload.lossEventId);
    if (!targetEvent) return;

    if (!['APPROVED', 'POSTED'].includes(targetEvent.status)) {
      await approveLossMutation.mutateAsync(targetEvent.id);
    }

    await issueChallanMutation.mutateAsync({
      id: payload.lossEventId,
      payload: {
        dispatchLocationId: payload.dispatchLocationId,
        targetDepartmentId: payload.targetDepartmentId,
        replacementQuantity: payload.replacementQuantity,
        rejectedQuantity: payload.rejectedQuantity,
        rejectionReason: payload.rejectionReason,
        notes: payload.notes,
      },
    });

    refetch();
    setSuccessToast(`Replacement Challan issued successfully for ${targetEvent.lossNumber}.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const replacedEvents = allEventsList.filter((e) => e.status === 'REPLACED');

  const filteredIssuedChallans = replacedEvents.filter((e) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (e.replacementChallanRef && e.replacementChallanRef.toLowerCase().includes(term)) ||
      e.lossNumber.toLowerCase().includes(term) ||
      (e.materialName && e.materialName.toLowerCase().includes(term)) ||
      (e.productName && e.productName.toLowerCase().includes(term)) ||
      (e.departmentName && e.departmentName.toLowerCase().includes(term))
    );
  });

  const filteredReceivedChallans = receivedChallans.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      c.challanNumber.toLowerCase().includes(term) ||
      c.itemName.toLowerCase().includes(term) ||
      (c.lossNumber && c.lossNumber.toLowerCase().includes(term)) ||
      (c.vendorOrOrigin && c.vendorOrOrigin.toLowerCase().includes(term))
    );
  });

  const totalIssued = replacedEvents.length;
  const totalReceived = receivedChallans.length;
  const totalChallans = totalIssued + totalReceived;

  // Total quantity replaced
  const totalReplacedQty = useMemo(() => {
    const issuedQty = replacedEvents.reduce((sum, e) => sum + Number(e.quantity || 0), 0);
    const receivedQty = receivedChallans.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
    return issuedQty + receivedQty;
  }, [replacedEvents, receivedChallans]);

  // Combined unified rows for display
  type CombinedChallanRow = {
    key: string;
    direction: 'OUTBOUND' | 'INBOUND';
    challanNumber: string;
    itemName: string;
    secondaryInfo: string;
    quantity: number;
    uom: string;
    locationOrDept: string;
    attachedProof: { hasProof: boolean; count?: number; url?: string };
    status: string;
    date: string;
    lossEventId?: string;
  };

  const unifiedRows = useMemo<CombinedChallanRow[]>(() => {
    const rows: CombinedChallanRow[] = [];

    if (activeTab === 'ALL' || activeTab === 'ISSUED') {
      for (const e of filteredIssuedChallans) {
        rows.push({
          key: `issued-${e.id}`,
          direction: 'OUTBOUND',
          challanNumber: e.replacementChallanRef || `REP-${e.lossNumber}`,
          itemName: e.materialName || e.productName || 'Material / Item',
          secondaryInfo: e.lossNumber ? `Ref: ${e.lossNumber}` : 'Direct Replenishment',
          quantity: Number(e.quantity || 0),
          uom: e.uomCode || 'units',
          locationOrDept: e.departmentName || 'Shopfloor Line',
          attachedProof: { hasProof: false },
          status: 'ISSUED',
          date: e.reportedAt,
          lossEventId: e.id,
        });
      }
    }

    if (activeTab === 'ALL' || activeTab === 'RECEIVED') {
      for (const c of filteredReceivedChallans) {
        rows.push({
          key: `received-${c.id}`,
          direction: 'INBOUND',
          challanNumber: c.challanNumber,
          itemName: c.itemName,
          secondaryInfo: c.vendorOrOrigin ? `From: ${c.vendorOrOrigin}` : (c.lossNumber ? `Ref: ${c.lossNumber}` : 'Inward Delivery'),
          quantity: Number(c.quantity || 0),
          uom: c.uom || 'units',
          locationOrDept: c.receivingLocationName || 'Receiving Store',
          attachedProof: {
            hasProof: Boolean(c.documentUrls && c.documentUrls.length > 0),
            count: c.documentUrls?.length ?? 0,
            url: c.documentUrls?.[0],
          },
          status: 'RECEIVED',
          date: c.receivedDate,
          lossEventId: undefined,
        });
      }
    }

    return rows;
  }, [activeTab, filteredIssuedChallans, filteredReceivedChallans]);

  // Pagination calculation
  const totalItems = unifiedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return unifiedRows.slice(start, start + pageSize);
  }, [unifiedRows, safePage, pageSize]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 dark:bg-[#070b14]/70 font-manrope">
      <div className="mx-auto max-w-[1680px] space-y-5">
        
        {/* ======================================================== */}
        {/* 1. STREAMLINED HEADER BAR WITH CLEAN 1-ROW ACTIONS       */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link href="/scrap-wastage" className="hover:text-primary transition-colors font-medium">
                Scrap &amp; Wastage
              </Link>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-foreground font-semibold">Replacement Delivery Challans</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Replacement Delivery Challans
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
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
              Live Sync
            </Button>

            <Link href="/scrap-wastage/ledger">
              <Button variant="outline" size="sm" className="h-8.5 px-3 text-xs font-semibold shadow-2xs">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Scrap Ledger
              </Button>
            </Link>

            <Link href="/scrap-wastage">
              <Button variant="outline" size="sm" className="h-8.5 px-3 text-xs font-semibold shadow-2xs">
                <Scale className="w-3.5 h-3.5 mr-1.5 text-primary" />
                Dashboard
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsUploadModalOpen(true)}
              className="h-8.5 px-3.5 text-xs font-semibold shadow-2xs"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Upload Inbound Slip
            </Button>

            <Button
              size="sm"
              onClick={() => setIsIssueModalOpen(true)}
              className="h-8.5 px-3.5 text-xs font-bold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Issue Replenishment
            </Button>
          </div>
        </div>

        {/* Success Alert */}
        {successToast && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted border border-border text-foreground text-xs shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span>{successToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. COMPACT 4-CARD METRIC SUMMARY STRIP                   */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Challans Logged
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Truck className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {totalChallans}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Issued &amp; Received
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Outbound Issued
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {totalIssued}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                authorized
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Inbound Received
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <UploadCloud className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {totalReceived}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                verified slips
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Replenished Units
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Boxes className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {number.format(totalReplacedQty)}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                units moved
              </span>
            </div>
          </div>
        </div>

        {/* Proposals Awaiting Store Manager Review & Replenishment Dispatch */}
        {allEventsList.filter((e) => ['REPORTED', 'REVIEWED', 'INVESTIGATED', 'APPROVED'].includes(e.status) && !e.replacementChallanRef).length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Scrap &amp; Wastage Proposals Requiring Store Action
                  </h3>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-muted text-foreground border border-border self-start sm:self-auto">
                {allEventsList.filter((e) => ['REPORTED', 'REVIEWED', 'INVESTIGATED', 'APPROVED'].includes(e.status) && !e.replacementChallanRef).length} pending
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allEventsList
                .filter((e) => ['REPORTED', 'REVIEWED', 'INVESTIGATED', 'APPROVED'].includes(e.status) && !e.replacementChallanRef)
                .map((ev) => {
                  const isApproved = ev.status === 'APPROVED';
                  return (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors p-4 shadow-2xs flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {ev.lossNumber}
                          </span>
                          <StatusBadge status={ev.status} />
                        </div>
                        <p className="text-xs font-bold text-foreground line-clamp-1">
                          {ev.materialName || ev.productName || 'Scrapped Inventory'}
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {ev.reason || 'No description provided'}
                        </p>
                        <div className="flex items-baseline justify-between pt-1 text-xs">
                          <span className="text-muted-foreground font-medium">Proposal Qty:</span>
                          <span className="font-mono font-bold text-foreground">
                            {ev.quantity} {ev.uomCode || 'units'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setIsIssueModalOpen(true);
                          }}
                          className="flex-1 h-8 text-xs font-bold gap-1 shadow-xs"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{isApproved ? 'Issue Replacement' : 'Approve & Replace'}</span>
                        </Button>
                        <Link href={`/scrap-wastage/${ev.id}`}>
                          <Button size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5">
                            Inspect
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. UNIFIED SEGMENTED TOOLBAR (DIRECTION TABS & SEARCH)   */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ALL');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'ALL'
                    ? 'bg-card text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Challans ({totalChallans})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ISSUED');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'ISSUED'
                    ? 'bg-card text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Outbound Issued ({totalIssued})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('RECEIVED');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'RECEIVED'
                    ? 'bg-card text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inbound Received ({totalReceived})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search challan #, loss ref, material, origin..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-8.5 h-8.5 text-xs rounded-xl shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. MAIN CHALLANS TABLE                                   */}
        {/* ======================================================== */}
        <Card className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Loading replacement delivery challans...</span>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-xs text-destructive space-y-2">
              <p>Failed to load replacement delivery records.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
                Retry
              </Button>
            </div>
          ) : paginatedRows.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  No Replacement Delivery Challans Found
                </h3>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-2">
                <Button
                  onClick={() => setIsIssueModalOpen(true)}
                  className="h-8 px-3.5 text-xs font-bold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Issue Replenishment
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="h-8 px-3.5 text-xs font-semibold"
                >
                  <UploadCloud className="w-3.5 h-3.5 mr-1 text-primary" /> Upload Inbound Slip
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/80">
                    <TableHead className="p-3.5 font-bold text-foreground">Challan Number</TableHead>
                    <TableHead className="p-3.5 font-bold text-foreground">Direction &amp; Type</TableHead>
                    <TableHead className="p-3.5 font-bold text-foreground">Material / Item</TableHead>
                    <TableHead className="p-3.5 font-bold text-right text-foreground">Quantity</TableHead>
                    <TableHead className="p-3.5 font-bold text-foreground">Location / Dept</TableHead>
                    <TableHead className="p-3.5 font-bold text-foreground">Proof / Receipt</TableHead>
                    <TableHead className="p-3.5 font-bold text-foreground">Status</TableHead>
                    <TableHead className="p-3.5 font-bold text-right text-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => {
                    const isOutbound = row.direction === 'OUTBOUND';

                    return (
                      <TableRow key={row.key} className="hover:bg-muted/40 transition-colors">
                        {/* 1. Challan Number */}
                        <TableCell className="p-3.5 font-mono font-bold text-foreground">
                          {row.challanNumber}
                        </TableCell>

                        {/* 2. Direction & Type */}
                        <TableCell className="p-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              isOutbound
                                ? 'border-primary/20 bg-primary/10 text-primary'
                                : 'border-border bg-muted text-foreground'
                            }`}
                          >
                            {isOutbound ? 'Outbound Replenishment' : 'Inbound Received Slip'}
                          </span>
                        </TableCell>

                        {/* 3. Material / Item */}
                        <TableCell className="p-3.5">
                          <div className="font-bold text-foreground text-xs">
                            {row.itemName}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {row.secondaryInfo}
                          </div>
                        </TableCell>

                        {/* 4. Quantity */}
                        <TableCell className="p-3.5 text-right font-mono font-bold whitespace-nowrap text-foreground">
                          {isOutbound ? '' : '+'}{row.quantity} {row.uom}
                        </TableCell>

                        {/* 5. Location / Dept */}
                        <TableCell className="p-3.5 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{row.locationOrDept}</span>
                          </div>
                        </TableCell>

                        {/* 6. Attached Proof */}
                        <TableCell className="p-3.5 whitespace-nowrap">
                          {row.attachedProof.hasProof && row.attachedProof.url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewDocUrl(row.attachedProof.url!)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> {row.attachedProof.count} File{row.attachedProof.count && row.attachedProof.count > 1 ? 's' : ''}
                            </button>
                          ) : (
                            <span className="text-[10px] italic text-muted-foreground">
                              {isOutbound ? 'ERP Generated' : 'No File Attached'}
                            </span>
                          )}
                        </TableCell>

                        {/* 7. Status */}
                        <TableCell className="p-3.5 whitespace-nowrap">
                          {isOutbound ? (
                            <StatusBadge status="ISSUED" />
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-foreground border border-border">
                              RECEIVED &amp; VERIFIED
                            </span>
                          )}
                        </TableCell>

                        {/* 8. Action */}
                        <TableCell className="p-3.5 text-right whitespace-nowrap">
                          {row.lossEventId ? (
                            <Link
                              href={`/scrap-wastage/${row.lossEventId}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                            >
                              <span>View Loss</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {row.date}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* ======================================================== */}
        {/* 5. COMPACT PAGINATION BAR                                */}
        {/* ======================================================== */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Showing <strong className="font-mono text-foreground">{(safePage - 1) * pageSize + 1}</strong> to{' '}
                <strong className="font-mono text-foreground">
                  {Math.min(safePage * pageSize, totalItems)}
                </strong>{' '}
                of <strong className="font-mono text-foreground">{totalItems}</strong> challans
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
                  className="h-7 rounded-lg border border-input bg-background px-2 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
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

        {/* ISSUE REPLACEMENT CHALLAN MODAL */}
        <IssueReplacementChallanModal
          isOpen={isIssueModalOpen}
          onClose={() => setIsIssueModalOpen(false)}
          lossEvents={allEventsList.filter((e) => ['APPROVED', 'POSTED', 'REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(e.status))}
          locations={selectors?.locations.items ?? []}
          departments={selectors?.departments.items ?? []}
          onSubmit={handleIssueChallanSubmit}
        />

        {/* UPLOAD RECEIVED CHALLAN MODAL */}
        <UploadReceivedChallanModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          locations={selectors?.locations.items ?? []}
          onSubmit={saveReceivedChallan}
        />

        {/* DOCUMENT PREVIEW POPUP */}
        {previewDocUrl && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#173796]" />
                  Uploaded Physical Delivery Proof
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewDocUrl(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="h-96 w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <img
                  src={previewDocUrl}
                  alt="Delivery Challan Document"
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewDocUrl(null)}>
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
