'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Info, PackageCheck, ShieldCheck } from 'lucide-react';
import { Badge, Button, Dialog, Input } from '@plinth/ui';
import { SalesOrder } from '../types';
import { useAllocateSalesOrder } from '../hooks';
import { formatErrorMessage } from '../utils/error';

interface SalesAllocationModalProps {
 order: SalesOrder;
 open: boolean;
 onClose: () => void;
}

type AllocationDraft = Record<string, string>;

export function SalesAllocationModal({ order, open, onClose }: SalesAllocationModalProps) {
 const allocate = useAllocateSalesOrder();
 const [error, setError] = useState<string | null>(null);
 const [draft, setDraft] = useState<AllocationDraft>({});

 const lines = useMemo(
 () =>
 (order.lines || [])
 .map((line) => {
 const ordered = Number(line.orderedQuantity || 0);
 const allocated = Number(line.allocatedQuantity || 0);
 return { line, ordered, allocated, remaining: Math.max(0, ordered - allocated) };
 })
 .filter((entry) => entry.remaining > 0),
 [order.lines]
 );

 useEffect(() => {
 if (!open) return;
 setError(null);
 setDraft(Object.fromEntries(lines.map(({ line, remaining }) => [line.id, String(remaining)])));
 }, [open, lines]);

 const requested = lines.map(({ line, remaining }) => ({
 line,
 remaining,
 ordered: Number(line.orderedQuantity || 0),
 allocated: Number(line.allocatedQuantity || 0),
 quantity: Number(draft[line.id] ?? 0),
 }));
 const invalidLines = requested.filter(({ quantity, remaining }) => !Number.isFinite(quantity) || quantity <= 0 || quantity > remaining);
 const hasPartialQuantity = requested.some(({ quantity, remaining }) => quantity > 0 && quantity < remaining);
 const totalRequested = requested.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
 const totalRemaining = requested.reduce((sum, item) => sum + item.remaining, 0);
 const allLinesEntered = requested.length > 0 && invalidLines.length === 0;

 const updateQuantity = (lineId: string, value: string) => {
 setDraft((current) => ({ ...current, [lineId]: value }));
 setError(null);
 };

 const handleAllocate = async () => {
 if (!allLinesEntered) {
 setError('Enter a quantity greater than 0 and no more than the remaining quantity for every line.');
 return;
 }
 setError(null);
 try {
 await allocate.mutateAsync({
 id: order.id,
 lines: requested.map(({ line, quantity }) => ({ salesOrderLineId: line.id, quantity })),
 });
 onClose();
 } catch (err: any) {
 setError(formatErrorMessage(err, 'Allocation could not be completed. No inventory was changed.'));
 }
 };

 return (
 <Dialog
 open={open}
 onClose={onClose}
 title="Allocate inventory"
 description={`${order.orderNumber} · ${lines.length} line${lines.length === 1 ? '' : 's'} pending`}
 className="max-w-3xl"
 >
 <div className="space-y-5">
 <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/80 bg-muted/20 p-3">
 <div className="rounded-lg bg-background p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lines pending</div><div className="mt-1 flex items-center gap-1.5 text-lg font-black"><Boxes className="h-4 w-4 text-primary" />{lines.length}</div></div>
 <div className="rounded-lg bg-background p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Requested now</div><div className="mt-1 flex items-center gap-1.5 text-lg font-black"><PackageCheck className="h-4 w-4 text-tone-green-text" />{totalRequested}</div></div>
 <div className="rounded-lg bg-background p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Order balance</div><div className="mt-1 text-lg font-black text-tone-amber-text">{totalRemaining}</div></div>
 </div>

 {error && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

 {!lines.length ? (
 <div className="rounded-xl border border-tone-green-solid/25 bg-tone-green-bg p-5 text-center text-sm text-tone-green-text"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />This order has no remaining quantity to allocate.</div>
 ) : (
 <div className="overflow-hidden rounded-xl border border-border/80">
 <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-4 py-3"><div><div className="text-sm font-bold">Allocation quantities</div><div className="mt-0.5 text-[11px] text-muted-foreground">Set the quantity to reserve in this run.</div></div><Badge variant="outline" className={hasPartialQuantity ? 'border-tone-amber-solid/25 text-tone-amber-text' : 'border-tone-green-solid/25 text-tone-green-text'}>{hasPartialQuantity ? 'Partial allocation' : 'Full request'}</Badge></div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-[var(--bg-inverse)] text-left text-[11px] font-bold uppercase tracking-wide text-white"><tr><th className="px-4 py-3">Product</th><th className="px-3 py-3 text-right">Ordered</th><th className="px-3 py-3 text-right">Allocated</th><th className="px-3 py-3 text-right">Remaining</th><th className="w-36 px-4 py-3 text-right">Allocate now</th></tr></thead>
 <tbody className="divide-y divide-border/70">
 {requested.map(({ line, ordered, allocated, remaining, quantity }) => {
 const invalid = !Number.isFinite(quantity) || quantity <= 0 || quantity > remaining;
 return <tr key={line.id} className={invalid ? 'bg-destructive/[0.03]' : 'bg-card'}><td className="px-4 py-3"><div className="font-mono text-xs font-bold text-foreground">{line.sku}</div><div className="max-w-[210px] truncate text-[11px] text-muted-foreground">{line.description}</div></td><td className="px-3 py-3 text-right font-mono">{ordered}</td><td className="px-3 py-3 text-right font-mono text-tone-green-text">{allocated}</td><td className="px-3 py-3 text-right font-mono font-bold text-tone-amber-text">{remaining}</td><td className="px-4 py-3"><Input type="number" min={1} max={remaining} step="any" value={draft[line.id] ?? ''} onChange={(event) => updateQuantity(line.id, event.target.value)} aria-label={`Allocation quantity for ${line.sku}`} className={`h-9 text-right font-mono font-bold ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`} />{invalid && <div className="mt-1 text-[10px] font-medium text-destructive">1–{remaining} only</div>}</td></tr>;
 })}
 </tbody>
 </table>
 </div>
 </div>
 )}

 <div className="flex items-start gap-2 rounded-lg border border-tone-blue-solid/25 bg-tone-blue-bg px-3 py-2.5 text-[11px] text-tone-blue-text"><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>Only the entered quantity is reserved. Unallocated balance remains available for a later allocation run or backorder follow-up.</span></div>
 <div className="flex items-center justify-between border-t border-border/70 pt-4"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="h-4 w-4 text-tone-green-text" />Atomic reservation</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={allocate.isPending}>Cancel</Button><Button onClick={handleAllocate} loading={allocate.isPending} disabled={!lines.length || !allLinesEntered}>Reserve {totalRequested} units</Button></div></div>
 </div>
 </Dialog>
 );
}
