'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Scan,
  ScanLine,
  Sparkles,
  Split,
  Barcode,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Input,
} from '@plinth/ui';
import { fulfillmentApi } from '../api';
import { useFulfillmentMutation } from '../hooks';
import type { Fulfillment, PickItem } from '../types';
import JsBarcode from 'jsbarcode';

export function PickDialog({
  fulfillment,
  open,
  onClose,
}: {
  fulfillment: Fulfillment;
  open: boolean;
  onClose: () => void;
}) {
  const pick = fulfillment.pickLists?.find((item) =>
    ['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'PARTIALLY_PICKED'].includes(item.status)
  );

  const [scans, setScans] = useState<Record<string, string>>({});
  const [pickedQuantities, setPickedQuantities] = useState<Record<string, number>>({});
  const [discrepancyReasons, setDiscrepancyReasons] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');
  const barcodeRefs = React.useRef<Record<string, SVGSVGElement | null>>({});

  const getItemSku = (item: PickItem) => {
    return (
      item.salesOrderLine?.sku ||
      fulfillment.salesOrder.lines.find((line) => line.id === item.salesOrderLineId)?.sku ||
      ''
    );
  };

  const getItemBarcode = (item: PickItem) => {
    const line = item.salesOrderLine || fulfillment.salesOrder.lines.find((entry) => entry.id === item.salesOrderLineId);
    return String(line?.barcode || line?.sku || getItemSku(item) || '');
  };

  const displayItems = useMemo(() => {
    if (pick && pick.items && pick.items.length > 0) {
      return pick.items.map((item) => {
        const expected = Number(item.expectedQuantity || 0);
        const already = Number(item.pickedQuantity || 0);
        const remaining = Math.max(0, expected - already);
        // Target pickable quantity
        const targetQty = remaining > 0 ? remaining : (expected > 0 ? expected : 1);
        return {
          id: item.id,
          salesPickItemId: item.id,
          salesOrderLineId: item.salesOrderLineId,
          sku: getItemSku(item),
          barcode: getItemBarcode(item),
          description: item.salesOrderLine?.description || 'Item',
          lotId: item.lotId,
          expectedQuantity: expected > 0 ? expected : targetQty,
          alreadyPicked: already,
          remainingQuantity: targetQty,
        };
      });
    }

    // Fallback: derive items directly from order lines
    return (fulfillment.salesOrder.lines || []).map((line, idx) => {
      const allocated = Number(line.allocatedQuantity || line.orderedQuantity || 1);
      const already = Number(line.pickedQuantity || 0);
      const remaining = Math.max(0, allocated - already);
      const targetQty = remaining > 0 ? remaining : allocated;
      return {
        id: line.id || `line-${idx}`,
        salesPickItemId: line.id,
        salesOrderLineId: line.id,
        sku: line.sku,
        barcode: String(line.barcode || line.sku || ''),
        description: line.description || 'Item',
        lotId: 'FEFO Standard Lot',
        expectedQuantity: allocated,
        alreadyPicked: already,
        remainingQuantity: targetQty,
      };
    });
  }, [pick, fulfillment]);

  useEffect(() => {
    if (!open) return;
    displayItems.forEach((item) => {
      const node = barcodeRefs.current[item.id];
      if (!node || !item.barcode) return;
      try {
        JsBarcode(node, item.barcode, {
          format: 'CODE128',
          displayValue: true,
          fontSize: 10,
          textMargin: 2,
          height: 30,
          width: 1.2,
          margin: 2,
          lineColor: '#171717',
          background: '#FFFFFF',
        });
      } catch {
        // The server still validates the SKU when legacy barcode data is invalid.
      }
    });
  }, [displayItems, open]);

  // Pre-fill default picked quantities with remaining expected quantities
  useEffect(() => {
    if (open) {
      const initialQtys: Record<string, number> = {};
      displayItems.forEach((item) => {
        initialQtys[item.id] = item.remainingQuantity;
      });
      setPickedQuantities(initialQtys);
      setError('');
    }
  }, [open, displayItems]);

  const hasAnyDiscrepancy = useMemo(() => {
    return displayItems.some((item) => {
      const picked = pickedQuantities[item.id] ?? item.remainingQuantity;
      return picked < item.remainingQuantity;
    });
  }, [displayItems, pickedQuantities]);

  const mutation = useFulfillmentMutation<void>(async () => {
    if (!pick) {
      throw new Error('No active pick list was found. Please refresh the page.');
    }
    if (['CREATED', 'ASSIGNED', 'PARTIALLY_PICKED'].includes(pick.status)) {
      await fulfillmentApi.startPick(pick.id);
    }

    let anyItemScanned = false;

    const pickItemMap: Record<string, PickItem> = {};
    (pick.items || []).forEach((item) => {
      pickItemMap[item.id] = item;
      if (item.salesOrderLineId) {
        pickItemMap[item.salesOrderLineId] = item;
      }
    });

    for (const display of displayItems) {
      const matchedPickItem = pickItemMap[display.id] || pickItemMap[display.salesOrderLineId] || pick.items?.[0];
      if (!matchedPickItem) continue;

      const remaining = Number(matchedPickItem.expectedQuantity) - Number(matchedPickItem.pickedQuantity);
      const userEnteredQty = Number(pickedQuantities[display.id] ?? pickedQuantities[matchedPickItem.id] ?? display.remainingQuantity);

      const maxPickable = remaining > 0 ? remaining : Number(matchedPickItem.expectedQuantity || display.expectedQuantity || 1);
      const qtyToPick = Math.max(0, Math.min(maxPickable, userEnteredQty > 0 ? userEnteredQty : maxPickable));
      if (qtyToPick <= 0) continue;

      const sku = display.sku || getItemSku(matchedPickItem);
      const scanValue = (scans[display.id] || scans[matchedPickItem.id] || display.barcode || sku || '').trim();
      if (!scanValue) {
        throw new Error(`Please scan the barcode for ${sku || 'item'} before completing.`);
      }

      const discrepancy = discrepancyReasons[display.id] || discrepancyReasons[matchedPickItem.id];
      const isShortPick = qtyToPick < maxPickable;

      if (isShortPick && !discrepancy && !overrideReason.trim()) {
        throw new Error(`Please select a discrepancy reason or provide supervisor justification for short-picking ${sku}.`);
      }

      await fulfillmentApi.scanPick(pick.id, {
        salesPickItemId: matchedPickItem.id,
        scanValue,
        quantity: qtyToPick,
        lotId: matchedPickItem.lotId || display.lotId || undefined,
        binCode: matchedPickItem.binCode || undefined,
        overrideReason: overrideReason.trim() || undefined,
        discrepancyReason: discrepancy || (isShortPick ? 'Physical bin quantity shortage' : undefined),
      });

      anyItemScanned = true;
    }

    if (!anyItemScanned && (!pick.items || !pick.items.some((item) => Number(item.pickedQuantity) > 0))) {
      throw new Error('At least one item must have a positive picked quantity to record picking.');
    }

    return fulfillmentApi.completePick(pick.id);
  });

  const handleSimulateScan = (itemId: string, sku: string) => {
    setScans((prev) => ({ ...prev, [itemId]: sku }));
  };

  const handleScanAll = () => {
    const newScans: Record<string, string> = {};
    const newQtys: Record<string, number> = {};
    displayItems.forEach((item) => {
      if (item.sku) {
        newScans[item.id] = item.sku;
      }
      newQtys[item.id] = item.remainingQuantity;
    });
    setScans(newScans);
    setPickedQuantities(newQtys);
  };

  const handleQuantityChange = (itemId: string, val: number, max: number) => {
    const safeMax = Math.max(max, 1);
    const safeVal = isNaN(val) ? 0 : Math.max(0, Math.min(safeMax, val));
    setPickedQuantities((prev) => ({ ...prev, [itemId]: safeVal }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mutation.mutateAsync(undefined);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Picking scan verification failed.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Barcoded Picking & Discrepancy Workstation"
      description={`Pick List: ${pick ? pick.pickListNumber : 'Auto-Resolved'} · Order: ${
        fulfillment.salesOrder.orderNumber
      }`}
      className="max-w-5xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-3 rounded-xl border border-tone-blue-solid/20 bg-tone-blue-bg/[0.04] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Scan className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">How picking works</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              1. Go to the shown bin and lot. 2. Scan the product label into the matching row. 3. Enter the quantity physically picked. 4. Complete the pick. A short pick needs a discrepancy reason; an incorrect barcode needs supervisor authorization.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Sparkles}
            onClick={handleScanAll}
            className="text-xs font-semibold"
          >
            Fill Expected Codes
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pick Items & Scan Verification</p>
              <p className="text-xs text-muted-foreground">Scan or type the barcode printed on the item label, then confirm picked quantity.</p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px] font-bold"><Barcode className="h-3 w-3" /> Hardware & Manual Scanning</Badge>
          </div>

          <div className="space-y-3">
            {displayItems.map((item) => {
              const sku = item.sku;
              const isScanned = Boolean(scans[item.id]?.trim());
              const matchesBarcode = scans[item.id]?.trim() === item.barcode.trim();
              const currentPicked = pickedQuantities[item.id] ?? item.remainingQuantity;
              const isShortage = currentPicked < item.remainingQuantity;
              const shortageCount = item.remainingQuantity - currentPicked;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isShortage
                      ? 'border-tone-amber-solid/40 bg-tone-amber-bg/[0.03]'
                      : isScanned && matchesBarcode
                      ? 'border-tone-green-solid/40 bg-tone-emerald-bg/[0.02]'
                      : 'border-border bg-card shadow-2xs'
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    {/* Left Details & Barcode (Cols 1-6) */}
                    <div className="lg:col-span-6 space-y-2">
                      <div>
                        <div className="font-mono text-sm font-bold text-foreground">
                          {sku || 'Item SKU'}
                        </div>
                        <div className="text-xs text-muted-foreground font-medium mt-0.5">
                          {item.description}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center text-[11px] font-mono font-semibold bg-muted px-2 py-0.5 rounded-md text-foreground">
                          Lot: {item.lotId || 'FEFO Standard Lot'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Expected: <strong className="font-mono text-foreground">{item.remainingQuantity}</strong> units
                        </span>
                      </div>

                      {/* Barcode Graphic Preview */}
                      <div className="inline-flex flex-col rounded-lg border border-border/80 bg-white p-2 shadow-2xs">
                        <svg
                          ref={(node) => {
                            barcodeRefs.current[item.id] = node;
                          }}
                          role="img"
                          aria-label={`Barcode for ${sku}`}
                          className="h-10 max-w-full"
                        />
                      </div>
                    </div>

                    {/* Right Inputs: Pick Qty & Barcode Scanner (Cols 7-12) */}
                    <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      {/* Pick Qty (Cols 1-4) */}
                      <div className="sm:col-span-4 space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block text-center sm:text-left">
                          Pick Qty *
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={Math.max(item.remainingQuantity, 1)}
                          value={currentPicked}
                          onChange={(e) =>
                            handleQuantityChange(item.id, Number(e.target.value), Math.max(item.remainingQuantity, 1))
                          }
                          className={`w-full h-9 text-center font-mono font-bold text-sm rounded-lg border bg-background transition-all outline-none focus:ring-1 focus:ring-primary ${
                            isShortage
                              ? 'border-tone-amber-solid text-tone-amber-text  bg-tone-amber-bg/10'
                              : 'border-border text-foreground'
                          }`}
                        />
                      </div>

                      {/* Barcode Input & Use Button (Cols 5-12) */}
                      <div className="sm:col-span-8 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Scan Barcode
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSimulateScan(item.id, item.barcode)}
                            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Fill code
                          </button>
                        </div>

                        <div className="relative">
                          <Input
                            data-scan
                            icon={ScanLine}
                            value={scans[item.id] || ''}
                            onChange={(e) =>
                              setScans((current) => ({ ...current, [item.id]: e.target.value }))
                            }
                            placeholder="Scan product barcode"
                            className={`h-9 w-full text-xs font-mono pr-8 ${
                              isScanned
                                ? matchesBarcode
                                  ? 'border-tone-green-solid/60 bg-tone-emerald-bg/[0.04]'
                                  : 'border-tone-amber-solid/60 bg-tone-amber-bg/[0.04]'
                                : ''
                            }`}
                          />
                          {isScanned && (
                            <span className="absolute right-2.5 top-2.5">
                              {matchesBarcode ? (
                                <CheckCircle2 className="h-4 w-4 text-tone-green-text" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-tone-amber-text" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shortage Discrepancy Note */}
                  {isShortage && (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-tone-amber-bg/10 border border-tone-amber-solid/30">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-tone-amber-text  shrink-0" />
                        <div className="text-xs">
                          <strong className="text-tone-amber-text ">Shortage Detected: </strong>
                          <span className="text-muted-foreground">
                            Picking <strong className="text-foreground">{currentPicked}</strong> of <strong className="text-foreground">{item.remainingQuantity}</strong> ({shortageCount} units short).
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-semibold text-muted-foreground">Reason:</span>
                        <select
                          value={discrepancyReasons[item.id] || 'BIN_SHORTAGE'}
                          onChange={(e) =>
                            setDiscrepancyReasons((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="h-7.5 text-xs rounded-md border border-border bg-background px-2.5 font-medium outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        >
                          <option value="BIN_SHORTAGE">Bin Physical Shortage</option>
                          <option value="DAMAGED_STOCK">Damaged / Defective Stock in Bin</option>
                          <option value="EXPIRED_LOT">Expired / QC Quarantine Required</option>
                          <option value="BIN_MISMATCH">Wrong Bin Placement / Missing</option>
                          <option value="OTHER">Other Discrepancy</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Discrepancy & Supervisor Justification */}
        <div className={`space-y-2 rounded-xl border p-4 transition-all ${hasAnyDiscrepancy ? 'border-tone-amber-solid/40 bg-tone-amber-bg/[0.04]' : 'border-border/80 bg-muted/10'}`}>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-foreground">
              Supervisor Override & Discrepancy Remarks {hasAnyDiscrepancy ? '(Recommended for Short Pick)' : '(Optional)'}
            </label>
            {hasAnyDiscrepancy && (
              <Badge variant="outline" className="text-[10px] text-tone-amber-text  border-tone-amber-solid/40 font-mono">
                Partial Fulfillment Wave
              </Badge>
            )}
          </div>
          <Input
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder="e.g. 4 units damaged in bin A-12; remaining items scheduled for backorder fulfillment wave"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hasAnyDiscrepancy
              ? 'Picking fewer units than expected will transition the pick list to "PARTIALLY_PICKED" and keep remaining backorders open for subsequent fulfillment.'
              : 'A mismatched barcode scan remains blocked unless an authorized user supplies a supervisor override reason. Every scan is permanently audited.'}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center border-t border-border/60 pt-4">
          <div className="text-xs text-muted-foreground">
            {hasAnyDiscrepancy ? (
              <span className="font-semibold text-tone-amber-text  flex items-center gap-1.5">
                <Split className="h-3.5 w-3.5" /> Partial Pick Mode Active
              </span>
            ) : (
              <span className="text-tone-green-text  font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Full Quantity Match
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" icon={ClipboardCheck} loading={mutation.isPending} className="font-bold">
              {hasAnyDiscrepancy ? 'Complete Partial Pick' : 'Complete Pick & Transition'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
