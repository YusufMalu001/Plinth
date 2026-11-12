'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useProduct } from '../../../../../hooks/useMasterData';
import { LoadingState } from '../../../../../components/LoadingState';
import { ErrorState } from '../../../../../components/ErrorState';

export default function PricingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, error, refetch } = useProduct(id);
  if (isLoading) return <LoadingState message="Loading pricing details..." />;
  if (error || !product) return <ErrorState error={(error as Error) || new Error('Product not found')} retry={refetch} />;
  const lines = Array.isArray(product.metadata?.pricingFields) ? product.metadata.pricingFields as Array<{ name?: string; value?: string | number }> : [];
  const masterName = String(product.metadata?.pricingMasterName || 'Custom pricing');
  return <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6"><div className="w-full space-y-6"><Link href="/products/pricing" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Pricing details</Link><header><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Pricing detail</p><h1 className="mt-1 text-3xl font-black text-foreground">{product.name}</h1><p className="mt-1 font-mono text-sm text-muted-foreground">{product.sku}</p><p className="mt-2 text-sm text-muted-foreground">Pricing master: <span className="font-semibold text-foreground">{masterName}</span></p></header><div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"><div className="border-border-strong border-border px-5 py-4"><h2 className="font-bold">Configured pricing fields</h2><p className="text-xs text-muted-foreground">All pricing fields imported or entered for this product.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Pricing field</th><th className="px-5 py-3">Value</th></tr></thead><tbody className="divide-y divide-border/70">{lines.map((line, index) => <tr key={index}><td className="px-5 py-4 font-bold">{line.name || 'Unnamed field'}</td><td className="px-5 py-4 font-mono font-bold">{line.value == null || line.value === '' ? '—' : String(line.value)}</td></tr>)}{lines.length === 0 && <tr><td colSpan={2} className="px-5 py-12 text-center text-muted-foreground">No pricing fields configured.</td></tr>}</tbody></table></div></div></div></div>;
}
