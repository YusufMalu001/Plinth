'use client';

import React, { useState, useRef } from 'react';
import { BomVersionDetail, BomCalculationResult, BomCalculationRequirement } from '../types';
import { useRunSimulation, useBomSimulations } from '../hooks';
import { useUoms } from '../../../hooks/useMasterData';
import { Play, Calculator, History, Building2, Layers, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  version: BomVersionDetail;
}

function formatSimulationResult(
  version: BomVersionDetail,
  requestedQuantity: number,
  requestedUomId: string,
  rawRequirements: Array<{
    bomLineId: string;
    requiredQuantity: number;
    uomId: string;
    departmentId?: string | null;
  }>,
  runAtDate: string = new Date().toISOString()
): BomCalculationResult {
  const lineMap = new Map(version.lines.map((l) => [l.id, l]));

  const requirements: BomCalculationRequirement[] = (rawRequirements || []).map((req) => {
    const line = lineMap.get(req.bomLineId);
    return {
      bomLineId: req.bomLineId,
      lineType: line?.lineType || 'COMPONENT',
      materialId: line?.materialId,
      materialCode: line?.material?.code,
      materialName: line?.material?.name,
      componentProductId: line?.componentProductId,
      componentSku: line?.componentProduct?.sku,
      componentName: line?.componentProduct?.name,
      uomId: req.uomId || line?.uomId || '',
      uomCode: line?.uom?.code || '',
      uomSymbol: line?.uom?.symbol || line?.uom?.name || '',
      quantityMode: line?.quantityMode || 'SCALED',
      baseRatio: Number(line?.quantity) || 0,
      requiredQuantity: Number(req.requiredQuantity) || 0,
      roundingRule: line?.roundingRule || 'NONE',
      roundingPrecision: line?.roundingPrecision,
      departmentId: req.departmentId || line?.departmentId,
      departmentCode: line?.department?.code,
      departmentName: line?.department?.name || 'General / Plant Floor',
    };
  });

  const departmentBreakdown: BomCalculationResult['departmentBreakdown'] = {};
  for (const r of requirements) {
    const deptKey = r.departmentId || 'general';
    const deptName = r.departmentName || 'General / Plant Floor';
    if (!departmentBreakdown[deptKey]) {
      departmentBreakdown[deptKey] = {
        departmentId: deptKey,
        departmentName: deptName,
        lines: [],
      };
    }
    departmentBreakdown[deptKey].lines.push(r);
  }

  return {
    bomVersionId: version.id,
    bomNumber: version.bomNumber,
    version: version.version,
    status: version.status,
    isAuthoritative: version.status === 'APPROVED',
    productId: version.productId,
    materialId: version.materialId,
    productVariantId: version.productVariantId,
    requestedQuantity,
    requestedUomId,
    effectiveAsOf: runAtDate,
    requirements,
    departmentBreakdown,
  };
}

