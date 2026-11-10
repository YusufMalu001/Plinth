"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  SlidersHorizontal,
  Clock3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  X,
  FileText,
  Sparkles,
  Pencil,
  Trash2
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@synergy/ui';
import { vendorsApi, GeminiVendorEvaluationDto } from '../../../features/vendors/api';
import { VendorScorecardDialog } from '../../../features/vendors/components/VendorScorecardDialog';
import { useDebounce } from '../../../common/hooks/useDebounce';
import { PaginationControls } from '../../../components/PaginationControls';
import { showToast } from '../../../components/toast-store';
import { useCurrentUser } from '../../../features/auth/hooks';
import { ConfirmDeleteDialog } from '../../../components/ConfirmDeleteDialog';
import { friendlyErrorMessage } from '../../../features/auth/access-control';

const statusBadgeStyles: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  },
  APPROVED: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  },
  PENDING_VALIDATION: {
    label: 'Pending Validation',
    className: 'bg-muted/60 text-muted-foreground border-border',
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    className: 'bg-muted/60 text-muted-foreground border-border',
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-muted/40 text-muted-foreground border-border',
  },
  SUSPENDED: {
    label: 'Suspended',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  INACTIVE: {
    label: 'Inactive',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

function formatAddress(address?: Record<string, unknown> | null): string {
  if (!address || typeof address !== 'object') return '—';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const state = typeof address.state === 'string' ? address.state.trim() : '';
  const country = typeof address.country === 'string' ? address.country.trim() : '';
  const location = [city, state].filter(Boolean).join(', ');
  if (location) return location;
  return country || '—';
}

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const roleKey = String(currentUser?.roleDefinition?.key || currentUser?.role || currentUser?.roles?.[0]?.key || '').toLowerCase().replace(/[\s_]+/g, '-');
  const isAdmin = roleKey === 'admin' || roleKey === 'super-admin';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [vendorToDelete, setVendorToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendors', debouncedSearch, statusFilter, page, pageSize],
    queryFn: () =>
      vendorsApi.list({
        search: debouncedSearch,
        status: statusFilter,
        page,
        limit: pageSize,
      }),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const rawItems = useMemo(() => data?.items ?? [], [data?.items]);

  // AI Vendor Scoring Query & State
  const [selectedEvaluation, setSelectedEvaluation] = useState<GeminiVendorEvaluationDto | null>(null);

  const {
    data: scoringReport,
    refetch: refetchScoring,
    isFetching: isScoringFetching,
  } = useQuery({
    queryKey: ['vendor-scoring', 'ALL'],
    queryFn: () => vendorsApi.getScoringReport('ALL'),
    staleTime: 60_000,
  });

  const scoringMap = useMemo(() => {
    const map = new Map<string, GeminiVendorEvaluationDto>();
    if (scoringReport?.evaluations) {
      scoringReport.evaluations.forEach((ev) => map.set(ev.vendorId, ev));
    }
    return map;
  }, [scoringReport]);

  const getVendorType = (v: { id: string; name?: string; code?: string }): 'Material Supplier' | 'Job-Work Vendor' => {
    const ev = scoringMap.get(v.id);
    if (ev?.vendorType === 'OUTSOURCING') return 'Job-Work Vendor';
    if (ev?.metrics && ev.metrics.totalJobWorkOrders > 0 && ev.metrics.totalPurchaseOrders === 0) return 'Job-Work Vendor';
    const text = `${v.name || ''} ${v.code || ''}`.toLowerCase();
    if (text.includes('job-work') || text.includes('job work') || text.includes('outsourc')) {
      return 'Job-Work Vendor';
    }
    return 'Material Supplier';
  };

  // Vendor Control Center shows only Material Supplier vendors; Job-Work vendors have their own directory.
  const items = useMemo(() => {
    return rawItems.filter((v) => getVendorType(v) === 'Material Supplier');
  }, [rawItems, scoringMap]);

  const totalCount = data?.total ?? rawItems.length;

  const activeCount = useMemo(
    () => rawItems.filter((v) => ['ACTIVE', 'APPROVED'].includes(v.status)).length,
    [rawItems]
  );
  const pendingCount = useMemo(
    () => rawItems.filter((v) => ['PENDING_APPROVAL', 'PENDING_VALIDATION', 'DRAFT'].includes(v.status)).length,
    [rawItems]
  );
  const registeredTaxCount = useMemo(
    () => rawItems.filter((v) => Boolean(v.taxNumber || v.taxId)).length,
    [rawItems]
  );

  // Quick Approve mutation for vendors currently pending validation or draft
  const deleteMutation = useMutation({
    mutationFn: (vendorId: string) => vendorsApi.delete(vendorId),
    onSuccess: () => {
      showToast({ kind: 'success', title: 'Vendor Deleted', message: 'The vendor was removed from the directory.' });
      setVendorToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['master-data', 'procurement-selectors'] });
      queryClient.invalidateQueries({ queryKey: ['approved-vendors'] });
    },
    onError: (error) => {
      showToast({
        kind: 'error',
        title: 'Vendor Could Not Be Deleted',
        message: friendlyErrorMessage(error),
      });
    },
  });

  const handleRecalculateScores = async () => {
    try {
      showToast({
        kind: 'info',
        title: 'Scoring Vendors',
        message: 'AI is evaluating vendor performance, discrepancy rates, and punctuality...',
      });
      await refetchScoring();
      showToast({
        kind: 'success',
        title: 'Scores Updated',
        message: 'Vendor Evaluation report refreshed successfully.',
      });
    } catch {
      showToast({
        kind: 'error',
        title: 'Evaluation Error',
        message: 'Unable to recalculate AI vendor scores. Using heuristic data.',
      });
    }
  };


  return (
    <main className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="w-full max-w-[1680px] mx-auto space-y-5">
        
        {/* Top Header */}
        <PageHeader
          title="Vendor Control Center"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculateScores}
                disabled={isScoringFetching}
                className="h-9 rounded-lg text-xs font-medium gap-1.5 border-border shadow-none"
                icon={Sparkles}
              >
                {isScoringFetching ? 'Scoring...' : 'Recalculate Scores'}
              </Button>
              <Link href="/vendors/new">
                <Button
                  size="sm"
                  className="h-9 rounded-lg text-xs font-medium bg-primary hover:bg-[#003c68] text-white shadow-none"
                  icon={Plus}
                >
                  Create Vendor
                </Button>
              </Link>
            </div>
          }
        />

        {/* Small & Sleek Metric Summary Boxes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Total Vendors
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {totalCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building2 className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Active Vendors
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {activeCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Pending Review
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {pendingCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Clock3 className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-card shadow-2xs flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                With GSTIN / Tax ID
              </span>
              <div className="text-xl font-black font-mono text-foreground leading-tight">
                {registeredTaxCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <Card className="overflow-hidden border-0 bg-transparent shadow-none">
          
          {/* Card Header with Filter Controls */}
          <CardHeader className="flex flex-col gap-3.5 border-0 bg-transparent p-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Building2 className="h-4.5 w-4.5 text-primary" />
                Vendor Directory
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold font-mono">
                  {items.length} of {totalCount}
                </span>
              </CardTitle>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex w-full flex-wrap items-center justify-start gap-2.5 border-0 bg-transparent p-0 sm:w-auto sm:justify-end">
              {/* Search input */}
              <div className="relative min-w-[240px] flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by code, name, or GSTIN..."
                  className="h-9 w-full sm:w-[260px] pl-9 pr-8 text-xs rounded-lg"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* This directory is Material Suppliers only. Job-Work vendors live in /job-work. */}

              <span className="inline-flex h-9 items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Filters</span>

              <div role="tablist" aria-label="Filter vendors by status" className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-lg border border-border/80 bg-muted/20 p-1">
                {[{ label: 'All', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }, { label: 'Draft', value: 'DRAFT' }].map((tab) => {
                  const selected = statusFilter === tab.value;
                  return (
                    <button
                      key={tab.label}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setStatusFilter(tab.value)}
                      className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {statusFilter && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="text-xs text-muted-foreground hover:text-foreground underline px-1"
                >
                  Clear
                </button>
              )}
            </div>
          </CardHeader>

          {/* Table Content */}
          <CardContent className="p-0">
            {isError ? (
              <div className="p-12 text-center text-xs text-destructive space-y-2">
                <p className="font-semibold">Unable to load vendor directory.</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()} className="text-xs">
                  Retry
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Vendor Name</TableHead>
                      <TableHead className="font-bold">GSTIN / Tax ID</TableHead>
                      <TableHead className="font-bold">Contact Details</TableHead>
                      <TableHead className="font-bold">Dispatch Location</TableHead>
                      <TableHead className="font-bold text-center">Status</TableHead>
                      <TableHead className="font-bold text-center">Vendor Score</TableHead>
                      <TableHead className="font-bold text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground text-xs">
                          <div className="flex items-center justify-center gap-2">
                            <Building2 className="w-4 h-4 animate-pulse text-primary" />
                            Loading vendor directory…
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground text-xs">
                          {search || statusFilter ? 'No vendors match your search filters.' : 'No Material Supplier vendors registered yet.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((v) => {
                        const vendorType = getVendorType(v);
                        const normalizedStatus = ['ACTIVE', 'APPROVED'].includes(v.status)
                          ? 'ACTIVE'
                          : v.status === 'INACTIVE' || v.status === 'SUSPENDED'
                            ? 'INACTIVE'
                            : 'DRAFT';
                        const badgeInfo = statusBadgeStyles[normalizedStatus];

                        return (
                          <TableRow
                            key={v.id}
                            role="link"
                            tabIndex={0}
                            aria-label={`Open ${v.name} vendor details`}
                            onClick={() => router.push(`/vendors/${v.id}`)}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                router.push(`/vendors/${v.id}`);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                          >
                            
                            {/* 1. Vendor Name & Vendor Type */}
                            <TableCell className="py-3">
                              <div className="group block">
                                <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-2 flex-wrap">
                                  <span>{v.name}</span>
                                  {vendorType === 'Job-Work Vendor' && (
                                    <span className="inline-flex items-center rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                      Job-Work Vendor
                                    </span>
                                  )}
                                </div>
                                {v.legalName && <div className="text-xs text-muted-foreground truncate max-w-[260px] mt-0.5">{v.legalName}</div>}
                              </div>
                            </TableCell>

                            {/* 2. GSTIN / Tax ID */}
                            <TableCell className="py-3">
                              {v.taxNumber || v.taxId ? (
                                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted/60 text-foreground border border-border/60">
                                  {v.taxNumber || v.taxId}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            {/* 3. Contact Details */}
                            <TableCell className="py-3">
                              <div className="space-y-1 text-xs">
                                {v.contactEmail ? (
                                  <div className="flex items-center gap-1.5 text-foreground/90 font-mono text-[11px]">
                                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[190px]">{v.contactEmail}</span>
                                  </div>
                                ) : null}
                                {v.contactPhone ? (
                                  <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                                    <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span>{v.contactPhone}</span>
                                  </div>
                                ) : null}
                                {!v.contactEmail && !v.contactPhone && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>

                            {/* 4. Dispatch Location */}
                            <TableCell className="py-3">
                              <div className="flex items-center gap-1.5 text-xs text-foreground/80">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[180px]">
                                  {formatAddress(v.address)}
                                </span>
                              </div>
                            </TableCell>

                            {/* 6. Lifecycle Status */}
                            <TableCell className="py-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wide ${badgeInfo.className}`}
                              >
                                {badgeInfo.label}
                              </span>
                            </TableCell>

                            {/* 7. Vendor Score */}
                            <TableCell className="py-3 text-center">
                              {(() => {
                                const ev = scoringMap.get(v.id);
                                if (!ev || ev.score === null || ev.score === undefined) {
                                  return (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-border bg-muted/50 text-muted-foreground font-mono">
                                      N/A
                                    </span>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); setSelectedEvaluation(ev); }}
                                    className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border border-border bg-muted/60 text-foreground hover:bg-muted transition cursor-pointer"
                                    title="Click to view full Vendor Scorecard & Audit"
                                  >
                                    <Sparkles className="w-3 h-3 text-muted-foreground group-hover:rotate-12 transition-transform" />
                                    <span>{ev.score}/100</span>
                                  </button>
                                );
                              })()}
                            </TableCell>

                            {/* 8. Action */}
                            <TableCell className="py-3 text-right pr-6">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/vendors/${v.id}/edit`}
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label={`Edit ${v.name}`}
                                  title="Edit vendor"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Link>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); setVendorToDelete({ id: v.id, name: v.name }); deleteMutation.reset(); }}
                                    aria-label={`Delete ${v.name}`}
                                    title="Delete vendor"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </TableCell>

                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            <div className="border-t border-border/80 px-4 py-3">
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={totalCount}
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
              />
            </div>

          </CardContent>
        </Card>

        <ConfirmDeleteDialog
          open={Boolean(vendorToDelete)}
          title="Delete vendor?"
          message={<>Delete <strong>{vendorToDelete?.name}</strong>? This action cannot be undone. Vendors referenced by purchase or job-work records cannot be deleted.</>}
          error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null}
          isDeleting={deleteMutation.isPending}
          onClose={() => { if (!deleteMutation.isPending) setVendorToDelete(null); }}
          onConfirm={() => { if (vendorToDelete) deleteMutation.mutate(vendorToDelete.id); }}
        />

        {/* Vendor Performance Scorecard Dialog */}
        <VendorScorecardDialog
          open={Boolean(selectedEvaluation)}
          onClose={() => setSelectedEvaluation(null)}
          evaluation={selectedEvaluation}
        />

      </div>
    </main>
  );
}
