'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles, X } from 'lucide-react';
import { getProductCreationDraft, type ProductCreationDraft } from '@/features/products/utils/productCreationDraft';

interface ReturnToProductDraftBannerProps {
 currentFlowName: string;
 className?: string;
 sourceUrl?: string;
}

function ReturnToProductDraftBannerInner({
 currentFlowName,
 className = '',
 sourceUrl,
}: ReturnToProductDraftBannerProps) {
 const [draft, setDraft] = useState<ProductCreationDraft | null>(null);
 const [isDismissed, setIsDismissed] = useState(false);
 const [isFromDraftFlow, setIsFromDraftFlow] = useState(false);
 const searchParams = useSearchParams();

 useEffect(() => {
 // Only show if explicitly navigated from product creation / draft setup
 const fromParam = searchParams.get('from');
 const sourceParam = searchParams.get('source');
 const returnToParam = searchParams.get('returnTo');
 const referrer = typeof document !== 'undefined' ? document.referrer : '';

 const hasFromQuery =
 fromParam === 'product-draft' ||
 fromParam === 'product-creation' ||
 fromParam === 'new-product' ||
 sourceParam === 'product-creation' ||
 sourceParam === 'product-draft' ||
 returnToParam?.includes('/products/new');

 const hasReferrer = referrer.includes('/products/new');

 if (hasFromQuery || hasReferrer || sourceUrl) {
 setIsFromDraftFlow(true);
 const loadedDraft = getProductCreationDraft();
 if (loadedDraft) {
 setDraft(loadedDraft);
 }
 }
 }, [searchParams, sourceUrl]);

 // Determine return target: if sourceUrl is passed use it, otherwise default to /products/new
 const returnHref = sourceUrl || '/products/new';

 if (!isFromDraftFlow || !draft || isDismissed) return null;

 const productName = draft.form.name?.trim() || 'Untitled Product Draft';
 const sku = draft.form.sku?.trim();
 const timeFormatted = draft.savedAt
 ? new Date(draft.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
 : null;

 return (
 <div
 className={`rounded-2xl border border-border bg-inverse p-4 shadow-none  transition-all relative ${className}`}
 >
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
 <div className="flex items-start sm:items-center gap-3">
 <div className="w-9 h-9 rounded-xl bg-tone-blue-bg/10 text-link flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ring-1 ring-accent-brand/20">
 <Sparkles className="w-4 h-4" />
 </div>
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-xs font-bold uppercase tracking-wider text-link ">
 Active Product Creation in Progress
 </span>
 {sku && (
 <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid ">
 {sku}
 </span>
 )}
 {timeFormatted && (
 <span className="text-[11px] text-link ">
 • Auto-saved at {timeFormatted}
 </span>
 )}
 </div>
 <p className="text-xs text-ink-secondary mt-0.5">
 Draft <strong className="font-semibold text-ink ">&quot;{productName}&quot;</strong> is preserved in storage. Once you complete this {currentFlowName}, you can return directly to your product setup.
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
 <Link
 href={returnHref}
 className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-tone-blue-bg hover:bg-tone-blue-bg active:bg-tone-blue-bg text-white shadow-xs hover:shadow-none transition-all"
 >
 <ArrowLeft className="w-3.5 h-3.5" />
 <span>Return to Product Draft</span>
 </Link>
 <button
 type="button"
 onClick={() => setIsDismissed(true)}
 className="p-2 rounded-xl text-ink-muted hover:text-ink-secondary hover:bg-active/50 transition-colors cursor-pointer"
 title="Dismiss notification"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 );
}

export function ReturnToProductDraftBanner(props: ReturnToProductDraftBannerProps) {
 return (
 <Suspense fallback={null}>
 <ReturnToProductDraftBannerInner {...props} />
 </Suspense>
 );
}
