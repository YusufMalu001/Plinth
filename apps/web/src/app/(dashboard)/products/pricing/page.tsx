'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';
import { useProducts } from '../../../../hooks/useMasterData';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';

type PricingLine = { name?: string; value?: string | number };

export default function PricingTablePage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useProducts(undefined, 1, 1000);
  const rows = useMemo(() => (data?.items ?? []).flatMap((product: any) => {
    const lines = Array.isArray(product.metadata?.pricingFields) ? product.metadata.pricingFields : [];
    return lines.map((line: PricingLine, index: number) => ({ product, line, index }));
  }).filter(({ product, line }) => `${product.name} ${product.sku} ${line.name} ${line.value}`.toLowerCase().includes(search.toLowerCase())), [data?.items, search]);
  if (isLoading) return <LoadingState message="Loading pricing table..." />;
  if (error) return <ErrorState error={error as Error} retry={refetch} />;
  return <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6"><div className="w-full space-y-6"><header><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Product Catalog / Pricing</p><h1 className="mt-1 text-3xl font-black text-foreground">Pricing details</h1><p className="mt-1 text-sm text-muted-foreground">Review imported pricing-master fields for every product.</p></header><div className="rounded-2xl border border-border bg-card shadow-xs"><div className="border-border-strong border-border p-4"><div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, pricing field, or value..." className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm font-semibold" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Pricing master</th><th className="px-5 py-3">Pricing field</th><th className="px-5 py-3">Value</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-border/70">{rows.map(({ product, line, index }) => <tr key={`${product.id}-${index}`} className="hover:bg-muted/20"><td className="px-5 py-4"><p className="font-bold">{product.name}</p><p className="font-mono text-xs text-muted-foreground">{product.sku}</p></td><td className="px-5 py-4 font-semibold">{product.metadata?.pricingMasterName || 'Custom pricing'}</td><td className="px-5 py-4 font-semibold">{line.name || 'Unnamed field'}</td><td className="px-5 py-4 font-mono font-bold">{line.value === '' || line.value == null ? '—' : String(line.value)}</td><td className="px-5 py-4 text-right"><Link href={`/products/pricing/${product.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">Details <ArrowUpRight className="h-3.5 w-3.5" /></Link></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No pricing fields found.</td></tr>}</tbody></table></div></div></div></div>;
}
