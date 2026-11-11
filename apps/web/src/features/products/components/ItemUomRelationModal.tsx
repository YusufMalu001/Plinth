'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ArrowLeftRight,
  AlertCircle,
  Check,
} from 'lucide-react';
import { Dialog, Button } from '@plinth/ui';
import { SearchableSelector } from '../../../components/ui/SearchableSelector';
import type { ItemUomRelation } from '../types';

export interface UomOption {
  id: string;
  name: string;
  code?: string;
  symbol?: string;
}

export interface ItemUomRelationModalProps {
  open: boolean;
  onClose: () => void;
  baseUomId: string;
  additionalUomIds?: string[];
  allUoms: UomOption[];
  relations: ItemUomRelation[];
  onSave: (relations: ItemUomRelation[]) => void;
}

interface RelationRowDraft {
  id: string;
  fromUomId: string;
  toUomId: string;
  fromQuantity: string;
  toQuantity: string;
}

export function ItemUomRelationModal({
  open,
  onClose,
  baseUomId,
  allUoms,
  relations,
  onSave,
}: ItemUomRelationModalProps) {
  const getUom = (id: string): UomOption | undefined => allUoms.find((u) => u.id === id);

  const getUomLabel = (id: string): string => {
    const u = getUom(id);
    if (!u) return 'Unit';
    return u.name + (u.symbol ? ` (${u.symbol})` : u.code ? ` (${u.code})` : '');
  };

  const getUomShort = (id: string): string => {
    const u = getUom(id);
    if (!u) return 'unit';
    return u.symbol || u.code || u.name;
  };

  const [rows, setRows] = useState<RelationRowDraft[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (relations && relations.length > 0) {
      setRows(
        relations.map((r, idx) => ({
          id: r.id || `rel_${idx}_${Date.now()}`,
          fromUomId: r.fromUomId,
          toUomId: r.toUomId,
          fromQuantity: String(r.fromQuantity ?? 1),
          toQuantity: String(r.toQuantity ?? r.factor ?? ''),
        }))
      );
    } else {
      const firstTarget = allUoms.find((u) => u.id !== baseUomId);
      setRows([
        {
          id: `rel_0_${Date.now()}`,
          fromUomId: baseUomId,
          toUomId: firstTarget ? firstTarget.id : '',
          fromQuantity: '1',
          toQuantity: '',
        },
      ]);
    }
    setErrorMsg(null);
  }, [open, baseUomId, relations, allUoms]);

  const updateRow = (index: number, updates: Partial<RelationRowDraft>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    );
    setErrorMsg(null);
  };

  const addRow = () => {
    const usedSecondaryIds = new Set(
      rows.map((r) => (r.fromUomId === baseUomId ? r.toUomId : r.fromUomId))
    );
    const nextAvailable = allUoms.find(
      (u) => u.id !== baseUomId && !usedSecondaryIds.has(u.id)
    );

    setRows((prev) => [
      ...prev,
      {
        id: `rel_${prev.length}_${Date.now()}`,
        fromUomId: baseUomId,
        toUomId: nextAvailable ? nextAvailable.id : '',
        fromQuantity: '1',
        toQuantity: '',
      },
    ]);
    setErrorMsg(null);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      // If user removes only row, reset to empty values
      const firstTarget = allUoms.find((u) => u.id !== baseUomId);
      setRows([
        {
          id: `rel_0_${Date.now()}`,
          fromUomId: baseUomId,
          toUomId: firstTarget ? firstTarget.id : '',
          fromQuantity: '1',
          toQuantity: '',
        },
      ]);
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrorMsg(null);
  };

  const swapRow = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const fQty = parseFloat(r.fromQuantity);
        const tQty = parseFloat(r.toQuantity);
        let newToQty = '';
        if (!isNaN(fQty) && fQty > 0 && !isNaN(tQty) && tQty > 0) {
          newToQty = Number((fQty / tQty).toFixed(6)).toString();
        }
        return {
          ...r,
          fromUomId: r.toUomId,
          toUomId: r.fromUomId,
          fromQuantity: '1',
          toQuantity: newToQty,
        };
      })
    );
    setErrorMsg(null);
  };

  const handleSave = () => {
    if (rows.length === 0) {
      setErrorMsg('Please add at least one conversion relation.');
      return;
    }

    const finalRelations: ItemUomRelation[] = [];
    const seenSecondaryUoms = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const secondaryId = r.fromUomId === baseUomId ? r.toUomId : r.fromUomId;

      if (!secondaryId || secondaryId === baseUomId) {
        setErrorMsg(`Please select a secondary unit of measure for relation #${i + 1}.`);
        return;
      }

      if (seenSecondaryUoms.has(secondaryId)) {
        setErrorMsg(`Each secondary UOM can only have one relation (${getUomLabel(secondaryId)} is duplicated).`);
        return;
      }
      seenSecondaryUoms.add(secondaryId);

      const fQty = parseFloat(r.fromQuantity);
      const tQty = parseFloat(r.toQuantity);

      if (isNaN(fQty) || fQty <= 0) {
        setErrorMsg(`Please enter a valid positive base quantity for relation #${i + 1}.`);
        return;
      }

      if (isNaN(tQty) || tQty <= 0) {
        setErrorMsg(`Please enter a valid positive equivalent quantity for ${getUomLabel(secondaryId)}.`);
        return;
      }

      const calculatedFactor = Number((tQty / fQty).toFixed(8));

      finalRelations.push({
        id: `${r.fromUomId}_${r.toUomId}`,
        fromUomId: r.fromUomId,
        toUomId: r.toUomId,
        fromQuantity: fQty,
        toQuantity: tQty,
        factor: calculatedFactor,
      });
    }

    onSave(finalRelations);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Unit of Measure Conversion Relation"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Base UOM Context Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase tracking-wider font-bold text-[11px]">
              Base UOM:
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {getUomLabel(baseUomId)}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {rows.length} {rows.length === 1 ? 'relation' : 'relations'}
          </span>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dynamic Relation Rows */}
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {rows.map((row, index) => {
            const isBaseFrom = row.fromUomId === baseUomId;
            const secondaryUomOptions = allUoms
              .filter((u) => u.id !== baseUomId)
              .map((u) => ({
                ...u,
                disabled: rows.some(
                  (r, i) => i !== index && (r.fromUomId === u.id || r.toUomId === u.id)
                ),
              }));

            return (
              <div
                key={row.id || index}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs flex items-center gap-2.5 flex-wrap sm:flex-nowrap"
              >
                {/* Left side: Quantity & UOM */}
                {isBaseFrom ? (
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden w-28 shrink-0 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={row.fromQuantity}
                      onChange={(e) => updateRow(index, { fromQuantity: e.target.value })}
                      placeholder="1"
                      className="w-14 h-9 px-2 text-center font-mono text-xs font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                    />
                    <span className="flex-1 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 border-l border-slate-300 dark:border-slate-700 whitespace-nowrap text-center">
                      {getUomShort(baseUomId)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={row.fromQuantity}
                      onChange={(e) => updateRow(index, { fromQuantity: e.target.value })}
                      placeholder="1"
                      className="w-14 h-9 px-2 text-center rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-primary shrink-0"
                    />
                    <div className="flex-1 min-w-[140px]">
                      <SearchableSelector
                        value={row.fromUomId}
                        onChange={(val) => updateRow(index, { fromUomId: val })}
                        options={secondaryUomOptions}
                        placeholder="Select UOM..."
                        size="sm"
                        renderOption={(uom) => (
                          <span className="font-medium text-foreground">
                            {uom.name}{uom.symbol ? ` (${uom.symbol})` : ''}
                          </span>
                        )}
                        className="w-full [&>button]:h-9 [&>button]:rounded-lg [&>button]:text-xs [&>button]:font-bold"
                      />
                    </div>
                  </div>
                )}

                {/* Equals sign */}
                <span className="text-slate-400 font-bold text-sm shrink-0">=</span>

                {/* Right side: Equivalent Quantity & UOM */}
                {isBaseFrom ? (
                  <>
                    <div className="w-28 shrink-0">
                      <input
                        type="number"
                        min="0.000001"
                        step="any"
                        value={row.toQuantity}
                        onChange={(e) => updateRow(index, { toQuantity: e.target.value })}
                        placeholder="e.g. 0.041"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="flex-1 min-w-[150px]">
                      <SearchableSelector
                        value={row.toUomId}
                        onChange={(val) => updateRow(index, { toUomId: val })}
                        options={secondaryUomOptions}
                        placeholder="Select UOM..."
                        size="sm"
                        renderOption={(uom) => (
                          <span className="font-medium text-foreground">
                            {uom.name}{uom.symbol ? ` (${uom.symbol})` : ''}
                          </span>
                        )}
                        className="w-full [&>button]:h-9 [&>button]:rounded-lg [&>button]:text-xs [&>button]:font-bold"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden w-28 shrink-0 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={row.toQuantity}
                      onChange={(e) => updateRow(index, { toQuantity: e.target.value })}
                      placeholder="e.g. 0.041"
                      className="w-14 h-9 px-2 text-center font-mono text-xs font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                    />
                    <span className="flex-1 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 border-l border-slate-300 dark:border-slate-700 whitespace-nowrap text-center">
                      {getUomShort(baseUomId)}
                    </span>
                  </div>
                )}

                {/* Direction swap button */}
                <button
                  type="button"
                  onClick={() => swapRow(index)}
                  className="p-2 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Reverse conversion order"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>

                {/* Delete button */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="p-2 text-slate-400 hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                    title="Remove relation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Another Relation Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="h-8 rounded-xl text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
            icon={Plus}
          >
            Add Relation
          </Button>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="h-9 px-5 rounded-xl text-xs font-bold bg-primary hover:bg-[#003c68] text-white shadow-xs"
            icon={Check}
          >
            Apply &amp; Save Relation
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
