import React from 'react';
import { Card } from '@plinth/ui';
import { Layers, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AssemblyBatchComponentDto } from '@plinth/types';

export interface ComponentReadinessProps {
  components: AssemblyBatchComponentDto[];
  targetOutputQuantity: number;
}

export function ComponentReadinessList({
  components,
  targetOutputQuantity: _targetOutputQuantity
}: ComponentReadinessProps) {
  const discreteComponents = components.filter((c) => c.componentType === 'BATCH_SOURCED');
  const bulkComponents = components.filter((c) => c.componentType === 'ISSUE_LINE_SOURCED');

  return (
    <div className="space-y-6">
      {/* 1. Discrete Source Batches (from upstream departments e.g. Fabrication, Machining, Sub-assembly) */}
      {discreteComponents.length > 0 && (
        <Card className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Discrete Upstream Batches ({discreteComponents.length})
                </h3>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-foreground border border-border">
              BATCH_SOURCED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Semi-Finished Component</th>
                  <th className="px-3 py-2.5">Source Batch Number</th>
                  <th className="px-3 py-2.5 text-right" title="Quantity required per 1 finished good">Unit Ratio</th>
                  <th className="px-3 py-2.5 text-right">Required Qty</th>
                  <th className="px-3 py-2.5 text-right">Consumed Qty</th>
                  <th className="px-3 py-2.5 text-center">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {discreteComponents.map((comp) => {
                  const req = Number(comp.requiredQuantity);
                  const consumed = Number(comp.consumedQuantity);
                  const isReady = req > 0;
                  const rawName =
                    comp.productName ||
                    comp.materialName ||
                    comp.noteName ||
                    'Semi-Finished Good';
                  const displayName = rawName.replace(/^MATERIAL\s*·\s*/i, '').replace(/^PRODUCT\s*·\s*/i, '');
                  const displayCode = comp.itemCode || comp.sourceBatchNumber || '';
                  const uomName = comp.uomCode || 'PCS';

                  return (
                    <tr key={comp.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-bold text-foreground text-xs">{displayName}</span>
                        {displayCode && (
                          <span className="block text-[11px] font-mono text-muted-foreground font-normal mt-0.5">
                            Code: {displayCode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono font-medium text-foreground">
                        {comp.sourceBatchNumber ? (
                          <span className="inline-flex items-center gap-1 text-primary font-bold">
                            {comp.sourceBatchNumber}
                          </span>
                        ) : comp.sourceBatchId ? (
                          <span className="font-mono text-xs">{comp.sourceBatchId}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Floor Stock</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                        {Number(comp.unitRatio)} : 1
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {req} {uomName}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {consumed}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-muted-foreground">
                            <AlertTriangle className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 2. Bulk & Hardware Kit Issues (from Store via Module 4 MaterialIssue) */}
      <Card className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-muted text-foreground">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Bulk Hardware &amp; Kit Store Issues ({bulkComponents.length})
              </h3>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-foreground border border-border">
            ISSUE_LINE_SOURCED
          </span>
        </div>

        {bulkComponents.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl">
            No bulk hardware or store issue lines allocated for this kit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Material / Hardware Item</th>
                  <th className="px-3 py-2.5">Store Issue Reference</th>
                  <th className="px-3 py-2.5 text-right" title="Quantity of this component required to assemble 1 Finished Good unit">Unit Ratio</th>
                  <th className="px-3 py-2.5 text-right">Required Qty</th>
                  <th className="px-3 py-2.5 text-right">Consumed Qty</th>
                  <th className="px-3 py-2.5 text-center">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {bulkComponents.map((comp) => {
                  const req = Number(comp.requiredQuantity);
                  const consumed = Number(comp.consumedQuantity);
                  const isReady = req > 0;
                  const rawName =
                    comp.materialName ||
                    comp.productName ||
                    comp.noteName ||
                    'Material Item';
                  const displayName = rawName.replace(/^MATERIAL\s*·\s*/i, '').replace(/^PRODUCT\s*·\s*/i, '');
                  const displayCode = comp.itemCode || '';
                  const uomName = comp.uomCode || 'PCS';
                  return (
                    <tr key={comp.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-bold text-foreground text-xs">{displayName}</span>
                        {displayCode && (
                          <span className="block text-[11px] font-mono text-muted-foreground font-normal mt-0.5">
                            Code: {displayCode}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono font-medium text-foreground">
                        {comp.materialIssueLineId ? (
                          <span className="inline-flex items-center gap-1 text-primary font-bold">
                            Line #{comp.materialIssueLineId.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Direct Issue</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                        {Number(comp.unitRatio)} : 1
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {req} {uomName}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {consumed}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Issued
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-muted-foreground">
                            <AlertTriangle className="w-3.5 h-3.5" /> Pending Issue
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
