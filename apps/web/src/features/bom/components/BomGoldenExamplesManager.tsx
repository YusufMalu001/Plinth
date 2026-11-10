'use client';

import React, { useState } from 'react';
import { BomVersionDetail, AddGoldenExampleInput } from '../types';
import { useAddGoldenExample } from '../hooks';
import { useUoms } from '../../../hooks/useMasterData';
import { CheckCheck, Plus, Sparkles, X, ShieldAlert, FileText } from 'lucide-react';

interface Props {
  version: BomVersionDetail;
  isReadOnly: boolean;
}

export function BomGoldenExamplesManager({ version, isReadOnly }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [inputQuantity, setInputQuantity] = useState(100);
  const [inputUomId, setInputUomId] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [lineResults, setLineResults] = useState<Record<string, number>>({});

  const { data: uomsData } = useUoms('ACTIVE');
  const uoms = uomsData?.items || [];
  const addMutation = useAddGoldenExample();

  const handleOpenModal = () => {
    setInputUomId(version.product?.uomId || uoms[0]?.id || '');
    // Pre-fill expected quantities by scaling component lines by default inputQuantity (100)
    const initialResults: Record<string, number> = {};
    version.lines.forEach((line) => {
      const baseQty = Number(line.quantity) || 0;
      if (line.quantityMode === 'SCALED') {
        initialResults[line.id] = Number((baseQty * 100).toFixed(4));
      } else {
        initialResults[line.id] = Number(baseQty.toFixed(4));
      }
    });
    setLineResults(initialResults);
    setLabel(`Standard Batch (100 units)`);
    setSourceReference('Master Recipe Binder / Pilot Run Batch');
    setIsModalOpen(true);
  };

  const handleQuantityChange = (newQty: number) => {
    setInputQuantity(newQty);
    const updatedResults: Record<string, number> = {};
    version.lines.forEach((line) => {
      const baseQty = Number(line.quantity) || 0;
      if (line.quantityMode === 'SCALED') {
        updatedResults[line.id] = Number((baseQty * newQty).toFixed(4));
      } else {
        updatedResults[line.id] = Number(baseQty.toFixed(4));
      }
    });
    setLineResults(updatedResults);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const expectedResults = version.lines.map((line) => ({
      bomLineId: line.id,
      expectedQuantity: lineResults[line.id] ?? 0,
      uomId: line.uomId,
    }));

    const payload: AddGoldenExampleInput = {
      label,
      inputQuantity,
      inputUomId: inputUomId || version.product?.uomId || uoms[0]?.id || '',
      expectedResults,
      sourceReference,
    };

    await addMutation.mutateAsync({ id: version.id, data: payload });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#004a80] dark:text-blue-400" />
            Golden Example Reference Cases ({version.goldenExamples.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Empirically verified test fixtures. The calculation engine must reproduce these test cases with 0 error before approval.
          </p>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={handleOpenModal}
            disabled={version.lines.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#004a80] text-white hover:bg-[#003c68] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Golden Fixture
          </button>
        )}
      </div>

      {version.goldenExamples.length === 0 ? (
        <div className="p-8 border border-dashed rounded-xl text-center space-y-3 bg-muted/20">
          <ShieldAlert className="h-10 w-10 text-[#004a80]/60 dark:text-blue-400/60 mx-auto" />
          <div>
            <p className="text-sm font-medium text-foreground">No Golden Examples Linked</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Golden examples are required by Synergy compliance to prevent calculation drift and formula regressions.
            </p>
          </div>
          {!isReadOnly && version.lines.length > 0 && (
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#004a80] text-white hover:bg-[#003c68]"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Golden Example Test Case
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {version.goldenExamples.map((example) => (
            <div
              key={example.id}
              className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3 hover:border-[#004a80]/40 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CheckCheck className="h-4 w-4 text-emerald-500" />
                    {example.label}
                  </h4>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    Input: {example.inputQuantity} {example.inputUom?.symbol || 'units'}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Verified
                </span>
              </div>

              <div className="border-t border-border/50 pt-2 space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Expected Line Yields:</p>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {example.expectedResults.map((r, i) => {
                    const line = version.lines.find((l) => l.id === r.bomLineId);
                    const name = line?.material?.name || line?.componentProduct?.name || `Line #${i + 1}`;
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/40 font-mono">
                        <span className="text-foreground text-[11px] truncate max-w-[180px] font-sans">{name}</span>
                        <span className="font-semibold text-emerald-400">{r.expectedQuantity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {example.sourceReference && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <FileText className="h-3 w-3" />
                  <span className="truncate">{example.sourceReference}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal for adding a golden example fixture */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Add Golden Example Test Fixture</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define reference batch input and exact expected component quantities.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Fixture Label</label>
                  <input
                    type="text"
                    required
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. 500L standard production run"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Source Reference</label>
                  <input
                    type="text"
                    required
                    value={sourceReference}
                    onChange={(e) => setSourceReference(e.target.value)}
                    placeholder="e.g. Master Formulation Binder v3"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Batch Input Quantity</label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    required
                    value={inputQuantity}
                    onChange={(e) => handleQuantityChange(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Input UOM</label>
                  <select
                    value={inputUomId || version.product?.uomId || uoms[0]?.id || ''}
                    onChange={(e) => setInputUomId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {uoms.map((u) => {
                      const isBase = u.id === version.product?.uomId;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.symbol ? `${u.symbol} (${u.code})` : u.name}
                          {isBase ? ' — Base Product UOM' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Expected Results Line by Line */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Expected Component Quantities</label>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 rounded-lg border border-border p-2 bg-muted/20">
                  {version.lines.map((line, idx) => {
                    const name = line.material?.name || line.componentProduct?.name || `Line #${idx + 1}`;
                    return (
                      <div key={line.id} className="flex items-center justify-between gap-3 text-xs p-1.5 rounded bg-card border border-border/60">
                        <div className="flex-1 truncate">
                          <span className="font-medium text-foreground truncate block">{name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Mode: {line.quantityMode} | Base: {line.quantity} {line.uom?.symbol || ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            required
                            value={lineResults[line.id] ?? 0}
                            onChange={(e) =>
                              setLineResults({
                                ...lineResults,
                                [line.id]: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-24 px-2 py-1 text-xs font-mono rounded border border-input bg-background text-right"
                          />
                          <span className="text-[11px] text-muted-foreground w-8">{line.uom?.symbol || ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-input hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addMutation.isPending}
                  className="px-4 py-1.5 text-xs rounded-lg bg-[#004a80] text-white hover:bg-[#003c68] font-semibold shadow-sm disabled:opacity-50"
                >
                  {addMutation.isPending ? 'Saving Fixture...' : 'Save Golden Fixture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
