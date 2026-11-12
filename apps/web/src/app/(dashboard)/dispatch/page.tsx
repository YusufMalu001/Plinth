'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Layers,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { useFulfillmentOverview } from '@/features/fulfillment/hooks';
import { ModuleRecommendationsPanel } from '@/features/intelligence/components/ModuleRecommendationsPanel';

export default function DispatchOverviewPage() {
  const { data, isLoading, isError, isFetching, refetch } = useFulfillmentOverview();

  if (isLoading) {
    return <LoadingState message="Loading logistics & dispatch command center…" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        retry={() => void refetch()}
        title="Dispatch overview is unavailable"
      />
    );
  }

  const pipelineStages = [
    {
      label: 'Allocation',
      count: data.allocationBacklog,
      sub: 'Pending inventory reserve',
      href: '/dispatch/allocation',
      icon: Boxes,
      badgeColor: 'bg-tone-amber-bg text-tone-amber-text border-tone-amber-solid/25',
    },
    {
      label: 'Picking',
      count: data.pickBacklog,
      sub: 'Bin & barcode scanning',
      href: '/dispatch/picking',
      icon: ClipboardCheck,
      badgeColor: 'bg-tone-blue-bg text-tone-blue-text border-tone-blue-solid/25',
    },
    {
      label: 'Packing',
      count: data.packagesStaged,
      sub: 'Boxes sealed & weighed',
      href: '/dispatch/packing',
      icon: PackageCheck,
      badgeColor: 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25',
    },
    {
      label: 'Staging & Dispatch',
      count: data.readyShipments,
      sub: 'AWB & carrier gatepass',
      href: '/dispatch/staging',
      icon: Truck,
      badgeColor: 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25',
    },
    {
      label: 'Dispatched Today',
      count: data.dispatchedToday,
      sub: 'Handed over to carrier',
      href: '/dispatch/dispatched',
      icon: Clock3,
      badgeColor: 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25',
    },
    {
      label: 'Delivery & POD',
      count: data.deliveryExceptions,
      sub: 'Exceptions & POD capture',
      href: '/dispatch/delivery',
      icon: AlertTriangle,
      badgeColor: data.deliveryExceptions > 0 ? 'bg-tone-red-bg text-tone-red-text border-tone-red-solid/25' : 'bg-tone-grey-bg text-ink-secondary border-border',
    },
  ];

  const totalChannelOrders = Object.values(data.channelCounts || {}).reduce((sum, count) => sum + count, 0);

  const channelBadges: Record<string, { label: string; tone: string }> = {
    AMAZON: { label: 'Amazon India', tone: 'bg-tone-orange-bg text-tone-orange-text border-tone-orange-solid/25' },
    E_TRADE: { label: 'E-Trade Direct', tone: 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25' },
    PHYSICAL: { label: 'Physical / Wholesale B2B', tone: 'bg-tone-blue-bg text-tone-blue-text border-tone-blue-solid/25' },
    STORE_POS: { label: 'Store POS (Counter)', tone: 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25' },
  };

  return (
    <div className="flex-1 overflow-y-auto bg-page p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Logistics & Dispatch Hub
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Live inventory reservation, barcoded picking, physical packaging, carrier dispatch, and proof-of-delivery operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={isFetching}
              onClick={() => void refetch()}
            >
              Sync Live Status
            </Button>
            <Link href="/dispatch/staging">
              <Button size="sm" icon={Truck}>
                Create Staged Shipment
              </Button>
            </Link>
          </div>
        </div>

        <ModuleRecommendationsPanel module="FULFILLMENT" />

        {/* Live Fulfillment Pipeline Stepper */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-border-strong border-border/60 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-bold">Fulfillment Pipeline Stream</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">Live across all active warehouses</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {pipelineStages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <Link href={stage.href} key={stage.label} className="group">
                    <div className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-none">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Step 0{index + 1}
                        </span>
                        <span className={`rounded-lg p-2 ${stage.badgeColor}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="font-mono text-2xl font-black text-foreground">
                          {stage.count}
                        </div>
                        <div className="text-sm font-bold text-foreground group-hover:text-primary">
                          {stage.label}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {stage.sub}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Middle Two-Column Grid: Recent Shipments & Channel Analytics */}
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          {/* Recent Carrier Handovers */}
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-border-strong border-border/60 bg-muted/20 py-4">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-bold">Recent Carrier Handovers & Dispatches</CardTitle>
              </div>
              <Link
                href="/dispatch/dispatched"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                View all shipments <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            {!data.recentShipments.length ? (
              <EmptyState
                title="No active shipments recorded"
                description="Staged and dispatched carrier consignments will stream here."
                icon={Truck}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-36 font-semibold">Shipment #</TableHead>
                      <TableHead className="font-semibold">Sales Order</TableHead>
                      <TableHead className="font-semibold">Channel</TableHead>
                      <TableHead className="font-semibold">Carrier / AWB</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="text-right font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentShipments.map((shipment) => {
                      const channelInfo =
                        channelBadges[shipment.salesOrder?.channel || ''] || {
                          label: shipment.salesOrder?.channel?.replaceAll('_', ' ') || 'Direct',
                          tone: 'bg-muted text-muted-foreground',
                        };

                      return (
                        <TableRow key={shipment.id} className="hover:bg-muted/30">
                          <TableCell>
                            <Link
                              className="font-mono text-xs font-bold text-primary hover:underline"
                              href={`/dispatch/shipments/${shipment.id}`}
                            >
                              {shipment.shipmentNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-foreground">
                              {shipment.salesOrder?.orderNumber || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={channelInfo.tone} variant="outline">
                              {channelInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-foreground">
                              {shipment.carrier?.name || shipment.mode?.replaceAll('_', ' ')}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {shipment.awbNumber ? `AWB: ${shipment.awbNumber}` : 'Direct Handover'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                shipment.status === 'DELIVERED'
                                  ? 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25 font-semibold'
                                  : shipment.status === 'HANDED_OVER' || shipment.status === 'IN_TRANSIT'
                                  ? 'bg-tone-blue-bg text-tone-blue-text border-tone-blue-solid/25 font-semibold'
                                  : shipment.status === 'DELIVERY_FAILED' || shipment.status === 'RTO_INITIATED'
                                  ? 'bg-tone-red-bg text-tone-red-text border-tone-red-solid/25 font-semibold'
                                  : 'font-semibold'
                              }
                            >
                              {shipment.status.replaceAll('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/dispatch/shipments/${shipment.id}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                Details
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
          </Card>

          {/* Right Column: Channel Mix & SLA Health */}
          <div className="space-y-6">
            {/* Channel Breakdown Card */}
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="border-border-strong border-border/60 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold">Channel Demand Mix</CardTitle>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {totalChannelOrders} Active Orders
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {Object.entries(data.channelCounts || {}).map(([channel, count]) => {
                  const channelInfo =
                    channelBadges[channel] || {
                      label: channel.replaceAll('_', ' '),
                      tone: 'bg-muted text-foreground',
                    };
                  const pct = totalChannelOrders > 0 ? (count / totalChannelOrders) * 100 : 0;

                  return (
                    <div key={channel} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{channelInfo.label}</span>
                        <span className="font-mono font-bold text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* SLA Alert Radar Card */}
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="border-border-strong border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-tone-amber-text" />
                  <CardTitle className="text-base font-bold">Delivery SLA Compliance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between rounded-xl border border-tone-amber-solid/25 bg-tone-amber-bg p-4">
                  <div>
                    <div className="font-mono text-2xl font-black text-tone-amber-text">
                      {data.slaBreaches}
                    </div>
                    <div className="text-xs font-bold text-tone-amber-text">
                      Active SLA Breach{data.slaBreaches === 1 ? '' : 'es'}
                    </div>
                  </div>
                  <AlertTriangle className="h-7 w-7 text-tone-amber-text" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Expected carrier delivery timestamp has passed without POD closure, cancellation, or returned status.
                </p>
                <div className="pt-1">
                  <Link href="/dispatch/delivery" className="w-full">
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                      Open Exception & POD Desk
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
