'use client';

import React, { useState } from 'react';
import {
  Button,
  Dialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { SalesOrder } from '../types';
import { useCreatePackage } from '../hooks';

interface SalesPackModalProps {
  order: SalesOrder;
  open: boolean;
  onClose: () => void;
}

export function SalesPackModal({ order, open, onClose }: SalesPackModalProps) {
  const createPackage = useCreatePackage();
  const lines = order.lines || [];

  const [packageType, setPackageType] = useState<string>('STANDARD_CARTON');
  const [weightKg, setWeightKg] = useState<string>('1.2');
  const [dimensions, setDimensions] = useState<string>('30x20x15 cm');
  const [carrier, setCarrier] = useState<string>('Delhivery');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [packQuantities, setPackQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    lines.forEach((l) => {
      const remaining = Math.max(0, Number(l.orderedQuantity) - Number(l.packedQuantity || 0));
      initial[l.id] = remaining;
    });
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const itemsToPack = Object.entries(packQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([lineId, quantity]) => ({
        salesOrderLineId: lineId,
        quantity,
      }));

    if (!itemsToPack.length) {
      setError('Please select at least one item quantity to pack.');
      return;
    }

    setError(null);
    createPackage.mutate(
      {
        id: order.id,
        packageInput: {
          packageType,
          weightKg: parseFloat(weightKg) || 1.0,
          dimensions,
          carrier: carrier || undefined,
          trackingNumber: trackingNumber || undefined,
          items: itemsToPack,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => {
          setError(err?.message || 'Failed to create shipment package.');
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Shipment Package"
      description={`Pack items into a shipping container for Order ${order.orderNumber}`}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Package Type
            </label>
            <select
              value={packageType}
              onChange={(e) => setPackageType(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm"
            >
              <option value="STANDARD_CARTON">Standard Carton</option>
              <option value="HEAVY_DUTY_BOX">Heavy-Duty Corrugated Box</option>
              <option value="POLY_MAILER">Poly Mailer / Pouch</option>
              <option value="PALLET">Wooden Pallet</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Weight (kg)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.05"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Dimensions (LxWxH)
            </label>
            <Input
              value={dimensions}
              onChange={(e) => setDimensions(e.target.value)}
              placeholder="e.g. 30x20x15 cm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Assigned Carrier
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
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1">
            Tracking / AWB # (Optional)
          </label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. DEL-987654321"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
            Pack Quantities per Line
          </label>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Packed</TableHead>
                <TableHead className="text-right w-24">Pack Now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const ordered = Number(line.orderedQuantity || 0);
                const packed = Number(line.packedQuantity || 0);
                const remaining = Math.max(0, ordered - packed);

                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono font-medium">{line.sku}</TableCell>
                    <TableCell className="text-right font-mono">{ordered}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{packed}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        max={remaining}
                        value={packQuantities[line.id] ?? 0}
                        onChange={(e) =>
                          setPackQuantities({
                            ...packQuantities,
                            [line.id]: Math.min(remaining, Math.max(0, Number(e.target.value))),
                          })
                        }
                        className="h-8 text-right font-mono text-xs w-20 ml-auto"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={createPackage.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={createPackage.isPending}>
            Confirm Package & Pack Items
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
