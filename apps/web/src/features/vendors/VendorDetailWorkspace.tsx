'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  Package,
  PackageCheck,
  Pencil,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Send,
  Truck,
  X,
} from 'lucide-react';
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@plinth/ui';
import { useReactToPrint } from 'react-to-print';
import { StatusBadge, type AnyStatus } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApprovalFlow } from '../../components/ApprovalFlow';
import { generateQRCodeMatrix } from '../../lib/qrcode';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../auth/access-control';
import { useCurrentUser } from '../auth/hooks';
import { vendorsApi, type VendorProfile, type VendorSummary } from './api';
import { getVariantLabel } from '../products/variant-names';
import type { LifecycleStatus } from '@plinth/types';

interface VendorDetailWorkspaceProps {
  id: string;
}

export function VendorDetailWorkspace({ id }: VendorDetailWorkspaceProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const roleKey = String(currentUser?.roleDefinition?.key || currentUser?.role || currentUser?.roles?.[0]?.key || '').toLowerCase().replace(/[\s_]+/g, '-');
  const isAdmin = roleKey === 'admin' || roleKey === 'super-admin';
  const [activeTab, setActiveTab] = useState<'profile' | 'performance' | 'orders' | 'debitNotes' | 'materials'>('profile');
  const [scoringWindowDays, setScoringWindowDays] = useState<number>(90);

  // Fetch Auditable Vendor Scoring Detail
  const { data: scoringDetail, refetch: refetchScoringDetail } = useQuery({
    queryKey: ['vendor-scoring-detail', id, scoringWindowDays],
    queryFn: () => vendorsApi.getScoringDetail(id, scoringWindowDays).catch(() => null),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  // Modals & Drawers
  const [isSpecSheetOpen, setIsSpecSheetOpen] = useState(false);
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  // Fetch Vendor Profile (Aggregated stats, orders, metrics, performance)
  const {
    data: profileData,
    isLoading: loadingProfile,
    error: profileError,
    refetch,
  } = useQuery<VendorProfile>({
    queryKey: ['vendor-profile', id],
    queryFn: () => vendorsApi.profile(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  // Fetch Raw Vendor Record
  const { data: rawVendor } = useQuery<VendorSummary>({
    queryKey: ['vendor-raw', id],
    queryFn: () => vendorsApi.getById(id),
    enabled: Boolean(id),
  });

  const availabilityMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE') => vendorsApi.transitionStatus(id, status),
    onSuccess: async (_, status) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vendor-profile', id] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-raw', id] }),
        queryClient.invalidateQueries({ queryKey: ['vendors'] }),
        queryClient.invalidateQueries({ queryKey: ['master-data', 'procurement-selectors'] }),
        queryClient.invalidateQueries({ queryKey: ['approved-vendors'] }),
      ]);
      showToast({ kind: 'success', title: status === 'ACTIVE' ? 'Vendor Activated' : 'Vendor Set Inactive', message: 'Vendor availability has been updated.' });
      refetch();
    },
    onError: (error) => showToast({ kind: 'error', title: 'Status Update Failed', message: friendlyErrorMessage(error) }),
  });

  const approveVendorMutation = useMutation({
    mutationFn: () => vendorsApi.approve(id, 'Approved by Admin'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['vendor-profile', id] }),
        queryClient.invalidateQueries({ queryKey: ['vendor-raw', id] }),
        queryClient.invalidateQueries({ queryKey: ['vendors'] }),
        queryClient.invalidateQueries({ queryKey: ['master-data', 'procurement-selectors'] }),
        queryClient.invalidateQueries({ queryKey: ['approved-vendors'] }),
      ]);
      showToast({ kind: 'success', title: 'Vendor Approved', message: 'Vendor is now active and available for procurement.' });
      await refetch();
    },
    onError: (error) => showToast({ kind: 'error', title: 'Approval Failed', message: friendlyErrorMessage(error) }),
  });

  // Submit Validation Mutation
  const submitValidationMutation = useMutation({
    mutationFn: () => vendorsApi.submit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-profile', id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-raw', id] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      showToast({
        kind: 'success',
        title: 'Validation Submitted',
        message: `Vendor ${profileData?.code} submitted for technical and commercial approval.`,
      });
      refetch();
    },
    onError: (err) => {
      showToast({
        kind: 'error',
        title: 'Submission Failed',
        message: friendlyErrorMessage(err),
      });
    },
  });

  if (loadingProfile) return <LoadingState message="Loading vendor intelligence profile..." />;
  if (profileError || !profileData) {
    return (
      <div className="p-8">
        <ErrorState error={(profileError as Error) || new Error('Vendor profile could not be loaded.')} retry={refetch} />
      </div>
    );
  }

  const vendor = profileData;
  const metrics = vendor.metrics || { totalOrders: 0, totalOrderValue: 0, orderedQuantity: 0, receivedQuantity: 0, acceptedQuantity: 0 };
  const performance = vendor.performance || { onTimeRate: 0, qualityRate: 0, fillRate: 0, complianceRate: 0, finalizedReceipts: 0 };
  const score = scoringDetail?.overallScore ?? vendor.score ?? null;
  const hasScore = score !== null && !Number.isNaN(score);

  // Address helper
  const address = (vendor.address || {}) as Record<string, string>;
  const fullAddress = [address.street, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ') || '—';
  const primaryContact = vendor.contacts?.find((contact) => contact.isPrimary) || vendor.contacts?.[0];
  const primaryContactName = primaryContact && typeof primaryContact.name === 'string' ? primaryContact.name : '';

  return (
    <div className="flex-1 w-full p-3 sm:p-4 overflow-y-auto bg-muted/20 min-h-screen">
      <div className="w-full space-y-5">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Link href="/vendors" className="hover:text-primary transition-colors">
            Vendor Directory
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          <span className="font-bold text-foreground">{vendor.name}</span>
        </nav>

        {/* Master Vendor Identity Header */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-manrope">
                {vendor.name}
              </h1>
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2.5 font-medium">
                {vendor.taxNumber && <span className="font-mono">GSTIN / Tax ID: {vendor.taxNumber}</span>}
                {vendor.taxNumber && vendor.paymentTerms && <span aria-hidden="true">·</span>}
                {vendor.paymentTerms && <span>Payment terms: {vendor.paymentTerms}</span>}
                {!vendor.taxNumber && !vendor.paymentTerms && <span>Vendor profile</span>}
              </p>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBarcodeOpen(true)}
                className="h-10 px-4 rounded-xl border-primary/25 bg-background text-sm font-bold text-foreground shadow-none hover:border-primary/50 hover:bg-primary/5"
                icon={QrCode}
              >
                Vendor Tag
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSpecSheetOpen(true)}
                className="h-10 px-4 rounded-xl border-primary/25 bg-background text-sm font-bold text-foreground shadow-none hover:border-primary/50 hover:bg-primary/5"
                icon={Printer}
              >
                Print Profile
              </Button>
              {/* Evaluate Vendor button removed - automated Gemini AI scoring is active */}
              {isAdmin && ['ACTIVE', 'APPROVED', 'INACTIVE'].includes(vendor.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={availabilityMutation.isPending}
                  onClick={() => availabilityMutation.mutate(vendor.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE')}
                  className={`h-10 px-4 rounded-xl text-sm font-semibold shadow-none ${vendor.status === 'INACTIVE' ? 'border-tone-green-solid bg-tone-green-bg text-tone-green-text hover:bg-tone-green-bg' : 'border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10'}`}
                >
                  {availabilityMutation.isPending ? 'Saving…' : vendor.status === 'INACTIVE' ? 'Set Active' : 'Set Inactive'}
                </Button>
              )}
              {vendor.status === 'DRAFT' && isAdmin && (
                <Button
                  size="sm"
                  onClick={() => approveVendorMutation.mutate()}
                  disabled={approveVendorMutation.isPending}
                  className="h-10 px-5 rounded-xl text-sm font-bold shadow-none"
                  icon={CheckCircle2}
                >
                  {approveVendorMutation.isPending ? 'Approving…' : 'Approve & Activate'}
                </Button>
              )}
              {vendor.status === 'DRAFT' && !isAdmin && (
                <Button
                  size="sm"
                  onClick={() => submitValidationMutation.mutate()}
                  disabled={submitValidationMutation.isPending}
                  className="h-10 px-5 rounded-xl text-sm font-bold shadow-none"
                  icon={Send}
                >
                  {submitValidationMutation.isPending ? 'Submitting...' : 'Submit Validation'}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => router.push(`/vendors/${vendor.id}/edit`)}
                  className="h-10 px-5 rounded-xl text-sm font-bold shadow-none bg-primary text-inverse hover:bg-[color:var(--action-primary-bg-hover)]"
                icon={Pencil}
              >
                Edit Vendor
              </Button>
            </div>
          </div>
        </div>

        {/* 4-Card Industrial Telemetry Ribbon (Consolidated Vendor Performance) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          {/* Telemetry 1: Vendor Score */}
          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Overall Vendor Score
              </span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl font-black text-foreground font-mono">{hasScore ? score : 'N/A'}</span>
                <span className="text-sm text-muted-foreground font-bold">{hasScore ? '/ 100' : ''}</span>
              </div>
            </div>
          </Card>

          {/* Telemetry 2: Spend & Orders */}
          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total PO Value & Orders
              </span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-foreground font-mono">
                  ₹ {metrics.totalOrderValue.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground font-medium">
                Across <span className="font-bold text-foreground font-mono">{metrics.totalOrders || vendor.orders.length}</span> Purchase Orders
              </p>
            </div>
          </Card>

          {/* Telemetry 3: Delivery Reliability */}
          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                On-Time Delivery Rate
              </span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl font-black text-foreground font-mono">
                  {performance.onTimeRate === null ? '—' : `${performance.onTimeRate}%`}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground font-medium">
                Lead Time: <span className="font-bold text-foreground font-mono">{rawVendor?.leadTimeDays != null ? `${rawVendor.leadTimeDays} Days` : 'Not set'}</span>
              </p>
            </div>
          </Card>

          {/* Telemetry 4: Quality Acceptance Rate */}
          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                QA Acceptance Rate
              </span>
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl font-black text-foreground font-mono">
                  {performance.qualityRate === null ? '—' : `${performance.qualityRate}%`}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground font-medium">
                <span className="font-bold text-foreground font-mono">{metrics.acceptedQuantity.toLocaleString('en-IN')}</span> units accepted
              </p>
            </div>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div role="tablist" aria-label="Vendor details sections" className="flex items-center gap-2 border-b border-border/70 pb-2.5 overflow-x-auto">
          {[
            { id: 'profile', label: 'Corporate Profile & Terms', icon: Building2 },
            { id: 'performance', label: 'Performance', icon: BarChart3 },
            { id: 'orders', label: 'Purchases', icon: Receipt },
            { id: 'debitNotes', label: 'Debit Notes', icon: CreditCard },
            { id: 'materials', label: rawVendor?.address && typeof rawVendor.address === 'object' && (rawVendor.address as Record<string, unknown>).vendorType === 'OUTSOURCING' ? 'Outsourced Items' : 'Supplied Items', icon: Package },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id as typeof activeTab);
                  void queryClient.invalidateQueries({ queryKey: ['vendor-scoring-detail', id] });
                  void queryClient.invalidateQueries({ queryKey: ['vendor-profile', id] });
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${isActive
                    ? 'bg-primary text-inverse'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card border border-transparent'
                  }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tabbed Content Suite (2-Column Main Layout) */}
        <div className="grid grid-cols-1 gap-5 items-start">
          <div className="min-w-0 space-y-5">
            {/* TAB 1: CORPORATE PROFILE & TERMS */}
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Vendor profile</p><h2 className="mt-1 text-lg font-bold text-foreground">Identity &amp; terms</h2></div>
                    <Building2 className="mt-1 h-5 w-5 text-primary" />
                  </div>
                  <dl className="divide-y divide-border/60 px-6">
                    {[
                      ['Trading name', vendor.name], ['Vendor code', vendor.code], ['Status', vendor.status.replace(/_/g, ' ')],
                      ['GSTIN / Tax ID', vendor.taxNumber || '—'], ['Currency', vendor.currency || 'INR'],
                      ['Payment terms', vendor.paymentTerms || '—'], ['Lead time', rawVendor?.leadTimeDays != null ? `${rawVendor.leadTimeDays} days` : '—'],
                    ].map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="max-w-[65%] break-words text-right text-sm font-semibold text-foreground">{value}</dd></div>)}
                  </dl>
                </section>

                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-muted px-6 py-5">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Key contact</p><h2 className="mt-1 text-lg font-bold text-foreground">Dispatch location</h2></div>
                    <MapPin className="mt-1 h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-4 p-6">
                    {primaryContactName && <div><p className="text-xs font-medium text-muted-foreground">Contact person</p><p className="mt-1 text-sm font-semibold text-foreground">{primaryContactName}</p></div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><p className="text-xs font-medium text-muted-foreground">PO delivery email</p><p className="mt-1 break-all text-sm font-medium text-foreground">{vendor.contactEmail || '—'}</p></div>
                      <div><p className="text-xs font-medium text-muted-foreground">Phone</p><p className="mt-1 text-sm font-medium text-foreground">{vendor.contactPhone || '—'}</p></div>
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4"><p className="text-xs font-semibold text-primary">Registered address</p><p className="mt-1.5 text-sm leading-6 text-foreground">{fullAddress}</p></div>
                  </div>
                </section>

                <section className="xl:col-span-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  <div className="flex items-center justify-between gap-4 border-b border-border/70 px-6 py-5">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Supplier catalog</p><h2 className="mt-1 text-lg font-bold text-foreground">Supplied items</h2></div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{vendor.capabilities?.length || 0} items</span>
                  </div>
                  {vendor.capabilities?.length ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-5">{(vendor.capabilities as Array<Record<string, any>>).map((cap) => {
                    const item = cap.material || cap.product;
                    const itemName = item?.name || 'Catalog item';
                    const itemPrice = cap.unitPrice == null ? null : Number(cap.unitPrice);
                    return <div key={String(cap.id)} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/10 p-4"><p className="truncate text-sm font-semibold text-foreground" title={itemName}>{itemName}</p><span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold text-primary">{itemPrice == null ? '—' : `₹${itemPrice.toFixed(2)}`}</span></div>;
                  })}</div> : <p className="px-6 py-10 text-center text-sm text-muted-foreground">No supplied items have been linked to this vendor.</p>}
                </section>

                {vendor.status === 'PENDING_VALIDATION' && <section className="xl:col-span-2 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-xs"><div className="border-b border-border/70 px-6 py-4"><h2 className="text-base font-bold text-foreground">Approval review</h2><p className="mt-1 text-xs text-muted-foreground">Review this vendor before approving or requesting changes.</p></div><div className="p-5"><ApprovalFlow entityId={vendor.id} entityTypePath="master-data/vendors" currentStatus={vendor.status as LifecycleStatus} hasPermission={isAdmin} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['vendor-profile', id] }); refetch(); }} /></div></section>}
              </div>
            )}

            {/* TAB 2: PERFORMANCE SCORECARD & AUDITABLE VENDOR ENGINE v2 */}
            {activeTab === 'performance' && (
              <div className="space-y-6">
                {/* Scorecard Hero Banner with Rolling Window Selector */}
                <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Award className="w-5 h-5 text-primary" />
                        Vendor Performance Scorecard
                      </h2>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-xl border border-border">
                        <span>Window:</span>
                        {[90, 180, 365].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setScoringWindowDays(days)}
                            className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                              scoringWindowDays === days
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted text-foreground'
                            }`}
                          >
                            {days}d
                          </button>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => refetchScoringDetail()}
                        className="text-xs gap-1.5 shadow-none"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Recalculate
                      </Button>
                    </div>
                  </div>

                  {/* Overall Composite Score & Classification */}
                  {scoringDetail && (
                    <div className="p-5 rounded-2xl bg-muted/20 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-3xl font-black font-mono text-foreground">
                            {scoringDetail.overallScore !== null ? scoringDetail.overallScore : 'N/A'}
                          </span>
                          {scoringDetail.overallScore !== null && (
                            <span className="text-xs font-semibold text-muted-foreground">/ 100</span>
                          )}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              scoringDetail.classification === 'STRONG'
                                ? 'bg-tone-green-bg text-tone-green-text border border-tone-green-solid'
                                : scoringDetail.classification === 'GOOD'
                                ? 'bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid'
                                : scoringDetail.classification === 'WATCH'
                                ? 'bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid'
                                : scoringDetail.classification === 'AT_RISK'
                                ? 'bg-tone-red-bg text-tone-red-text border border-tone-red-solid'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            {scoringDetail.overallScore !== null ? scoringDetail.classification : 'UNRATED'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              scoringDetail.confidenceStatus === 'SUFFICIENT_EVIDENCE'
                                ? 'bg-tone-green-bg text-tone-green-text'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            {scoringDetail.confidenceStatus === 'SUFFICIENT_EVIDENCE'
                              ? 'High Confidence'
                              : scoringDetail.confidenceStatus === 'PROVISIONAL'
                              ? 'Provisional Rating'
                              : 'No Transaction History'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground/80 font-mono">
                        Policy Version: v{scoringDetail.policyVersion}
                      </div>
                    </div>
                  )}

                  {/* 5 Distinct Sub-score Breakdown Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* 1. Quality (35%) */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">Quality</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            {scoringDetail ? `×${(scoringDetail.breakdown.quality.weight / 100).toFixed(2)}` : '—'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {scoringDetail ? `${scoringDetail.breakdown.quality.weight}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl font-black font-mono text-tone-green-text truncate" title={`${scoringDetail?.breakdown.quality.score ?? performance.qualityRate}%`}>
                        {(() => {
                          const val = scoringDetail?.breakdown.quality.score ?? performance.qualityRate;
                          return val != null ? `${Number(val.toFixed(2))}%` : '—';
                        })()}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-tone-green-bg rounded-full transition-all"
                          style={{ width: `${scoringDetail?.breakdown.quality.score ?? performance.qualityRate ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{scoringDetail ? `${scoringDetail.breakdown.quality.acceptedQuantity} / ${scoringDetail.breakdown.quality.receivedQuantity} accepted` : 'No scoring data'}</span>
                        {scoringDetail && (
                          <span className="font-mono font-semibold text-foreground">
                            +{scoringDetail.breakdown.quality.contribution} pts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 2. Delivery (25%) */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">Delivery</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            {scoringDetail ? `×${(scoringDetail.breakdown.delivery.weight / 100).toFixed(2)}` : '—'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {scoringDetail ? `${scoringDetail.breakdown.delivery.weight}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl font-black font-mono text-primary truncate" title={`${scoringDetail?.breakdown.delivery.score ?? performance.onTimeRate}%`}>
                        {(() => {
                          const val = scoringDetail?.breakdown.delivery.score ?? performance.onTimeRate;
                          return val != null ? `${Number(val.toFixed(2))}%` : '—';
                        })()}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${scoringDetail?.breakdown.delivery.score ?? performance.onTimeRate ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{scoringDetail ? `${scoringDetail.breakdown.delivery.onTimeShipments} of ${scoringDetail.breakdown.delivery.totalShipments} on-time` : 'No scoring data'}</span>
                        {scoringDetail && (
                          <span className="font-mono font-semibold text-foreground">
                            +{scoringDetail.breakdown.delivery.contribution} pts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. Discrepancies (20%) */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">Discrepancies</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            {scoringDetail ? `×${(scoringDetail.breakdown.discrepancy.weight / 100).toFixed(2)}` : '—'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {scoringDetail ? `${scoringDetail.breakdown.discrepancy.weight}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl font-black font-mono text-foreground truncate" title={`${scoringDetail?.breakdown.discrepancy.score}%`}>
                        {scoringDetail?.breakdown.discrepancy.score != null ? `${Number(scoringDetail.breakdown.discrepancy.score.toFixed(2))}%` : '—'}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full transition-all"
                          style={{ width: `${scoringDetail?.breakdown.discrepancy.score ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{scoringDetail ? `${scoringDetail.breakdown.discrepancy.totalEligiblePenaltyPoints} penalty pts` : 'No scoring data'}</span>
                        {scoringDetail && (
                          <span className="font-mono font-semibold text-foreground">
                            +{scoringDetail.breakdown.discrepancy.contribution} pts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 4. Financial Resolution (10%) */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">Vendor Obligations</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            {scoringDetail ? `×${(scoringDetail.breakdown.vendorObligation.weight / 100).toFixed(2)}` : '—'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {scoringDetail ? `${scoringDetail.breakdown.vendorObligation.weight}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl font-black font-mono text-foreground truncate" title={`${scoringDetail?.breakdown.vendorObligation.score}%`}>
                        {scoringDetail?.breakdown.vendorObligation.score != null ? `${Number(scoringDetail.breakdown.vendorObligation.score.toFixed(2))}%` : '—'}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full transition-all"
                          style={{ width: `${scoringDetail?.breakdown.vendorObligation.score ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{scoringDetail?.breakdown.vendorObligation.isProvisional ? 'No overdue claims (100)' : 'Resolved claims'}</span>
                        {scoringDetail && (
                          <span className="font-mono font-semibold text-foreground">
                            +{scoringDetail.breakdown.vendorObligation.contribution} pts
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 5. Scrap & Custody (10%) */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">Scrap & Custody</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            {scoringDetail ? `×${(scoringDetail.breakdown.custody.weight / 100).toFixed(2)}` : '—'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {scoringDetail ? `${scoringDetail.breakdown.custody.weight}%` : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl font-black font-mono text-foreground truncate" title={`${scoringDetail?.breakdown.custody.score}%`}>
                        {scoringDetail?.breakdown.custody.score != null ? `${Number(scoringDetail.breakdown.custody.score.toFixed(2))}%` : '—'}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full transition-all"
                          style={{ width: `${scoringDetail?.breakdown.custody.score ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{scoringDetail?.breakdown.custody.isProvisional ? 'Prior standard (100)' : `${scoringDetail?.breakdown.custody.jobWorkOrdersCount ?? 0} job orders`}</span>
                        {scoringDetail && (
                          <span className="font-mono font-semibold text-foreground">
                            +{scoringDetail.breakdown.custody.contribution} pts
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Debit Note Severity & Deduplicated Audit Ledger */}
                <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        Debit Note Penalty Audit
                      </h3>
                    </div>
                    <span className="text-xs font-mono font-bold text-foreground bg-muted/40 px-3 py-1 rounded-lg">
                      {scoringDetail?.activeDebitNotes.length ?? 0} Active Claims
                    </span>
                  </div>

                  {scoringDetail?.activeDebitNotes && scoringDetail.activeDebitNotes.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider bg-muted/20">
                          <tr>
                            <th className="py-2.5 px-3">Debit Note #</th>
                            <th className="py-2.5 px-3">Claim Amount</th>
                            <th className="py-2.5 px-3">Affected Invoice</th>
                            <th className="py-2.5 px-3">Ratio %</th>
                            <th className="py-2.5 px-3">Severity Band</th>
                            <th className="py-2.5 px-3">Discrepancy Penalty</th>
                            <th className="py-2.5 px-3">Overall Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 font-mono">
                          {scoringDetail.activeDebitNotes.map((dn) => (
                            <tr key={dn.debitNoteId} className="hover:bg-muted/10">
                              <td className="py-3 px-3 font-bold text-foreground">{dn.debitNoteNumber || dn.debitNoteId.slice(0, 8)}</td>
                              <td className="py-3 px-3">₹{dn.eligibleAmount.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-3">₹{dn.affectedInvoiceValue.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-3">{dn.debitNoteRatio.toFixed(2)}%</td>
                              <td className="py-3 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                    dn.severityLabel === 'minor'
                                      ? 'bg-muted text-ink-secondary'
                                      : dn.severityLabel === 'low'
                                      ? 'bg-tone-blue-bg text-tone-blue-text'
                                      : dn.severityLabel === 'moderate'
                                      ? 'bg-tone-amber-bg text-tone-amber-text'
                                      : dn.severityLabel === 'high'
                                      ? 'bg-tone-orange-bg text-tone-orange-text'
                                      : 'bg-tone-red-bg text-tone-red-text'
                                  }`}
                                >
                                  {dn.severityLabel}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-tone-red-text font-bold">-{dn.penaltyPoints.toFixed(1)} pts</td>
                              <td className="py-3 px-3 text-tone-red-text">-{dn.overallContribution.toFixed(2)} pts</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-muted-foreground bg-muted/10 rounded-xl">
                      No active debit notes raised against this vendor in the active scoring period. Full 100 discrepancy points intact.
                    </div>
                  )}
                </div>

                {/* Inbound Material Quantity Breakdown */}
                <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-primary" />
                    Inbound Material Quantity Breakdown
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div className="p-4 rounded-xl bg-muted/20 border border-border">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Ordered</p>
                      <p className="text-2xl font-black text-foreground font-mono mt-1">
                        {metrics.orderedQuantity.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/20 border border-border">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Received</p>
                      <p className="text-2xl font-black text-foreground font-mono mt-1">
                        {metrics.receivedQuantity.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/20 border border-border">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">QA Accepted</p>
                      <p className="text-2xl font-black text-tone-green-text font-mono mt-1">
                        {metrics.acceptedQuantity.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PURCHASE ORDERS & SPEND LEDGER */}
            {activeTab === 'orders' && (
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-primary" />
                      Purchase Orders & Receipts Ledger
                    </h2>
                  </div>
                  <Link href="/procurement/purchase-orders/generate">
                    <Button size="sm" className="h-8 rounded-lg text-xs font-bold shadow-none">
                      + Issue Purchase Order
                    </Button>
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm text-left">
                    <thead className="bg-primary text-primary-foreground uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-5 py-3">PO Number</th>
                        <th className="px-5 py-3">Issue Date</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Order Value</th>
                        <th className="px-5 py-3 text-center">Receipts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {vendor.orders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center text-sm text-muted-foreground">
                            No purchase orders issued to this vendor yet.
                          </td>
                        </tr>
                      ) : (
                        vendor.orders.map((order) => (
                          <React.Fragment key={order.id}>
                            <tr className="border-b border-border/70 transition-colors hover:bg-muted/30">
                              <td className="px-5 py-3.5 font-mono text-sm font-bold">
                                <Link href={`/procurement/purchase-orders/${order.id}`} className="text-primary hover:underline">{order.poNumber}</Link>
                              </td>
                              <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                                {new Date(order.createdAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                              <td className="px-5 py-3.5 whitespace-nowrap">
                                <StatusBadge status={order.status as AnyStatus} className="text-xs px-2.5 py-1" />
                              </td>
                              <td className="px-5 py-3.5 font-mono font-bold text-foreground text-right whitespace-nowrap">
                                ₹ {order.totalAmount.toLocaleString('en-IN')}
                              </td>
                              <td className="px-5 py-3.5 text-center font-mono font-semibold whitespace-nowrap">
                                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-bold text-foreground">
                                  {order.receiptCount} GRN{order.receiptCount === 1 ? '' : 's'}
                                </span>
                              </td>
                            </tr>
                            <tr className="border-b border-border/70 bg-muted/10">
                              <td colSpan={5} className="px-5 py-2">
                                <details className="group">
                                  <summary className="cursor-pointer list-none text-xs font-semibold text-primary hover:text-primary/80 select-none"><span className="inline-block w-4 transition-transform group-open:rotate-90">›</span>
                                    Order lines, receipts, payments and debit notes
                                  </summary>
                                  <div className="my-3 grid grid-cols-2 gap-3 rounded-xl bg-card border border-border/80 p-4 text-xs sm:text-sm sm:grid-cols-4 font-mono shadow-2xs">
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Subtotal</span><span className="font-bold text-foreground">₹{(order.subtotal || 0).toLocaleString('en-IN')}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Tax</span><span className="font-bold text-foreground">₹{(order.taxAmount || 0).toLocaleString('en-IN')}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Payment Terms</span><span className="font-semibold text-foreground font-sans">{order.paymentTerms || 'Not specified'}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Currency</span><span className="font-bold text-foreground">{order.currency || vendor.currency || 'INR'}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Sent Date</span><span className="font-medium text-foreground font-sans">{order.sentAt ? new Date(order.sentAt).toLocaleDateString() : 'Not recorded'}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Amount Paid</span><span className="font-bold text-foreground">₹{(order.receipts || []).flatMap((receipt) => receipt.payments).reduce((sum, payment) => sum + payment.amount, 0).toLocaleString('en-IN')}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Remaining Balance</span><span className="font-bold text-foreground">₹{Math.max(0, order.totalAmount - (order.receipts || []).flatMap((receipt) => receipt.payments).reduce((sum, payment) => sum + payment.amount, 0)).toLocaleString('en-IN')}</span></div>
                                    <div><span className="text-muted-foreground block text-[11px] uppercase font-sans">Debit Notes</span><span className="font-bold text-foreground">{order.debitNotes?.length || 0}</span></div>
                                  </div>
                                  <div className="grid gap-4 md:grid-cols-2 py-3">
                                    <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                                      <h3 className="text-xs sm:text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                        Ordered items ({order.lines?.length || 0})
                                      </h3>
                                      <div className="space-y-2">
                                        {(order.lines || []).map((line) => (
                                          <div key={line.id} className="text-xs sm:text-sm text-muted-foreground p-2.5 rounded-lg bg-muted/20 border border-border/50">
                                            <p className="font-bold text-foreground">{line.itemName}</p>
                                            <p className="text-xs mt-0.5 font-mono text-muted-foreground">
                                              {line.quantity} {line.uom} × ₹{line.unitPrice.toLocaleString('en-IN')} · GST {line.taxRate}% = <strong className="text-foreground">₹{line.lineTotal.toLocaleString('en-IN')}</strong> · Due: {new Date(line.needDate).toLocaleDateString()}
                                            </p>
                                          </div>
                                        ))}
                                        {!order.lines?.length && <p className="text-xs text-muted-foreground">No line details recorded.</p>}
                                      </div>
                                    </section>
                                    <section className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                                      <h3 className="text-xs sm:text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                        Goods Receipts &amp; Disbursements ({order.receiptCount})
                                      </h3>
                                      <div className="space-y-3">
                                        {(order.receipts || []).map((receipt) => (
                                          <div key={receipt.id} className="border border-border/60 rounded-lg p-3 bg-muted/20 text-xs sm:text-sm">
                                            <div className="flex items-center justify-between font-semibold pb-1.5 border-b border-border/50">
                                              <Link className="text-primary hover:underline font-mono" href={`/receiving/goods-receipts/${receipt.id}`}>
                                                {receipt.grnNumber}
                                              </Link>
                                              <span className="text-xs text-muted-foreground font-sans">
                                                {receipt.status} · {new Date(receipt.receivedAt).toLocaleDateString()}
                                              </span>
                                            </div>
                                            <div className="mt-2 space-y-1 text-xs">
                                              {receipt.lines.map((line, index) => (
                                                <p key={index} className="text-muted-foreground">
                                                  <strong className="text-foreground">{line.itemName}</strong>: received {line.receivedQuantity}, accepted {line.acceptedQuantity}, rejected {line.rejectedQuantity}, damaged {line.damagedQuantity} {line.uom}
                                                </p>
                                              ))}
                                              {receipt.payments.map((payment, index) => (
                                                <p key={index} className="text-foreground font-mono">
                                                  Paid ₹{payment.amount.toLocaleString('en-IN')} on {new Date(payment.paymentDate).toLocaleDateString()} · {payment.paymentMode} ({payment.reference})
                                                </p>
                                              ))}
                                              {receipt.debitNotes.map((note) => {
                                                const linkedDebitNote = vendor.debitNotes?.find((entry) => entry.debitNoteNumber === note.debitNoteNumber);
                                                return <p key={note.debitNoteNumber} className="text-foreground font-mono">{linkedDebitNote ? <Link href={`/debit-notes/${linkedDebitNote.id}`} className="text-primary hover:underline">Debit Note {note.debitNoteNumber}</Link> : `Debit Note ${note.debitNoteNumber}`} ({note.status}) · ₹{note.totalAmount.toLocaleString('en-IN')}</p>;
                                              })}
                                              {!receipt.payments.length && !receipt.debitNotes.length && (
                                                <p className="text-[11px] text-muted-foreground">No payment or debit note recorded.</p>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                        {!order.receipts?.length && <p className="text-xs text-muted-foreground">No receipts recorded.</p>}
                                        {order.debitNotes?.map((note) => {
                                          const linkedDebitNote = vendor.debitNotes?.find((entry) => entry.debitNoteNumber === note.debitNoteNumber);
                                          return <p key={note.debitNoteNumber} className="text-xs text-foreground font-mono">{linkedDebitNote ? <Link href={`/debit-notes/${linkedDebitNote.id}`} className="text-primary hover:underline">Debit note {note.debitNoteNumber}</Link> : `Debit note ${note.debitNoteNumber}`} · {note.status} · ₹{note.totalAmount.toLocaleString('en-IN')} · {note.reason}</p>;
                                        })}
                                      </div>
                                    </section>
                                  </div>
                                </details>
                              </td>
                            </tr>
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'debitNotes' && (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
                  <div><h2 className="text-sm font-bold text-foreground">Debit notes</h2><p className="mt-1 text-xs text-muted-foreground">Claims and supporting quantity details for this vendor.</p></div>
                  <div className="flex gap-5 text-xs"><span className="text-muted-foreground">Total <strong className="ml-1 text-foreground">{vendor.debitNotes?.length || 0}</strong></span><span className="text-muted-foreground">Active claims <strong className="ml-1 text-foreground">{vendor.performance?.debitNoteCount ?? 0}</strong></span><span className="text-muted-foreground">Active value <strong className="ml-1 text-foreground">₹{(vendor.performance?.debitNoteValue ?? 0).toLocaleString('en-IN')}</strong></span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider"><tr><th className="px-5 py-3">Debit note</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">References</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Details</th></tr></thead>
                    <tbody className="divide-y divide-border/70">
                      {vendor.debitNotes?.length ? vendor.debitNotes.map((note) => {
                        const linkedOrder = vendor.orders.find((order) => order.id === note.poId);
                        const linkedReceipt = vendor.orders.flatMap((order) => order.receipts || []).find((receipt) => receipt.id === note.grnId);
                        return <React.Fragment key={note.id}>
                          <tr className="transition-colors hover:bg-muted/30">
                            <td className="px-5 py-3.5 font-mono font-bold"><Link className="text-primary hover:underline" href={`/debit-notes/${note.id}`}>{note.debitNoteNumber}</Link></td>
                            <td className="px-5 py-3.5 text-muted-foreground">{new Date(note.createdAt).toLocaleDateString('en-IN')}</td>
                            <td className="px-5 py-3.5"><StatusBadge status={note.status as AnyStatus} /></td>
                            <td className="px-5 py-3.5"><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{linkedOrder ? <Link className="text-primary hover:underline" href={`/procurement/purchase-orders/${linkedOrder.id}`}>PO {linkedOrder.poNumber}</Link> : <span className="text-muted-foreground">PO —</span>}{linkedReceipt ? <Link className="text-primary hover:underline" href={`/receiving/goods-receipts/${linkedReceipt.id}`}>GRN {linkedReceipt.grnNumber}</Link> : <span className="text-muted-foreground">GRN —</span>}</div></td>
                            <td className="px-5 py-3.5 text-right font-mono font-bold whitespace-nowrap">{note.currency || vendor.currency || 'INR'} {note.totalAmount.toLocaleString('en-IN')}</td>
                            <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">Expand below</td>
                          </tr>
                          <tr className="bg-muted/10"><td colSpan={6} className="px-5 py-2"><details className="group"><summary className="cursor-pointer list-none text-xs font-semibold text-primary"><span className="inline-block w-4 transition-transform group-open:rotate-90">›</span> Reason, tax and affected items ({note.lines?.length || 0})</summary>
                            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                              <div className="rounded-lg border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason</p><p className="mt-1 text-sm font-medium">{note.reason || '—'}</p>{note.invoiceNumber && <p className="mt-3 text-xs text-muted-foreground">Invoice reference: <span className="font-medium text-foreground">{note.invoiceNumber}</span></p>}</div>
                              <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-card p-4 text-right text-xs"><div><p className="text-muted-foreground">Taxable</p><p className="mt-1 font-semibold">₹{note.taxableAmount.toLocaleString('en-IN')}</p></div><div><p className="text-muted-foreground">Tax</p><p className="mt-1 font-semibold">₹{note.taxAmount.toLocaleString('en-IN')}</p></div><div><p className="text-muted-foreground">Total</p><p className="mt-1 font-bold">₹{note.totalAmount.toLocaleString('en-IN')}</p></div></div>
                            </div>
                            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full min-w-[780px] text-xs text-left"><thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Expected</th><th className="px-3 py-2.5">Received</th><th className="px-3 py-2.5">Accepted</th><th className="px-3 py-2.5">Rejected</th><th className="px-3 py-2.5">Damaged</th><th className="px-3 py-2.5">Short</th><th className="px-3 py-2.5">Unit price</th><th className="px-3 py-2.5 text-right">Claim total</th></tr></thead><tbody className="divide-y divide-border/60">{(note.lines || []).map((line, index) => <tr key={index}><td className="px-3 py-2.5 font-semibold">{line.description}</td><td className="px-3 py-2.5">{line.expectedQuantity}</td><td className="px-3 py-2.5">{line.receivedQuantity}</td><td className="px-3 py-2.5">{line.acceptedQuantity}</td><td className="px-3 py-2.5">{line.rejectedQuantity}</td><td className="px-3 py-2.5">{line.damagedQuantity}</td><td className="px-3 py-2.5">{line.shortQuantity}</td><td className="px-3 py-2.5">₹{line.unitPrice.toLocaleString('en-IN')}</td><td className="px-3 py-2.5 text-right font-semibold">₹{line.totalAmount.toLocaleString('en-IN')}</td></tr>)}</tbody></table>{!note.lines?.length && <p className="px-3 py-4 text-xs text-muted-foreground">No line-level details were saved for this debit note.</p>}</div>
                            {note.documents?.length ? <div className="mt-3 flex flex-wrap gap-2">{note.documents.map((document, index) => <a key={index} href={document.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted">{document.fileName}</a>)}</div> : null}
                          </details></td></tr>
                        </React.Fragment>;
                      }) : <tr><td colSpan={6} className="px-5 py-14 text-center"><p className="text-sm font-semibold text-foreground">No debit notes for this vendor</p><p className="mt-1 text-xs text-muted-foreground">Debit note records will appear here when a claim is created.</p></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: SOURCED MATERIALS */}
            {activeTab === 'materials' && (
              <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
                <div className="p-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-card">
                  <div>
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      {rawVendor?.address && typeof rawVendor.address === 'object' && (rawVendor.address as Record<string, unknown>).vendorType === 'OUTSOURCING' ? 'Outsourced Items' : 'Supplied Items Catalog'}
                    </h2>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold">Description</TableHead>
                        <TableHead className="font-bold">Category</TableHead>
                        <TableHead className="font-bold">Unit (UOM)</TableHead>
                        <TableHead className="text-right font-bold">Price (₹)</TableHead>
                        <TableHead className="text-right font-bold">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendor.capabilities && vendor.capabilities.length > 0 ? (
                        (vendor.capabilities as any[]).map((cap: any) => {
                          const item = cap.material || cap.product;
                          const itemName = item?.name || '—';
                          const itemSpecs = cap.material?.specs || {};
                          const itemMetadata = cap.product?.metadata || {};
                          const isVariant = Boolean(itemSpecs.isVariant || itemMetadata.isVariant || item?.parentName);
                          const parentName = item?.parentName || itemSpecs.parentMaterialName || itemMetadata.parentProductName;
                          const variantLabel = isVariant
                            ? getVariantLabel(parentName, itemName, itemSpecs.measurementValue || itemMetadata.measurementValue || 'Variant')
                            : '';
                          const category = cap.material?.category?.name || cap.product?.category?.name || cap.material?.category?.code || cap.product?.category?.code || 'Uncategorized';
                          const uomSymbol = cap.material?.uom?.symbol || cap.material?.uom?.code || cap.product?.uom?.symbol || cap.product?.uom?.code || '—';
                          const price = cap.unitPrice == null ? null : Number(cap.unitPrice);
                          const linkUrl = cap.material ? `/inventory/materials/${cap.material.id}` : cap.product ? `/inventory/products/${cap.product.id}` : '#';

                          return (
                            <TableRow key={cap.id}>
                              <TableCell className="font-semibold text-foreground">
                                <div>{isVariant && parentName ? parentName : itemName}</div>
                                {isVariant && <div className="mt-1 flex items-center gap-2"><span className="text-[11px] font-medium text-muted-foreground">{variantLabel}</span><span className="shrink-0 rounded-md border border-tone-purple-solid/25 bg-tone-purple-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-tone-purple-text">Variant</span></div>}
                              </TableCell>
                              <TableCell className="text-xs font-medium text-foreground">{category}</TableCell>
                              <TableCell className="font-mono text-muted-foreground">{uomSymbol}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-foreground">
                                {price == null ? '—' : `₹ ${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </TableCell>
                              <TableCell className="text-right">
                                <Link
                                  href={linkUrl}
                                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  View details <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                            No supplied items are linked to this vendor yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>


      {/* PROFILE SHEET MODAL */}
      {isSpecSheetOpen && (
        <VendorProfileSheetModal
          vendor={vendor}
          rawVendor={rawVendor}
          fullAddress={fullAddress}
          onClose={() => setIsSpecSheetOpen(false)}
        />
      )}

      {/* BARCODE MODAL */}
      {isBarcodeOpen && (
        <VendorBarcodeModal
          vendor={vendor}
          onClose={() => setIsBarcodeOpen(false)}
        />
      )}
    </div>
  );
}


// ----------------------------------------------------------------------
// MODAL: Vendor Profile Sheet Modal
// ----------------------------------------------------------------------
function VendorProfileSheetModal({
  vendor,
  rawVendor,
  fullAddress,
  onClose,
}: {
  vendor: VendorProfile;
  rawVendor?: VendorSummary;
  fullAddress: string;
  onClose: () => void;
}) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${vendor.name}-vendor-profile`,
  });
  const primaryContact = vendor.contacts?.find((contact) => contact.isPrimary) || vendor.contacts?.[0];
  const catalogItems = (vendor.capabilities || []) as Array<Record<string, any>>;
  const profileFields = [
    ['Vendor code', vendor.code],
    ['Status', vendor.status.replace(/_/g, ' ')],
    ['GSTIN / Tax ID', vendor.taxNumber || '—'],
    ['Currency', vendor.currency || 'INR'],
    ['Payment terms', vendor.paymentTerms || '—'],
    ['Lead time', rawVendor?.leadTimeDays != null ? `${rawVendor.leadTimeDays} days` : '—'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Printer className="h-4 w-4" /></div>
            <div><h2 className="text-sm font-bold text-foreground">Vendor Profile</h2><p className="text-xs text-muted-foreground">Current contact, address, terms, and supplied items</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handlePrint()} className="h-9 rounded-lg text-xs font-semibold" icon={Printer}>Print / Save PDF</Button>
            <button type="button" onClick={onClose} aria-label="Close print preview" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/20 p-5 sm:p-8 print:overflow-visible print:bg-surface print:p-0">
          <article ref={printRef} className="printable-document print-target mx-auto block w-full max-w-4xl space-y-6 bg-surface p-6 text-ink shadow-sm print:visible print:max-w-none print:space-y-5 print:p-0 print:shadow-none">
            <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-[color:var(--action-primary-bg)] pb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--action-primary-bg)]">Plinth · Vendor Directory</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">{vendor.name}</h1>
                <p className="mt-2 text-xs text-ink-secondary">Vendor profile generated {new Date().toLocaleDateString('en-IN')}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted px-4 py-3 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Vendor status</p>
                <p className="mt-1 text-sm font-bold uppercase text-[color:var(--action-primary-bg)]">{vendor.status.replace(/_/g, ' ')}</p>
                <p className="mt-2 text-xs font-semibold text-ink-secondary">Score {vendor.score != null ? `${vendor.score}/100` : 'N/A'}</p>
              </div>
            </header>

            <section className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--action-primary-bg)]">Vendor details</h2></div>
              <dl className="grid grid-cols-1 gap-x-8 px-4 sm:grid-cols-2 lg:grid-cols-3">
                {profileFields.map(([label, value]) => <div key={label} className="border-b border-border py-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-ink">{value}</dd></div>)}
              </dl>
            </section>

            <section className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--action-primary-bg)]">Key contact &amp; dispatch</h2></div>
              <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2">
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Contact person</p><p className="mt-1 text-sm font-semibold">{typeof primaryContact?.name === 'string' ? primaryContact.name : '—'}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">PO delivery email</p><p className="mt-1 break-all text-sm font-medium">{vendor.contactEmail || '—'}</p></div>
                <div><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Phone</p><p className="mt-1 text-sm font-medium">{vendor.contactPhone || '—'}</p></div>
                <div className="sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Registered address</p><p className="mt-1 text-sm leading-6">{fullAddress}</p></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--action-primary-bg)]">Supplied items</h2><span className="text-xs font-semibold text-ink-muted">{catalogItems.length} items</span></div>
              {catalogItems.length ? <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead className="bg-surface text-[10px] uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Price</th></tr></thead><tbody className="divide-y divide-border">{catalogItems.map((cap) => { const item = cap.material || cap.product; const itemPrice = cap.unitPrice == null ? null : Number(cap.unitPrice); return <tr key={String(cap.id)}><td className="px-4 py-3 font-semibold">{item?.name || 'Catalog item'}</td><td className="px-4 py-3">{cap.material ? 'Material' : cap.product ? 'Product' : 'Item'}</td><td className="px-4 py-3 text-right font-mono font-semibold">{itemPrice == null ? '—' : `₹${itemPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td></tr>; })}</tbody></table></div> : <p className="px-4 py-6 text-sm text-ink-muted">No supplied items are linked to this vendor.</p>}
            </section>

            {(vendor.performance?.onTimeRate != null || vendor.performance?.qualityRate != null || vendor.performance?.fillRate != null) && <section className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--action-primary-bg)]">Performance summary</h2></div>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">{[['On-time delivery', vendor.performance?.onTimeRate], ['Quality acceptance', vendor.performance?.qualityRate], ['Order fill rate', vendor.performance?.fillRate]].filter((entry) => entry[1] != null).map(([label, value]) => <div key={String(label)}><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-1 text-lg font-bold">{value}%</p></div>)}</div>
            </section>}
            <footer className="border-t border-border pt-3 text-[10px] text-ink-muted">Generated from the current vendor directory record.</footer>
          </article>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// MODAL: Vendor Barcode Modal
// ----------------------------------------------------------------------
function VendorBarcodeModal({
  vendor,
  onClose,
}: {
  vendor: VendorProfile;
  onClose: () => void;
}) {
  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${vendor.code}-inbound-tag`,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse backdrop-blur-xs animate-in fade-in duration-200 p-4">
      <div className="w-full max-w-sm bg-card rounded-xl shadow-none border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Inbound Vendor Tag
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div ref={printRef} className="print-label-document p-6 text-center space-y-4 bg-surface">
          <div className="p-4 rounded-2xl bg-surface border border-border inline-block shadow-sm">
            <div className="w-48 h-48 mx-auto flex items-center justify-center bg-surface p-2">
              {(() => {
                const qrValue = vendor.code || vendor.id;
                try {
                  const matrix = generateQRCodeMatrix(qrValue);
                  const size = matrix.length;
                  const cellSize = 100 / size;
                  return (
                    <svg viewBox="0 0 100 100" className="w-full h-full" shapeRendering="crispEdges">
                      <rect width="100" height="100" fill="#FFFFFF" />
                      {matrix.map((row, r) =>
                        row.map((cell, c) =>
                          cell ? (
                            <rect
                              key={`${r}-${c}`}
                              x={c * cellSize}
                              y={r * cellSize}
                              width={cellSize}
                              height={cellSize}
                              fill="var(--text-primary)"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  );
                } catch (e) {
                  return (
                    <div className="w-full h-full bg-muted flex items-center justify-center font-mono text-xs">
                      {qrValue}
                    </div>
                  );
                }
              })()}
            </div>
            <p className="font-mono text-xs font-bold text-ink mt-2 tracking-wider">{vendor.code}</p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground">{vendor.name}</h3>
          </div>

          <div className="print:hidden pt-2">
            <Button size="sm" onClick={() => handlePrint()} className="w-full h-9 rounded-lg text-xs" icon={Printer}>
              Print Inbound Barcode Tag
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
