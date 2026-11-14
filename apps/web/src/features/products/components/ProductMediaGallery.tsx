"use client";

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  UploadCloud,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { DetailedProduct, ProductImage } from '../types';

interface ProductMediaGalleryProps {
  product?: DetailedProduct;
  images?: ProductImage[];
  name?: string;
  onOpenEdit?: () => void;
}

export function ProductMediaGallery({ product, images, name, onOpenEdit }: ProductMediaGalleryProps) {
  const customImages: ProductImage[] = Array.isArray(images)
    ? images.filter((img): img is ProductImage => Boolean(img && typeof img.url === 'string'))
    : Array.isArray(product?.metadata?.images)
    ? product.metadata.images.filter((img): img is ProductImage => Boolean(img && typeof img.url === 'string'))
    : [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const activeIndex = Math.min(currentIndex, Math.max(0, customImages.length - 1));
  const currentImage = customImages[activeIndex];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : customImages.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < customImages.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-sm overflow-hidden font-sans">
      
      {/* Main Image Showcase Stage */}
      <div
        className="relative flex min-h-[380px] sm:min-h-[440px] items-center justify-center bg-muted p-6 overflow-hidden select-none cursor-pointer group"
        onClick={() => currentImage && setIsZoomed(!isZoomed)}
      >
        {currentImage ? (
          <>
            <img
              src={currentImage.url}
              alt={currentImage.fileName || currentImage.caption || name || product?.name || 'Catalog Item'}
              className={`max-h-[360px] w-auto max-w-full rounded-xl object-contain transition-transform duration-300 ${
                isZoomed ? 'scale-125 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
              }`}
            />

            {/* Navigation Arrows for Carousel */}
            {customImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous Image"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-ink-secondary shadow-none border border-border hover:bg-surface hover:scale-105 transition-all cursor-pointer z-10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next Image"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-ink-secondary shadow-none border border-border hover:bg-surface hover:scale-105 transition-all cursor-pointer z-10"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Image Counter & Zoom Indicator */}
            <div className="absolute top-3.5 right-3.5 flex items-center gap-2 pointer-events-none z-10">
              {customImages.length > 1 && (
                <span className="rounded-lg bg-inverse backdrop-blur-md px-2.5 py-1 font-mono text-xs font-bold text-inverse shadow-xs">
                  {activeIndex + 1} / {customImages.length}
                </span>
              )}
              <span className="rounded-lg bg-surface backdrop-blur-md p-1.5 text-ink-secondary border border-border shadow-xs">
                {isZoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
              </span>
            </div>

            {/* Pagination Dots */}
            {customImages.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-inverse backdrop-blur-md px-2.5 py-1 rounded-full pointer-events-none">
                {customImages.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${
                      activeIndex === idx ? 'w-5 bg-surface' : 'w-1.5 bg-surface'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Empty State Placeholder */
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted text-ink-placeholder border border-border">
              <ImageIcon className="h-10 w-10 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-secondary">No product image uploaded</p>
              <p className="text-xs text-ink-placeholder mt-0.5">Upload catalog media from the product editor</p>
            </div>
            {onOpenEdit && (
              <button
                type="button"
                onClick={onOpenEdit}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Upload Photos</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail Bar & Manage Media Action */}
      <div className="flex items-center justify-between border-t border-border bg-muted px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none">
          {customImages.length > 0 ? (
            customImages.map((img, idx) => (
              <button
                key={img.url + idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`relative h-12 w-12 shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  activeIndex === idx
                    ? 'border-primary ring-2 ring-primary/20 scale-105 shadow-xs'
                    : 'border-border opacity-60 hover:opacity-100'
                }`}
              >
                <img src={img.url} alt={`Thumbnail ${idx + 1}`} className="h-full w-full object-cover" />
              </button>
            ))
          ) : (
            <span className="text-xs text-ink-placeholder font-medium">No media uploaded</span>
          )}
        </div>

        {/* Manage Media Action Button */}
        {onOpenEdit && (
          <button
            type="button"
            onClick={onOpenEdit}
            className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-ink-secondary hover:bg-muted hover:text-primary transition-colors cursor-pointer shadow-2xs"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Manage Media</span>
          </button>
        )}
      </div>
    </div>
  );
}
