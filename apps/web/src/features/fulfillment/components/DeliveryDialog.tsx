'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  KeyRound,
  PenTool,
  ShieldCheck,
} from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
} from '@synergy/ui';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Shipment } from '../types';

export function DeliveryDialog({
  shipment,
  open,
  onClose,
}: {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<'OTP' | 'SIGNATURE' | 'PHOTO' | 'DOCUMENT'>('OTP');
  const [recipientName, setRecipientName] = useState('');
  const [otpReference, setOtpReference] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [photoUrls, setPhotoUrls] = useState('');
  const [error, setError] = useState('');

  const mutation = useFulfillmentMutation((input: Parameters<typeof fulfillmentApi.deliver>[1]) =>
    fulfillmentApi.deliver(shipment.id, input)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync({
        method,
        recipientName: recipientName.trim(),
        otpReference: method === 'OTP' ? otpReference.trim() : undefined,
        signatureUrl: method === 'SIGNATURE' ? signatureUrl.trim() : undefined,
        photoUrls:
          method === 'PHOTO'
            ? photoUrls
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : undefined,
        deliveredAt: new Date().toISOString(),
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to record authenticated Proof of Delivery.'
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record Proof of Delivery (POD)"
      description={`Consignment: ${shipment.shipmentNumber} · Carrier: ${
        shipment.carrier?.name || shipment.mode?.replaceAll('_', ' ')
      }`}
      className="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Method Switcher */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Authentication Method
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'OTP', label: 'One-Time Passcode (OTP)', icon: KeyRound },
              { id: 'SIGNATURE', label: 'Digital Signature', icon: PenTool },
              { id: 'PHOTO', label: 'Photo Evidence & Gatepass', icon: Camera },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id as any)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 text-center transition ${
                    method === m.id
                      ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary'
                      : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/15 p-4">
          <label className="space-y-1 text-xs font-semibold">
            Recipient / Consignee Full Name *
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Ramesh Kumar (Store Manager)"
              required
            />
          </label>

          {method === 'OTP' && (
            <label className="space-y-1 text-xs font-semibold">
              Authenticated OTP Verification Code *
              <Input
                value={otpReference}
                onChange={(e) => setOtpReference(e.target.value)}
                placeholder="Enter 6-digit delivery OTP"
                required
                className="font-mono font-bold tracking-widest text-base"
              />
            </label>
          )}

          {method === 'SIGNATURE' && (
            <label className="space-y-1 text-xs font-semibold">
              Digital Signature Image URL or Reference *
              <Input
                value={signatureUrl}
                onChange={(e) => setSignatureUrl(e.target.value)}
                placeholder="https://cdn.example.com/signatures/pod-984.png"
                required
              />
            </label>
          )}

          {method === 'PHOTO' && (
            <label className="space-y-1 text-xs font-semibold">
              Delivery Proof Photo URLs *
              <Input
                value={photoUrls}
                onChange={(e) => setPhotoUrls(e.target.value)}
                placeholder="Comma separated image URLs of delivered cartons at location"
                required
              />
            </label>
          )}
        </div>

        {/* POD Impact Notice */}
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-emerald-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Recording valid Proof of Delivery marks this shipment as <strong>Delivered</strong>, closes the sales order delivery requirement, and satisfies marketplace fulfillment SLA criteria.
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={CheckCircle2} loading={mutation.isPending}>
            Authenticate & Complete Delivery
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
