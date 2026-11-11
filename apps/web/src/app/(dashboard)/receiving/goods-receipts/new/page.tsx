'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, PackageCheck, UploadCloud, FileCheck, X } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import { showToast } from '@/components/toast-store';
import { generateUUID } from '@/lib/uuid';
import { usePOList, usePODetail } from '@/features/purchases/hooks';
import type { PO } from '@/features/purchases/api';
import type { PoStatus } from '@plinth/types';
import { useJobWorkOrders, useJobWorkOrderDetail } from '@/features/job-work/hooks';
import { jobWorkApi } from '@/features/job-work/api';
import { useCreateGrnFromPo, useGrnCapabilities, useUploadGrnDocument, useVerifyGrnLines } from '@/features/goods-receipt/hooks';
import type { Grn } from '@/features/goods-receipt/api';
import { PhysicalVerificationModal } from '@/features/goods-receipt/components/PhysicalVerificationModal';
import { PoSearchSelector, PoOption } from './components/PoSearchSelector';
import { PoSummaryCard } from './components/PoSummaryCard';
import { PoLinesTable } from './components/PoLinesTable';
import { ReceivingForbiddenState } from './components/ReceivingEmptyStates';
import { useWarehouseLocations } from '@/features/master-data/hooks';

export default function GrnCreatePage() {
  return <Suspense fallback={<LoadingState message="Preparing goods receipt…" />}><ReceivingStudio /></Suspense>;
}

function ReceivingStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPoId = searchParams.get('poId') || '';
  const [selectedPoId, setSelectedPoId] = useState(initialPoId);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [grn, setGrn] = useState<Grn | null>(null);
  const [createdGrnForPoId, setCreatedGrnForPoId] = useState<string | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verifiedGrnId, setVerifiedGrnId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [invoiceUploadNeedsRetry, setInvoiceUploadNeedsRetry] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(generateUUID);
  const [isDragging, setIsDragging] = useState(false);

  const { data: capabilities, isLoading: loadingCapabilities } = useGrnCapabilities();
  const { data: locations } = useWarehouseLocations();
  const { data: allOrders, isLoading: loadingOrders } = usePOList({ limit: 100 });
  const { orders: allJobWorkOrders, loading: loadingJobWorkOrders } = useJobWorkOrders();
  const isJobWorkSelected = selectedPoId.startsWith('jwo-') || allJobWorkOrders.some((jw) => jw.id === selectedPoId);
  const { data: selectedPoRegular } = usePODetail(!isJobWorkSelected ? selectedPoId : '');
  const { order: selectedJobWork } = useJobWorkOrderDetail(isJobWorkSelected ? selectedPoId : undefined);

  const selectedPo: PO | undefined = useMemo(() => {
    if (isJobWorkSelected && selectedJobWork) {
      return {
        id: selectedJobWork.id,
        poNumber: selectedJobWork.orderNumber,
        revisionNumber: 1,
        status: selectedJobWork.status as unknown as PoStatus,
        vendorId: selectedJobWork.vendorId,
        vendor: {
          id: selectedJobWork.vendor?.id || selectedJobWork.vendorId,
          code: selectedJobWork.vendor?.code || '',
          name: selectedJobWork.vendor?.name || 'Vendor pending',
          contactEmail: selectedJobWork.vendor?.contactEmail || undefined,
          contactPhone: selectedJobWork.vendor?.contactPhone || undefined,
        },
        createdAt: selectedJobWork.createdAt,
        updatedAt: selectedJobWork.updatedAt,
        currency: 'INR',
        totalAmount: 0,
        notes: selectedJobWork.notes || undefined,
        natureOfProcessing: selectedJobWork.natureOfProcessing || undefined,
        lines: (selectedJobWork.lines || []).map((line, idx) => ({
          id: line.id || `jw-line-${idx}`,
          productId: line.productId || selectedJobWork.productId || null,
          materialId: line.materialId || null,
          quantity: Number(line.requiredQuantity || selectedJobWork.targetQuantity || 0),
          unitPrice: 0,
          lineTotal: 0,
          uomId: line.uomId || selectedJobWork.targetUomId || '',
          uom: (line.uom || selectedJobWork.targetUom)
            ? {
                id: (line.uom || selectedJobWork.targetUom)!.id,
                code: (line.uom || selectedJobWork.targetUom)!.code,
                name: (line.uom || selectedJobWork.targetUom)!.name,
                symbol: (line.uom || selectedJobWork.targetUom)!.symbol || undefined,
              }
            : undefined,
          product: line.product || selectedJobWork.product || undefined,
          material: line.material || undefined,
          needDate: selectedJobWork.createdAt || new Date().toISOString(),
        })),
        goodsReceiptNotes: (selectedJobWork.returns || [])
          .filter((r) => r.goodsReceipt)
          .map((r) => ({
            id: r.goodsReceipt!.id,
            grnNumber: r.goodsReceipt!.grnNumber,
            status: r.goodsReceipt!.status,
            receivedAt: r.receivedAt,
          })),
      };
    }
    return selectedPoRegular;
  }, [isJobWorkSelected, selectedJobWork, selectedPoRegular]);
  const createGrn = useCreateGrnFromPo();
  const uploadDocument = useUploadGrnDocument();
  const verifyLines = useVerifyGrnLines();

  const poOptions: PoOption[] = useMemo(() => {
    const poList: PoOption[] = (allOrders?.items ?? [])
      .filter((po) =>
        ['SENT', 'APPROVED'].includes(po.status) &&
        (!po.goodsReceiptNotes || po.goodsReceiptNotes.length === 0)
      )
      .map((po) => ({
        id: po.id,
        number: po.poNumber,
        vendor: po.vendor?.name || 'Vendor pending',
        vendorCode: po.vendor?.code,
        status: po.status,
        lineCount: po.lines?.length,
        currency: po.currency || 'INR',
        totalAmount: Number(po.totalAmount || 0),
        createdAt: po.createdAt,
        orderType: 'PO',
      }));

    const jwList: PoOption[] = (allJobWorkOrders ?? [])
      .filter((jw) => ['APPROVED', 'ISSUED', 'PARTIALLY_RETURNED'].includes(jw.status))
      .map((jw) => ({
        id: jw.id,
        number: jw.orderNumber,
        vendor: jw.vendor?.name || 'Outsource Partner',
        vendorCode: jw.vendor?.code,
        status: jw.status,
        lineCount: jw.lines?.length || 1,
        currency: 'INR',
        totalAmount: 0,
        createdAt: jw.createdAt,
        isOutsourced: true,
        orderType: 'JOB_WORK',
        jobWorkOrderId: jw.id,
        natureOfProcessing: jw.natureOfProcessing || undefined,
      }));

    return [...poList, ...jwList];
  }, [allOrders?.items, allJobWorkOrders]);
  const existingGrn = selectedPo?.goodsReceiptNotes?.[0];
  // The create mutation invalidates PO queries before the invoice upload finishes.
  // During that window the new GRN appears in selectedPo.goodsReceiptNotes; don't
  // report our own in-progress receipt as a pre-existing duplicate.
  const hasLocalGrnForSelectedPo = Boolean(grn && createdGrnForPoId === selectedPoId);
  const isPoAlreadyReceived = Boolean(
    !hasLocalGrnForSelectedPo && (
      existingGrn ||
      selectedPo?.status === 'FULLY_RECEIVED' ||
      (selectedPo?.status as string) === 'PARTIALLY_RECEIVED'
    )
  );


  useEffect(() => () => {
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
  }, [invoicePreview]);

  // Wait for the verification modal to close before leaving this route. This
  // avoids racing the modal's completion/close state against App Router navigation.
  useEffect(() => {
    if (!verifiedGrnId || verificationOpen) return;
    router.replace(`/receiving/goods-receipts/${verifiedGrnId}`);
    setVerifiedGrnId(null);
  }, [router, verificationOpen, verifiedGrnId]);

  if (loadingCapabilities) return <LoadingState message="Checking receiving permissions…" />;
  if (capabilities && !capabilities.receive) return <ReceivingForbiddenState message="You are not authorized to register an incoming shipment." />;

  const handleInvoiceSelect = (file?: File) => {
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    if (!file) {
      setInvoiceFile(null);
      setInvoicePreview(null);
      return;
    }
    // Validate file type (PDF or Image)
    const isValidType = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!isValidType) {
      setError('Please upload a PDF document or image file (JPEG, PNG, WEBP).');
      return;
    }
    setInvoiceFile(file);
    setInvoicePreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    setError('');
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleInvoiceSelect(droppedFile);
    }
  };

  const removeInvoice = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    setInvoiceFile(null);
    setInvoicePreview(null);
  };

  const createReceipt = async () => {
    if (!selectedPo || !selectedPoId) return setError('Select an order first.');
    if (!invoiceFile) return setError('Attach the supplier invoice to register its arrival.');
    if (!selectedPo.lines?.length && !isJobWorkSelected) return setError('This order has no receivable lines.');

    // If GRN creation succeeded but document upload failed, retry only the upload.
    // Creating another GRN here would correctly hit the one-GRN-per-PO rule.
    if (grn && (createdGrnForPoId === selectedPo.id || createdGrnForPoId === selectedPoId)) {
      setIsCreating(true);
      setError('');
      try {
        await uploadDocument.mutateAsync({ grnId: grn.id, file: invoiceFile });
        setInvoiceUploadNeedsRetry(false);
        showToast({ title: 'Invoice received', message: `${grn.grnNumber} is ready for physical verification. No invoice scan was performed.`, kind: 'success' });
        if (capabilities?.verify) setVerificationOpen(true);
        else router.push(`/receiving/goods-receipts/${grn.id}`);
      } catch (cause) {
        setInvoiceUploadNeedsRetry(true);
        setError(cause instanceof Error ? cause.message : 'The GRN exists, but the invoice could not be attached. Please retry.');
      } finally {
        setIsCreating(false);
      }
      return;
    }

    setIsCreating(true);
    setError('');
    let createdReceipt: Grn | null = null;
    try {
      let receipt: Grn;
      if (isJobWorkSelected && selectedJobWork) {
        const targetLocationId = capabilities?.locationId || locations?.items?.[0]?.id || selectedJobWork.deliveryLocationId;
        const primaryUomId = selectedJobWork.targetUomId || selectedJobWork.lines?.[0]?.uomId || '';
        const res = await jobWorkApi.receiveReturn({
          jobWorkOrderId: selectedJobWork.id,
          vendorId: selectedJobWork.vendorId,
          locationId: targetLocationId!,
          productId: selectedJobWork.productId || undefined,
          uomId: primaryUomId,
          expectedQuantity: Number(selectedJobWork.targetQuantity || 1),
          receivedQuantity: Number(selectedJobWork.targetQuantity || 1),
          acceptedQuantity: Number(selectedJobWork.targetQuantity || 1),
          consumedRawMaterial: Number(selectedJobWork.rawMaterialInputQty || 0),
          scrapQuantity: 0,
          notes: `GRN created from Receiving Studio for Job Work ${selectedJobWork.orderNumber}`,
        });
        receipt = res.grn as unknown as Grn;
      } else {
        receipt = await createGrn.mutateAsync({
          data: {
            poId: selectedPo.id,
            locationId: capabilities?.locationId || locations?.items?.[0]?.id,
            lines: selectedPo.lines.map((line) => ({ poLineId: line.id })),
          },
          idempotencyKey,
        });
      }
      createdReceipt = receipt;
      setGrn(receipt);
      setCreatedGrnForPoId(selectedPo.id);
      await uploadDocument.mutateAsync({ grnId: receipt.id, file: invoiceFile });
      setInvoiceUploadNeedsRetry(false);
      showToast({ title: 'Invoice received', message: `${receipt.grnNumber} is ready for physical verification. No invoice scan was performed.`, kind: 'success' });
      if (capabilities?.verify) setVerificationOpen(true);
      else router.push(`/receiving/goods-receipts/${receipt.id}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not register the invoice and goods receipt.';
      if (createdReceipt) setInvoiceUploadNeedsRetry(true);
      setError(createdReceipt
        ? `GRN ${createdReceipt.grnNumber} was created, but the invoice could not be attached: ${message}. Keep the invoice selected and retry.`
        : message);
    } finally {
      setIsCreating(false);
    }
  };

  const saveVerification = async (data: Parameters<React.ComponentProps<typeof PhysicalVerificationModal>['onSave']>[0]) => {
    if (!grn) return;
    const updated = await verifyLines.mutateAsync({ grnId: grn.id, data });
    setGrn(updated);
    setVerifiedGrnId(updated.id);
  };

  return (
    <main className="min-h-screen bg-background pb-12">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/receiving/goods-receipts" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft size={14} /> Goods Receipts</Link>
          <span>/</span><span className="font-semibold text-foreground">Receive Purchase Order</span>
        </nav>
        <header>
          <h1 className="text-2xl font-bold text-foreground">Receive Purchase Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">Attach the supplier invoice, physically verify delivered goods, then continue the existing GRN approval and inventory posting flow.</p>
        </header>

        {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <section className="grid gap-6 xl:grid-cols-2 items-start">
          {/* Left Column: Select a Purchase Order (Elongated to match right side) */}
          <div className="flex flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm h-full">
            <div className="flex items-center justify-between pb-1 border-b border-border/60">
              <h2 className="font-semibold text-base text-foreground">1. Select a purchase order</h2>
            </div>
            <PoSearchSelector
              options={poOptions}
              selectedPoId={selectedPoId}
              onSelect={(newPoId) => {
                if (!isCreating && !verificationOpen && newPoId !== selectedPoId) {
                  setSelectedPoId(newPoId);
                  setGrn(null);
                  setCreatedGrnForPoId(null);
                  setInvoiceUploadNeedsRetry(false);
                  setIdempotencyKey(generateUUID());
                  if (invoicePreview) URL.revokeObjectURL(invoicePreview);
                  setInvoiceFile(null);
                  setInvoicePreview(null);
                  setError('');
                }
              }}
              isLoading={loadingOrders || loadingJobWorkOrders}
              listClassName="flex-1 min-h-[500px] max-h-[calc(100vh-250px)]"
            />
          </div>

          {/* Invoice upload + selected PO details */}
          <div className="space-y-6">

          <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                isDragging
                  ? 'border-primary bg-primary/10 shadow-md scale-[1.01]'
                  : invoiceFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {isDragging ? (
                <>
                  <UploadCloud className="h-10 w-10 text-primary animate-bounce" />
                  <span className="text-sm font-bold text-primary">Drop Supplier Invoice PDF or Image here</span>
                  <span className="text-xs text-muted-foreground">Release to upload file</span>
                </>
              ) : invoiceFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileCheck className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground max-w-[280px] sm:max-w-md truncate">
                      {invoiceFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={removeInvoice}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Remove invoice"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {(invoiceFile.size / 1024).toFixed(1)} KB · {invoiceFile.type === 'application/pdf' ? 'PDF Document' : 'Image File'}
                  </span>
                  <span className="text-[11px] text-primary hover:underline mt-1">Click or drag another file to replace</span>
                </div>
              ) : (
                <>
                  <UploadCloud className="h-9 w-9 text-primary/80" />
                  <div className="space-y-0.5">
                    <span className="text-sm font-semibold text-foreground block">
                      Choose or drag &amp; drop supplier invoice
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      Drag PDF or image from your device here, or click to browse
                    </span>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/80">
                    PDF, JPEG, PNG, WEBP · Attachment only (no OCR)
                  </span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(event) => handleInvoiceSelect(event.target.files?.[0])}
              />
            </label>
            {invoicePreview && invoiceFile?.type.startsWith('image/') && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Invoice Image Preview:</span>
                <img src={invoicePreview} alt="Invoice preview" className="max-h-64 w-full rounded-lg border border-border object-contain bg-muted/10 p-1" />
              </div>
            )}
            {invoiceFile?.type === 'application/pdf' && (
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-foreground truncate flex-1">{invoiceFile.name}</span>
                <span className="text-[11px] font-mono text-muted-foreground">Attached for physical verification</span>
              </div>
            )}
            {isPoAlreadyReceived ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <PackageCheck size={16} /> GRN Already Raised For This PO
                </div>
                <p className="text-xs">
                  A Goods Receipt Note {existingGrn ? `(${existingGrn.grnNumber})` : ''} has already been raised for Purchase Order #{selectedPo?.poNumber}. By policy, only one GRN can be created per PO.
                </p>
                {existingGrn && (
                  <Link
                    href={`/receiving/goods-receipts/${existingGrn.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary underline pt-1"
                  >
                    View existing Goods Receipt Note ({existingGrn.grnNumber}) →
                  </Link>
                )}
              </div>
            ) : capabilities?.verify ? (
              null
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold"><PackageCheck size={16} /> Manager verification required</div>
                <p className="mt-1 text-xs text-muted-foreground">You can register the arrived invoice. An Admin or Store Manager must complete physical verification from the GRN detail page.</p>
              </div>
            )}

            <button type="button" onClick={createReceipt} disabled={isCreating || isPoAlreadyReceived || (hasLocalGrnForSelectedPo && !invoiceUploadNeedsRetry) || createGrn.isPending || uploadDocument.isPending || !selectedPo || !invoiceFile} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" /> Registering invoice arrival…</> : <><PackageCheck size={16} /> {hasLocalGrnForSelectedPo && invoiceUploadNeedsRetry ? 'Retry Invoice Upload' : 'Register Invoice & Create GRN'}</>}
            </button>
          </div>

          {/* Selected PO Contract Baseline & Lines Table positioned underneath Section 2 */}
          {selectedPo && (
            <div className="space-y-4">
              <PoSummaryCard po={selectedPo} />
              <PoLinesTable lines={selectedPo.lines || []} currency={selectedPo.currency || 'INR'} />
            </div>
          )}
        </div>
        </section>
      </div>

      {grn && <PhysicalVerificationModal key={grn.id} grn={grn} isOpen={verificationOpen} isSubmitting={verifyLines.isPending} onClose={() => setVerificationOpen(false)} onSave={saveVerification} />}
    </main>
  );
}
