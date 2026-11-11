'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Layers,
  Package,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Search,
  Truck,
  Undo2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { PaginationControls } from '@/components/PaginationControls';
import { fulfillmentApi } from '../api';
import { useFulfillments, useFulfillmentMutation } from '../hooks';
import type { Fulfillment, FulfillmentStage, Shipment } from '../types';
import { DeliveryDialog } from './DeliveryDialog';
import { FailureAttemptDialog } from './FailureAttemptDialog';
import { PackageDialog } from './PackageDialog';
import { PickDialog } from './PickDialog';
import { ShipmentDialog } from './ShipmentDialog';
import { CancelShipmentDialog } from './CancelShipmentDialog';
import { TrackingEventDialog } from './TrackingEventDialog';

const stageMeta: Record<
  FulfillmentStage | 'delivery',
  {
    title: string;
    description: string;
    step: string;
    icon: React.ElementType;
    instruction: string;
    badgeStyle: string;
  }
> = {
  allocation: {
    title: 'Stock Allocation Workbench',
    description: 'Match sales demand against available physical finished goods using FEFO (First-Expired, First-Out) lot prioritization.',
    step: 'Step 1 of 6',
    icon: Boxes,
    instruction: 'Allocating an order creates real inventory reservations against batches and generates a warehouse pick list.',
    badgeStyle: 'bg-amber-500/10 text-amber-700 border-amber-300',
  },
  picking: {
    title: 'Barcoded Picking Station',
    description: 'Verify bin coordinates, lot identifiers, and scan item EAN/SKU barcodes before stock reaches packing.',
    step: 'Step 2 of 6',
    icon: ClipboardCheck,
    instruction: 'Barcode verification is mandatory. Mismatched scans require authorized supervisor justification.',
    badgeStyle: 'bg-blue-500/10 text-blue-700 border-blue-300',
  },
  packing: {
    title: 'Packaging & Weight Workstation',
    description: 'Build traceable shipping cartons, record precise dimensions, gross/tare weights, and log consumed packaging materials.',
    step: 'Step 3 of 6',
    icon: PackageCheck,
    instruction: 'Sealing a carton automatically deducts packaging materials (boxes, tape, bubble wrap) from warehouse inventory.',
    badgeStyle: 'bg-indigo-500/10 text-indigo-700 border-indigo-300',
  },
  staging: {
    title: 'Dispatch Staging & Carrier Gates',
    description: 'Assign sealed cartons to carrier consignments, auto-generate tax invoices & packing slips, and validate dispatch gates.',
    step: 'Step 4 of 6',
    icon: Truck,
    instruction: 'Dispatch execution permanently posts stock issues to the inventory ledger and unlocks manifest generation.',
    badgeStyle: 'bg-purple-500/10 text-purple-700 border-purple-300',
  },
  dispatched: {
    title: 'Dispatched In-Transit Shipments',
    description: 'Real-time monitoring of carrier movement, milestone tracking updates, transit delays, and delivery attempts.',
    step: 'Step 5 of 6',
    icon: Clock3,
    instruction: 'Shipments handed over to carriers cannot be cancelled directly; returns must proceed via Reverse Logistics / RTO.',
    badgeStyle: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
  },
  delivery: {
    title: 'Delivery Exceptions & Proof of Delivery',
    description: 'Resolve delivery attempt failures and record authenticated Proof of Delivery via OTP, digital signature, or multi-photo evidence.',
    step: 'Step 6 of 6',
    icon: CheckCircle2,
    instruction: 'Recording valid Proof of Delivery marks the sales order as Delivered and completes the fulfillment lifecycle.',
    badgeStyle: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
  },
};

