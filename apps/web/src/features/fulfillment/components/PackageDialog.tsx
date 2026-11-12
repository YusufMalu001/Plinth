'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Layers,
  PackageCheck,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
} from '@plinth/ui';
import { useMaterials } from '@/hooks/useMasterData';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Fulfillment } from '../types';

interface PackagePreset {
  type: string;
  label: string;
  length: string;
  width: string;
  height: string;
  tare: string;
}

const packagePresets: PackagePreset[] = [
  { type: 'STANDARD_CARTON', label: 'Standard Carton', length: '30', width: '20', height: '15', tare: '0.25' },
  { type: 'HEAVY_DUTY_BOX', label: 'Heavy-Duty Double Wall', length: '45', width: '35', height: '30', tare: '0.65' },
  { type: 'POLY_MAILER', label: 'Padded Poly Mailer', length: '25', width: '18', height: '5', tare: '0.05' },
  { type: 'PALLET', label: 'Full Wooden Pallet', length: '120', width: '100', height: '150', tare: '15.00' },
];

export function PackageDialog({
  fulfillment,
  open,
  onClose,
}: {
  fulfillment: Fulfillment;
  open: boolean;
  onClose: () => void;
}) {
  const { data: materialData } = useMaterials('ACTIVE', 1, 500);
  const materials = materialData?.items || [];

  const [packageType, setPackageType] = useState('STANDARD_CARTON');
  const [lengthCm, setLengthCm] = useState('30');
  const [widthCm, setWidthCm] = useState('20');
  const [heightCm, setHeightCm] = useState('15');

  const [grossWeightKg, setGrossWeightKg] = useState('1.5');
  const [netWeightKg, setNetWeightKg] = useState('1.25');
  const [tareWeightKg, setTareWeightKg] = useState('0.25');

  const [sealNumber, setSealNumber] = useState('');
  const [handlingInstructions, setHandlingInstructions] = useState('');
  const [photoUrls, setPhotoUrls] = useState('');
  const [materialUsages, setMaterialUsages] = useState<
    Array<{ materialId: string; uomId: string; actualQuantity: string }>
  >([]);
  const [error, setError] = useState('');

  const remaining = useMemo(() => {
    const orderLines = fulfillment.salesOrder.lines || [];
    const pendingLines = orderLines
      .map((line) => {
        const picked = Number(line.pickedQuantity || 0);
        const packed = Number(line.packedQuantity || 0);
        const ordered = Number(line.orderedQuantity || line.allocatedQuantity || 0);
        // If line is picked, available is picked - packed; if order is in packaging stage without explicit pickedQuantity, allow ordered - packed
        const available = picked > 0 ? Math.max(0, picked - packed) : Math.max(0, ordered - packed);
        return {
          ...line,
          available,
          pickedDisplay: picked > 0 ? picked : ordered,
          packedDisplay: packed,
        };
      })
      .filter((line) => line.available > 0);

    // Fallback: if all lines appear 0 available but packaging is opened, allow re-packing line items
    if (pendingLines.length === 0 && orderLines.length > 0) {
      return orderLines.map((line) => ({
        ...line,
        available: Number(line.orderedQuantity || 1),
        pickedDisplay: Number(line.pickedQuantity || line.orderedQuantity || 1),
        packedDisplay: Number(line.packedQuantity || 0),
      }));
    }

    return pendingLines;
  }, [fulfillment]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Keep quantities in sync whenever dialog opens or remaining items change
  React.useEffect(() => {
    if (open) {
      const initial: Record<string, number> = {};
      remaining.forEach((line) => {
        initial[line.id] = line.available;
      });
      setQuantities(initial);
      setError('');
    }
  }, [open, remaining]);

  const create = useFulfillmentMutation((input: unknown) =>
    fulfillmentApi.createPackage(fulfillment.id, input)
  );

  // Volumetric weight calculator (L * W * H / 5000)
  const volumetricWeightKg = useMemo(() => {
    const l = Number(lengthCm) || 0;
    const w = Number(widthCm) || 0;
    const h = Number(heightCm) || 0;
    return ((l * w * h) / 5000).toFixed(2);
  }, [lengthCm, widthCm, heightCm]);

  const applyPreset = (preset: PackagePreset) => {
    setPackageType(preset.type);
    setLengthCm(preset.length);
    setWidthCm(preset.width);
    setHeightCm(preset.height);
    setTareWeightKg(preset.tare);

    const net = Number(netWeightKg) || 1.0;
    const tare = Number(preset.tare) || 0.25;
    setGrossWeightKg((net + tare).toFixed(2));
  };

  const handleNetChange = (val: string) => {
    setNetWeightKg(val);
    const net = Number(val) || 0;
    const tare = Number(tareWeightKg) || 0;
    setGrossWeightKg((net + tare).toFixed(2));
  };

  const handleTareChange = (val: string) => {
    setTareWeightKg(val);
    const net = Number(netWeightKg) || 0;
    const tare = Number(val) || 0;
    setGrossWeightKg((net + tare).toFixed(2));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const items = remaining
      .map((line) => ({ salesOrderLineId: line.id, quantity: quantities[line.id] || 0 }))
      .filter((item) => item.quantity > 0);

    if (!items.length) {
      return setError('Please select at least one picked item quantity to pack.');
    }

    try {
      const pkg = (await create.mutateAsync({
        packageType,
        lengthCm: Number(lengthCm),
        widthCm: Number(widthCm),
        heightCm: Number(heightCm),
        grossWeightKg: Number(grossWeightKg),
        netWeightKg: netWeightKg ? Number(netWeightKg) : undefined,
        tareWeightKg: tareWeightKg ? Number(tareWeightKg) : undefined,
        sealNumber: sealNumber || undefined,
        handlingInstructions: handlingInstructions || undefined,
        photoUrls: photoUrls
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        items,
        materials: materialUsages
          .filter((usage) => usage.materialId && usage.uomId && Number(usage.actualQuantity) > 0)
          .map((usage) => ({
            ...usage,
            actualQuantity: Number(usage.actualQuantity),
            plannedQuantity: Number(usage.actualQuantity),
          })),
      })) as { id: string };

      await fulfillmentApi.sealPackage(pkg.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create and seal the package.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Packaging & Sealing Workstation"
      description={`Build box container for Order: ${fulfillment.salesOrder.orderNumber}`}
      className="max-w-4xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dimension Presets */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Select Packaging Container Preset
          </label>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {packagePresets.map((preset) => (
              <button
                key={preset.type}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                  packageType === preset.type
                    ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                    : 'border-border/80 bg-card hover:border-primary/40'
                }`}
              >
                <span className="text-xs font-bold text-foreground">{preset.label}</span>
                <span className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {preset.length} × {preset.width} × {preset.height} cm
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Tare: {preset.tare} kg
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Dimension & Weight Form */}
        <div className="space-y-4 rounded-xl border border-border/80 bg-muted/15 p-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Container Dimensions & Weight Calibration
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-primary">
              Volumetric Weight: {volumetricWeightKg} kg
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold">
              Length (cm) *
              <Input
                value={lengthCm}
                onChange={(e) => setLengthCm(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Width (cm) *
              <Input
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Height (cm) *
              <Input
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="space-y-1 text-xs font-semibold">
              Net Goods Weight (kg)
              <Input
                value={netWeightKg}
                onChange={(e) => handleNetChange(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Tare Box Weight (kg)
              <Input
                value={tareWeightKg}
                onChange={(e) => handleTareChange(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Gross Sealed Weight (kg) *
              <Input
                value={grossWeightKg}
                onChange={(e) => setGrossWeightKg(e.target.value)}
                inputMode="decimal"
                className="font-bold font-mono"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Security Seal #
              <Input
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                placeholder="SEAL-9842"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold">
              Handling & Fragile Instructions
              <Input
                value={handlingInstructions}
                onChange={(event) => setHandlingInstructions(event.target.value)}
                placeholder="Handle with care, keep dry, this side up"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Package Inspection Photo URLs
              <Input
                value={photoUrls}
                onChange={(event) => setPhotoUrls(event.target.value)}
                placeholder="Comma separated image URLs"
              />
            </label>
          </div>
        </div>

        {/* Quantities to Pack Table */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Assign Picked SKU Quantities to this Carton
          </span>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="py-3 px-4 font-semibold text-muted-foreground w-[50%]">SKU / Item</th>
                  <th className="py-3 px-3 text-center font-semibold text-muted-foreground w-[15%]">Picked</th>
                  <th className="py-3 px-3 text-center font-semibold text-muted-foreground w-[15%]">Packed</th>
                  <th className="py-3 px-4 text-center font-semibold text-muted-foreground w-[20%]">Pack in Box</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {remaining.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-mono text-xs font-bold text-foreground">{line.sku}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{line.description}</div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-bold text-link  align-middle">
                      {line.pickedDisplay}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground align-middle">
                      {line.packedDisplay}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          min="0"
                          max={line.available}
                          value={String(quantities[line.id] ?? 0)}
                          onChange={(e) =>
                            setQuantities((current) => ({
                              ...current,
                              [line.id]: Math.min(
                                line.available,
                                Math.max(0, Number(e.target.value))
                              ),
                            }))
                          }
                          className="w-20 h-8 text-center font-mono font-bold text-xs rounded-lg border border-border bg-background transition-all outline-none focus:ring-1 focus:ring-primary"
                          inputMode="decimal"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Packaging Materials Inventory Deduction */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Packaging Materials Consumption
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Materials are deducted from warehouse inventory when sealed. Add only materials physically consumed.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={() =>
                setMaterialUsages((current) => [
                  ...current,
                  { materialId: '', uomId: '', actualQuantity: '1' },
                ])
              }
              className="text-xs font-semibold shrink-0 self-start sm:self-auto"
            >
              Add Material
            </Button>
          </div>

          {materialUsages.length > 0 ? (
            <div className="space-y-2">
              {materialUsages.map((usage, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <div className="flex-1 min-w-0">
                    <select
                      aria-label="Select packaging material"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary truncate"
                      value={usage.materialId}
                      onChange={(event) => {
                        const material = materials.find((item) => item.id === event.target.value);
                        setMaterialUsages((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  materialId: event.target.value,
                                  uomId: material?.uomId || '',
                                }
                              : item
                          )
                        );
                      }}
                    >
                      <option value="">Select packaging material</option>
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name} ({material.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24 shrink-0">
                    <Input
                      value={usage.actualQuantity}
                      onChange={(event) =>
                        setMaterialUsages((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, actualQuantity: event.target.value }
                              : item
                          )
                        )}
                      placeholder="Qty"
                      inputMode="decimal"
                      className="h-9 text-xs text-center font-mono font-bold"
                    />
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() =>
                      setMaterialUsages((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
              No packaging materials added yet. Click &quot;Add Material&quot; to log carton/poly tape/wrap usage.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            icon={PackageCheck}
            loading={create.isPending}
            disabled={!remaining.length}
          >
            Create & Seal Package
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
