'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '@/features/api/client';

type Line = { id: string; itemName: string; unitName: string; destinationDepartmentName: string; requiredQty: string; issuedQty: string; receivedQty: string; returnedQty: string; ledgerEntryId: string | null; lotNumber: string | null };
type Detail = { id: string; planNumber: string; product: { name: string }; taskMaterialAssignments: Line[] };
const qty = (value: string) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
export default function ProductionIssueLedger() {
  const { planId } = useParams<{ planId: string }>();
  const { data, isLoading, error } = useQuery<Detail>({ queryKey: ['production-execution', planId], queryFn: () => fetchApi(`/production/executions/${planId}`) });
  return <main className="min-h-full bg-muted/20 px-4 py-7 text-foreground sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><header><Link href={`/production/execution/plans/${planId}`} className="text-sm text-muted-foreground">← Schedule execution</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">Production material ledger</h1><p className="mt-2 text-sm text-muted-foreground">{data?.product.name} · {data?.planNumber}</p></header>{isLoading ? <p className="text-sm text-muted-foreground">Loading material postings…</p> : error || !data ? <p role="alert" className="text-sm text-destructive">Material postings are unavailable.</p> : <div className="overflow-hidden rounded-xl border border-border bg-card"><div className="hidden grid-cols-[minmax(12rem,2fr)_minmax(10rem,1fr)_repeat(3,minmax(7rem,1fr))] gap-4 border-border-strong border-border bg-muted/30 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Named item</span><span>Destination</span><span>Issued</span><span>Received</span><span>Returned</span></div>{data.taskMaterialAssignments.map((line) => <div key={line.id} className="grid gap-2 border-border-strong border-border px-5 py-4 text-sm last:border-border-strong-0 md:grid-cols-[minmax(12rem,2fr)_minmax(10rem,1fr)_repeat(3,minmax(7rem,1fr))] md:items-center md:gap-4"><div><p className="font-medium">{line.itemName}</p><p className="mt-1 text-xs text-muted-foreground">{line.ledgerEntryId ? 'Posted to inventory ledger' : 'Posting pending'}{line.lotNumber ? ` · Lot ${line.lotNumber}` : ''}</p></div><p>{line.destinationDepartmentName}</p><p>{qty(line.issuedQty)} {line.unitName}</p><p>{qty(line.receivedQty)} {line.unitName}</p><p>{qty(line.returnedQty)} {line.unitName}</p></div>)}{data.taskMaterialAssignments.length === 0 && <p className="p-8 text-sm text-muted-foreground">No material postings are visible.</p>}</div>}</div></main>;
}
