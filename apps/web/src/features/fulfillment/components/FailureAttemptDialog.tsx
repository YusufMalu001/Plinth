'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
} from '@synergy/ui';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Shipment } from '../types';

const failureReasons = [
  { code: 'CUSTOMER_UNAVAILABLE', label: 'Consignee / Customer Unavailable / Premises Locked' },
  { code: 'ADDRESS_INCORRECT', label: 'Incorrect or Incomplete Delivery Address / Landmark' },
  { code: 'PAYMENT_REFUSED', label: 'COD Cash Payment / Invoice Price Disputed by Customer' },
  { code: 'TRANSIT_DELAY', label: 'Vehicle Breakdown / Road Inaccessible / Weather Blockage' },
  { code: 'DAMAGED_IN_TRANSIT', label: 'Carton Damaged in Transit - Refused by Consignee' },
  { code: 'RESCHEDULE_REQUESTED', label: 'Customer Requested Delivery Rescheduled to Future Date' },
];

export function FailureAttemptDialog({
  shipment,
  open,
  onClose,
}: {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
}) {
  const [failureReason, setFailureReason] = useState(failureReasons[0].label);
  const [nextAttemptAt, setNextAttemptAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useFulfillmentMutation((input: Parameters<typeof fulfillmentApi.deliveryAttempt>[1]) =>
    fulfillmentApi.deliveryAttempt(shipment.id, input)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        outcome: 'FAILED',
        failureReason,
        nextAttemptAt: nextAttemptAt || undefined,
        notes: notes || undefined,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record delivery failure.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record Delivery Attempt Failure"
      description={`Shipment: ${shipment.shipmentNumber} · Carrier: ${
        shipment.carrier?.name || shipment.mode?.replaceAll('_', ' ')
      }`}
      className="max-w-xl"
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
            Primary Failure Category *
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
            >
              {failureReasons.map((item) => (
                <option key={item.code} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold">
            Scheduled Next Re-Attempt Date & Time
            <Input
              type="datetime-local"
              value={nextAttemptAt}
              onChange={(event) => setNextAttemptAt(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-xs font-semibold">
            Courier Remarks & Dispatch Notes
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Spoke with customer, will re-deliver tomorrow at 11 AM"
            />
          </label>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800">
          Recording a failed attempt flags an operational delivery exception and tracks carrier re-attempt SLAs. If 3 attempts fail, an RTO return workflow should be initiated.
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={AlertTriangle} loading={mutation.isPending}>
            Record Failed Attempt
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
