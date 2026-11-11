'use client';

import React, { useState } from 'react';
import { BomLine, UpdateBomDraftInput } from '../types';
import { BomLineType, BomQuantityMode, BomRoundingRule } from '@plinth/types';
import { useMaterials, useProducts, useUoms, useDepartments } from '../../../hooks/useMasterData';
import { Plus, Trash2, ArrowUp, ArrowDown, Package, Layers, Loader2 } from 'lucide-react';
import { SearchableSelector } from '../../../components/ui/SearchableSelector';
import { DepartmentDialog } from '../../../components/DepartmentDialog';

interface EditableLine {
  id?: string;
  lineType: BomLineType;
  materialId?: string | null;
  componentProductId?: string | null;
  uomId: string;
  quantityMode: BomQuantityMode;
  quantity: number;
  roundingRule: BomRoundingRule;
  roundingPrecision?: number | null;
  departmentId?: string | null;
  sequence: number;
  note?: string | null;
}

interface Props {
  bomVersionId: string;
  lines: BomLine[];
  isReadOnly: boolean;
  onSaveLines: (lines: UpdateBomDraftInput['lines']) => Promise<void>;
  isSaving: boolean;
}

export function BomLineEditor({ lines, isReadOnly, onSaveLines, isSaving }: Props) {
  const [draftLines, setDraftLines] = useState<EditableLine[]>(() =>
    lines.map((l, i) => ({
      id: l.id,
      lineType: l.lineType,
      materialId: l.materialId ?? null,
      componentProductId: l.componentProductId ?? null,
      uomId: l.uomId,
      quantityMode: l.quantityMode,
      quantity: l.quantity,
      roundingRule: l.roundingRule,
      roundingPrecision: l.roundingPrecision ?? null,
      departmentId: l.departmentId ?? null,
      sequence: l.sequence ?? i + 1,
      note: l.note ?? '',
    }))
  );
  const [createDeptOpen, setCreateDeptOpen] = useState(false);
  const [targetLineIdx, setTargetLineIdx] = useState<number | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: materialsData } = useMaterials('ACTIVE', 1, 500);
  const { data: productsData } = useProducts('ACTIVE', 1, 500);
  const { data: uomsData } = useUoms('ACTIVE');
  const { data: departmentsData } = useDepartments('ACTIVE');

  const materials = React.useMemo(() => materialsData?.items || [], [materialsData?.items]);
  const products = React.useMemo(() => productsData?.items || [], [productsData?.items]);
  const uoms = React.useMemo(() => uomsData?.items || [], [uomsData?.items]);
  const departments = React.useMemo(() => departmentsData?.items || [], [departmentsData?.items]);

  React.useEffect(() => {
    setDraftLines(
      lines.map((l, i) => ({
        id: l.id,
        lineType: l.lineType,
        materialId: l.materialId ?? null,
        componentProductId: l.componentProductId ?? null,
        uomId: l.uomId,
        quantityMode: l.quantityMode,
        quantity: l.quantity,
        roundingRule: l.roundingRule || 'NONE',
        roundingPrecision: l.roundingPrecision ?? null,
        departmentId: l.departmentId ?? null,
        sequence: l.sequence ?? i + 1,
        note: l.note ?? '',
      }))
    );
  }, [lines]);

  const handleAddLine = () => {
    const newLine: EditableLine = {
      lineType: 'COMPONENT',
      materialId: null,
      componentProductId: null,
      uomId: '',
      quantityMode: 'SCALED',
      quantity: 1,
      roundingRule: 'NONE',
      roundingPrecision: null,
      departmentId: null,
      sequence: draftLines.length + 1,
      note: '',
    };
    setDraftLines([...draftLines, newLine]);
    setValidationError(null);
  };

  const handleRemoveLine = (index: number) => {
    const updated = draftLines.filter((_, i) => i !== index).map((l, i) => ({ ...l, sequence: i + 1 }));
    setDraftLines(updated);
    setValidationError(null);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftLines.length) return;
    const copy = [...draftLines];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setDraftLines(copy.map((l, i) => ({ ...l, sequence: i + 1 })));
  };

  const handleChange = (index: number, field: keyof EditableLine, value: string | number | null | undefined) => {
    const copy = [...draftLines];
    copy[index] = { ...copy[index], [field]: value };

    // Reset mutually exclusive IDs if switching type
    if (field === 'materialId' && value) {
      copy[index].componentProductId = null;
    } else if (field === 'componentProductId' && value) {
      copy[index].materialId = null;
    }

    if (field === 'roundingRule') {
      if (value && value !== 'NONE' && (copy[index].roundingPrecision === null || copy[index].roundingPrecision === undefined)) {
        copy[index].roundingPrecision = 2;
      } else if (value === 'NONE') {
        copy[index].roundingPrecision = null;
      }
    }

    setDraftLines(copy);
    setValidationError(null);
  };

  const handleSave = async () => {
    setValidationError(null);
    for (let i = 0; i < draftLines.length; i++) {
      const l = draftLines[i];
      if (!l.materialId && !l.componentProductId) {
        setValidationError(`Row #${i + 1} must reference a valid Material or Subassembly Product.`);
        return;
      }
      if (!l.uomId) {
        setValidationError(`Row #${i + 1} is missing a valid Unit of Measure (UOM).`);
        return;
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        setValidationError(`Row #${i + 1} quantity must be greater than 0.`);
        return;
      }
    }

    const payload = draftLines.map((l, i) => ({
      lineType: l.lineType,
      materialId: l.materialId || null,
      componentProductId: l.componentProductId || null,
      uomId: l.uomId,
      quantityMode: l.quantityMode,
      quantity: Number(l.quantity) || 0,
      roundingRule: l.roundingRule || 'NONE',
      roundingPrecision:
        l.roundingRule && l.roundingRule !== 'NONE'
          ? (l.roundingPrecision !== null && l.roundingPrecision !== undefined && !isNaN(Number(l.roundingPrecision))
              ? Number(l.roundingPrecision)
              : 0)
          : null,
      departmentId: l.departmentId || null,
      sequence: i + 1,
      note: l.note || null,
    }));
    await onSaveLines(payload);
  };

  const hasUnsavedChanges = JSON.stringify(draftLines) !== JSON.stringify(
    lines.map((l, i) => ({
      id: l.id,
      lineType: l.lineType,
      materialId: l.materialId ?? null,
      componentProductId: l.componentProductId ?? null,
      uomId: l.uomId,
      quantityMode: l.quantityMode,
      quantity: l.quantity,
      roundingRule: l.roundingRule,
      roundingPrecision: l.roundingPrecision ?? null,
      departmentId: l.departmentId ?? null,
      sequence: l.sequence ?? i + 1,
      note: l.note ?? '',
    }))
  );

  return (
    <div className="space-y-4">
      {validationError && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center justify-between">
          <span>{validationError}</span>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-destructive/80 hover:text-destructive text-xs font-semibold px-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Formula & Component Lines ({draftLines.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure scaled product ratios (per unit output) or fixed batch components with department routing.
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Line
            </button>
            <button
              type="button"
              disabled={isSaving || !hasUnsavedChanges}
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {isSaving ? 'Saving Formula...' : 'Save Formula Lines'}
            </button>
          </div>
        )}
      </div>

      {draftLines.length === 0 ? (
        <div className="p-8 border border-dashed rounded-xl text-center space-y-3 bg-muted/20">
          <Package className="h-10 w-10 text-muted-foreground/50 mx-auto" />
          <div>
            <p className="text-sm font-medium text-foreground">No Formula Lines Defined</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add raw material and component ratios to formulate this bill of materials.
            </p>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add First Component Line
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/60 text-muted-foreground border-b border-border uppercase font-medium text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[120px]">Type</th>
                <th className="py-2.5 px-3 min-w-[240px]">Component / Material</th>
                <th className="py-2.5 px-3 min-w-[110px]">Qty Mode</th>
                <th className="py-2.5 px-3 min-w-[100px]">Base Ratio Qty</th>
                <th className="py-2.5 px-3 min-w-[120px]">UOM</th>
                <th className="py-2.5 px-3 min-w-[140px]">Rounding</th>
                <th className="py-2.5 px-3 min-w-[140px]">Department</th>
                <th className="py-2.5 px-3 min-w-[140px]">Notes</th>
                {!isReadOnly && <th className="py-2.5 px-3 w-20 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-normal">
              {draftLines.map((line, idx) => (
                <tr key={idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 text-center text-muted-foreground font-mono">
                    {idx + 1}
                  </td>

                  {/* Line Type */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        line.lineType === 'COMPONENT'
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {line.lineType}
                      </span>
                    ) : (
                      <select
                        value={line.lineType}
                        onChange={(e) => handleChange(idx, 'lineType', e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="COMPONENT">COMPONENT</option>
                        <option value="PACKAGING">PACKAGING</option>
                      </select>
                    )}
                  </td>

                  {/* Material / Component Product Selector */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {line.materialId
                            ? materials.find((m) => m.id === line.materialId)?.name || line.materialId
                            : products.find((p) => p.id === line.componentProductId)?.name || line.componentProductId}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {line.materialId
                            ? `MAT: ${materials.find((m) => m.id === line.materialId)?.code || ''}`
                            : `SKU: ${products.find((p) => p.id === line.componentProductId)?.sku || ''}`}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <SearchableSelector
                          size="sm"
                          value={line.materialId ? `mat:${line.materialId}` : line.componentProductId ? `prod:${line.componentProductId}` : ''}
                          onChange={(value) => {
                            const copy = [...draftLines];
                            if (value.startsWith('mat:')) {
                              const matId = value.slice(4); const mat = materials.find((m) => m.id === matId);
                              copy[idx] = { ...copy[idx], materialId: matId, componentProductId: null, uomId: mat?.uomId || mat?.uom?.id || '' };
                            } else if (value.startsWith('prod:')) {
                              const prodId = value.slice(5); const prod = products.find((p) => p.id === prodId);
                              copy[idx] = { ...copy[idx], componentProductId: prodId, materialId: null, uomId: prod?.uomId || prod?.uom?.id || '' };
                            }
                            setDraftLines(copy); setValidationError(null);
                          }}
                          options={[
                            ...materials.map((m) => ({
                              id: `mat:${m.id}`,
                              name: m.name,
                              code: m.isVariant ? `MAT · ${m.code} [Variant]` : `MAT · ${m.code}`,
                              status: m.status,
                              isVariant: m.isVariant,
                              parentItemName: m.parentMaterialName || materials.find((parent) => parent.id === m.parentMaterialId)?.name,
                            })),
                            ...products.map((p) => ({
                              id: `prod:${p.id}`,
                              name: p.name,
                              code: p.isVariant ? `SKU · ${p.sku} [Variant]` : `SKU · ${p.sku}`,
                              status: p.status,
                              isVariant: p.isVariant,
                              parentItemName: p.parentProductName || products.find((parent) => parent.id === p.parentProductId)?.name,
                            })),
                          ]}
                          placeholder="Search material or component product..."
                        />
                      </div>
                    )}
                  </td>

                  {/* Quantity Mode */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        line.quantityMode === 'SCALED'
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {line.quantityMode}
                      </span>
                    ) : (
                      <select
                        value={line.quantityMode}
                        onChange={(e) => handleChange(idx, 'quantityMode', e.target.value)}
                        className="w-full px-1.5 py-1 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="SCALED">SCALED</option>
                        <option value="FIXED">FIXED</option>
                      </select>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className="font-mono font-medium text-foreground">{line.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        step="any"
                        min="0.000001"
                        value={line.quantity}
                        onChange={(e) => handleChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-xs font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                  </td>

                  {/* UOM */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className="text-foreground">
                        {uoms.find((u) => u.id === line.uomId)?.symbol || uoms.find((u) => u.id === line.uomId)?.name || line.uomId}
                      </span>
                    ) : (
                      <select
                        value={line.uomId}
                        onChange={(e) => handleChange(idx, 'uomId', e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {uoms.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.symbol ? `${u.symbol} (${u.code})` : u.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Rounding Rule & Precision */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {line.roundingRule} {line.roundingPrecision !== null && line.roundingPrecision !== undefined ? `(${line.roundingPrecision} dec)` : ''}
                      </span>
                    ) : (
                      <div className="flex gap-1 items-center">
                        <select
                          value={line.roundingRule}
                          onChange={(e) => handleChange(idx, 'roundingRule', e.target.value)}
                          className="w-24 px-1 py-1 text-[11px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="NONE">NONE</option>
                          <option value="ROUND_UP">UP</option>
                          <option value="ROUND_DOWN">DOWN</option>
                          <option value="ROUND_NEAREST">NEAREST</option>
                        </select>
                        {line.roundingRule !== 'NONE' && (
                          <input
                            type="number"
                            min="0"
                            max="6"
                            placeholder="Dec"
                            title="Precision decimals"
                            value={line.roundingPrecision ?? ''}
                            onChange={(e) =>
                              handleChange(idx, 'roundingPrecision', e.target.value === '' ? null : parseInt(e.target.value, 10))
                            }
                            className="w-12 px-1 py-1 text-[11px] font-mono rounded border border-input bg-background"
                          />
                        )}
                      </div>
                    )}
                  </td>

                  {/* Department */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className="text-muted-foreground text-[11px]">
                        {departments.find((d) => d.id === line.departmentId)?.name || '—'}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select
                          value={line.departmentId || ''}
                          onChange={(e) => handleChange(idx, 'departmentId', e.target.value || null)}
                          className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">(None)</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetLineIdx(idx);
                            setCreateDeptOpen(true);
                          }}
                          className="p-1 rounded text-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer"
                          title="Add new department"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="py-2 px-3">
                    {isReadOnly ? (
                      <span className="text-muted-foreground text-[11px] truncate block max-w-[160px]">
                        {line.note || '—'}
                      </span>
                    ) : (
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={line.note || ''}
                        onChange={(e) => handleChange(idx, 'note', e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                  </td>

                  {/* Actions */}
                  {!isReadOnly && (
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, 'up')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20"
                          title="Move up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draftLines.length - 1}
                          onClick={() => handleMove(idx, 'down')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20"
                          title="Move down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                          title="Delete line"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DepartmentDialog
        open={createDeptOpen}
        onClose={() => {
          setCreateDeptOpen(false);
          setTargetLineIdx(null);
        }}
        onCreated={(newDept) => {
          if (targetLineIdx !== null) {
            handleChange(targetLineIdx, 'departmentId', newDept.id);
          }
        }}
      />
    </div>
  );
}
