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
      className={`rounded-2xl border border-blue-200/90 dark:border-blue-900/60 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/90 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/40 p-4 shadow-sm backdrop-blur-xs transition-all relative ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ring-1 ring-blue-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Active Product Creation in Progress
              </span>
              {sku && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                  {sku}
                </span>
              )}
              {timeFormatted && (
                <span className="text-[11px] text-blue-600/70 dark:text-blue-400/70">
                  • Auto-saved at {timeFormatted}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Draft <strong className="font-semibold text-slate-900 dark:text-white">&quot;{productName}&quot;</strong> is preserved in storage. Once you complete this {currentFlowName}, you can return directly to your product setup.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Link
            href={returnHref}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs hover:shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Product Draft</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
