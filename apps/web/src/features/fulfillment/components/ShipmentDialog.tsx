'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  FileCheck,
  Package,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Input,
} from '@synergy/ui';
import { fulfillmentApi } from '../api';
import { useCarriers, useFulfillmentMutation } from '../hooks';
import type { Fulfillment, ShipmentMode } from '../types';

export function ShipmentDialog({
  fulfillment,
  open,
  onClose,
}: {
  fulfillment: Fulfillment;
  open: boolean;
  onClose: () => void;
}) {
  const packages = useMemo(
    () =>
      fulfillment.packages.filter(
        (pkg) => ['SEALED', 'STAGED'].includes(pkg.status) && !pkg.shipmentLinks?.length
      ),
    [fulfillment]
  );

  const { data: carriers = [] } = useCarriers();
  const [mode, setMode] = useState<ShipmentMode>(
    fulfillment.salesOrder.channel === 'AMAZON' ? 'MARKETPLACE' : 'COURIER'
  );
  const [carrierId, setCarrierId] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState('');
  const [pickupScheduledAt, setPickupScheduledAt] = useState('');
  const [freightTerms, setFreightTerms] = useState('PREPAID');
  const [freightAmount, setFreightAmount] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [dispatchDock, setDispatchDock] = useState('DOCK-01');
  const [routeNotes, setRouteNotes] = useState('');
  const [error, setError] = useState('');

  const totalGrossWeight = useMemo(
    () => packages.reduce((sum, p) => sum + Number(p.grossWeightKg || 0), 0).toFixed(2),
    [packages]
  );

  const mutation = useFulfillmentMutation(
    (input: Parameters<typeof fulfillmentApi.createShipment>[1]) =>
      fulfillmentApi.createShipment(fulfillment.id, input)
  );

  const handleGenerateAwb = () => {
    const randomAwb = `AWB-${Math.floor(100000000 + Math.random() * 900000000)}`;
    setAwbNumber(randomAwb);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        packageIds: packages.map((pkg) => pkg.id),
        mode,
        carrierId: carrierId || undefined,
        awbNumber: awbNumber || undefined,
        vehicleNumber: vehicleNumber || undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        expectedDeliveryAt: expectedDeliveryAt || undefined,
        pickupScheduledAt: pickupScheduledAt || undefined,
        freightTerms,
        freightAmount: freightAmount ? Number(freightAmount) : undefined,
        codAmount: codAmount ? Number(codAmount) : undefined,
        dispatchDock: dispatchDock || undefined,
        routeNotes: routeNotes || undefined,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Shipment staging creation failed.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Staged Consignment & Shipment"
      description={`Consolidating ${packages.length} sealed carton(s) for Order: ${fulfillment.salesOrder.orderNumber}`}
      className="max-w-3xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Consignment Packages Summary */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-foreground">
                {packages.length} Sealed Container{packages.length === 1 ? '' : 's'} Ready
              </div>
              <div className="text-xs text-muted-foreground">
                Total Gross Weight: <strong className="text-foreground">{totalGrossWeight} kg</strong>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300">
            Sealed & Inspected
          </Badge>
        </div>

        {/* Carrier and Logistics Selection */}
        <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-card p-4">
          <label className="space-y-1.5 text-xs font-semibold">
            Logistics Dispatch Mode *
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground"
              value={mode}
              onChange={(e) => setMode(e.target.value as ShipmentMode)}
            >
              <option value="COURIER">Courier Express (Air/Surface)</option>
              <option value="TRANSPORTER">Third-Party Transporter (LTL/FTL)</option>
              <option value="OWN_FLEET">Own Company Vehicle Fleet</option>
              <option value="CUSTOMER_PICKUP">Customer Direct Self-Pickup</option>
              <option value="MARKETPLACE">Marketplace Fulfillment Carrier</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            Assigned Carrier *
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground"
              value={carrierId}
              onChange={(e) => setCarrierId(e.target.value)}
            >
              <option value="">Select carrier partner</option>
              {carriers
                .filter((carrier) => carrier.mode === mode || mode === 'MARKETPLACE')
                .map((carrier) => (
                  <option key={carrier.id} value={carrier.id}>
                    {carrier.name} ({carrier.code})
                  </option>
                ))}
            </select>
          </label>

          {['COURIER', 'MARKETPLACE', 'TRANSPORTER'].includes(mode) && (
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">Air Waybill / Consignment Tracking Number *</label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Sparkles}
                  className="h-6 text-xs text-primary"
                  onClick={handleGenerateAwb}
                >
                  Generate Test AWB
                </Button>
              </div>
              <Input
                value={awbNumber}
                onChange={(e) => setAwbNumber(e.target.value)}
                placeholder="e.g. DELHIVERY-7849201934"
                className="font-mono font-bold"
              />
            </div>
          )}

          {mode === 'OWN_FLEET' && (
            <>
              <label className="space-y-1.5 text-xs font-semibold">
                Vehicle Registration # *
                <Input
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="MH-12-AB-1234"
                  className="font-mono font-bold"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold">
                Driver Name *
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver Full Name"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold">
                Driver Phone
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
            </>
          )}

          <label className="space-y-1.5 text-xs font-semibold">
            Freight Commercial Terms
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold"
              value={freightTerms}
              onChange={(event) => setFreightTerms(event.target.value)}
            >
              <option value="PREPAID">Prepaid by Shipper</option>
              <option value="TO_PAY">To-Pay (Consignee on delivery)</option>
              <option value="FOB">FOB Destination</option>
              <option value="CUSTOMER_ACCOUNT">Charged to Customer Account</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            Dispatch Loading Dock
            <Input
              value={dispatchDock}
              onChange={(event) => setDispatchDock(event.target.value)}
              placeholder="DOCK-01 / BAY-A"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            Freight Charge Amount
            <Input
              value={freightAmount}
              onChange={(event) => setFreightAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            COD Collection Amount
            <Input
              value={codAmount}
              onChange={(event) => setCodAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            Carrier Pickup Slot
            <Input
              type="datetime-local"
              value={pickupScheduledAt}
              onChange={(event) => setPickupScheduledAt(event.target.value)}
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold">
            Expected Delivery Date & Time
            <Input
              type="datetime-local"
              value={expectedDeliveryAt}
              onChange={(e) => setExpectedDeliveryAt(e.target.value)}
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold sm:col-span-2">
            Route Instructions & Gatepass Notes
            <Input
              value={routeNotes}
              onChange={(event) => setRouteNotes(event.target.value)}
              placeholder="Handover through Gate 2, driver must carry invoice duplicate"
            />
          </label>
        </div>

        {/* Automatic Documents Preview Note */}
        <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground">
          <FileCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            Creating this shipment will automatically generate the official <strong>Tax Invoice</strong>, <strong>Packing Slip</strong>, and <strong>Barcoded Shipping Label</strong>. Dispatch handover will verify credit clearance and shipping address integrity.
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            icon={Truck}
            loading={mutation.isPending}
            disabled={!packages.length}
          >
            Create Staged Shipment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
