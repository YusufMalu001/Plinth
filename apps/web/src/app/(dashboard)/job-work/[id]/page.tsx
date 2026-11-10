'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Factory,
  Building2,
  Send,
  CheckCircle2,
  Package,
  Layers,
  Scale,
  ExternalLink,
  Truck,
  Plus,
  RefreshCw,
  Check,
  Printer,
  FileText,
  FileCheck
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { Button, Card } from '@synergy/ui';
import { useJobWorkOrderDetail } from '@/features/job-work/hooks';
import { jobWorkApi } from '@/features/job-work/api';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { IssueChallanModal } from '@/features/job-work/components/IssueChallanModal';
import { JobWorkOrderPDF } from '@/components/JobWorkOrderPDF';
export default function JobWorkOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const { order, loading, error, refresh } = useJobWorkOrderDetail(id);

  // Active tab inside detail page
  const [activeTab, setActiveTab] = useState<'overview' | 'lines' | 'challans' | 'returns'>('overview');
  const [viewMode, setViewMode] = useState<'details' | 'document'>('details');
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: order ? `JWO-${order.orderNumber}` : 'Job Work Order',
  });

  // Modals state
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 w-full bg-muted/20 p-8 flex items-center justify-center">
        <LoadingState message="Loading Job Work Order details..." />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex-1 w-full bg-muted/20 p-8 flex flex-col items-center justify-center">
        <ErrorState
          error={error ? new Error(error) : new Error('Job Work Order not found.')}
          retry={() => { void refresh(); }}
        />
        <Link href="/job-work" className="mt-4">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Job Work Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await jobWorkApi.approveOrder(order.id);
      await refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve job work order.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      setActionLoading(true);
      await jobWorkApi.closeOrder(order.id);
      await refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to close job work order.');
    } finally {
      setActionLoading(false);
    }
  };

  // Computations
  const totalIssued = order.challans?.reduce((sum, c) => sum + Number(c.quantity || 0), 0) || 0;
  const totalReceived = order.returns?.reduce((sum, r) => sum + Number(r.receivedQuantity || 0), 0) || 0;
  const totalAccepted = order.returns?.reduce((sum, r) => sum + Number(r.acceptedQuantity || 0), 0) || 0;
  const totalConsumed = order.returns?.reduce((sum, r) => sum + Number(r.consumedRawMaterial || 0), 0) || 0;
  const totalScrap = order.returns?.reduce((sum, r) => sum + Number(r.scrapQuantity || 0), 0) || 0;
  const totalShortage = order.returns?.reduce((sum, r) => sum + Number(r.shortQuantity || 0), 0) || 0;
  const outstandingCustody = Math.max(0, totalIssued - totalConsumed - totalScrap);
  const issuedUom = order.challans?.[0]?.uom?.symbol || order.challans?.[0]?.uom?.code || (order.lines?.[0]?.uom?.symbol || order.lines?.[0]?.uom?.code) || 'Units';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 pb-16">
      {/* Top Header & Breadcrumb Ribbon */}
      <div className="border-b border-border bg-card w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5">
          <nav className="mb-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/job-work" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft size={13} /> Job Work & Outsourced Processing
            </Link>
            <span className="text-border">/</span>
            <span className="font-mono font-medium text-foreground">{order.orderNumber}</span>
          </nav>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Factory className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Outsourced Processing Order
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-0.5">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                    {order.orderNumber}
                  </h1>
                  <span className="text-sm font-semibold text-muted-foreground">
                    · Partner: <strong className="text-foreground">{order.vendor?.name || 'Unknown Vendor'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Document / Details Toggle */}
              <div className="inline-flex items-center p-0.5 rounded-xl bg-muted/60 border border-border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('details')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'details'
                      ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  <span>Order Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('document')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'document'
                      ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Official Document</span>
                </button>
              </div>

              {viewMode === 'document' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePrint()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-2xs gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Job Work Order
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh()}
                className="font-semibold gap-1.5 border-border bg-background shadow-xs text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              {order.status === 'DRAFT' && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleApprove}
                  className="font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  Approve Order
                </Button>
              )}

              {order.status === 'APPROVED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIssueModalOpen(true)}
                  className="font-semibold gap-2 border-border bg-background shadow-xs text-foreground"
                >
                  <Send className="h-4 w-4 text-primary" />
                  Issue Challan
                </Button>
              )}

              {order.status !== 'CLOSED' && order.status !== 'DRAFT' && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleClose}
                  className="font-bold gap-2 bg-slate-800 hover:bg-slate-900 text-white shadow-xs dark:bg-slate-200 dark:text-slate-900"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Close Order
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Document View Mode */}
      {viewMode === 'document' ? (
        <div className="p-4 sm:p-6 lg:p-8 flex justify-center">
          <div className="w-full max-w-[850px] bg-white shadow-2xl rounded-sm border border-border/40 overflow-hidden">
            <JobWorkOrderPDF ref={printRef} order={order} isPrintPreview />
          </div>
        </div>
      ) : (
        /* Main Details Content Area */
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* KPI Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Raw Material Allocation
              </span>
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-foreground">
                {order.rawMaterialInputQty} MT / Units
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Allocated from inventory deposit
              </p>
            </div>
          </Card>

          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Issued to Vendor
              </span>
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Send className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-foreground">
                {totalIssued} {issuedUom}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {order.challans?.length || 0} delivery challans
              </p>
            </div>
          </Card>

          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Target Output
              </span>
              <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-600 dark:text-indigo-400">
                <Package className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-foreground">
                {order.targetQuantity} {order.targetUom?.symbol || order.targetUom?.code || 'Units'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Received: {totalReceived} ({totalAccepted} accepted)
              </p>
            </div>
          </Card>

          <Card className="p-5 border-border bg-card shadow-xs rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Vendor Custody Balance
              </span>
              <div className={`rounded-xl p-2.5 ${outstandingCustody > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                <Scale className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-foreground">
                {outstandingCustody} {issuedUom}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {totalShortage > 0 ? `${totalShortage} units shortage flagged` : 'Material unconsumed in custody'}
              </p>
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Order Overview
          </button>
          <button
            onClick={() => setActiveTab('lines')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'lines'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            BOM / Lines ({order.lines?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('challans')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'challans'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Delivery Challans ({order.challans?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'returns'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Goods Receipts / Returns ({order.returns?.length || 0})
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
              {/* Partner & Processing Information */}
              <Card className="p-6 border-border bg-card shadow-xs rounded-2xl">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Vendor & Processing Specifications
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold">Vendor Partner</span>
                    <div className="font-bold text-foreground text-sm">{order.vendor?.name || '—'}</div>
                    <div className="text-muted-foreground font-mono">{order.vendor?.code}</div>
                    {order.vendor?.contactEmail && (
                      <div className="text-muted-foreground">{order.vendor.contactEmail}</div>
                    )}
                    {order.vendor?.contactPhone && (
                      <div className="text-muted-foreground">{order.vendor.contactPhone}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold">Nature of Processing</span>
                    <div className="font-bold text-foreground text-sm">
                      {order.natureOfProcessing || 'General Processing'}
                    </div>
                    {order.product && (
                      <div className="text-muted-foreground">
                        Target SKU: <span className="font-semibold text-foreground">{order.product.sku}</span> - {order.product.name}
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      Expected Scrap Rate: <span className="font-semibold text-foreground">{order.expectedScrapRate ?? 0}%</span>
                    </div>
                  </div>
                </div>

                {order.specifications && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <span className="text-xs text-muted-foreground font-semibold block mb-1">
                      Technical Specifications & Tolerances
                    </span>
                    <p className="text-xs text-foreground bg-muted/40 p-3 rounded-xl border border-border/50">
                      {order.specifications}
                    </p>
                  </div>
                )}

                {order.notes && (
                  <div className="mt-3">
                    <span className="text-xs text-muted-foreground font-semibold block mb-1">
                      Notes & Instructions
                    </span>
                    <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border border-border/50">
                      {order.notes}
                    </p>
                  </div>
                )}
              </Card>

              {/* Linked Purchase Order & Logistics */}
              <Card className="p-6 border-border bg-card shadow-xs rounded-2xl">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-indigo-500" />
                  Logistics & Linked Documents
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold">Linked Purchase Order</span>
                    {order.purchaseOrder ? (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/procurement/purchase-orders/${order.purchaseOrder.id}`}
                          className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          {order.purchaseOrder.poNumber}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <StatusBadge status={order.purchaseOrder.status as unknown as import('@/components/StatusBadge').AnyStatus} />
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Direct Outsource (No linked PO)</div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground font-semibold">Delivery Location</span>
                    <div className="font-bold text-foreground">
                      {order.deliveryLocation ? `${order.deliveryLocation.name} (${order.deliveryLocation.code})` : 'Main Production Yard'}
                    </div>
                  </div>
                </div>
              </Card>
          </div>
        )}

        {/* Tab 2: BOM Lines */}
        {activeTab === 'lines' && (
          <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Required Materials & Input Quantities
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-b border-border">
                  <tr>
                    <th className="p-3.5">Material / Item</th>
                    <th className="p-3.5">Required Qty</th>
                    <th className="p-3.5">Allocated Qty</th>
                    <th className="p-3.5">Issued Qty</th>
                    <th className="p-3.5">Returned Qty</th>
                    <th className="p-3.5">Consumed Qty</th>
                    <th className="p-3.5">Scrap Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!order.lines || order.lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No individual BOM lines defined for this job work order.
                      </td>
                    </tr>
                  ) : (
                    order.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/30 transition">
                        <td className="p-3.5">
                          <div className="font-bold text-foreground">
                            {line.material?.name || line.product?.name || 'Raw Material Input'}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {line.material?.code || line.product?.sku}
                          </div>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-foreground">
                          {line.requiredQuantity} {line.uom?.symbol || 'Units'}
                        </td>
                        <td className="p-3.5 font-mono text-muted-foreground">
                          {line.allocatedQuantity}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-primary">
                          {line.issuedQuantity}
                        </td>
                        <td className="p-3.5 font-mono text-muted-foreground">
                          {line.returnedQuantity}
                        </td>
                        <td className="p-3.5 font-mono text-foreground font-semibold">
                          {line.consumedQuantity}
                        </td>
                        <td className="p-3.5 font-mono text-muted-foreground">
                          {line.scrapQuantity}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Tab 3: Delivery Challans */}
        {activeTab === 'challans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Material Delivery Challans (Outward to Vendor)
              </h3>
              {order.status === 'APPROVED' && (
                <Button
                  size="sm"
                  onClick={() => setIssueModalOpen(true)}
                  className="font-bold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Issue New Challan
                </Button>
              )}
            </div>

            <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Challan Number</th>
                      <th className="p-3.5">Dispatched Material</th>
                      <th className="p-3.5">Quantity</th>
                      <th className="p-3.5">Vehicle / Logistics</th>
                      <th className="p-3.5">Issued Date</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!order.challans || order.challans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          No delivery challans issued yet.
                        </td>
                      </tr>
                    ) : (
                      order.challans.map((challan) => (
                        <tr key={challan.id} className="hover:bg-muted/30 transition">
                          <td className="p-3.5 font-mono font-bold text-primary">
                            <Link
                              href={`/job-work/challans/${challan.id}`}
                              className="hover:underline flex items-center gap-1 group"
                            >
                              <span>{challan.challanNumber}</span>
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </td>
                          <td className="p-3.5">
                            <div className="font-bold text-foreground">
                              {challan.material?.name || challan.product?.name || 'Raw Material'}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {challan.material?.code || challan.product?.sku}
                            </div>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-foreground">
                            {challan.quantity} {challan.uom?.symbol || 'Units'}
                          </td>
                          <td className="p-3.5">
                            <div className="font-semibold text-foreground">
                              {challan.vehicleNumber || '—'}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {challan.transporterName || 'Self Transport'}
                            </div>
                          </td>
                          <td className="p-3.5 text-muted-foreground">
                            {new Date(challan.issuedAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </td>
                          <td className="p-3.5 text-right">
                            <Link href={`/job-work/challans/${challan.id}`}>
                              <Button variant="outline" size="sm" className="text-xs font-semibold gap-1">
                                View Challan
                              </Button>
                            </Link>
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

        {/* Tab 4: Returns / Receipts */}
        {activeTab === 'returns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Processed Goods Receipts & Inward Returns
              </h3>
            </div>

            <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground uppercase font-bold border-b border-border">
                    <tr>
                      <th className="p-3.5">Return #</th>
                      <th className="p-3.5">Output Product</th>
                      <th className="p-3.5">Received / Accepted</th>
                      <th className="p-3.5">Consumed Raw Mat.</th>
                      <th className="p-3.5">Scrap Qty</th>
                      <th className="p-3.5">Shortage</th>
                      <th className="p-3.5">Linked GRN</th>
                      <th className="p-3.5">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {!order.returns || order.returns.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          No returns or goods receipts recorded yet.
                        </td>
                      </tr>
                    ) : (
                      order.returns.map((ret) => (
                        <tr key={ret.id} className="hover:bg-muted/30 transition">
                          <td className="p-3.5 font-mono font-bold text-foreground">
                            {ret.returnNumber}
                          </td>
                          <td className="p-3.5">
                            <div className="font-bold text-foreground">
                              {ret.product?.name || ret.material?.name || 'Processed Product'}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {ret.product?.sku || ret.material?.code}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="font-mono font-bold text-foreground">
                              {ret.receivedQuantity} {ret.uom?.symbol || 'Units'}
                            </div>
                            <div className="text-[11px] text-emerald-600 font-semibold">
                              Accepted: {ret.acceptedQuantity}
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-foreground font-semibold">
                            {ret.consumedRawMaterial} MT
                          </td>
                          <td className="p-3.5 font-mono text-muted-foreground">
                            {ret.scrapQuantity} MT
                          </td>
                          <td className="p-3.5 font-mono font-bold text-rose-600">
                            {ret.shortQuantity > 0 ? `${ret.shortQuantity} Short` : '—'}
                          </td>
                          <td className="p-3.5">
                            {ret.goodsReceipt ? (
                              <Link
                                href={`/receiving/goods-receipts/${ret.goodsReceipt.id}`}
                                className="font-mono font-bold text-primary hover:underline flex items-center gap-1"
                              >
                                {ret.goodsReceipt.grnNumber}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3.5 text-muted-foreground">
                            {new Date(ret.receivedAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
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

        </div>
      )}

      {/* Action Modals */}
      <IssueChallanModal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        onSuccess={() => {
          setIssueModalOpen(false);
          refresh();
        }}
        defaultVendorId={order.vendorId}
        defaultJobWorkOrderId={order.id}
      />

    </div>
  );
}
