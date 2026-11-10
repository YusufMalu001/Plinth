"use client";

import React from 'react';
import { X, Printer, Barcode, Copy, Check } from 'lucide-react';
import { Button } from '@synergy/ui';
import type { DetailedProduct } from '../types';
import { showToast } from '../../../components/toast-store';
import { useReactToPrint } from 'react-to-print';
import { isCustomSku } from '../../../hooks/useMasterData';
import JsBarcode from 'jsbarcode';

interface ProductBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: DetailedProduct;
}

export function ProductBarcodeModal({ isOpen, onClose, product }: ProductBarcodeModalProps) {
  const [copied, setCopied] = React.useState(false);
  const barcodeRef = React.useRef<SVGSVGElement>(null);
  const printRef = React.useRef<HTMLDivElement>(null);

  // Use product name for barcode so it is always present even if SKU code is null/unassigned
  const barcodeValue = String(product.name || product.metadata?.barcode || product.sku || 'PRODUCT').trim();
  const safeBarcodeValue = barcodeValue.replace(/[^\x20-\x7E]/g, '').trim() || 'PRODUCT';
  const asinValue = String(product.metadata?.asin || '');
  const hasUserSku = isCustomSku(product.sku, product.metadata as any);

  React.useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (barcodeRef.current && safeBarcodeValue) {
        try {
          JsBarcode(barcodeRef.current, safeBarcodeValue, {
            format: 'CODE128',
            displayValue: true,
            fontSize: 13,
            height: 68,
            margin: 10,
            lineColor: '#111827',
            background: '#ffffff',
          });
        } catch (err) {
          console.error('Barcode render error, falling back:', err);
          try {
            JsBarcode(barcodeRef.current, product.sku || 'PRODUCT', {
              format: 'CODE128',
              displayValue: true,
              fontSize: 13,
              height: 68,
              margin: 10,
            });
          } catch {
            // non-blocking
          }
        }
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isOpen, safeBarcodeValue, product.sku]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${product.name || product.sku || 'product'}-barcode-label`,
  });

  function copyCode() {
    navigator.clipboard.writeText(barcodeValue);
    setCopied(true);
    showToast({ kind: 'info', title: 'Copied', message: 'Barcode copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div ref={printRef} className="print-label-document flex w-full max-w-md flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Barcode className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Product Barcode Label
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Printable Barcode Label */}
        <div className="p-6 text-center space-y-5">
          <div className="rounded-xl border border-border bg-white p-5 dark:bg-zinc-900 shadow-inner flex flex-col items-center justify-center min-h-[130px]">
            <svg ref={barcodeRef} role="img" aria-label={`Barcode for ${product.name}`} className="max-w-full" />
            <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">Code 128 Product Barcode</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 border border-slate-200/80 dark:border-slate-700/80 text-left">
            <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Barcode Identifier (Product Name)</p>
            <p className="font-mono text-sm font-bold text-slate-900 dark:text-white mt-0.5 break-words">
              {product.name}
            </p>
          </div>

          {/* Product Meta Pills */}
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">SKU Code</p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                {hasUserSku ? product.sku : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Amazon ASIN</p>
              <p className="font-mono text-xs font-bold text-foreground mt-0.5">{asinValue || '—'}</p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="print:hidden flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
          <Button size="sm" variant="outline" icon={copied ? Check : Copy} onClick={copyCode}>
            {copied ? 'Copied' : 'Copy Number'}
          </Button>
          <Button size="sm" icon={Printer} onClick={() => handlePrint()} disabled={!barcodeValue}>
            Print / Download Label
          </Button>
        </div>
      </div>
    </div>
  );
}