export function BomSimulationDrawer({ version }: Props) {
  const [quantity, setQuantity] = useState(100);
  const [uomId, setUomId] = useState(version.product?.uomId || version.material?.uomId || '');
  const [lastResult, setLastResult] = useState<BomCalculationResult | null>(null);
  const [inspectingResult, setInspectingResult] = useState<BomCalculationResult | null>(null);
  const [modalTab, setModalTab] = useState<'department' | 'all'>('department');
  const breakdownRef = useRef<HTMLDivElement>(null);

  const { data: uomsData } = useUoms('ACTIVE');
  const uoms = uomsData?.items || [];
  const runMutation = useRunSimulation();
  const { data: simulations = [] } = useBomSimulations(version.id);

  React.useEffect(() => {
    if (version.product?.uomId) {
      setUomId(version.product.uomId);
    }
  }, [version.product?.uomId]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveUomId = uomId || version.product?.uomId || uoms[0]?.id || '';
    const res = await runMutation.mutateAsync({
      id: version.id,
      data: {
        requestedQuantity: Number(quantity),
        requestedUomId: effectiveUomId,
      },
    });

    const rawReqs =
      res?.requirements ||
      (res?.simulation as { resultBreakdown?: Array<{ bomLineId: string; requiredQuantity: number; uomId: string; departmentId?: string | null }> })?.resultBreakdown ||
      [];

    const formatted = formatSimulationResult(
      version,
      Number(quantity),
      effectiveUomId,
      rawReqs,
      res?.simulation?.runAt || new Date().toISOString()
    );
    setLastResult(formatted);
    setTimeout(() => {
      breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleInspectRun = (sim: (typeof simulations)[0]) => {
    const rawBreakdown =
      (sim as { resultBreakdown?: Array<{ bomLineId: string; requiredQuantity: number; uomId: string; departmentId?: string | null }> })?.resultBreakdown ||
      (sim as { resultPayload?: { requirements?: Array<{ bomLineId: string; requiredQuantity: number; uomId: string; departmentId?: string | null }> } })?.resultPayload?.requirements ||
      [];

    const formatted = formatSimulationResult(
      version,
      sim.requestedQuantity,
      sim.requestedUomId,
      rawBreakdown,
      sim.runAt
    );
    setLastResult(formatted);
    setInspectingResult(formatted);
  };

  return (
    <div className="space-y-6">
      {/* Simulation Launcher Card */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Pre-Production BOM Simulator
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simulate requirements for any batch volume with validated rounding, unit conversion, and department routing.
            </p>
          </div>

          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-secondary-foreground border border-border">
            Non-Authoritative Sandbox
          </span>
        </div>

        <form onSubmit={handleSimulate} className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1 w-44">
            <label className="text-xs font-medium text-foreground">Target Production Qty</label>
            <input
              type="number"
              min="0.0001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1 w-56">
            <label className="text-xs font-medium text-foreground">Output Unit (UOM)</label>
            <select
              value={uomId || version.product?.uomId || uoms[0]?.id || ''}
              onChange={(e) => setUomId(e.target.value)}
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

          <button
            type="submit"
            disabled={runMutation.isPending || version.lines.length === 0}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {runMutation.isPending ? 'Simulating Requirements...' : 'Run Simulation'}
          </button>
        </form>
      </div>

      {/* Simulation Result Breakdown */}
      {lastResult && (
        <div ref={breakdownRef} className="rounded-xl border border-primary/30 bg-card p-5 shadow-md space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Material Requirements for {lastResult.requestedQuantity}{' '}
                {uoms.find((u) => u.id === lastResult.requestedUomId)?.symbol || 'Units'}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Calculated against BOM {lastResult.bomNumber} as of{' '}
                {new Date(lastResult.effectiveAsOf).toLocaleString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                {lastResult.requirements.length} Component Lines Computed
              </span>
              <button
                type="button"
                onClick={() => setInspectingResult(lastResult)}
                className="text-xs px-3 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5 active:translate-y-0 font-medium transition-all cursor-pointer"
              >
                Expand Modal
              </button>
            </div>
          </div>

          {/* Department Breakdown */}
          {lastResult.departmentBreakdown && Object.keys(lastResult.departmentBreakdown).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(lastResult.departmentBreakdown).map(([deptKey, dept]) => (
                <div key={deptKey} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span>{dept.departmentName}</span>
                    <span className="text-muted-foreground font-normal">({dept.lines.length} lines)</span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border bg-muted/20">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-muted-foreground font-medium">
                          <th className="py-2 px-3">Component / Material</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Mode</th>
                          <th className="py-2 px-3">Base Ratio</th>
                          <th className="py-2 px-3 text-right">Required Quantity</th>
                          <th className="py-2 px-3">UOM</th>
                          <th className="py-2 px-3">Rounding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-normal">
                        {dept.lines.map((req, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="py-2 px-3 font-medium text-foreground">
                              {req.materialName || req.componentName || '—'}
                              <span className="block text-[10px] text-muted-foreground font-mono">
                                {req.materialCode || req.componentSku || ''}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                                {req.lineType}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[11px] font-mono">{req.quantityMode}</td>
                            <td className="py-2 px-3 text-[11px] font-mono">{req.baseRatio}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                              {req.requiredQuantity}
                            </td>
                            <td className="py-2 px-3 font-mono">{req.uomSymbol || req.uomCode}</td>
                            <td className="py-2 px-3 text-[10px] text-muted-foreground">
                              {req.roundingRule !== 'NONE' ? `${req.roundingRule} (${req.roundingPrecision || 0} dec)` : 'Exact'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground font-medium">
                    <th className="py-2 px-3">Component / Material</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Mode</th>
                    <th className="py-2 px-3">Base Ratio</th>
                    <th className="py-2 px-3 text-right">Required Quantity</th>
                    <th className="py-2 px-3">UOM</th>
                    <th className="py-2 px-3">Rounding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-normal">
                  {lastResult.requirements.map((req, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium text-foreground">
                        {req.materialName || req.componentName || '—'}
                        <span className="block text-[10px] text-muted-foreground font-mono">
                          {req.materialCode || req.componentSku || ''}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                          {req.lineType}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] font-mono">{req.quantityMode}</td>
                      <td className="py-2 px-3 text-[11px] font-mono">{req.baseRatio}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                        {req.requiredQuantity}
                      </td>
                      <td className="py-2 px-3 font-mono">{req.uomSymbol || req.uomCode}</td>
                      <td className="py-2 px-3 text-[10px] text-muted-foreground">
                        {req.roundingRule !== 'NONE' ? `${req.roundingRule} (${req.roundingPrecision || 0} dec)` : 'Exact'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Historical Simulation Runs */}
      {simulations.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Simulation History ({simulations.length})
          </h4>

          <div className="space-y-2">
            {simulations.map((sim) => {
              const isViewing = lastResult?.effectiveAsOf === sim.runAt;

              return (
                <div
                  key={sim.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-xs ${
                    isViewing
                      ? 'border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/20'
                      : 'border-border bg-card/70 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isViewing ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                      <Calculator className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          Batch {sim.requestedQuantity} {uoms.find((u) => u.id === sim.requestedUomId)?.symbol || sim.requestedUom?.symbol || 'units'}
                        </span>
                        {isViewing && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Active View
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        Run: {new Date(sim.runAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInspectRun(sim)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm shadow-primary/20 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    View Breakdown
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Modal Breakdown Inspector */}
      {inspectingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Simulation Requirements: Batch {inspectingResult.requestedQuantity}{' '}
                    {uoms.find((u) => u.id === inspectingResult.requestedUomId)?.symbol || 'units'}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                    BOM {inspectingResult.bomNumber}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Simulated at {new Date(inspectingResult.effectiveAsOf).toLocaleString()} • {inspectingResult.requirements.length} required component lines
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingResult(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Subnav */}
            <div className="px-5 pt-3 border-b border-border flex items-center gap-3 text-xs bg-muted/10">
              <button
                type="button"
                onClick={() => setModalTab('department')}
                className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  modalTab === 'department'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Department Allocations ({Object.keys(inspectingResult.departmentBreakdown).length})
              </button>
              <button
                type="button"
                onClick={() => setModalTab('all')}
                className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  modalTab === 'all'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Consolidated Lines ({inspectingResult.requirements.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {modalTab === 'department' ? (
                <div className="space-y-4">
                  {Object.entries(inspectingResult.departmentBreakdown).map(([deptKey, dept]) => (
                    <div key={deptKey} className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                        <span className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          {dept.departmentName}
                        </span>
                        <span className="text-muted-foreground text-[11px] font-normal">{dept.lines.length} lines</span>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-border bg-background">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase font-medium">
                            <tr>
                              <th className="py-2 px-3">Item / Component</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3">Mode</th>
                              <th className="py-2 px-3">Base Ratio</th>
                              <th className="py-2 px-3 text-right">Required Quantity</th>
                              <th className="py-2 px-3">UOM</th>
                              <th className="py-2 px-3">Rounding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {dept.lines.map((req, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="py-2 px-3 font-medium text-foreground">
                                  {req.materialName || req.componentName || '—'}
                                  <span className="block text-[10px] text-muted-foreground font-mono">
                                    {req.materialCode || req.componentSku || ''}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                                    {req.lineType}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-[11px] font-mono">{req.quantityMode}</td>
                                <td className="py-2 px-3 text-[11px] font-mono">{req.baseRatio}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                                  {req.requiredQuantity}
                                </td>
                                <td className="py-2 px-3 font-mono">{req.uomSymbol || req.uomCode}</td>
                                <td className="py-2 px-3 text-[10px] text-muted-foreground">
                                  {req.roundingRule !== 'NONE' ? `${req.roundingRule} (${req.roundingPrecision || 0} dec)` : 'Exact'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-background">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase font-medium">
                      <tr>
                        <th className="py-2 px-3">Item / Component</th>
                        <th className="py-2 px-3">Department</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Mode</th>
                        <th className="py-2 px-3">Base Ratio</th>
                        <th className="py-2 px-3 text-right">Required Quantity</th>
                        <th className="py-2 px-3">UOM</th>
                        <th className="py-2 px-3">Rounding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inspectingResult.requirements.map((req, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-medium text-foreground">
                            {req.materialName || req.componentName || '—'}
                            <span className="block text-[10px] text-muted-foreground font-mono">
                              {req.materialCode || req.componentSku || ''}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground text-[11px]">
                            {req.departmentName}
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                              {req.lineType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[11px] font-mono">{req.quantityMode}</td>
                          <td className="py-2 px-3 text-[11px] font-mono">{req.baseRatio}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                            {req.requiredQuantity}
                          </td>
                          <td className="py-2 px-3 font-mono">{req.uomSymbol || req.uomCode}</td>
                          <td className="py-2 px-3 text-[10px] text-muted-foreground">
                            {req.roundingRule !== 'NONE' ? `${req.roundingRule} (${req.roundingPrecision || 0} dec)` : 'Exact'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Non-authoritative simulation preview
              </span>
              <button
                type="button"
                onClick={() => setInspectingResult(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
