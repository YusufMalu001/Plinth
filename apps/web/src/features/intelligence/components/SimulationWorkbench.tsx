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
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#004a80] text-white shadow-xs">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Authoritative Operational Strategy Simulator
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-semibold border border-blue-200 dark:border-blue-800">
                <Server className="h-2.5 w-2.5" />
                SERVER AUTHORITATIVE
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scenario baselines and bounds are computed server-side with certified Decimal arithmetic.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          {cases.length > 0 && (
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#004a80] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003a66] disabled:opacity-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            {isSimulating ? 'Calculating...' : 'Recalculate (Server)'}
          </button>
        </div>
      </div>

      {serverError && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 px-5 py-2 text-xs text-amber-800 dark:text-amber-200">
          Server Calculation Note: {serverError}
        </div>
      )}

      {/* Simulator Grid */}
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Scenario 1: Bulk Purchase vs Inventory Carrying Cost */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-5 dark:border-slate-800 dark:bg-slate-800/20 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-750">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bulk Buy vs. Carrying Cost Tradeoff (BUY_MORE)
                </h4>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  isViable
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {serverBuyMoreScenario ? (isViable ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />) : <Server className="h-3 w-3" />}
                {serverBuyMoreScenario ? (isViable ? 'Economically Viable' : 'Carrying Cost Deficit') : 'Not simulated'}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Calculates forward volume gross savings against inventory carrying cost using server deterministic bounds.
            </p>

            {/* Inputs */}
            <div className="space-y-3.5 pt-1">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">Simulated Purchase Volume:</span>
                  <span className="font-bold text-[#004a80] dark:text-blue-400">
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
                  className="h-1.5 w-full cursor-pointer accent-[#004a80]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    value={bulkDiscount}
                    min={1}
                    max={50}
                    onChange={(e) => setBulkDiscount(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Holding Cost (%/yr)
                  </label>
                  <input
                    type="number"
                    value={holdingRate}
                    min={5}
                    max={40}
                    onChange={(e) => setHoldingRate(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Horizon (Days)
                  </label>
                  <input
                    type="number"
                    value={horizonDays}
                    min={15}
                    max={365}
                    onChange={(e) => setHorizonDays(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 focus:border-[#004a80] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary Box from Server */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 border-b border-slate-100 dark:border-slate-700">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                {serverBuyMoreScenario?.formulaVersion ?? 'No server result yet'}
              </span>
              <span className="font-medium text-slate-500">
                Provenance: {serverBuyMoreScenario?.provenance ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-slate-100 dark:divide-slate-700">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Low Case</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  {serverBuyMoreScenario?.lowCase?.value !== undefined ? `₹${Math.round(serverBuyMoreScenario.lowCase.value).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">Base Expected</p>
                <p className={`text-xs font-bold mt-0.5 ${isViable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {typeof buyMoreNetGain === 'number' ? `${isViable ? '+' : ''}₹${Math.round(buyMoreNetGain).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">High Case</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  {serverBuyMoreScenario?.highCase?.value !== undefined ? `₹${Math.round(serverBuyMoreScenario.highCase.value).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scenario 2: Festive & Seasonal Surge Planning */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-5 dark:border-slate-800 dark:bg-slate-800/20 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-750">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#004a80] dark:text-blue-400" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Surge Demand Modeling (PRODUCTION_INCREASE)
                </h4>
              </div>
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-[#004a80] dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                {serverSurgeScenario ? `${(surgeMultiplier * 100 - 100).toFixed(0)}% Uplift Mode` : 'Not simulated'}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Calculate capacity and safety stock buffers required to capture demand surges safely.
            </p>

            {/* Inputs */}
            <div className="space-y-3.5 pt-1">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">Baseline Monthly Net Revenue:</span>
                  <span className="font-bold text-[#004a80] dark:text-blue-400">
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
                  className="h-1.5 w-full cursor-pointer accent-[#004a80]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">Expected Festive Demand Multiplier:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
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
                          ? 'border-[#004a80] bg-[#004a80] text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 border-b border-slate-100 dark:border-slate-700">
              <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                {serverSurgeScenario?.formulaVersion ?? 'deterministic-decimal-scenario-v1'}
              </span>
              <span className="font-medium text-slate-500">
                Risk: {serverSurgeScenario?.risk ?? '—'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center divide-x divide-slate-100 dark:divide-slate-700">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Expected Incremental Impact</p>
                <p className="text-xs sm:text-sm font-bold text-[#004a80] dark:text-blue-400 mt-0.5">
                  {typeof surgeImpact === 'number' ? `₹${Math.round(surgeImpact).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase text-slate-400">Required Safety Buffer</p>
                <p className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
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
