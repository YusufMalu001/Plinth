'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  FileText,
  Trash2,
  ZoomIn,
  X,
  AlertCircle
} from 'lucide-react';

export interface EvidenceAttachmentProps {
  evidenceUrls: string[];
  onChange?: (urls: string[]) => void;
  readOnly?: boolean;
}

export function EvidenceAttachmentField({
  evidenceUrls,
  onChange,
  readOnly = false,
}: EvidenceAttachmentProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = (files: FileList | File[]) => {
    setUploadError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const validFiles: File[] = [];
    for (const file of fileArray) {
      // 10MB file limit
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds the maximum 10 MB size limit.`);
        return;
      }
      validFiles.push(file);
    }

    let loadedCount = 0;
    const newUrls: string[] = [];

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          newUrls.push(e.target.result);
        }
        loadedCount += 1;
        if (loadedCount === validFiles.length && onChange) {
          onChange([...evidenceUrls, ...newUrls]);
        }
      };
      reader.onerror = () => {
        setUploadError(`Failed to read file: ${file.name}`);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset input to allow re-uploading same file
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (readOnly) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (index: number) => {
    if (!onChange) return;
    onChange(evidenceUrls.filter((_, i) => i !== index));
  };

  const isPdf = (url: string) =>
    url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-primary" />
          Evidence & Photo Attachments
        </label>
        {evidenceUrls.length > 0 && (
          <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            {evidenceUrls.length} {evidenceUrls.length === 1 ? 'photo' : 'photos'} attached
          </span>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Direct System Upload Area */}
      {!readOnly && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/5 shadow-md scale-[1.005]'
              : 'border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-muted/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={handleFileSelect}
            className="sr-only"
            id="loss-evidence-file-upload"
          />

          <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-foreground">
              Click to browse or drag & drop photos directly from your system
            </div>
            <p className="text-[11px] text-muted-foreground">
              Supports PNG, JPG, JPEG, WEBP, SVG & PDF (Max 10MB each)
            </p>
          </div>
        </div>
      )}

      {/* Uploaded Photos Gallery Grid */}
      {evidenceUrls.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-1">
          {evidenceUrls.map((url, idx) => {
            const isPdfFile = isPdf(url);
            return (
              <div
                key={idx}
                className="group relative aspect-square rounded-xl border border-border bg-card overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col items-center justify-center p-1"
              >
                {isPdfFile ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted/40 p-2 text-center">
                    <FileText className="w-8 h-8 text-rose-500 mb-1" />
                    <span className="text-[10px] font-mono text-muted-foreground truncate w-full">
                      Document #{idx + 1} (PDF)
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`Evidence attachment ${idx + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                )}

                {/* Overlay with Actions */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewModalUrl(url);
                    }}
                    className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white transition-colors cursor-pointer"
                    title="Zoom / View Photo"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(idx);
                      }}
                      className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
                      title="Remove Photo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Index badge */}
                <span className="absolute left-1.5 top-1.5 text-[9px] font-bold bg-background/80 backdrop-blur-xs text-foreground px-1.5 py-0.5 rounded shadow-2xs">
                  #{idx + 1}
                </span>
              </div>
            );
          })}
        </div>
      ) : readOnly ? (
        <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-center">
          <p className="text-xs text-muted-foreground italic">
            No photos or evidence documents attached.
          </p>
        </div>
      ) : null}

      {/* Lightbox / Modal Preview */}
      {previewModalUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full bg-card border border-border rounded-2xl p-3 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border px-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-primary" />
                Evidence Photo Preview
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
              {isPdf(previewModalUrl) ? (
                <iframe
                  src={previewModalUrl}
                  title="PDF Evidence Preview"
                  className="w-full h-[600px] rounded-lg border border-border"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewModalUrl}
                  alt="Evidence attachment preview"
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-sm"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
