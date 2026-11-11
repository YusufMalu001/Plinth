'use client';

import React, { useState } from 'react';
import { Button, Dialog, Input } from '@plinth/ui';
import { CheckCircle2, Truck } from 'lucide-react';
import { SalesOrder } from '../types';
import { useDispatchSalesOrder } from '../hooks';

interface SalesDispatchModalProps {
  order: SalesOrder;
  open: boolean;
  onClose: () => void;
}

export function SalesDispatchModal({ order, open, onClose }: SalesDispatchModalProps) {
  const dispatchOrder = useDispatchSalesOrder();

  const [carrier, setCarrier] = useState<string>('Delhivery');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrier) {
      setError('Carrier is required.');
      return;
    }

    setError(null);
    dispatchOrder.mutate(
      {
        id: order.id,
        dispatchInput: {
          carrier,
          trackingNumber: trackingNumber || undefined,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => {
          setError(err?.message || 'Failed to dispatch order.');
        },
      }
    );
  };

  const shippingAddress = order.addresses?.find((a) => a.kind === 'SHIPPING');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm Outbound Dispatch"
      description={`Release shipment for Order ${order.orderNumber} to carrier`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Pre-Dispatch Verification Checklist
          </div>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            <li>Inventory reservation will be converted to permanent outbound issue.</li>
            <li>Outbound Stock Ledger Entry (ILE) will be posted to the inventory ledger.</li>
            <li>Shipment destination: {shippingAddress?.city}, {shippingAddress?.state} {shippingAddress?.postalCode}.</li>
          </ul>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1">
            Shipping Carrier *
          </label>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm"
          >
            <option value="Delhivery">Delhivery</option>
            <option value="Bluedart">Bluedart Express</option>
            <option value="DTDC">DTDC Courier</option>
            <option value="Ecom Express">Ecom Express</option>
            <option value="In-house Fleet">In-house Delivery Fleet</option>
            <option value="Customer Pickup">Customer Self-Pickup</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1">
            AWB / Tracking Number
          </label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. TRK-78901234"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1">
            Dispatch Remarks
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional handover remarks or driver details"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={dispatchOrder.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={dispatchOrder.isPending} icon={Truck}>
            Confirm Dispatch
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
