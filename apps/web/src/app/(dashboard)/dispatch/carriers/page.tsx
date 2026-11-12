'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Plus,
  RefreshCw,
  Truck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { PaginationControls } from '@/components/PaginationControls';
import { fulfillmentApi } from '@/features/fulfillment/api';
import { useCarriers, useFulfillmentMutation } from '@/features/fulfillment/hooks';
import type { ShipmentMode } from '@/features/fulfillment/types';

export default function CarrierAdministrationPage() {
  const { data = [], isLoading, isFetching, refetch } = useCarriers();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [open, setOpen] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ShipmentMode>('COURIER');
  const [trackingUrlTemplate, setTrackingUrlTemplate] = useState('');
  const [error, setError] = useState('');

  const create = useFulfillmentMutation(
    (input: { code: string; name: string; mode: ShipmentMode; trackingUrlTemplate?: string }) =>
      fulfillmentApi.createCarrier(input)
  );

  const rows = useMemo(
    () => data.slice((page - 1) * pageSize, page * pageSize),
    [data, page, pageSize]
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await create.mutateAsync({
        code,
        name,
        mode,
        trackingUrlTemplate: trackingUrlTemplate || undefined,
      });
      setOpen(false);
      setCode('');
      setName('');
      setTrackingUrlTemplate('');
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to register carrier.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-page p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Link href="/dispatch" className="hover:text-foreground">
            Dispatch Hub
          </Link>
          <span>/</span>
          <span className="text-foreground">Carrier Directory</span>
        </div>

        {/* Hero Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary shadow-sm">
              <Truck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Logistics & Carrier Partners
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage express courier partners, bulk 3PL transporters, self-pickup counters, and company fleet configurations.
              </p>
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
            <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
              Register Carrier
            </Button>
          </div>
        </div>

        {/* Carriers Table Card */}
        <Card className="overflow-hidden border-border/80 shadow-sm">
          {isLoading ? (
            <LoadingState message="Fetching carrier directory…" />
          ) : !rows.length ? (
            <EmptyState
              title="No carriers configured"
              description="Register active courier partners or transporter logistics providers."
              icon={Truck}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-28 font-bold">Code</TableHead>
                    <TableHead className="font-bold">Carrier Partner Name</TableHead>
                    <TableHead className="font-bold">Logistics Mode</TableHead>
                    <TableHead className="w-28 text-center font-bold">Services</TableHead>
                    <TableHead className="font-bold">Live Tracking URL Template</TableHead>
                    <TableHead className="text-right font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((carrier) => (
                    <TableRow key={carrier.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-foreground">
                        {carrier.code}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-foreground">{carrier.name}</div>
                        {carrier.adapterKey && (
                          <div className="text-[11px] text-muted-foreground">
                            API Adapter: {carrier.adapterKey}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-semibold">
                          {carrier.mode.replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-muted-foreground">
                        {carrier.services?.length || 0}
                      </TableCell>
                      <TableCell>
                        {carrier.trackingUrlTemplate ? (
                          <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate max-w-sm">{carrier.trackingUrlTemplate}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Manual Tracking</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            carrier.status === 'ACTIVE'
                              ? 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25 font-semibold'
                              : 'font-semibold'
                          }
                        >
                          {carrier.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="border-t border-border/60 bg-muted/10 p-3">
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={data.length}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </div>
        </Card>

        {/* Register Carrier Modal */}
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Register Logistics Carrier Partner"
          description="Create an active carrier master record for dispatch assignment."
          className="max-w-xl"
        >
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-border/80 bg-muted/15 p-4">
              <label className="space-y-1 text-xs font-semibold">
                Carrier Short Code *
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. DELHIVERY / BLUEDART"
                  required
                  className="font-mono font-bold uppercase"
                />
              </label>

              <label className="space-y-1 text-xs font-semibold">
                Carrier Display Name *
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Delhivery Express Logistics"
                  required
                />
              </label>

              <label className="space-y-1 text-xs font-semibold sm:col-span-2">
                Logistics Dispatch Mode
                <select
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as ShipmentMode)}
                >
                  <option value="COURIER">Express Courier (Air/Surface)</option>
                  <option value="TRANSPORTER">3PL Freight Transporter</option>
                  <option value="OWN_FLEET">Own Company Fleet</option>
                  <option value="CUSTOMER_PICKUP">Customer Self-Pickup</option>
                  <option value="MARKETPLACE">Marketplace Integrated Carrier</option>
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold sm:col-span-2">
                Tracking Web URL Template
                <Input
                  value={trackingUrlTemplate}
                  onChange={(event) => setTrackingUrlTemplate(event.target.value)}
                  placeholder="https://track.carrier.com/?awb={awb}"
                  className="font-mono text-xs"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" icon={CheckCircle2} loading={create.isPending}>
                Register Carrier
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </div>
  );
}
