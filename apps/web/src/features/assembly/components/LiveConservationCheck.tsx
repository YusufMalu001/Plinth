import React, { useMemo } from 'react';
import { Card } from '@synergy/ui';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import type { AssemblyBatchComponentDto } from '@synergy/types';

export interface ConservationCheckProps {
  actualOutputQuantity: number;
  scrapQuantity: number;
  targetOutputQuantity: number;
  components: AssemblyBatchComponentDto[];
  componentConsumptions: Record<string, { consumedQuantity: number; scrapQuantity: number }>;
}

export function LiveConservationCheck({
  actualOutputQuantity,
  scrapQuantity,
  targetOutputQuantity,
  components,
  componentConsumptions
}: ConservationCheckProps) {
  const totalProduced = Number(actualOutputQuantity || 0) + Number(scrapQuantity || 0);

  // Analyze each component's conservation equation according to BOM ratios
  const analysis = useMemo(() => {
    return components.map((comp) => {
      const consumption = componentConsumptions[comp.id] || {
        consumedQuantity: Number(comp.consumedQuantity || 0),
        scrapQuantity: Number(comp.scrapQuantity || 0)
      };

      const unitRatio = Number(comp.unitRatio) > 0 ? Number(comp.unitRatio) : 1;
      const consumedQty = Number(consumption.consumedQuantity || 0);
      const expectedConsumed = totalProduced * unitRatio;
      const theoreticalYield = consumedQty / unitRatio;

      let state: 'BALANCED' | 'DEFICIT' | 'EXCESS' = 'BALANCED';
      let isBalanced = false;
      let label = 'Balanced';

      if (totalProduced === 0) {
        isBalanced = consumedQty === 0;
        state = isBalanced ? 'BALANCED' : 'EXCESS';
        label = isBalanced ? 'Ready' : 'Excess Material';
      } else if (consumedQty === 0) {
        state = 'DEFICIT';
        isBalanced = false;
        label = `Missing Material (-${expectedConsumed.toFixed(1)})`;
      } else if (consumedQty < expectedConsumed * 0.95) {
        state = 'DEFICIT';
        isBalanced = false;
        const deficit = expectedConsumed - consumedQty;
        label = `Deficit (-${deficit.toFixed(1)})`;
      } else if (consumedQty > expectedConsumed * 1.05) {
        state = 'EXCESS';
        isBalanced = false;
        const excess = consumedQty - expectedConsumed;
        label = `Excess (+${excess.toFixed(1)})`;
      } else {
        state = 'BALANCED';
        isBalanced = true;
        label = 'Balanced';
      }

      const variance = totalProduced - theoreticalYield;

      return {
        comp,
        consumedQty,
        expectedConsumed,
        unitRatio,
        theoreticalYield,
        state,
        isBalanced,
        label,
        variance
      };
    });
  }, [components, componentConsumptions, totalProduced]);

  const allBalanced = analysis.length > 0 && analysis.every((a) => a.isBalanced) && totalProduced > 0;

  return (
    <Card className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-muted text-foreground">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Quantity Conservation &amp; Yield Verification
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allBalanced ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-foreground font-bold text-xs border border-border">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Conservation Balanced ✓
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-foreground font-bold text-xs border border-border">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              {totalProduced === 0 ? 'No Output Declared' : 'Yield Equation Unbalanced'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-background/80 border border-border">
            <span className="text-muted-foreground">Declared Good FG Output:</span>
            <p className="font-mono text-base font-bold text-foreground mt-0.5">
              {actualOutputQuantity || 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background/80 border border-border">
            <span className="text-muted-foreground">Scrap Quantity:</span>
            <p className="font-mono text-base font-bold text-amber-600 mt-0.5">
              {scrapQuantity || 0}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background/80 border border-border">
            <span className="text-muted-foreground">Total Accounted Output:</span>
            <p className="font-mono text-base font-bold text-foreground mt-0.5">
              {totalProduced} / {targetOutputQuantity} Target
            </p>
          </div>
        </div>

        {/* Component breakdown table */}
        <div className="rounded-xl border border-border bg-background overflow-hidden mt-3">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Component Name</th>
                <th className="px-2 py-2 text-center">Unit Ratio</th>
                <th className="px-2 py-2 text-right">Expected Qty</th>
                <th className="px-2 py-2 text-right">Consumed Qty</th>
                <th className="px-2 py-2 text-right">Theoretical Yield</th>
                <th className="px-2 py-2 text-right">Actual Output</th>
                <th className="px-3 py-2 text-center">Equation State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {analysis.map(({ comp, consumedQty, expectedConsumed, unitRatio, theoreticalYield, isBalanced, label }) => {
                const rawName =
                  comp.productName ||
                  comp.materialName ||
                  comp.noteName ||
                  'Component';
                const displayName = rawName.replace(/^MATERIAL\s*·\s*/i, '').replace(/^PRODUCT\s*·\s*/i, '');
                return (
                  <tr key={comp.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {displayName}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono text-muted-foreground">
                      {unitRatio} : 1
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-muted-foreground">
                      {expectedConsumed.toFixed(1)} {comp.uomCode || ''}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-semibold text-foreground">
                      {consumedQty} {comp.uomCode || ''}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-semibold text-foreground">
                      {theoreticalYield.toFixed(2)} FG
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-semibold text-foreground">
                      {totalProduced} FG
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isBalanced ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Balanced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                          <AlertTriangle className="w-3.5 h-3.5" /> {label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
