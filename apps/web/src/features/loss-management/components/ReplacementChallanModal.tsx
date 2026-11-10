'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { LossEventDto } from '@synergy/types';
import { Button } from '@synergy/ui';
import { X, RefreshCw, Warehouse, Building2, AlertCircle, CheckCircle2, Boxes, Info } from 'lucide-react';
import { CreateReplacementChallanPayload } from '../api';
import { useStockBalances } from '@/features/inventory/hooks';

export interface ReplacementChallanModalProps {
  event: LossEventDto;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateReplacementChallanPayload) => Promise<void>;
  isLoading?: boolean;
  locations?: Array<{ id: string; name: string; code: string }>;
  departments?: Array<{ id: string; name: string; code: string }>;
}

export function ReplacementChallanModal({
  event,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  locations = [],
  departments = [],
}: ReplacementChallanModalProps) {
  const [dispatchLocationId, setDispatchLocationId] = useState(
    event.locationId || (locations[0]?.id ?? '')
  );
  const [targetDepartmentId, setTargetDepartmentId] = useState(
    event.departmentId || ''
  );
  const totalProposalQty = Number(event.quantity || 0);
  const [replacementQty, setReplacementQty] = useState(String(event.quantity || ''));
  const [rejectedQty, setRejectedQty] = useState('0');
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch live stock balances for this material / product
  const { data: stockData, isLoading: isStockLoading } = useStockBalances({
    materialId: event.materialId || undefined,
    productId: event.productId || undefined,
    limit: 50,
  });

  const availableStockList = useMemo(() => {
    return stockData?.items || [];
  }, [stockData?.items]);

  const totalStoreStockAvailable = useMemo(() => {
    return availableStockList.reduce((sum, item) => sum + (Number(item.availableQuantity ?? item.available) || Number(item.onHandQuantity) || 0), 0);
  }, [availableStockList]);

  // Auto-select location that has available stock
  useEffect(() => {
    if (availableStockList.length > 0) {
      const bestLocation = availableStockList.find((b) => (Number(b.availableQuantity ?? b.available) || Number(b.onHandQuantity) || 0) >= totalProposalQty)
        || availableStockList.find((b) => (Number(b.availableQuantity ?? b.available) || Number(b.onHandQuantity) || 0) > 0);
      if (bestLocation?.locationId) {
        setDispatchLocationId(bestLocation.locationId);
      }
    } else if (event.locationId) {
      setDispatchLocationId(event.locationId);
    } else if (locations.length > 0 && !dispatchLocationId) {
      setDispatchLocationId(locations[0].id);
    }
  }, [availableStockList, event.locationId, locations, totalProposalQty]);

  useEffect(() => {
    if (event.departmentId) {
      setTargetDepartmentId(event.departmentId);
    }
    setReplacementQty(String(event.quantity || ''));
  }, [event]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!dispatchLocationId) {
      setError('Please select a dispatch warehouse location.');
      return;
    }

    const repNum = parseFloat(replacementQty);
    const rejNum = parseFloat(rejectedQty || '0');

    if (isNaN(repNum) || repNum < 0) {
      setError('Please provide a valid replacement quantity.');
      return;
    }

    if (repNum + rejNum > totalProposalQty + 0.0001) {
      setError(`Sum of replacement (${repNum}) and rejected returned (${rejNum}) exceeds proposal quantity (${totalProposalQty}).`);
      return;
    }

    if (rejNum > 0 && !rejectionReason.trim()) {
      setError('Rejection reason is required when rejecting/returning a portion of the proposal.');
      return;
    }

    try {
      await onSubmit({
        dispatchLocationId,
        targetDepartmentId: targetDepartmentId || undefined,
        replacementQuantity: repNum,
        rejectedQuantity: rejNum,
        rejectionReason: rejNum > 0 ? rejectionReason.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to issue replacement challan.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Issue Replacement Challan
              </h3>
              <p className="text-xs text-muted-foreground">
                Dispatch material replenishment against Loss Event{' '}
                <span className="font-mono font-medium text-foreground">
                  {event.lossNumber}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Item & Live Available Stock Banner */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">Replacement Item</span>
                <span className="font-bold text-sm text-foreground">
                  {event.materialName || event.productName || 'Raw Material / Item'}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground block">
                  {event.itemCode ? `Code: ${event.itemCode}` : 'Code: Standard'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block text-[11px] uppercase font-semibold">Reported Scrap</span>
                <span className="font-mono text-base font-bold text-rose-600 dark:text-rose-400">
                  {event.quantity} {event.uomCode || 'units'}
                </span>
              </div>
            </div>

            {/* Live Auto-Fetched Store Inventory Badge */}
            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">
                  Store Available Stock:
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {isStockLoading ? 'Checking store...' : `${totalStoreStockAvailable} ${event.uomCode || 'units'}`}
                </span>
              </div>
              {totalStoreStockAvailable >= totalProposalQty ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Ready to Replenish
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border">
                  <Info className="w-3 h-3 text-primary" /> Low Store Balance
                </span>
              )}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Disbursement &amp; Return Allocation
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                Total: {event.quantity} {event.uomCode || 'units'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block mb-1">
                  Accept &amp; Replace (From Store) *
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalProposalQty}
                  step="any"
                  value={replacementQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReplacementQty(val);
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed) && parsed <= totalProposalQty) {
                      setRejectedQty(String(Math.max(0, +(totalProposalQty - parsed).toFixed(4))));
                    }
                  }}
                  className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-background border border-emerald-500/40 rounded-lg text-foreground focus:ring-2 focus:ring-emerald-500/20"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 block mb-1">
                  Reject &amp; Return to Dept
                </label>
                <input
                  type="number"
                  min="0"
                  max={totalProposalQty}
                  step="any"
                  value={rejectedQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRejectedQty(val);
                    const parsed = parseFloat(val);
                    if (!isNaN(parsed) && parsed <= totalProposalQty) {
                      setReplacementQty(String(Math.max(0, +(totalProposalQty - parsed).toFixed(4))));
                    }
                  }}
                  className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-background border border-rose-500/40 rounded-lg text-foreground focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>

            {parseFloat(rejectedQty || '0') > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-destructive block">
                  Rejection Reason for Returned Material ({rejectedQty} {event.uomCode || 'units'}) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Usable material; must rework or complete production with original stock"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-background border border-destructive/40 rounded-lg text-foreground focus:ring-2 focus:ring-destructive/20"
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  The {rejectedQty} returned units will be sent back to the department queue. The department head is bound to use it to complete the scheduled output.
                </p>
              </div>
            )}
          </div>

          {/* Dispatch Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-primary" />
              Dispatch Warehouse Location *
            </label>
            <select
              value={dispatchLocationId}
              onChange={(e) => setDispatchLocationId(e.target.value)}
              required
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select dispatch location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Target Department */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              Receiving Department (Optional)
            </label>
            <select
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select receiving department (default: event department)...</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.code})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Dispatch Instructions / Notes
            </label>
            <textarea
              placeholder="Provide gatepass / driver / handling instructions (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2.5 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Footer Actions */}
          {/* Unpausing Notice */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Automatic Production Resumption</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300/90 mt-0.5">
                Upon issuing this replacement challan, the paused floor execution batch will be refilled with the replacement quantity and automatically unpaused so the department head can continue production.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="h-9 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Issuing & Dispatching...' : 'Accept Scrap & Dispatch Replacement'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
