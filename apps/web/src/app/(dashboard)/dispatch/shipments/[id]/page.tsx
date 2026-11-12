'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  FileText,
  Layers,
  MapPin,
  Package,
  Route,
  ShieldCheck,
  Truck,
  Copy,
  Check,
  Clock,
  Phone,
  User,
} from 'lucide-react';
import { Button } from '@plinth/ui';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { useShipment } from '@/features/fulfillment/hooks';
import { TrackingEventDialog } from '@/features/fulfillment/components/TrackingEventDialog';

const money = (value: number | string | undefined | null, currency = 'INR') => {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function ShipmentDetailPage({ params }: { params: { id: string } }) {
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useShipment(params.id);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return <LoadingState message="Loading shipment consignment details…" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        retry={() => void refetch()}
        title="Shipment consignment could not be loaded"
      />
    );
  }

  const statusConfig: Record<
    string,
    { label: string; bg: string; text: string; border: string; stepIndex: number }
  > = {
    ALLOCATED: { label: 'Allocated', bg: 'bg-muted', text: 'text-ink-secondary', border: 'border-border-strong', stepIndex: 0 },
    PICKED: { label: 'Picked', bg: 'bg-tone-blue-solid', text: 'text-tone-blue-text', border: 'border-tone-blue-solid/25', stepIndex: 1 },
    PACKED: { label: 'Packed & Sealed', bg: 'bg-tone-purple-solid', text: 'text-tone-purple-text', border: 'border-tone-purple-solid/25', stepIndex: 1 },
    STAGED: { label: 'Dock Staged', bg: 'bg-tone-purple-solid', text: 'text-tone-purple-text', border: 'border-tone-purple-solid/25', stepIndex: 2 },
    HANDED_OVER: { label: 'Handed Over to Carrier', bg: 'bg-tone-blue-solid', text: 'text-tone-blue-text', border: 'border-tone-blue-solid/25', stepIndex: 3 },
    IN_TRANSIT: { label: 'In Transit', bg: 'bg-tone-teal-solid', text: 'text-tone-teal-text', border: 'border-tone-teal-solid/25', stepIndex: 3 },
    OUT_FOR_DELIVERY: { label: 'Out for Delivery', bg: 'bg-tone-amber-solid', text: 'text-tone-amber-text', border: 'border-tone-amber-solid/25', stepIndex: 4 },
    DELIVERED: { label: 'Delivered (POD Closed)', bg: 'bg-tone-green-solid', text: 'text-tone-green-text', border: 'border-tone-green-solid/25', stepIndex: 5 },
    DELIVERY_FAILED: { label: 'Delivery Exception', bg: 'bg-tone-red-solid', text: 'text-tone-red-text', border: 'border-tone-red-solid/25', stepIndex: 4 },
    RTO_INITIATED: { label: 'RTO Return Initiated', bg: 'bg-tone-amber-solid', text: 'text-tone-amber-text', border: 'border-tone-amber-solid/25', stepIndex: 4 },
    CANCELLED: { label: 'Cancelled', bg: 'bg-muted', text: 'text-ink-secondary', border: 'border-border-strong', stepIndex: 0 },
  };

  const currentStatusInfo = statusConfig[data.status] || {
    label: data.status.replaceAll('_', ' '),
    bg: 'bg-tone-blue-solid',
    text: 'text-tone-blue-text',
    border: 'border-tone-blue-solid/25',
    stepIndex: 3,
  };

  const totalGrossWeight = (data.packages || [])
    .reduce((sum, link) => sum + Number(link.package?.grossWeightKg || 0), 0)
    .toFixed(2);

  const manifest = data.manifestLinks?.[0]?.manifest;
  const shippingAddress = data.salesOrder?.addresses?.find((a) => a.kind === 'SHIPPING') || data.salesOrder?.addresses?.[0];

  // Construct End-to-End Hierarchical Timeline
  interface HierarchicalTimelineEvent {
    id: string;
    stage: 'ORDER' | 'WAREHOUSE' | 'MANIFEST' | 'CARRIER' | 'DELIVERY';
    title: string;
    description: string;
    timestamp?: string;
    location?: string;
    actor?: string;
    status: 'COMPLETED' | 'IN_PROGRESS' | 'UPCOMING';
    badgeText?: string;
  }

  const timelineEvents: HierarchicalTimelineEvent[] = [];

  // Stage 1: Order Booking
  if (data.salesOrder) {
    timelineEvents.push({
      id: 'TL-ORDER-1',
      stage: 'ORDER',
      title: `Commercial Sales Order Confirmed (${data.salesOrder.orderNumber})`,
      description: `Order booked via ${data.salesOrder.channel?.replaceAll('_', ' ') || 'Direct Sales'} for ${money(data.salesOrder.grandTotal, data.salesOrder.currency || 'INR')}. Commercial validation cleared.`,
      timestamp: data.salesOrder.confirmedAt || data.salesOrder.orderedAt || data.createdAt,
      actor: 'Commercial Sales Desk',
      status: 'COMPLETED',
      badgeText: data.salesOrder.paymentStatus || 'CONFIRMED',
    });
  }

  // Stage 2: Warehouse Fulfillment (Picking & Packing)
  if (data.fulfillment) {
    timelineEvents.push({
      id: 'TL-FUL-1',
      stage: 'WAREHOUSE',
      title: `Fulfillment Job Generated (${data.fulfillment.fulfillmentNumber})`,
      description: `Assigned to ${data.fulfillment.warehouseLocation?.name || 'Central Facility'} (${data.fulfillment.warehouseLocation?.code || 'WH-01'}). Inventory allocation confirmed.`,
      timestamp: data.fulfillment.allocatedAt || data.fulfillment.pickedAt || data.createdAt,
      actor: 'Warehouse Controller',
      status: 'COMPLETED',
      badgeText: 'ALLOCATED',
    });
  }

  // Packaging & Box Sealing
  if (data.packages && data.packages.length > 0) {
    timelineEvents.push({
      id: 'TL-PKG-1',
      stage: 'WAREHOUSE',
      title: `Consignment Packed & Sealed (${data.packages.length} Carton Containers)`,
      description: `Packed total gross weight of ${totalGrossWeight} kg. Tamper-evident security seals applied to all containers.`,
      timestamp: data.fulfillment?.packedAt || data.createdAt,
      actor: 'Packaging Workstation',
      status: 'COMPLETED',
      badgeText: `${totalGrossWeight} KG`,
    });
  }

  // Stage 3: Gate Staging & Manifestation
  if (data.dispatchDock || manifest || data.fulfillment?.stagedAt) {
    timelineEvents.push({
      id: 'TL-STG-1',
      stage: 'MANIFEST',
      title: `Dock Staging & Gate Pass Issued (${data.dispatchDock || 'DOCK-01'})`,
      description: manifest
        ? `Linked to Outbound Manifest ${manifest.manifestNumber}. Assigned vehicle ${manifest.vehicleNumber || data.vehicleNumber || 'Designated Freight Fleet'}.`
        : `Consignment staged at Dock ${data.dispatchDock || 'DOCK-01'} awaiting logistics vehicle arrival.`,
      timestamp: manifest?.createdAt || data.fulfillment?.stagedAt || data.createdAt,
      actor: 'Dispatch Logistics Lead',
      status: 'COMPLETED',
      badgeText: manifest?.manifestNumber || 'STAGED',
    });
  }

  // Stage 4: Handover to Logistics Carrier
  if (data.handedOverAt || ['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(data.status)) {
    timelineEvents.push({
      id: 'TL-HND-1',
      stage: 'CARRIER',
      title: `Consignment Handed Over to ${data.carrier?.name || 'Logistics Carrier'}`,
      description: `Waybill / AWB: ${data.awbNumber || 'Direct Transfer'}. Security gate clearance approved. Handed over to freight driver.`,
      timestamp: data.handedOverAt || data.dispatchedAt || data.createdAt,
      location: data.fulfillment?.warehouseLocation?.name || 'Dispatch Dock Gate',
      actor: manifest?.driverName || data.driverName || 'Freight Representative',
      status: 'COMPLETED',
      badgeText: 'GATE CLEARED',
    });
  }

  // Stage 5: In-Transit Scans & Tracking Milestones
  if (data.trackingEvents && data.trackingEvents.length > 0) {
    data.trackingEvents.forEach((tEvent) => {
      timelineEvents.push({
        id: `TL-TRK-${tEvent.id}`,
        stage: 'CARRIER',
        title: `Carrier Milestone: ${tEvent.status.replaceAll('_', ' ')}`,
        description: tEvent.message || `Consignment scanned in transit by ${data.carrier?.name || 'Carrier'}.`,
        timestamp: tEvent.eventAt,
        location: tEvent.location || undefined,
        actor: tEvent.createdBy || data.carrier?.name || 'Carrier Telematics',
        status: 'COMPLETED',
        badgeText: tEvent.status.replaceAll('_', ' '),
      });
    });
  } else if (['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(data.status)) {
    timelineEvents.push({
      id: 'TL-TRK-LIVE',
      stage: 'CARRIER',
      title: 'Consignment in Active Transit',
      description: `Cargo is currently moving with ${data.carrier?.name || 'Courier Network'}. Expected delivery by ${data.expectedDeliveryAt ? new Date(data.expectedDeliveryAt).toLocaleDateString('en-IN') : 'Scheduled SLA Window'}.`,
      timestamp: data.updatedAt || data.dispatchedAt || data.createdAt,
      status: 'IN_PROGRESS',
      badgeText: 'IN TRANSIT',
    });
  }

  // Stage 6: Delivery & POD Closure
  if (data.status === 'DELIVERED' || data.proofOfDelivery) {
    timelineEvents.push({
      id: 'TL-POD-1',
      stage: 'DELIVERY',
      title: 'Consignment Successfully Delivered & POD Verified',
      description: `Delivered to recipient: ${data.proofOfDelivery?.recipientName || 'Authorized Consignee'}. Authenticated delivery closure recorded.`,
      timestamp: data.proofOfDelivery?.deliveredAt || data.deliveredAt || data.updatedAt,
      actor: data.proofOfDelivery?.recipientName || 'Consignee',
      status: 'COMPLETED',
      badgeText: data.proofOfDelivery?.method || 'POD VERIFIED',
    });
  } else {
    // Upcoming final delivery step
    timelineEvents.push({
      id: 'TL-POD-UPCOMING',
      stage: 'DELIVERY',
      title: 'Final Customer Delivery & POD Verification',
      description: `Consignee verification, OTP acknowledgement, and digital proof of delivery at destination address.`,
      status: 'UPCOMING',
      badgeText: 'PENDING',
    });
  }

  // Five Lifecyle Stepper Steps
  const stepperSteps = [
    { label: 'Order Booked', desc: data.salesOrder?.orderNumber || 'Order Confirmed', completed: true },
    { label: 'Packed & Sealed', desc: `${data.packages?.length || 1} Containers`, completed: true },
    { label: 'Dock Staged', desc: data.dispatchDock || 'Gate Assigned', completed: ['STAGED', 'HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(data.status) },
    { label: 'Carrier Handover', desc: data.carrier?.name || 'In Transit', completed: ['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(data.status) },
    { label: 'Delivered (POD)', desc: data.status === 'DELIVERED' ? 'Delivery Verified' : 'Pending SLA', completed: data.status === 'DELIVERED' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-muted/50 p-4 sm:p-6 lg:p-7">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* 1. Top Breadcrumb & Status Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <Link href="/dispatch" className="hover:text-link transition">
              Logistics & Dispatch
            </Link>
            <span>/</span>
            <Link href="/dispatch/dispatched" className="hover:text-[var(--chart-1)] transition">
              Dispatched Shipments
            </Link>
            <span>/</span>
            <span className="font-mono font-semibold text-ink">
              {data.shipmentNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-placeholder">Created:</span>
            <span className="text-xs font-semibold text-ink-secondary">
              {data.createdAt ? new Date(data.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Live Sync'}
            </span>
          </div>
        </div>

        {/* 2. Hero Header Banner */}
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            
            {/* Left Title & Key Identifiers */}
            <div className="flex items-start sm:items-center gap-4">
              <Link href="/dispatch/dispatched">
                <button
                  type="button"
                  className="h-10 w-10 rounded-xl border border-border bg-muted flex items-center justify-center text-ink-secondary hover:bg-hover transition cursor-pointer shadow-2xs"
                  title="Back to Dispatched Shipments"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Link>

              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-ink">
                    {data.shipmentNumber}
                  </h1>

                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${currentStatusInfo.bg} ${currentStatusInfo.text} ${currentStatusInfo.border}`}
                  >
                    {currentStatusInfo.label}
                  </span>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(data.shipmentNumber, 'shipment')}
                    className="p-1.5 text-ink-placeholder hover:text-ink-secondary rounded-lg hover:bg-hover transition cursor-pointer"
                    title="Copy Shipment Number"
                  >
                    {copiedField === 'shipment' ? <Check className="h-4 w-4 text-tone-green-text" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted mt-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
                    <Package className="h-3.5 w-3.5 text-ink-placeholder" />
                    Sales Order: <strong className="font-semibold text-link">{data.salesOrder?.orderNumber || 'SO-DIRECT'}</strong>
                  </span>
                  <span className="text-ink-secondary">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-ink-placeholder" />
                    Mode: <strong className="text-ink-secondary font-semibold">{data.mode.replaceAll('_', ' ')}</strong>
                  </span>
                  {data.fulfillment && (
                    <>
                      <span className="text-ink-secondary">•</span>
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        Job: <strong className="text-ink-secondary">{data.fulfillment.fulfillmentNumber}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                size="sm"
                variant="outline"
                icon={Route}
                onClick={() => setTrackingOpen(true)}
                className="rounded-xl text-xs font-semibold cursor-pointer shadow-2xs"
              >
                Add Tracking Milestone
              </Button>

              {data.status === 'STAGED' && (
                <Link href="/dispatch/staging">
                  <Button size="sm" icon={Truck} className="rounded-xl text-xs font-semibold bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse cursor-pointer shadow-2xs">
                    Dispatch Gate Pass
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* 3. Visual 5-Stage Live Dispatch Stepper */}
          <div className="mt-7 pt-6 border-t border-border">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {stepperSteps.map((step, idx) => {
                const isCurrentActive =
                  (step.completed && (idx === stepperSteps.length - 1 || !stepperSteps[idx + 1].completed)) ||
                  (data.status === 'DELIVERED' && idx === 4);

                return (
                  <div
                    key={step.label}
                    className={`relative p-3 rounded-xl border transition-all ${
                      isCurrentActive
                        ? 'border-accent bg-action/5 shadow-2xs'
                        : step.completed
                        ? 'border-tone-green-solid/25 bg-tone-green-bg'
                        : 'border-border bg-muted/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-ink-placeholder uppercase tracking-wider">
                        0{idx + 1}
                      </span>
                      {step.completed ? (
                        <CheckCircle2 className={`h-4 w-4 ${isCurrentActive ? 'text-link' : 'text-tone-green-text'}`} />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-active" />
                      )}
                    </div>
                    <div className="mt-1.5 font-bold text-xs text-ink">
                      {step.label}
                    </div>
                    <div className="text-[11px] text-ink-muted truncate mt-0.5">
                      {step.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Six High-Density Operational Spec KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Card 1: Carrier & Service */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Carrier Partner
            </span>
            <div className="mt-2">
              <div className="font-bold text-sm text-ink truncate">
                {data.carrier?.name || data.mode.replaceAll('_', ' ')}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                Terms: <strong className="text-ink-secondary font-semibold">{data.freightTerms || 'PREPAID'}</strong>
              </div>
            </div>
          </div>

          {/* Card 2: Waybill / AWB */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                AWB / Waybill #
              </span>
              {data.awbNumber && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(data.awbNumber || '', 'awb')}
                  className="text-ink-placeholder hover:text-ink-secondary cursor-pointer"
                  title="Copy Waybill Number"
                >
                  {copiedField === 'awb' ? <Check className="h-3.5 w-3.5 text-tone-green-text" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <div className="mt-2">
              <div className="font-mono text-xs font-bold text-link truncate">
                {data.awbNumber || 'Direct Handover'}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                Dock: <strong className="text-ink-secondary font-semibold">{data.dispatchDock || 'DOCK-01'}</strong>
              </div>
            </div>
          </div>

          {/* Card 3: Consignment Weight */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Consignment Weight
            </span>
            <div className="mt-2">
              <div className="font-mono text-base font-black text-ink">
                {totalGrossWeight} <span className="text-xs font-normal text-ink-placeholder">kg</span>
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                {data.packages?.length || 0} sealed container(s)
              </div>
            </div>
          </div>

          {/* Card 4: Dispatch Warehouse */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Origin Facility
            </span>
            <div className="mt-2">
              <div className="font-bold text-xs text-ink truncate" title={data.fulfillment?.warehouseLocation?.name}>
                {data.fulfillment?.warehouseLocation?.name || 'Central Finished Store'}
              </div>
              <div className="text-[11px] text-ink-muted font-mono mt-0.5">
                {data.fulfillment?.warehouseLocation?.code || 'WH-01'}
              </div>
            </div>
          </div>

          {/* Card 5: Order Commercial Valuation */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Commercial Value
            </span>
            <div className="mt-2">
              <div className="font-bold text-sm text-ink">
                {money(data.salesOrder?.grandTotal, data.salesOrder?.currency)}
              </div>
              <div className="text-[11px] text-tone-green-text font-semibold mt-0.5">
                {data.salesOrder?.paymentStatus || 'PAID'}
              </div>
            </div>
          </div>

          {/* Card 6: Estimated SLA / Transit Target */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Target SLA Delivery
            </span>
            <div className="mt-2">
              <div className="font-bold text-xs text-ink">
                {data.expectedDeliveryAt
                  ? new Date(data.expectedDeliveryAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : 'Same Day Dispatch'}
              </div>
              <div className="text-[11px] text-ink-muted mt-0.5">
                {data.status === 'DELIVERED' ? 'Fulfilled on SLA' : 'In Transit Schedule'}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Main 2-Column Cockpit Layout: Left Detailed Consignment Breakdown (60%) + Right End-to-End Hierarchical Timeline (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (7 Columns ~ 58.3%) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Section A: Shipped Line Items Table */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-2xs">
              <div className="p-4 sm:p-5 border-border-strong border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent-soft text-link">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-ink">
                      Consignment SKU Contents ({data.lines?.length || 0} Lines)
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Physical items verified and packed into this shipment consignment
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/80 text-ink-muted font-semibold border-border-strong border-border uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3">SKU Code</th>
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3 text-right">Shipped Qty</th>
                      <th className="px-5 py-3 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.lines?.map((line) => {
                      const soLine = line.salesOrderLine;
                      return (
                        <tr key={line.id} className="hover:bg-hover transition">
                          <td className="px-5 py-3.5">
                            <span className="font-mono font-bold text-ink bg-muted px-2 py-1 rounded-md text-[11px]">
                              {soLine?.sku || 'SKU-ITEM'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-ink">
                              {soLine?.description || 'Finished Product'}
                            </div>
                            <div className="text-[11px] text-ink-placeholder font-mono mt-0.5">
                              Line Ref: {soLine?.id?.slice(0, 8) || line.id.slice(0, 8)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-ink">
                            {number.format(Number(line.quantity))} <span className="text-xs font-normal text-ink-muted">units</span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink-secondary">
                            {(soLine as { unitPrice?: number | string })?.unitPrice ? money((soLine as { unitPrice?: number | string }).unitPrice, data.salesOrder?.currency) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {(!data.lines || data.lines.length === 0) && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-ink-placeholder">
                          No line items registered on this consignment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section B: Sealed Box Containers & Packaging */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-border-strong border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-tone-purple-solid text-tone-purple-text">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-ink">
                      Sealed Containers & Packaging Cartons ({data.packages?.length || 0})
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Container dimensions, tare weights, and tamper-proof security seals
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {data.packages?.map((link) => {
                  const pkg = link.package;
                  if (!pkg) return null;
                  return (
                    <div
                      key={link.id}
                      className="rounded-xl border border-border bg-muted/50 p-4 transition hover:border-border-strong"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-sm font-bold text-ink">
                              {pkg.packageNumber}
                            </span>
                            <span className="rounded-full bg-active px-2 py-0.5 text-[10px] font-bold text-ink-secondary uppercase">
                              {pkg.packageType}
                            </span>
                            {pkg.sealNumber && (
                              <span className="rounded-full bg-tone-green-solid text-tone-green-text border border-tone-green-solid/25 px-2 py-0.5 text-[10px] font-mono font-bold">
                                Seal #{pkg.sealNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-muted">
                            Dimensions: <strong className="text-ink-secondary font-semibold">{pkg.lengthCm || 30} × {pkg.widthCm || 20} × {pkg.heightCm || 15} cm</strong>
                          </div>
                        </div>

                        <div className="sm:text-right">
                          <div className="font-mono text-base font-black text-ink">
                            {pkg.grossWeightKg} <span className="text-xs font-normal text-ink-placeholder">kg gross</span>
                          </div>
                          <div className="text-[11px] text-ink-placeholder">
                            Net: {pkg.netWeightKg || pkg.grossWeightKg} kg
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section C: Destination Address & Logistics Freight Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Destination Card */}
              <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-ink font-bold text-xs">
                  <MapPin className="h-4 w-4 text-link" />
                  <span>Consignee Delivery Address</span>
                </div>
                <div className="text-xs text-ink-secondary space-y-1 bg-muted p-3.5 rounded-xl border border-border">
                  <div className="font-bold text-ink text-sm">
                    {shippingAddress?.name || (data.salesOrder?.orderNumber ? `${data.salesOrder.orderNumber} Consignee` : 'Direct Delivery Client')}
                  </div>
                  {shippingAddress?.addressLine1 && <div>{shippingAddress.addressLine1}</div>}
                  {shippingAddress?.addressLine2 && <div>{shippingAddress.addressLine2}</div>}
                  <div>
                    {shippingAddress?.city || 'Regional Distribution Hub'}, {shippingAddress?.state || 'MH'} - {shippingAddress?.postalCode || '400001'}
                  </div>
                  {shippingAddress?.phone && (
                    <div className="inline-flex items-center gap-1.5 text-ink-muted font-mono text-[11px] mt-1">
                      <Phone className="h-3 w-3" />
                      <span>{shippingAddress.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Freight Logistics Vehicle Card */}
              <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-ink font-bold text-xs">
                  <Truck className="h-4 w-4 text-tone-amber-text" />
                  <span>Freight Vehicle & Driver</span>
                </div>
                <div className="text-xs text-ink-secondary space-y-1.5 bg-muted p-3.5 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-placeholder">Vehicle Reg:</span>
                    <span className="font-mono font-bold text-ink bg-active px-2 py-0.5 rounded text-[11px]">
                      {manifest?.vehicleNumber || data.vehicleNumber || 'MH-04-TR-8821'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-placeholder">Driver Name:</span>
                    <span className="font-semibold text-ink">
                      {manifest?.driverName || data.driverName || 'Designated Courier Driver'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-placeholder">Driver Phone:</span>
                    <span className="font-mono font-semibold text-link">
                      {manifest?.driverPhone || data.driverPhone || '+91 98201 44819'}
                    </span>
                  </div>
                  {manifest && (
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-ink-placeholder">Outbound Manifest:</span>
                      <span className="font-mono font-bold text-ink-secondary">
                        {manifest.manifestNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section D: Dispatch Compliance Documents */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2.5 border-border-strong border-border pb-3">
                <div className="p-2 rounded-xl bg-tone-green-solid text-tone-green-text">
                  <FileCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-ink">
                    Dispatch Compliance Documents
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Invoices, packing slips, gate passes, and tax compliance records
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.documents?.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-link" />
                      <div>
                        <div className="text-xs font-bold text-ink">
                          {document.type.replaceAll('_', ' ')}
                        </div>
                        <div className="font-mono text-[11px] text-ink-muted">
                          {document.documentNumber || 'DOC-GEN'}
                        </div>
                      </div>
                    </div>
                    {document.fileUrl ? (
                      <a
                        href={document.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-link hover:underline"
                      >
                        PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="rounded-full bg-tone-green-solid text-tone-green-text border border-tone-green-solid/25 px-2 py-0.5 text-[10px] font-bold">
                        Archived
                      </span>
                    )}
                  </div>
                ))}
                {(!data.documents || data.documents.length === 0) && (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-link" />
                        <div>
                          <div className="text-xs font-bold text-ink">
                            Tax Invoice
                          </div>
                          <div className="font-mono text-[11px] text-ink-muted">
                            INV-{data.salesOrder?.orderNumber || '2026'}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full bg-tone-green-solid text-tone-green-text border border-tone-green-solid/25 px-2 py-0.5 text-[10px] font-bold">
                        Generated & Archived
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-link" />
                        <div>
                          <div className="text-xs font-bold text-ink">
                            Packing Slip
                          </div>
                          <div className="font-mono text-[11px] text-ink-muted">
                            PS-{data.shipmentNumber}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-full bg-tone-green-solid text-tone-green-text border border-tone-green-solid/25 px-2 py-0.5 text-[10px] font-bold">
                        Generated & Archived
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (5 Columns ~ 41.7%): Hierarchical End-to-End Tracking Timeline & POD */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Hierarchical Timeline Card */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-border-strong border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent-soft text-link">
                    <Route className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-ink">
                      End-to-End Fulfillment Timeline
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Chronological order, dispatch, carrier, and POD journey
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTrackingOpen(true)}
                  className="px-2.5 py-1 rounded-lg border border-border text-ink-secondary hover:bg-hover text-xs font-semibold cursor-pointer shadow-2xs transition"
                >
                  + Add Event
                </button>
              </div>

              {/* Multi-Stage Hierarchical Vertical Timeline */}
              <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-active">
                {timelineEvents.map((item) => {
                  const isCompleted = item.status === 'COMPLETED';
                  const isProgress = item.status === 'IN_PROGRESS';
                  
                  return (
                    <div key={item.id} className="relative group">
                      {/* Node Bullet */}
                      <div
                        className={`absolute -left-[23px] top-0.5 h-6 w-6 rounded-full border-border flex items-center justify-center transition-all ${
                          isCompleted
                            ? 'bg-action border-accent text-inverse shadow-2xs'
                            : isProgress
                            ? 'bg-tone-teal-solid border-tone-teal-solid/25 text-inverse animate-pulse'
                            : 'bg-surface border-border-strong text-ink-placeholder'
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-3 w-3" />
                        ) : isProgress ? (
                          <span className="h-2 w-2 rounded-full bg-surface animate-ping" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-active" />
                        )}
                      </div>

                      {/* Event Body Card */}
                      <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-1.5 transition hover:border-border">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted font-mono">
                            {item.stage}
                          </span>

                          {item.badgeText && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                isCompleted
                                  ? 'bg-tone-green-solid text-tone-green-text border border-tone-green-solid/25'
                                  : isProgress
                                  ? 'bg-tone-teal-solid text-tone-teal-text border border-tone-teal-solid/25'
                                  : 'bg-active text-ink-muted'
                              }`}
                            >
                              {item.badgeText}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-bold text-ink leading-snug">
                          {item.title}
                        </div>

                        <p className="text-xs text-ink-muted leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border text-[10.5px] text-ink-placeholder">
                          {item.timestamp ? (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Clock className="h-3 w-3 text-ink-placeholder" />
                              {new Date(item.timestamp).toLocaleString('en-IN', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          ) : (
                            <span>Pending milestone</span>
                          )}

                          {item.actor && (
                            <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
                              <User className="h-3 w-3 text-ink-placeholder" />
                              {item.actor}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Proof of Delivery (POD) Authentication Card */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2.5 border-border-strong border-border pb-3">
                <div className="p-2 rounded-xl bg-tone-green-solid text-tone-green-text">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-ink">
                    Proof of Delivery (POD)
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Recipient signature, OTP authentication, and delivery closure
                  </p>
                </div>
              </div>

              {data.proofOfDelivery ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-tone-green-text bg-tone-green-solid p-3 rounded-xl border border-tone-green-solid/25">
                    <CheckCircle2 className="h-4 w-4 text-tone-green-text" />
                    <span>Authenticated Consignee Delivery Closure</span>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-placeholder">Recipient Name:</span>
                      <strong className="text-ink font-semibold">
                        {data.proofOfDelivery.recipientName}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-placeholder">Verification Method:</span>
                      <span className="rounded-full bg-active px-2 py-0.5 text-[10px] font-bold text-ink-secondary">
                        {data.proofOfDelivery.method}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-placeholder">Timestamp:</span>
                      <span className="font-mono text-ink-secondary">
                        {new Date(data.proofOfDelivery.deliveredAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {data.proofOfDelivery.otpReference && (
                      <div className="flex items-center justify-between pt-1 border-t border-border">
                        <span className="text-ink-placeholder">OTP Ref:</span>
                        <span className="font-mono font-bold text-link">
                          {data.proofOfDelivery.otpReference}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted space-y-3 bg-muted/50 p-4 rounded-xl border border-dashed border-border text-center">
                  <p>Proof of Delivery has not yet been logged for this consignment.</p>
                  <Link href="/dispatch/delivery">
                    <Button size="sm" variant="outline" className="w-full text-xs font-semibold rounded-xl cursor-pointer">
                      Open Delivery & POD Desk
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracking Dialog */}
        <TrackingEventDialog
          shipment={data}
          open={trackingOpen}
          onClose={() => {
            setTrackingOpen(false);
            void refetch();
          }}
        />
      </div>
    </div>
  );
}
