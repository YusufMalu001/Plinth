'use client';

import { Checkbox } from '@plinth/ui';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ClipboardCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
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
import { useFulfillments, useFulfillmentMutation } from '@/features/fulfillment/hooks';

export default function ManifestsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [open, setOpen] = useState(false);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [error, setError] = useState('');

  const manifests = useQuery({
    queryKey: ['fulfillment', 'manifests', page, pageSize],
    queryFn: () => fulfillmentApi.manifests(page, pageSize),
  });

  const stagedFulfillments = useFulfillments({ page: 1, limit: 100, stage: 'staging' });

  const create = useFulfillmentMutation((input: unknown) =>
    fulfillmentApi.createManifest(input)
  );
  const close = useFulfillmentMutation((id: string) =>
    fulfillmentApi.closeManifest(id)
  );

  const availableShipments = useMemo(
    () =>
      (stagedFulfillments.data?.items || []).flatMap((fulfillment) =>
        fulfillment.shipments
          .filter((shipment) => ['STAGED', 'READY'].includes(shipment.status))
          .map((shipment) => ({ shipment, fulfillment }))
      ),
    [stagedFulfillments.data]
  );

  const selectedRows = availableShipments.filter((row) =>
    selectedShipmentIds.includes(row.shipment.id)
  );

  const selectedPackageCount = selectedRows.reduce(
    (sum, row) => sum + (row.shipment.packages?.length || 0),
    0
  );
  const selectedTotalWeight = selectedRows
    .reduce(
      (sum, row) =>
        sum +
        (row.shipment.packages || []).reduce(
          (inner, p) => inner + Number(p.package?.grossWeightKg || 0),
          0
        ),
      0
    )
    .toFixed(2);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!selectedShipmentIds.length) {
      return setError('Please select at least one staged consignment for this vehicle manifest.');
    }

    const warehouseIds = new Set(
      selectedRows.map((row) => row.fulfillment.warehouseLocation.id)
    );
    if (warehouseIds.size !== 1) {
      return setError('A manifest can only bundle shipments departing from a single warehouse location.');
    }

    try {
      await create.mutateAsync({
        warehouseLocationId: selectedRows[0].fulfillment.warehouseLocation.id,
        shipmentIds: selectedShipmentIds,
        vehicleNumber: vehicleNumber || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
      });
      setOpen(false);
      setSelectedShipmentIds([]);
      setVehicleNumber('');
      setDriverName('');
      setDriverPhone('');
      await manifests.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create vehicle manifest.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-muted p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Link href="/dispatch" className="hover:text-foreground">
            Dispatch Hub
          </Link>
          <span>/</span>
          <span className="text-foreground">Manifests & Gate Handover</span>
        </div>

        {/* Hero Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary shadow-sm">
              <ClipboardCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Dispatch Manifests & Gate Clearance
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Consolidate multiple shipments into vehicle manifests, capture driver acknowledgement, and clear warehouse security gatepasses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={manifests.isFetching}
              onClick={() => void manifests.refetch()}
            >
              Refresh
            </Button>
            <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
              Generate Vehicle Manifest
            </Button>
          </div>
        </div>

        {/* Manifest Table */}
        <Card className="overflow-hidden border-border/80 shadow-sm">
          {manifests.isLoading ? (
            <LoadingState message="Fetching dispatch manifests…" />
          ) : !manifests.data?.items.length ? (
            <EmptyState
              title="No vehicle manifests generated yet"
              description="Group multiple staged shipments departing on the same vehicle into an official gatepass manifest."
              icon={ClipboardCheck}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="font-bold">Manifest #</TableHead>
                    <TableHead className="font-bold">Departure Warehouse</TableHead>
                    <TableHead className="font-bold">Carrier / Vehicle Details</TableHead>
                    <TableHead className="w-24 text-center font-bold">Consignments</TableHead>
                    <TableHead className="font-bold">Packages & Weight</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold">Gate Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifests.data.items.map((manifest) => (
                    <TableRow key={manifest.id} className="hover:bg-muted/20">
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-primary">
                          {manifest.manifestNumber}
                        </span>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(manifest.createdAt).toLocaleDateString('en-IN')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">
                          {manifest.warehouseLocation.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Code: {manifest.warehouseLocation.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">
                          {manifest.carrier?.name || manifest.vehicleNumber || 'Vehicle Assigned'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Driver: {manifest.driverName || 'External Transporter'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-foreground">
                        {manifest.shipments.length}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs font-bold text-foreground">
                          {manifest.packageCount} Carton(s)
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {Number(manifest.totalWeightKg).toFixed(2)} kg gross
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            manifest.status === 'CLOSED'
                              ? 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25 font-semibold'
                              : 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25 font-semibold'
                          }
                        >
                          {manifest.status === 'CLOSED' ? 'Gate Cleared' : 'Open / Staging'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {manifest.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={ShieldCheck}
                            loading={close.isPending}
                            onClick={() =>
                              void close
                                .mutateAsync(manifest.id)
                                .then(() => manifests.refetch())
                            }
                            className="text-xs font-semibold"
                          >
                            Clear Gate
                          </Button>
                        )}
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
              total={manifests.data?.total || 0}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </div>
        </Card>

        {/* Generate Manifest Dialog */}
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Generate Vehicle Gatepass Manifest"
          description="Consolidate staged consignments into an authorized transport manifest."
          className="max-w-3xl"
        >
          <form data-keyboard-submit="off" onSubmit={submit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Selected Summary Counter */}
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                <span>
                  Selected Consignments: <strong className="text-foreground">{selectedShipmentIds.length}</strong>
                </span>
              </div>
              <div className="font-mono text-muted-foreground">
                {selectedPackageCount} Box(es) · {selectedTotalWeight} kg
              </div>
            </div>

            {/* Shipment Selection List */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Select Staged Consignments for this Vehicle
              </label>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border/80 divide-y divide-border/60">
                {availableShipments.map(({ shipment, fulfillment }) => (
                  <label
                    key={shipment.id}
                    className="flex cursor-pointer items-center gap-3 p-3.5 transition hover:bg-muted/30"
                  >
                    <Checkbox

                      checked={selectedShipmentIds.includes(shipment.id)}
                      onChange={(event) =>
                        setSelectedShipmentIds((current) =>
                          event.target.checked
                            ? [...current, shipment.id]
                            : current.filter((id) => id !== shipment.id)
                        )
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {shipment.shipmentNumber}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {shipment.mode}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Order: {fulfillment.salesOrder.orderNumber} · Warehouse: {fulfillment.warehouseLocation.name}
                      </p>
                    </div>
                    <div className="text-right font-mono text-xs text-muted-foreground">
                      {shipment.packages?.length || 0} pkg(s)
                    </div>
                  </label>
                ))}
                {!availableShipments.length && (
                  <p className="p-8 text-center text-xs text-muted-foreground">
                    No staged shipments are currently waiting for manifest generation.
                  </p>
                )}
              </div>
            </div>

            {/* Transport Details Form */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-border/80 bg-muted/15 p-4">
              <label className="space-y-1 text-xs font-semibold">
                Vehicle Registration #
                <Input
                  value={vehicleNumber}
                  onChange={(event) => setVehicleNumber(event.target.value)}
                  placeholder="MH-12-AB-9876"
                  className="font-mono font-bold"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Driver Full Name
                <Input
                  value={driverName}
                  onChange={(event) => setDriverName(event.target.value)}
                  placeholder="Driver Name"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Driver Phone Number
                <Input
                  value={driverPhone}
                  onChange={(event) => setDriverPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                icon={ClipboardCheck}
                loading={create.isPending}
                disabled={!selectedShipmentIds.length}
              >
                Generate Manifest & Handover
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </div>
  );
}
