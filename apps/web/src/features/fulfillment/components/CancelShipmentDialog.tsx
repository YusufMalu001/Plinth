'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
} from '@plinth/ui';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Shipment } from '../types';

export function CancelShipmentDialog({
  shipment,
  open,
  onClose,
}: {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const mutation = useFulfillmentMutation((cancelReason: string) =>
    fulfillmentApi.cancelShipment(shipment.id, cancelReason)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      return setError('A cancellation reason is strictly required.');
    }
    setError('');
    try {
      await mutation.mutateAsync(reason.trim());
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to cancel this staged shipment.'
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cancel Staged Shipment"
      description={`Shipment: ${shipment.shipmentNumber}`}
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-4 w-4" />
            <span>Pre-Handover Cancellation Rule</span>
          </div>
          <p>
            Cancelling this staged shipment will unlink its sealed cartons so they can be repackaged or re-assigned to another carrier. A shipment cannot be cancelled once handed over to a carrier.
          </p>
        </div>

        <label className="block space-y-1.5 text-xs font-semibold">
          Cancellation Reason & Justification *
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Carrier truck full, re-routing via alternative transporter"
            required
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="submit"
            variant="destructive"
            icon={Ban}
            loading={mutation.isPending}
          >
            Confirm Cancellation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
