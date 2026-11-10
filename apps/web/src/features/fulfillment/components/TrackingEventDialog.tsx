'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Route,
} from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
} from '@synergy/ui';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Shipment } from '../types';

const trackingStatuses = [
  { status: 'IN_TRANSIT', label: 'In Transit / Dispatched from Hub' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Final Delivery' },
  { status: 'DELIVERY_FAILED', label: 'Delivery Attempt Failed' },
  { status: 'RTO_INITIATED', label: 'Return to Origin (RTO) Initiated' },
  { status: 'RTO_RECEIVED', label: 'RTO Consignment Received at Warehouse' },
];

export function TrackingEventDialog({
  shipment,
  open,
  onClose,
}: {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(trackingStatuses[0].status);
  const [location, setLocation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const mutation = useFulfillmentMutation((input: Parameters<typeof fulfillmentApi.addTracking>[1]) =>
    fulfillmentApi.addTracking(shipment.id, input)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        status,
        location: location || undefined,
        message: message || undefined,
        eventAt: new Date().toISOString(),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to log tracking milestone.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Carrier Tracking Milestone"
      description={`Shipment: ${shipment.shipmentNumber} · Current Status: ${shipment.status.replaceAll(
        '_',
        ' '
      )}`}
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/15 p-4">
          <label className="space-y-1 text-xs font-semibold">
            Milestone Status *
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {trackingStatuses.map((item) => (
                <option key={item.status} value={item.status}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold">
            Current Geographical Location / Transit Hub
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Bhiwandi Mother Hub, Mumbai"
            />
          </label>

          <label className="space-y-1 text-xs font-semibold">
            Carrier Status Message
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Package arrived at local distribution center"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={Route} loading={mutation.isPending}>
            Append Tracking Milestone
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