const channelStyles: Record<string, { label: string; tone: string }> = {
  AMAZON: { label: 'Amazon India', tone: 'bg-orange-500/10 text-orange-700 border-orange-300 font-semibold' },
  E_TRADE: { label: 'E-Trade Direct', tone: 'bg-violet-500/10 text-violet-700 border-violet-300 font-semibold' },
  PHYSICAL: { label: 'Physical Wholesale', tone: 'bg-blue-500/10 text-blue-700 border-blue-300 font-semibold' },
  STORE_POS: { label: 'Store POS', tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 font-semibold' },
};

export function FulfillmentQueueWorkspace({ stage }: { stage: FulfillmentStage | 'delivery' }) {
  const queryStage: FulfillmentStage = stage === 'delivery' ? 'dispatched' : stage;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const [selectedFulfillment, setSelectedFulfillment] = useState<Fulfillment | null>(null);
  const [dialog, setDialog] = useState<'pick' | 'package' | 'shipment' | null>(null);
  const [deliveryShipment, setDeliveryShipment] = useState<Shipment | null>(null);
  const [failureShipment, setFailureShipment] = useState<Shipment | null>(null);
  const [cancellingShipment, setCancellingShipment] = useState<Shipment | null>(null);
  const [trackingShipment, setTrackingShipment] = useState<Shipment | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useFulfillments({
    page,
    limit: pageSize,
    stage: queryStage,
    channel: channel || undefined,
    search: search || undefined,
  });

  const allocation = useFulfillmentMutation((id: string) => fulfillmentApi.allocate(id));
  const dispatch = useFulfillmentMutation(async (shipment: Shipment) => {
    const validation = await fulfillmentApi.validateShipment(shipment.id);
    if (!validation.ready) {
      throw new Error(`Dispatch readiness blocked: ${validation.errors.join(' • ')}`);
    }
    return fulfillmentApi.dispatchShipment(shipment.id);
  });
  const reopen = useFulfillmentMutation((id: string) => fulfillmentApi.reopenPackage(id));

  const config = stageMeta[stage];
  const Icon = config.icon;

  const toggleRow = (id: string) => {
    setExpandedRows((current) => ({ ...current, [id]: !current[id] }));
  };

  const handleAction = async (work: () => Promise<unknown>, successMessage: string) => {
    setFeedback(null);
    try {
      await work();
      setFeedback({ type: 'success', text: successMessage });
      await refetch();
    } catch (cause) {
      setFeedback({
        type: 'error',
        text: cause instanceof Error ? cause.message : 'The requested operation could not be completed.',
      });
    }
  };

  const stagesNav: Array<{ key: FulfillmentStage | 'delivery'; label: string; href: string }> = [
    { key: 'allocation', label: '1. Allocation', href: '/dispatch/allocation' },
    { key: 'picking', label: '2. Picking', href: '/dispatch/picking' },
    { key: 'packing', label: '3. Packaging', href: '/dispatch/packing' },
    { key: 'staging', label: '4. Staging & Shipping', href: '/dispatch/staging' },
    { key: 'dispatched', label: '5. Dispatched', href: '/dispatch/dispatched' },
    { key: 'delivery', label: '6. Delivery & POD', href: '/dispatch/delivery' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background via-muted/10 to-muted/30 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Workspace Breadcrumbs / Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/dispatch"
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Dispatch Hub
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-black text-primary">{config.title}</span>
          </div>

          {/* Quick Stage Switcher */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-border/80 bg-muted/40 p-1">
            {stagesNav.map((item) => (
              <Link key={item.key} href={item.href}>
                <span
                  className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    stage === item.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Page Hero Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`rounded-xl p-3 shadow-sm border ${config.badgeStyle}`}>
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {config.step}
                </span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <Badge variant="outline" className={config.badgeStyle}>
                  Active Queue
                </Badge>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {config.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={isFetching}
              onClick={() => void refetch()}
            >
              Refresh
            </Button>
            {stage === 'staging' && (
              <Link href="/dispatch/manifests">
                <Button size="sm" variant="outline" icon={Truck}>
                  Gate Manifests
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Informational Stage Guidance Banner */}
        <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <Layers className="mt-0.5 h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">Operational Rule: </strong>
            {config.instruction}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`flex items-center justify-between rounded-xl border p-4 text-sm font-medium shadow-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
              <span>{feedback.text}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setFeedback(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Main Workstation Card */}
        <Card className="overflow-hidden border-border/80 shadow-sm">
          {/* Filter and Search Bar */}
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 bg-background"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by order #, fulfillment #, or customer…"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by sales channel"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground shadow-sm"
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Sales Channels</option>
                <option value="PHYSICAL">Physical / B2B Wholesale</option>
                <option value="E_TRADE">E-Trade Direct</option>
                <option value="AMAZON">Amazon India</option>
              </select>
            </div>
          </div>

          {/* Table Content */}
          {isLoading ? (
            <LoadingState message="Fetching fulfillment queue…" />
          ) : isError ? (
            <ErrorState retry={() => void refetch()} />
          ) : !data?.items.length ? (
            <EmptyState
              title={`No items in ${config.title.toLowerCase()}`}
              description="Orders will dynamically stream into this workbench as preceding operations are completed."
              icon={Icon}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-52 font-bold">Order & Channel</TableHead>
                    <TableHead className="font-bold">Warehouse Location</TableHead>
                    <TableHead className="w-48 font-bold">Progress Units</TableHead>
                    <TableHead className="font-bold">Quality & Exceptions</TableHead>
                    <TableHead className="font-bold">Fulfillment Status</TableHead>
                    <TableHead className="text-right font-bold">Workbench Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => {
                    const isExpanded = !!expandedRows[item.id];
                    const ordered = item.salesOrder.lines.reduce(
                      (sum, line) => sum + Number(line.orderedQuantity),
                      0
                    );
                    const progress =
                      stage === 'allocation'
                        ? item.salesOrder.lines.reduce(
                            (sum, line) => sum + Number(line.allocatedQuantity),
                            0
                          )
                        : stage === 'picking'
                        ? item.salesOrder.lines.reduce(
                            (sum, line) => sum + Number(line.pickedQuantity),
                            0
                          )
                        : stage === 'packing'
                        ? item.salesOrder.lines.reduce(
                            (sum, line) => sum + Number(line.packedQuantity),
                            0
                          )
                        : item.salesOrder.lines.reduce(
                            (sum, line) => sum + Number(line.shippedQuantity),
                            0
                          );

                    const activeShipment = item.shipments.find(
                      (shipment) => !['DELIVERED', 'CANCELLED'].includes(shipment.status)
                    );
                    const openExceptions = item.salesOrder.exceptions.filter(
                      (exception) => exception.status === 'OPEN'
                    );

                    const channelInfo =
                      channelStyles[item.salesOrder.channel] || {
                        label: item.salesOrder.channel.replaceAll('_', ' '),
                        tone: 'bg-muted text-foreground',
                      };

                    return (
                      <React.Fragment key={item.id}>
                        <TableRow className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => toggleRow(item.id)}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-foreground">
                              {item.salesOrder.orderNumber}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {item.fulfillmentNumber}
                              </span>
                              <Badge variant="outline" className={channelInfo.tone}>
                                {channelInfo.label}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">
                              {item.warehouseLocation.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Code: {item.warehouseLocation.code}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-bold text-foreground">
                                {progress} / {ordered} Units
                              </span>
                              <span className="text-muted-foreground">
                                {ordered > 0 ? `${Math.round((progress / ordered) * 100)}%` : '0%'}
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/80">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{
                                  width: `${ordered ? Math.min(100, (progress / ordered) * 100) : 0}%`,
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            {openExceptions.length > 0 ? (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                                <AlertTriangle className="h-4 w-4" />
                                <span>{openExceptions.length} blocking exception(s)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Clear / Ready</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                item.status === 'ALLOCATED' || item.status === 'PICKED' || item.status === 'STAGED' || item.status === 'DISPATCHED' || item.status === 'COMPLETED'
                                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300 font-semibold'
                                  : item.status === 'PARTIALLY_ALLOCATED' || item.status === 'PARTIALLY_PICKED' || item.status === 'PARTIALLY_DISPATCHED'
                                  ? 'bg-amber-500/10 text-amber-700 border-amber-300 font-semibold'
                                  : 'font-semibold'
                              }
                            >
                              {item.status.replaceAll('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end items-center gap-2">
                              {/* Stage 1: Allocation Action */}
                              {stage === 'allocation' && (
                                <Button
                                  size="sm"
                                  icon={Boxes}
                                  loading={allocation.isPending}
                                  onClick={() =>
                                    void handleAction(
                                      () => allocation.mutateAsync(item.id),
                                      `Order ${item.salesOrder.orderNumber} successfully allocated and pick list generated.`
                                    )
                                  }
                                >
                                  Allocate Stock
                                </Button>
                              )}

                              {/* Stage 2: Picking Action */}
                              {stage === 'picking' && (
                                <Button
                                  size="sm"
                                  icon={ScanLine}
                                  onClick={() => {
                                    setSelectedFulfillment(item);
                                    setDialog('pick');
                                  }}
                                >
                                  Open Scanner
                                </Button>
                              )}

                              {/* Stage 3: Packing Action */}
                              {stage === 'packing' && (
                                <Button
                                  size="sm"
                                  icon={PackageCheck}
                                  onClick={() => {
                                    setSelectedFulfillment(item);
                                    setDialog('package');
                                  }}
                                >
                                  Build Package
                                </Button>
                              )}

                              {/* Stage 4: Staging & Dispatch Actions */}
                              {stage === 'staging' && !activeShipment && item.packages[0] && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  icon={Undo2}
                                  loading={reopen.isPending}
                                  onClick={() =>
                                    void handleAction(
                                      () => reopen.mutateAsync(item.packages[0].id),
                                      `Package ${item.packages[0].packageNumber} reopened for modification.`
                                    )
                                  }
                                >
                                  Reopen Box
                                </Button>
                              )}
                              {stage === 'staging' && !activeShipment && (
                                <Button
                                  size="sm"
                                  icon={Truck}
                                  onClick={() => {
                                    setSelectedFulfillment(item);
                                    setDialog('shipment');
                                  }}
                                >
                                  Create Shipment
                                </Button>
                              )}
                              {stage === 'staging' && activeShipment && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setCancellingShipment(activeShipment)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    icon={Truck}
                                    loading={dispatch.isPending}
                                    onClick={() =>
                                      void handleAction(
                                        () => dispatch.mutateAsync(activeShipment),
                                        `Shipment ${activeShipment.shipmentNumber} handed over to carrier and stock posted.`
                                      )
                                    }
                                  >
                                    Validate & Dispatch
                                  </Button>
                                </>
                              )}

                              {/* Stage 5: Dispatched Actions */}
                              {stage === 'dispatched' && activeShipment && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setTrackingShipment(activeShipment)}
                                  >
                                    Add Milestone
                                  </Button>
                                  <Link href={`/dispatch/shipments/${activeShipment.id}`}>
                                    <Button size="sm" variant="outline" icon={ArrowUpRight}>
                                      Details
                                    </Button>
                                  </Link>
                                </div>
                              )}

                              {/* Stage 6: Delivery & POD Actions */}
                              {stage === 'delivery' && activeShipment && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setFailureShipment(activeShipment)}
                                  >
                                    Failed Attempt
                                  </Button>
                                  <Button
                                    size="sm"
                                    icon={CheckCircle2}
                                    onClick={() => setDeliveryShipment(activeShipment)}
                                  >
                                    Confirm POD
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Collapsible Order Lines Detail Drawer */}
                        {isExpanded && (
                          <TableRow className="bg-muted/15">
                            <TableCell colSpan={7} className="p-4 sm:p-6">
                              <div className="rounded-xl border border-border/80 bg-card p-4 shadow-inner space-y-4">
                                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Order Line Item Breakdown ({item.salesOrder.lines.length} lines)
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Promised Date: {item.promisedShipAt ? new Date(item.promisedShipAt).toLocaleDateString('en-IN') : 'Standard SLA'}
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="border-b border-border/40 text-muted-foreground">
                                        <th className="py-2 font-semibold">SKU / Item</th>
                                        <th className="py-2 font-semibold">Description</th>
                                        <th className="py-2 text-right font-semibold">Ordered</th>
                                        <th className="py-2 text-right font-semibold">Allocated</th>
                                        <th className="py-2 text-right font-semibold">Picked</th>
                                        <th className="py-2 text-right font-semibold">Packed</th>
                                        <th className="py-2 text-right font-semibold">Shipped</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                      {item.salesOrder.lines.map((line) => (
                                        <tr key={line.id} className="hover:bg-muted/30">
                                          <td className="py-2.5 font-mono font-bold text-foreground">
                                            {line.sku}
                                          </td>
                                          <td className="py-2.5 text-muted-foreground">
                                            {line.description}
                                          </td>
                                          <td className="py-2.5 text-right font-mono font-bold">
                                            {Number(line.orderedQuantity)} {line.uomId || ''}
                                          </td>
                                          <td className="py-2.5 text-right font-mono text-amber-700 font-semibold">
                                            {Number(line.allocatedQuantity)}
                                          </td>
                                          <td className="py-2.5 text-right font-mono text-blue-700 font-semibold">
                                            {Number(line.pickedQuantity)}
                                          </td>
                                          <td className="py-2.5 text-right font-mono text-indigo-700 font-semibold">
                                            {Number(line.packedQuantity)}
                                          </td>
                                          <td className="py-2.5 text-right font-mono text-emerald-700 font-semibold">
                                            {Number(line.shippedQuantity)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {item.packages.length > 0 && (
                                  <div className="pt-2 border-t border-border/40">
                                    <span className="text-xs font-bold text-muted-foreground">
                                      Packages ({item.packages.length}):
                                    </span>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {item.packages.map((pkg) => (
                                        <div
                                          key={pkg.id}
                                          className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 text-xs"
                                        >
                                          <Package className="h-3.5 w-3.5 text-primary" />
                                          <span className="font-mono font-bold">{pkg.packageNumber}</span>
                                          <Badge variant="outline" className="text-[10px]">
                                            {pkg.packageType}
                                          </Badge>
                                          <span className="text-muted-foreground">
                                            {pkg.grossWeightKg} kg
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="border-t border-border/60 bg-muted/10 p-3">
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={data?.total || 0}
              onPageChange={setPage}
              onPageSizeChange={(val) => {
                setPageSize(val);
                setPage(1);
              }}
            />
          </div>
        </Card>

        {/* Action Dialogs */}
        {selectedFulfillment && (
          <>
            <PickDialog
              fulfillment={selectedFulfillment}
              open={dialog === 'pick'}
              onClose={() => {
                setDialog(null);
                setSelectedFulfillment(null);
                void refetch();
              }}
            />
            <PackageDialog
              fulfillment={selectedFulfillment}
              open={dialog === 'package'}
              onClose={() => {
                setDialog(null);
                setSelectedFulfillment(null);
                void refetch();
              }}
            />
            <ShipmentDialog
              fulfillment={selectedFulfillment}
              open={dialog === 'shipment'}
              onClose={() => {
                setDialog(null);
                setSelectedFulfillment(null);
                void refetch();
              }}
            />
          </>
        )}

        {deliveryShipment && (
          <DeliveryDialog
            shipment={deliveryShipment}
            open
            onClose={() => {
              setDeliveryShipment(null);
              void refetch();
            }}
          />
        )}

        {failureShipment && (
          <FailureAttemptDialog
            shipment={failureShipment}
            open
            onClose={() => {
              setFailureShipment(null);
              void refetch();
            }}
          />
        )}

        {cancellingShipment && (
          <CancelShipmentDialog
            shipment={cancellingShipment}
            open
            onClose={() => {
              setCancellingShipment(null);
              void refetch();
            }}
          />
        )}

        {trackingShipment && (
          <TrackingEventDialog
            shipment={trackingShipment}
            open
            onClose={() => {
              setTrackingShipment(null);
              void refetch();
            }}
          />
        )}
      </div>
    </div>
  );
}
