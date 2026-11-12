'use client';

import React, { useEffect, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Package,
  Server,
  TrendingUp,
  XCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useIntelligenceOverview, useCases } from '../hooks';
import { intelligenceApi } from '../api';

export function SimulationWorkbench() {
  const query = useIntelligenceOverview();
  const casesQuery = useCases(1, 10);
  const snapshots = query.data?.latestSnapshots ?? [];
  const cases = casesQuery.data?.items ?? [];

  const liveInventoryVal = Number(
    snapshots.find((s) => s.module === 'INVENTORY')?.metrics.find((m) => m.key === 'inventory.value_at_average_cost')?.value ?? 0
  );
  const liveSalesVal = Number(
    snapshots.find((s) => s.module === 'SALES')?.metrics.find((m) => m.key === 'sales.booked_net_revenue' || m.key === 'sales.dispatched_net_revenue')?.value ?? 0
  );

  // Selected case for server calculation
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  // Bulk Purchase Simulation Inputs
  const [purchaseSpend, setPurchaseSpend] = useState<number>(liveInventoryVal);
  const [bulkDiscount, setBulkDiscount] = useState<number>(8);
  const [holdingRate, setHoldingRate] = useState<number>(18);
  const [horizonDays, setHorizonDays] = useState<number>(90);

  // Festive Surge Simulation Inputs
  const [monthlySales, setMonthlySales] = useState<number>(liveSalesVal);
  const [surgeMultiplier, setSurgeMultiplier] = useState<number>(1.3);

  // Authoritative Server-Calculated Scenarios
  const [serverBuyMoreScenario, setServerBuyMoreScenario] = useState<any>(null);
  const [serverSurgeScenario, setServerSurgeScenario] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (liveInventoryVal > 0) setPurchaseSpend(liveInventoryVal);
    if (liveSalesVal > 0) setMonthlySales(liveSalesVal);
  }, [liveInventoryVal, liveSalesVal]);

  useEffect(() => {
    if (cases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  // Execute authoritative server simulation via POST /scenarios
  const runServerSimulation = async () => {
    if (!selectedCaseId && cases.length === 0) return;
    const targetCaseId = selectedCaseId || cases[0]?.id;
    if (!targetCaseId) return;

    setIsSimulating(true);
    setServerError(null);

    try {
      // 1. Authoritative BUY_MORE Scenario computed by server
      const buyMoreRes = await intelligenceApi.createScenario({
        caseId: targetCaseId,
        idempotencyKey: `workbench-buymore-${Date.now()}`,
        scenarioType: 'BUY_MORE',
        assumptions: {
          forwardQuantity: Math.round(purchaseSpend / 100),
          holdingCostPercent: holdingRate,
          horizonDays,
          bulkDiscountPercent: bulkDiscount,
        },
      });
      setServerBuyMoreScenario(buyMoreRes);

      // 2. Authoritative PRODUCTION_INCREASE Scenario computed by server
      const surgeRes = await intelligenceApi.createScenario({
        caseId: targetCaseId,
        idempotencyKey: `workbench-surge-${Date.now()}`,
        scenarioType: 'PRODUCTION_INCREASE',
        assumptions: {
          plannedSurgeQuantity: Math.round((monthlySales / 100) * (surgeMultiplier - 1)),
          safetyStockPercent: surgeMultiplier > 1.25 ? 30 : 15,
          horizonDays,
        },
      });
      setServerSurgeScenario(surgeRes);
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to execute authoritative server simulation.');
    } finally {
      setIsSimulating(false);
    }
  };

  // Results remain empty until the user explicitly requests server-side scenarios.
  const buyMoreNetGain = serverBuyMoreScenario?.baseCase?.value;
  const isViable = typeof buyMoreNetGain === 'number' && buyMoreNetGain > 0;
  const surgeImpact = serverSurgeScenario?.baseCase?.value;
  const requiredSafetyStockBuffer = serverSurgeScenario?.assumptions?.safetyStockPercent;

  return (
    <div className="rounded-2xl border border-border/90 bg-surface shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border p-5 bg-muted/50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-action text-inverse shadow-xs">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">
                Authoritative Operational Strategy Simulator
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-tone-blue-bg text-link px-2 py-0.5 text-[10px] font-semibold border border-tone-blue-solid/25">
                <Server className="h-2.5 w-2.5" />
                SERVER AUTHORITATIVE
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Scenario baselines and bounds are computed server-side with certified Decimal arithmetic.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          {cases.length > 0 && (
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-ink-secondary"
            >
              {cases.map((c: any) => (
                <option key={c.id} value={c.id}>
                  Case: {c.title || c.detectorKey} ({c.severity})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={runServerSimulation}
            disabled={isSimulating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-inverse hover:bg-[color:var(--action-primary-bg-hover)] disabled:opacity-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Calculating...' : 'Recalculate (Server)'}
          </button>
        </div>
      </div>

      {serverError && (
        <div className="bg-tone-amber-bg border-b border-tone-amber-solid/25 px-5 py-2 text-xs text-tone-amber-text">
          Server Calculation Note: {serverError}
        </div>
      )}

      {/* Simulator Grid */}
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Scenario 1: Bulk Purchase vs Inventory Carrying Cost */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-link" />
                <h4 className="text-xs sm:text-sm font-bold text-ink">
                  Bulk Buy vs. Carrying Cost Tradeoff (BUY_MORE)
                </h4>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  isViable
                    ? 'border-tone-green-solid/25 bg-tone-green-bg text-tone-green-text'
                    : 'border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text'
                }`}
              >
                {serverBuyMoreScenario ? (isViable ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />) : <Server className="h-3 w-3" />}
                {serverBuyMoreScenario ? (isViable ? 'Economically Viable' : 'Carrying Cost Deficit') : 'Not simulated'}
              </span>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Calculates forward volume gross savings against inventory carrying cost using server deterministic bounds.
            </p>

            {/* Inputs */}
            <div className="space-y-3.5 pt-1">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-ink-secondary">Simulated Purchase Volume:</span>
                  <span className="font-bold text-link">
                    ₹{purchaseSpend.toLocaleString('en-IN')}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2500000}
                  step={25000}
                  value={purchaseSpend}
                  onChange={(e) => setPurchaseSpend(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-[color:var(--accent-blue)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-ink-muted">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    value={bulkDiscount}
                    min={1}
                    max={50}
                    onChange={(e) => setBulkDiscount(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-ink-muted">
                    Holding Cost (%/yr)
                  </label>
                  <input
                    type="number"
                    value={holdingRate}
                    min={5}
                    max={40}
                    onChange={(e) => setHoldingRate(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-ink-muted">
                    Horizon (Days)
                  </label>
                  <input
                    type="number"
                    value={horizonDays}
                    min={15}
                    max={365}
                    onChange={(e) => setHorizonDays(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary Box from Server */}
          <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-ink-muted pb-1 border-b border-border">
                    <span className="flex items-center gap-1 font-semibold text-ink-secondary">
                      <ShieldCheck className="h-3 w-3 text-tone-green-text" />
                {serverBuyMoreScenario?.formulaVersion ?? 'No server result yet'}
              </span>
              <span className="font-medium text-ink-muted">
                Provenance: {serverBuyMoreScenario?.provenance ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-border">
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Low Case</p>
                <p className="text-xs font-bold text-ink-secondary mt-0.5">
                  {serverBuyMoreScenario?.lowCase?.value !== undefined ? `₹${Math.round(serverBuyMoreScenario.lowCase.value).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Base Expected</p>
                <p className={`text-xs font-bold mt-0.5 ${isViable ? 'text-tone-green-text' : 'text-tone-red-text'}`}>
                  {typeof buyMoreNetGain === 'number' ? `${isViable ? '+' : ''}₹${Math.round(buyMoreNetGain).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">High Case</p>
                <p className="text-xs font-bold text-ink-secondary mt-0.5">
                  {serverBuyMoreScenario?.highCase?.value !== undefined ? `₹${Math.round(serverBuyMoreScenario.highCase.value).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scenario 2: Festive & Seasonal Surge Planning */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-link" />
                <h4 className="text-xs sm:text-sm font-bold text-ink">
                  Surge Demand Modeling (PRODUCTION_INCREASE)
                </h4>
              </div>
              <span className="inline-flex items-center rounded-full border border-tone-blue-solid/25 bg-tone-blue-bg px-2.5 py-0.5 text-[11px] font-bold text-link">
                {serverSurgeScenario ? `${(surgeMultiplier * 100 - 100).toFixed(0)}% Uplift Mode` : 'Not simulated'}
              </span>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Calculate capacity and safety stock buffers required to capture demand surges safely.
            </p>

            {/* Inputs */}
            <div className="space-y-3.5 pt-1">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-ink-secondary">Baseline Monthly Net Revenue:</span>
                  <span className="font-bold text-link">
                    ₹{monthlySales.toLocaleString('en-IN')}
                  </span>
                </div>
                <input
                  type="range"
                  min={100000}
                  max={3000000}
                  step={50000}
                  value={monthlySales}
                  onChange={(e) => setMonthlySales(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-[color:var(--accent-blue)]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-ink-secondary">Expected Festive Demand Multiplier:</span>
                  <span className="font-bold text-tone-green-text">
                    {surgeMultiplier.toFixed(2)}x
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1.15, 1.3, 1.5, 1.75].map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => setSurgeMultiplier(mult)}
                      className={`h-9 rounded-lg border text-xs font-bold transition-all ${
                        surgeMultiplier === mult
                          ? 'border-accent-brand bg-action text-inverse shadow-xs'
                          : 'border-border bg-surface text-ink-secondary hover:bg-muted'
                      }`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary Box from Server */}
          <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-ink-muted pb-1 border-b border-border">
              <span className="flex items-center gap-1 font-semibold text-ink-secondary">
                <ShieldCheck className="h-3 w-3 text-tone-green-text" />
                {serverSurgeScenario?.formulaVersion ?? 'deterministic-decimal-scenario-v1'}
              </span>
              <span className="font-medium text-ink-muted">
                Risk: {serverSurgeScenario?.risk ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center divide-x divide-border">
              <div>
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Expected Incremental Impact</p>
                <p className="text-xs sm:text-sm font-bold text-link mt-0.5">
                  {typeof surgeImpact === 'number' ? `₹${Math.round(surgeImpact).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-ink-placeholder">Required Safety Buffer</p>
                <p className="text-xs sm:text-sm font-bold text-tone-amber-text mt-0.5">
                  {typeof requiredSafetyStockBuffer === 'number' ? `+${requiredSafetyStockBuffer}% Raw Materials` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
