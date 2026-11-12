'use client';

import React, { useMemo } from 'react';
import { BomLine, BomVersionDiff } from '../types';
import { getBomLineVariantLabel } from '../utils';

interface Props {
  diff: BomVersionDiff;
}

interface SideBySideRow {
  key: string;
  itemName: string;
  variant?: string;
  itemType: string;
  status: 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'DELETED';
  leftLine?: BomLine;
  rightLine?: BomLine;
  differences?: string[];
}

function getLineKey(line: BomLine): string {
  if (line.materialId) return `MAT:${line.materialId}`;
  if (line.componentProductId) return `PROD:${line.componentProductId}`;
  return `ID:${line.id}`;
}

function getLineItemName(line?: BomLine): string {
  if (!line) return '—';
  return (
    line.material?.name ||
    line.componentProduct?.name ||
    line.material?.code ||
    line.componentProduct?.sku ||
    line.materialId ||
    line.componentProductId ||
    line.id
  );
}

function getLineItemCode(line?: BomLine): string | undefined {
  if (!line) return undefined;
  return line.material?.code || line.componentProduct?.sku || undefined;
}

export function BomDiffViewer({ diff }: Props) {
  const fromVersion = diff?.fromVersion || { id: '', bomNumber: 'Base BOM', version: 1, status: 'DRAFT' as const };
  const toVersion = diff?.toVersion || { id: '', bomNumber: 'Target BOM', version: 2, status: 'DRAFT' as const };
  const rawDiff: Record<string, unknown> = diff && typeof diff === 'object' ? (diff as unknown as Record<string, unknown>) : {};
  const addedLines = Array.isArray(diff?.addedLines)
    ? diff.addedLines
    : Array.isArray(rawDiff.added)
    ? (rawDiff.added as BomLine[])
    : [];
  const removedLines = Array.isArray(diff?.removedLines)
    ? diff.removedLines
    : Array.isArray(rawDiff.removed)
    ? (rawDiff.removed as BomLine[])
    : [];
  const changedLines = Array.isArray(diff?.changedLines)
    ? diff.changedLines
    : Array.isArray(rawDiff.changed)
    ? (rawDiff.changed as BomVersionDiff['changedLines'])
    : [];
  const unchangedLines = Array.isArray(diff?.unchangedLines) ? diff.unchangedLines : [];

  // Group matched and unmatched rows for the side-by-side comparison table
  const sideBySideRows = useMemo<SideBySideRow[]>(() => {
    const rows: SideBySideRow[] = [];

    // 1. Unchanged lines (present identically on both left and right)
    for (const line of unchangedLines) {
      rows.push({
        key: getLineKey(line),
        itemName: getLineItemName(line),
        variant: getBomLineVariantLabel(line.note),
        itemType: line.lineType,
        status: 'UNCHANGED',
        leftLine: line,
        rightLine: line,
      });
    }

    // 2. Modified lines (present on both, but with differences)
    for (const change of changedLines) {
      rows.push({
        key: getLineKey(change.from),
        itemName: getLineItemName(change.to || change.from),
        variant: getBomLineVariantLabel((change.to || change.from)?.note),
        itemType: change.to?.lineType || change.from?.lineType || 'COMPONENT',
        status: 'MODIFIED',
        leftLine: change.from,
        rightLine: change.to,
        differences: change.differences,
      });
    }

    // Sort rows alphabetically by item name
    return rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [unchangedLines, changedLines]);

  return (
    <div className="space-y-6">
      {/* Top Summary Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">BOM Version Comparison</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparing Base Version <span className="font-semibold text-foreground">{fromVersion.bomNumber} (v{fromVersion.version})</span> against Target Version <span className="font-semibold text-foreground">{toVersion.bomNumber} (v{toVersion.version})</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground">
              +{addedLines.length} Added
            </span>
            <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground">
              -{removedLines.length} Deleted
            </span>
            <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground">
              ~{changedLines.length} Modified
            </span>
            <span className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-muted/40 text-muted-foreground">
              ={unchangedLines.length} Unchanged
            </span>
          </div>
        </div>
      </div>

      {/* Main Side-by-Side Comparison Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Formula Lines Comparison</h4>
            <p className="text-xs text-muted-foreground">
              Direct comparison of common and modified formula lines across versions.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {sideBySideRows.length} {sideBySideRows.length === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[180px]">Item / Component</th>
                <th className="py-2.5 px-3 w-28 text-center border-r border-border">Status</th>
                {/* Left side: Base Version */}
                <th className="py-2.5 px-3 bg-muted/10 font-bold text-foreground">
                  Left: {fromVersion.bomNumber} (v{fromVersion.version})
                </th>
                <th className="py-2.5 px-3 text-right bg-muted/10">Ratio / Qty</th>
                <th className="py-2.5 px-3 text-center bg-muted/10">Mode</th>
                <th className="py-2.5 px-3 text-center border-r border-border bg-muted/10">Rounding</th>
                {/* Right side: Target Version */}
                <th className="py-2.5 px-3 bg-muted/10 font-bold text-foreground">
                  Right: {toVersion.bomNumber} (v{toVersion.version})
                </th>
                <th className="py-2.5 px-3 text-right bg-muted/10">Ratio / Qty</th>
                <th className="py-2.5 px-3 text-center bg-muted/10">Mode</th>
                <th className="py-2.5 px-3 text-center bg-muted/10">Rounding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sideBySideRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-muted-foreground">
                    No common formula lines to compare.
                  </td>
                </tr>
              ) : (
                sideBySideRows.map((row, index) => {
                  const left = row.leftLine;
                  const right = row.rightLine;
                  const isModified = row.status === 'MODIFIED';
                  const qtyDiff = isModified && left?.quantity !== right?.quantity;
                  const modeDiff = isModified && left?.quantityMode !== right?.quantityMode;
                  const roundDiff = isModified && left?.roundingRule !== right?.roundingRule;
                  const itemCode = getLineItemCode(left || right);

                  return (
                    <tr
                      key={row.key}
                      className={isModified ? 'bg-muted/15 hover:bg-muted/30' : 'hover:bg-muted/10'}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{index + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{row.itemName}</div>
                        {row.variant && <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>{row.variant}</span><span className="shrink-0 rounded-md border border-tone-purple-solid bg-tone-violet-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-tone-purple-text   ">Variant</span></div>}
                        {itemCode && (
                          <div className="text-[10px] font-mono text-muted-foreground">{itemCode}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center border-r border-border">
                        {isModified ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border border-border bg-muted/60 text-foreground">
                            Modified
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-muted/20 text-muted-foreground">
                            Unchanged
                          </span>
                        )}
                      </td>

                      {/* Left: Base Version Details */}
                      <td className="py-2.5 px-3 text-muted-foreground font-mono">
                        {left?.lineType || '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${qtyDiff ? 'font-semibold text-foreground underline decoration-muted-foreground' : 'text-muted-foreground'}`}>
                        {left ? `${left.quantity} ${left.uom?.symbol || ''}`.trim() : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-center font-mono ${modeDiff ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {left?.quantityMode || '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-center text-muted-foreground border-r border-border ${roundDiff ? 'font-semibold text-foreground' : ''}`}>
                        {left?.roundingRule || '—'}
                      </td>

                      {/* Right: Target Version Details */}
                      <td className="py-2.5 px-3 text-foreground font-mono">
                        {right?.lineType || '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${qtyDiff ? 'font-bold text-foreground underline decoration-primary' : 'text-foreground'}`}>
                        {right ? `${right.quantity} ${right.uom?.symbol || ''}`.trim() : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-center font-mono ${modeDiff ? 'font-bold text-foreground' : 'text-foreground'}`}>
                        {right?.quantityMode || '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-center text-foreground ${roundDiff ? 'font-bold' : ''}`}>
                        {right?.roundingRule || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Separate Section for Additions */}
      {addedLines.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Added Formula Lines
              </h4>
              <p className="text-xs text-muted-foreground">
                Lines present in Target Version <span className="font-semibold text-foreground">{toVersion.bomNumber} (v{toVersion.version})</span> but absent in Base Version.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-medium border border-border bg-muted/40 text-foreground">
              +{addedLines.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3 text-right">Ratio / Qty</th>
                  <th className="py-2.5 px-3">Rounding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {addedLines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-muted/10">
                    <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold font-mono text-foreground">+{line.lineType}</td>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      <><span>{getLineItemName(line)}</span>{getBomLineVariantLabel(line.note) && <span className="block text-[11px] text-muted-foreground">{getBomLineVariantLabel(line.note)}</span>}</>
                      {getLineItemCode(line) && (
                        <div className="text-[10px] font-mono text-muted-foreground">{getLineItemCode(line)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-muted-foreground">{line.quantityMode}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                      {line.quantity} {line.uom?.symbol || ''}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{line.roundingRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Separate Section for Deletions */}
      {removedLines.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Deleted Formula Lines
              </h4>
              <p className="text-xs text-muted-foreground">
                Lines removed from Base Version <span className="font-semibold text-foreground">{fromVersion.bomNumber} (v{fromVersion.version})</span> and no longer in Target Version.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-medium border border-border bg-muted/40 text-foreground">
              -{removedLines.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3 text-right">Ratio / Qty</th>
                  <th className="py-2.5 px-3">Rounding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {removedLines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-muted/10 text-muted-foreground">
                    <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold font-mono text-foreground">-{line.lineType}</td>
                    <td className="py-2.5 px-3 font-medium line-through">
                      <><span>{getLineItemName(line)}</span>{getBomLineVariantLabel(line.note) && <span className="block text-[11px] text-muted-foreground">{getBomLineVariantLabel(line.note)}</span>}</>
                      {getLineItemCode(line) && (
                        <div className="text-[10px] font-mono text-muted-foreground">{getLineItemCode(line)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono">{line.quantityMode}</td>
                    <td className="py-2.5 px-3 text-right font-mono line-through">
                      {line.quantity} {line.uom?.symbol || ''}
                    </td>
                    <td className="py-2.5 px-3">{line.roundingRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
