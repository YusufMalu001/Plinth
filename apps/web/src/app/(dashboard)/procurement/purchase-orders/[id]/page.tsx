'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button, Dialog, Input, Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@plinth/ui';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { LoadingState } from '../../../../../components/LoadingState';
import { ErrorState } from '../../../../../components/ErrorState';
import { ForbiddenState } from '../../../../../components/ForbiddenState';
import { ProcurementApprovalPanel } from '../../../../../components/ProcurementApprovalPanel';
import { PurchaseOrderPDF } from '../../../../../components/PurchaseOrderPDF';
import { ConfirmDeleteDialog } from '../../../../../components/ConfirmDeleteDialog';
import {
  usePODetail,
  useUpdatePO,
  useRevisePO,
  useCancelPO,
  useSendPO,
  useResendPOEmail,
  useActiveUOMs,
  useApprovedVendors,
  useApprovedProducts,
  useApprovedMaterials,
  useProcurementSelectors,
  poKeys,
} from '../../../../../features/purchases/hooks';
import {
  formatIndianDate,
  getVendorDisplayDetails,
  PO_PAYMENT_MODES,
  encodePoPaymentTerms,
  parsePoPaymentTerms,
} from '../../../../../features/purchases/utils';
import {
  Printer,
  Mail,
  Pencil,
  Plus,
  FileText,
  ChevronRight,
  Copy,
  Check,
  Package,
  FileCheck,
  Boxes,
  Eye,
  Trash2,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useCurrentUser } from '../../../../../features/auth/hooks';
import { normalizeRole } from '../../../../../features/auth/access-control';
import { showToast } from '../../../../../components/toast-store';
import { SearchableSelector, SearchableOption } from '../../../../../components/ui/SearchableSelector';
import type { PO } from '../../../../../features/purchases/api';

interface PageProps {
  params: { id: string };
}

function formatAmount(amount: number | string | null | undefined): string {
  return Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getItemTaxRate(taxInfo: unknown): number {
  if (!taxInfo || typeof taxInfo !== 'object' || Array.isArray(taxInfo)) return 0;
  const fields = taxInfo as Record<string, unknown>;
  const taxability = String(fields.taxability ?? '').trim().toLowerCase();
  if (taxability && taxability !== 'taxable') return 0;
  const rate = Number(fields.gstRate ?? fields.taxRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

interface ReviseLineForm {
  productId: string;
  materialId: string;
  uomId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  needDate: string;
}

interface ReviseForm {
  reason: string;
  vendorId: string;
  paymentMode: string;
  netTermsDays: string;
  deliveryLocation: string;
  dispatchedThrough: string;
  otherReferences: string;
  termsOfDelivery: string;
  lines: ReviseLineForm[];
}

type ViewMode = 'details' | 'document';

export default function PODetailPage({ params }: PageProps) {
  const { id } = params;
  const searchParams = useSearchParams();
  const { data: po, isLoading, error, refetch } = usePODetail(id);
  const updatePO = useUpdatePO();
  const revisePO = useRevisePO();
  const cancelPO = useCancelPO();
  const sendPO = useSendPO();
  const resendPOEmail = useResendPOEmail();
  const { data: uoms } = useActiveUOMs();
  const { data: approvedVendors } = useApprovedVendors();
  const { data: products } = useApprovedProducts();
  const { data: materials } = useApprovedMaterials();
  const { data: procurementSelectors, isLoading: areSupplierCapabilitiesLoading } = useProcurementSelectors();
  const { data: currentUser } = useCurrentUser();

  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [copied, setCopied] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pricingEvidenceLine, setPricingEvidenceLine] = useState<PO['lines'][number] | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const autoEditHandled = useRef(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: po ? `PO-${po.poNumber}` : 'Purchase Order',
  });

  const { register, handleSubmit, control, reset, watch, setValue } = useForm<ReviseForm>({
    defaultValues: { reason: '', vendorId: '', paymentMode: '', netTermsDays: '', deliveryLocation: '', dispatchedThrough: '', otherReferences: '', termsOfDelivery: '', lines: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  React.useEffect(() => {
    const isDraft = po?.status === 'DRAFT' || (po?.status as string | undefined) === 'CHANGES_REQUESTED';
    if (po && isEditing && !isDraft) {
      setIsEditing(false);
      reset();
    }
  }, [po?.status, isEditing, reset]);

  const itemOptions = React.useMemo<SearchableOption[]>(() => {
    const options = new Map<string, SearchableOption>();
    for (const product of products?.items ?? []) {
      options.set(product.id, { id: product.id, name: product.name || product.sku || 'Unnamed product', sku: product.sku, status: product.status });
    }
    for (const material of materials?.items ?? []) {
      options.set(material.id, { id: material.id, name: material.name || material.code || 'Unnamed material', code: material.code, status: material.status });
    }
    // Keep the current selection searchable and visible even if it is no
    // longer included in the active product/material selector results.
    for (const line of po?.lines ?? []) {
      if (line.productId && !options.has(line.productId)) {
        options.set(line.productId, { id: line.productId, name: line.product?.name || 'Saved product', sku: line.product?.sku });
      }
      if (line.materialId && !options.has(line.materialId)) {
        options.set(line.materialId, { id: line.materialId, name: line.material?.name || 'Saved material', code: line.material?.code });
      }
    }
    return [...options.values()];
  }, [products?.items, materials?.items, po?.lines]);

  const handleOpenEdit = React.useCallback(() => {
    if (!po) return;
    setViewMode('details');
    const payment = parsePoPaymentTerms(po.paymentTerms);
    reset({
      reason: '',
      vendorId: po.vendorId || po.vendor?.id || '',
      paymentMode: payment.paymentMode,
      netTermsDays: payment.netTermsDays,
      deliveryLocation: po.deliveryLocation || '',
      dispatchedThrough: po.dispatchedThrough || '',
      otherReferences: po.otherReferences || '',
      termsOfDelivery: po.termsOfDelivery || '',
      lines: po.lines.map((line) => ({
        productId: line.productId ?? '',
        materialId: line.materialId ?? '',
        uomId: line.uomId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice || 0),
        taxRate: Number(line.taxRate || 0),
        needDate: line.needDate ? line.needDate.split('T')[0] : '',
      })),
    });
    setIsEditing(true);
  }, [po, reset]);

  React.useEffect(() => {
    if (searchParams.get('edit') !== '1' || autoEditHandled.current || !po || !currentUser) return;
    autoEditHandled.current = true;
    const roleKeys = [
      currentUser.role,
      currentUser.roleDefinition?.key,
      currentUser.roleDefinition?.name,
      ...(currentUser.roles?.map((role) => role.key) ?? []),
      ...(currentUser.roles?.map((role) => role.name) ?? []),
    ].filter(Boolean).map((role) => normalizeRole(String(role)));
    const canManage = ['admin', 'super_admin', 'procurement_manager', 'store_manager', 'inventory_manager', 'manager']
      .some((role) => roleKeys.includes(role));
    if (po.status === 'DRAFT' && canManage) handleOpenEdit();
  }, [searchParams, po, currentUser, handleOpenEdit]);

  if (id === 'undefined' || !id) {
    return (
      <ErrorState
        error={
          new Error('This purchase order link is invalid. Please open the order from the Purchase Orders register.')
        }
      />
    );
  }

  if (isLoading) return <LoadingState message="Loading purchase order..." />;
  if (error) {
    const apiError = error as { status?: number };
    if (apiError.status === 401)
      return <ForbiddenState message="You must be logged in to view this purchase order." />;
    if (apiError.status === 403)
      return <ForbiddenState message="You do not have permission to view this purchase order." />;
    return <ErrorState error={error as Error} />;
  }
  if (!po) return <ErrorState error={new Error('Purchase order not found')} />;

  const rawRoles = [
    currentUser?.role,
    currentUser?.roleDefinition?.key,
    currentUser?.roleDefinition?.name,
    ...(currentUser?.roles?.map((r) => r.key) ?? []),
    ...(currentUser?.roles?.map((r) => r.name) ?? []),
  ].filter(Boolean) as string[];
  const normalizedRoles = new Set(rawRoles.map((r) => normalizeRole(r)));
  const canManagePo =
    ['admin', 'super_admin', 'procurement_manager', 'store_manager', 'inventory_manager', 'manager'].some((role) =>
      normalizedRoles.has(role)
    );
  const isAdmin = normalizedRoles.has('admin') || normalizedRoles.has('super_admin');
  const isDraftStatus = po.status === 'DRAFT' || (po.status as string) === 'CHANGES_REQUESTED';
  const canApprove = isDraftStatus && isAdmin;
  const canEditDraft = isDraftStatus && canManagePo;
  const existingGrn = po.goodsReceiptNotes?.[0];
  const hasExistingGrn = Boolean(
    existingGrn ||
    po.status === 'FULLY_RECEIVED' ||
    (po.status as string) === 'PARTIALLY_RECEIVED'
  );
  const canCreateGrn = ['APPROVED', 'SENT'].includes(po.status) && !hasExistingGrn;
  const canCancel = isAdmin && ['APPROVED', 'SENT'].includes(po.status);

  const handleCopyPoNumber = () => {
    navigator.clipboard.writeText(po.poNumber);
    setCopied(true);
    showToast({ kind: 'success', title: 'Copied', message: `PO Number ${po.poNumber} copied to clipboard.` });
    setTimeout(() => setCopied(false), 2000);
  };

  const onSaveSubmit = handleSubmit(async (data) => {
    if (areSupplierCapabilitiesLoading) {
      showToast({ kind: 'error', title: 'Supplier validation is still loading', message: 'Wait for supplier and item compatibility checks to finish before saving.' });
      return;
    }
    if (supplierValidationErrors.length > 0) {
      showToast({ kind: 'error', title: 'Supplier and item mismatch', message: supplierValidationErrors[0] });
      return;
    }
    try {
      if (isDraftStatus) {
        await updatePO.mutateAsync({
          id,
          body: {
            vendorId: data.vendorId,
            paymentTerms: encodePoPaymentTerms(data.paymentMode, data.netTermsDays),
            deliveryLocation: data.deliveryLocation,
            dispatchedThrough: data.dispatchedThrough,
            otherReferences: data.otherReferences,
            termsOfDelivery: data.termsOfDelivery,
            lines: data.lines.map((l) => ({
              productId: l.productId || undefined,
              materialId: l.materialId || undefined,
              uomId: l.uomId,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unitPrice || 0),
              needDate: l.needDate,
            })),
          },
        });
        showToast({ kind: 'success', title: 'Purchase Order Updated', message: 'Changes saved successfully.' });
      } else {
        await revisePO.mutateAsync({
          id,
          reason: data.reason || undefined,
          lines: data.lines.map((l) => ({
            productId: l.productId || undefined,
            materialId: l.materialId || undefined,
            uomId: l.uomId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice || 0),
            needDate: l.needDate,
          })),
        });
        showToast({ kind: 'success', title: 'Purchase Order Revised', message: 'Revisions saved successfully.' });
      }
      setIsEditing(false);
      reset();
      refetch();
    } catch (err) {
      showToast({
        kind: 'error',
        title: isDraftStatus ? 'Update Failed' : 'Revision Failed',
        message: err instanceof Error ? err.message : 'Failed to save changes.',
      });
    }
  });

  const handleResendPOEmail = async () => {
    try {
      const delivery = await resendPOEmail.mutateAsync({ id });
      showToast({ kind: 'success', title: 'Purchase Order Emailed', message: `${po.poNumber} was emailed to ${delivery.recipient}.` });
      refetch();
    } catch (err) {
      showToast({ kind: 'error', title: 'Email Failed', message: err instanceof Error ? err.message : 'Could not email the purchase order.' });
    }
  };

  const handleSendPO = async () => {
    try {
      await sendPO.mutateAsync({ id, method: 'EMAIL' });
      setIsEditing(false);
      reset();
      showToast({ kind: 'success', title: 'Purchase Order Sent', message: `${po.poNumber} was emailed to the vendor.` });
      await refetch();
    } catch (err) {
      showToast({ kind: 'error', title: 'Send Failed', message: err instanceof Error ? err.message : 'Could not email the purchase order.' });
    }
  };

  const handleCancelPO = async () => {
    try {
      await cancelPO.mutateAsync({ id, reason: 'Cancelled by administrator from purchase order details.' });
      setCancelDialogOpen(false);
      showToast({ kind: 'success', title: 'Purchase order cancelled', message: `${po.poNumber} was cancelled.` });
      refetch();
    } catch (err) {
      showToast({ kind: 'error', title: 'Cancellation failed', message: err instanceof Error ? err.message : 'Could not cancel this purchase order.' });
    }
  };

  const formLines = watch('lines');
  const formValues = watch();
  const getLineUomOptions = (index: number) => {
    const formLine = formLines?.[index];
    const itemId = formLine?.materialId || formLine?.productId;
    const material = materials?.items?.find((item) => item.id === itemId);
    const product = products?.items?.find((item) => item.id === itemId);
    const item = material || product;
    const itemData = item as (typeof item & { specs?: Record<string, unknown>; metadata?: Record<string, unknown> }) | undefined;
    const configured = (itemData?.specs?.availableUomIds || itemData?.metadata?.availableUomIds);
    const allowedIds = new Set<string>([
      item?.uomId || item?.uom?.id || '',
      ...(Array.isArray(configured) ? configured.filter((uomId): uomId is string => typeof uomId === 'string') : []),
    ].filter(Boolean));
    return (uoms?.items || []).filter((uom) => allowedIds.has(uom.id)).map((uom) => ({
      id: uom.id,
      name: uom.symbol || uom.code || uom.name,
      code: uom.code,
      symbol: uom.symbol,
    }));
  };
  const supplierCapabilities = procurementSelectors?.capabilities?.items ?? [];
  const selectedVendorId = formValues.vendorId || po.vendorId || po.vendor?.id || '';
  const getItemCapabilities = (itemId: string) => supplierCapabilities.filter((cap) => cap.materialId === itemId || cap.productId === itemId);
  const legacyItemAllowed = (itemId: string, index: number) => {
    const originalLine = po.lines[index];
    return selectedVendorId === (po.vendorId || po.vendor?.id) && !!originalLine && (originalLine.materialId === itemId || originalLine.productId === itemId);
  };
  const supplierValidationErrors = (formLines ?? []).flatMap((line, index) => {
    const itemId = line.materialId || line.productId;
    if (!itemId) return [`Line ${index + 1}: select a material or product.`];
    const capabilities = getItemCapabilities(itemId);
    if (capabilities.some((cap) => cap.vendorId === selectedVendorId)) return [];
    if (capabilities.length === 0 && legacyItemAllowed(itemId, index)) return [];
    return [capabilities.length ? `Line ${index + 1}: ${itemOptions.find((option) => option.id === itemId)?.name || 'Selected item'} is not supplied by this vendor.` : `Line ${index + 1}: no approved supplier is linked to this item.`];
  });
  const compatibleSupplierIds = new Set((approvedVendors?.items ?? []).filter((vendor) => (formLines ?? []).every((line, index) => {
    const itemId = line.materialId || line.productId;
    if (!itemId) return false;
    const capabilities = getItemCapabilities(itemId);
    return capabilities.some((cap) => cap.vendorId === vendor.id) || (capabilities.length === 0 && vendor.id === (po.vendorId || po.vendor?.id) && legacyItemAllowed(itemId, index));
  })).map((vendor) => vendor.id));
  const supplierPickerOptions = [
    ...(selectedVendorId ? [{ id: selectedVendorId, name: approvedVendors?.items.find((vendor) => vendor.id === selectedVendorId)?.name || po.vendor?.name || 'Current vendor', code: approvedVendors?.items.find((vendor) => vendor.id === selectedVendorId)?.code || po.vendor?.code }] : []),
    ...(approvedVendors?.items ?? []).filter((vendor) => compatibleSupplierIds.has(vendor.id) && vendor.id !== selectedVendorId),
  ];
  const compatibleItemOptions = itemOptions.filter((item) => {
    const capabilities = getItemCapabilities(item.id);
    return capabilities.some((cap) => cap.vendorId === selectedVendorId) || (capabilities.length === 0 && (formLines ?? []).some((_line, index) => legacyItemAllowed(item.id, index)));
  });
  const previewPo = isEditing
      ? {
        ...po,
        vendorId: formValues.vendorId || po.vendorId,
        vendor: approvedVendors?.items.find((vendor) => vendor.id === formValues.vendorId)
          ? {
              ...po.vendor,
              ...approvedVendors.items.find((vendor) => vendor.id === formValues.vendorId),
              id: formValues.vendorId,
            }
          : po.vendor,
        paymentTerms: encodePoPaymentTerms(formValues.paymentMode, formValues.netTermsDays),
        deliveryLocation: formValues.deliveryLocation,
        dispatchedThrough: formValues.dispatchedThrough,
        otherReferences: formValues.otherReferences,
        termsOfDelivery: formValues.termsOfDelivery,
        lines:
          formLines?.map((fl, index) => {
            const originalLine = po.lines?.[index] || { id: `temp-${index}` };
            const originalLineCast = originalLine as { product?: { id: string; sku?: string; name?: string }; material?: { id: string; code?: string; name?: string }; uom?: { id: string; symbol?: string } };
            const product = products?.items?.find((p) => p.id === fl.productId) ?? originalLineCast.product;
            const material = materials?.items?.find((m) => m.id === fl.materialId) ?? originalLineCast.material;
            const uom = uoms?.items?.find((u) => u.id === fl.uomId) ?? originalLineCast.uom;

            return {
              ...originalLine,
              productId: fl.productId || undefined,
              materialId: fl.materialId || undefined,
              uomId: fl.uomId,
              quantity: Number(fl.quantity) || 0,
              unitPrice: Number(fl.unitPrice) || 0,
              taxRate: Number(fl.taxRate) || 0,
              lineTotal: (Number(fl.quantity) || 0) * (Number(fl.unitPrice) || 0),
              needDate: fl.needDate || new Date().toISOString(),
              product,
              material,
              uom,
            };
          }) || [],
      }
    : po;

  const lineSubtotal = previewPo.lines?.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0
  ) || 0;
  const subtotal = isEditing ? lineSubtotal : Number(po.subtotal ?? lineSubtotal);
  const calculatedLineTax = previewPo.lines?.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.taxRate || 0) / 100, 0
  ) || 0;
  const taxAmount = isEditing ? calculatedLineTax : Number(po.taxAmount ?? calculatedLineTax);
  const totalAmount = isEditing ? subtotal + taxAmount : Number(po.totalAmount ?? subtotal + taxAmount);
  const vendorDetails = getVendorDisplayDetails(previewPo.vendor);

  return (
    <div className="flex-1 min-h-screen bg-background p-4 sm:p-6 md:p-8 overflow-y-auto">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Top Breadcrumbs & Mode Bar */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Link href="/procurement" className="hover:text-foreground transition-colors">
                Procurement
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <Link href="/procurement/purchase-orders" className="hover:text-foreground transition-colors">
                Purchase Orders
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                {po.poNumber}
                <button
                  type="button"
                  onClick={handleCopyPoNumber}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  title="Copy PO Number"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-tone-green-text" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </span>
            </nav>

            {/* View Mode Toggle Controls */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('details')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'details'
                      ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  <span>PO Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('document')}
                  disabled={isEditing}
                  title={isEditing ? 'Save or cancel changes to view the official document' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'document'
                      ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Official Document</span>
                </button>
              </div>
              {viewMode === 'document' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePrint()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-2xs"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Print Purchase Order
                </Button>
              )}
            </div>
          </div>

          {/* Clean Executive Header Card (No orangish gradient, using clean theme styling) */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                      <FileCheck className="h-5 w-5" />
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
                      {po.poNumber}
                    </h1>
                  </div>

                  <StatusBadge status={['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status) ? 'APPROVED' : ['REJECTED', 'SUPERSEDED'].includes(po.status) ? 'CANCELLED' : po.status} className="text-xs px-3 py-1 font-bold shadow-2xs" />
                </div>

              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5">
                {canApprove && (
                  <ProcurementApprovalPanel
                    entityId={id}
                    entityTypePath="purchases/orders"
                    currentStatus={po.status}
                    hasPermission={true}
                    queryKey={poKeys.detail(id)}
                    inline
                    purchaseOrderConfirmation
                  />
                )}

                {isAdmin && po.sentAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendPOEmail}
                    disabled={resendPOEmail.isPending}
                    className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{resendPOEmail.isPending ? 'Sending...' : 'Resend PO Email'}</span>
                  </Button>
                )}

                {isAdmin && po.status === 'APPROVED' && !po.sentAt && (
                  <Button variant="outline" size="sm" onClick={handleSendPO} disabled={sendPO.isPending} className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted">
                    <Mail className="h-3.5 w-3.5" />
                    <span>{sendPO.isPending ? 'Sending...' : 'Confirm & Send'}</span>
                  </Button>
                )}

                {!isEditing && canEditDraft && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenEdit}
                      className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                      <span>Edit PO</span>
                    </Button>
                )}

                {canCreateGrn && (
                  <Link href={`/receiving/goods-receipts/new?poId=${po.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted"
                    >
                      <Boxes className="h-3.5 w-3.5 text-primary" />
                      <span>Create GRN</span>
                    </Button>
                  </Link>
                )}

                {hasExistingGrn && (
                  <Link href={existingGrn ? `/receiving/goods-receipts/${existingGrn.id}` : '/receiving/goods-receipts'}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="inline-flex items-center gap-1.5 font-semibold border-primary/30 text-primary hover:bg-primary/10"
                    >
                      <Boxes className="h-3.5 w-3.5 text-primary" />
                      <span>{existingGrn ? `View GRN (${existingGrn.grnNumber})` : 'GRN Raised'}</span>
                    </Button>
                  </Link>
                )}

                {canCancel && <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelDialogOpen(true)}
                  disabled={cancelPO.isPending}
                  className="inline-flex items-center gap-1.5 font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                  title="Cancel this purchase order"
                >
                  <span>Cancel PO</span>
                </Button>}
              </div>
            </div>
          </div>

          {viewMode === 'details' && <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <div className="bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Subtotal</p>
              <p className="mt-1 font-mono text-base font-bold text-foreground">{formatAmount(subtotal)}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tax</p>
              <p className="mt-1 font-mono text-base font-bold text-foreground">{formatAmount(taxAmount)}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total PO value</p>
              <p className="mt-1 font-mono text-lg font-bold text-primary">{formatAmount(totalAmount)}</p>
            </div>
            <div className="bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fulfillment</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{po.status === 'CANCELLED' || po.status === 'REJECTED' ? 'Cancelled' : isDraftStatus ? 'Awaiting Admin approval' : po.sentAt ? 'Sent to vendor' : 'Approved'}</p>
            </div>
          </div>}
        </div>

        {/* Dynamic View Mode Content */}
        {viewMode === 'details' && (
          <div className="space-y-5">
            <form id="po-inline-edit-form" onSubmit={onSaveSubmit}>
              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
                <div className="border-border-strong border-border bg-primary/[0.04] px-5 py-4">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Purchase Order Details</h2>
                </div>
                <div className="overflow-x-auto">
                  <Table className="w-full min-w-[760px] table-fixed text-sm [&_th]:border-r [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-4 [&_th]:py-4 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-foreground [&_td]:px-4 [&_td]:py-4 [&_td]:align-middle [&_tr]:border-border-strong [&_tr]:border-border/80">
                    <colgroup><col style={{ width: '20%' }} /><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '30%' }} /></colgroup>
                    <TableBody>
                      <TableRow>
                        <TableHead scope="row" className="font-semibold">Supplier</TableHead>
                        <TableCell className="font-semibold text-foreground">
                          {isEditing && isDraftStatus ? <><input type="hidden" {...register('vendorId', { required: true })} /><SearchableSelector value={formValues.vendorId} onChange={(vendorId) => setValue('vendorId', vendorId, { shouldDirty: true })} options={supplierPickerOptions} placeholder="Search compatible suppliers…" size="sm" /></> : (previewPo.vendorId || previewPo.vendor?.id ? <Link href={`/vendors/${previewPo.vendor?.id || previewPo.vendorId}`} className="hover:text-primary hover:underline">{vendorDetails.name}</Link> : vendorDetails.name)}
                        </TableCell>
                        <TableHead scope="row">PO date</TableHead>
                        <TableCell className="font-medium text-foreground">{formatIndianDate(po.createdAt)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">Supplier address</TableHead>
                        <TableCell className="font-medium text-foreground">{[vendorDetails.street, vendorDetails.cityStateZip].filter(Boolean).join(', ') || '—'}</TableCell>
                        <TableHead scope="row">Required by</TableHead>
                        <TableCell className="font-medium text-foreground">{formatIndianDate(previewPo.lines?.[0]?.needDate || po.createdAt)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">GSTIN / UIN</TableHead>
                        <TableCell className="font-mono text-sm font-medium text-foreground">{vendorDetails.gstin}</TableCell>
                        <TableHead scope="row">Source requisition</TableHead>
                        <TableCell className="font-mono text-sm font-medium text-foreground">{po.sourcePr?.prNumber || '—'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">Mode of payment</TableHead>
                        <TableCell className="font-medium text-foreground">{isEditing && isDraftStatus ? <select value={formValues.paymentMode} onChange={(event) => setValue('paymentMode', event.target.value, { shouldDirty: true })} aria-label="Mode of payment" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground"><option value="">Select mode</option>{PO_PAYMENT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select> : PO_PAYMENT_MODES.find((mode) => mode.value === parsePoPaymentTerms(previewPo.paymentTerms).paymentMode)?.label || '—'}</TableCell>
                        <TableHead scope="row">Payment terms</TableHead>
                        <TableCell className="font-medium text-foreground">{isEditing && isDraftStatus ? <div className="space-y-2"><select value={['15', '30', '60'].includes(formValues.netTermsDays) ? formValues.netTermsDays : 'CUSTOM'} onChange={(event) => { const selected = event.target.value; setValue('netTermsDays', selected === 'CUSTOM' ? '' : selected, { shouldDirty: true }); }} aria-label="Payment terms" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground"><option value="15">Net 15 Days</option><option value="30">Net 30 Days</option><option value="60">Net 60 Days</option><option value="CUSTOM">Custom</option></select>{!['15', '30', '60'].includes(formValues.netTermsDays) && <Input type="number" min="1" step="1" {...register('netTermsDays')} placeholder="Custom term in days" aria-label="Custom payment term in days" />}</div> : parsePoPaymentTerms(previewPo.paymentTerms).netTermsDays ? `Net ${parsePoPaymentTerms(previewPo.paymentTerms).netTermsDays} Days` : '—'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">Dispatch</TableHead>
                        <TableCell className="font-medium text-foreground">{isEditing && isDraftStatus ? <Input {...register('dispatchedThrough')} placeholder="Dispatch method" /> : previewPo.dispatchedThrough || '—'}</TableCell>
                        <TableHead scope="row">Destination</TableHead>
                        <TableCell className="font-medium text-foreground">{isEditing && isDraftStatus ? <Input {...register('deliveryLocation')} placeholder="Destination" /> : previewPo.deliveryLocation || '—'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">Delivery terms</TableHead>
                        <TableCell className="font-medium text-foreground">{isEditing && isDraftStatus ? <Input {...register('termsOfDelivery')} placeholder="Delivery terms" /> : previewPo.termsOfDelivery || '—'}</TableCell>
                        <TableHead /><TableCell />
                      </TableRow>
                      {(previewPo.otherReferences || (isEditing && isDraftStatus)) && <TableRow>
                        <TableHead scope="row">Other references</TableHead>
                        <TableCell colSpan={3} className="font-medium text-foreground">{isEditing && isDraftStatus ? <Input {...register('otherReferences')} placeholder="Optional reference" /> : previewPo.otherReferences}</TableCell>
                      </TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {/* Order Lines Table / Editor */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xs">
                <div className="flex items-center justify-between bg-muted/40 px-5 py-3.5 border-border-strong border-border">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Ordered Line Items ({previewPo.lines?.length || 0})
                    </h2>
                  </div>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        append({
                          productId: '',
                          materialId: '',
                          uomId: '',
                          quantity: 1,
                          unitPrice: 0,
                          taxRate: 0,
                          needDate: new Date().toISOString().split('T')[0],
                        })
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold border-border hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Item Line</span>
                    </Button>
                  )}
                </div>

                {isEditing && !isDraftStatus && <div className="border-border-strong border-border p-4"><label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Reason for revision</label><Input {...register('reason')} placeholder="Reason for this revision" /></div>}
                {isEditing && isDraftStatus && supplierValidationErrors.length > 0 && <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><p className="font-semibold">Resolve supplier and item mismatches before saving:</p><ul className="mt-1 list-inside list-disc">{supplierValidationErrors.map((message) => <li key={message}>{message}</li>)}</ul>{areSupplierCapabilitiesLoading && <p className="mt-1">Loading supplier catalog…</p>}</div>}
                {isEditing && isDraftStatus && po.lines.some((line) => Number(line.unitPrice) <= 0 && line.pricingEvidence?.decisionReason?.includes('zero placeholder rate')) && <div className="m-4 rounded-lg border border-tone-amber-solid/25 bg-tone-amber-solid px-3 py-2 text-xs text-tone-amber-text">Hermes could not find a defensible rate for this item. Enter and save the agreed unit rate below before approving the PO.</div>}
                <div className="overflow-x-auto">
                  <Table className="w-full min-w-[1000px] table-fixed text-left text-xs border-collapse">
                    <colgroup>
                      <col style={{ width: '4%' }} />
                      <col style={{ width: isEditing ? '29%' : '31%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: isEditing ? '21%' : '20%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: isEditing ? '11%' : '14%' }} />
                      {isEditing && <col style={{ width: '4%' }} />}
                    </colgroup>
                    <TableHeader><TableRow><TableHead className="px-4 py-3 text-center">#</TableHead><TableHead className="px-4 py-3">Description of Goods</TableHead><TableHead className="px-3 py-3 text-center">Due on</TableHead><TableHead className="px-4 py-3 text-center">Quantity / UOM</TableHead><TableHead className="px-4 py-3 text-right">Rate</TableHead><TableHead className="px-2 py-3 text-right">Tax %</TableHead><TableHead className="px-4 py-3 text-right">Amount</TableHead>{isEditing && <TableHead className="w-12" />}</TableRow></TableHeader>
                    <TableBody>
                      {(isEditing ? fields : (previewPo.lines ?? [])).map((field, idx) => {
                        const line = previewPo.lines?.[idx];
                        const itemDesc = line?.product?.name || line?.material?.name || line?.product?.sku || line?.material?.code || 'Select item';
                        const lineAmount = Number(line?.quantity || 0) * Number(line?.unitPrice || 0);
                        return <TableRow key={field.id}>
                          <TableCell className="px-4 py-2 text-center font-mono">{idx + 1}</TableCell>
                          <TableCell className="min-w-[280px] px-4 py-2">{isEditing ? <><input type="hidden" {...register(`lines.${idx}.productId`)} /><input type="hidden" {...register(`lines.${idx}.materialId`)} /><SearchableSelector value={formLines?.[idx]?.productId || formLines?.[idx]?.materialId || ''} onChange={(itemId) => { const product = products?.items?.find((item) => item.id === itemId); const material = materials?.items?.find((item) => item.id === itemId); setValue(`lines.${idx}.productId`, product ? itemId : '', { shouldDirty: true }); setValue(`lines.${idx}.materialId`, material ? itemId : '', { shouldDirty: true }); const targetUom = product?.uomId || product?.uom?.id || material?.uomId || material?.uom?.id || ''; setValue(`lines.${idx}.uomId`, targetUom, { shouldDirty: true }); setValue(`lines.${idx}.taxRate`, getItemTaxRate(product?.metadata ?? material?.specs), { shouldDirty: true }); }} options={compatibleItemOptions} isLoading={!products && !materials || areSupplierCapabilitiesLoading} placeholder={compatibleItemOptions.length ? 'Choose an item supplied by this vendor' : 'No compatible items for this vendor'} size="sm" /> </> : <div className="font-bold uppercase">{itemDesc}</div>}</TableCell>
                          <TableCell className="px-3 py-2 text-center">{isEditing ? <Input type="date" {...register(`lines.${idx}.needDate`)} className="min-w-36" /> : formatIndianDate(line?.needDate || po.createdAt)}</TableCell>
                          <TableCell className="px-4 py-2 text-center">{isEditing ? <div className="mx-auto flex w-full max-w-[14rem] min-w-0 items-center justify-center gap-2"><Input type="number" min="0.01" step="any" {...register(`lines.${idx}.quantity`, { required: true, valueAsNumber: true })} className="min-w-0 flex-1 text-right" /><div className="w-24 shrink-0"><SearchableSelector value={formLines?.[idx]?.uomId || ''} onChange={(uomId) => setValue(`lines.${idx}.uomId`, uomId, { shouldDirty: true })} options={getLineUomOptions(idx)} placeholder="UOM" size="sm" /></div></div> : <span className="inline-block w-full text-center font-mono font-bold">{Number(line?.quantity || 0).toLocaleString('en-IN')} {line?.uom?.symbol || 'Nos.'}</span>}</TableCell>
                          <TableCell className="px-4 py-2 text-right">{isEditing ? <Input type="number" min="0" step="any" {...register(`lines.${idx}.unitPrice`, { valueAsNumber: true })} className="min-w-28 text-right" /> : <span className="inline-flex items-center gap-1 font-mono">{Number(line?.unitPrice || 0).toFixed(2)}{line?.pricingEvidence && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-primary" title="View rate calculation and purchase order history" aria-label={`View rate calculation for ${itemDesc}`} onClick={() => setPricingEvidenceLine(line)}><Eye className="h-3.5 w-3.5" /></Button>}</span>}</TableCell>
                          <TableCell className="px-2 py-2 text-right font-mono">{Number(line?.taxRate || 0).toLocaleString('en-IN')}%</TableCell>
                          <TableCell className="px-4 py-2 text-right font-mono font-bold">{formatAmount(lineAmount)}</TableCell>
                          {isEditing && <TableCell className="px-2 py-2"><Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)} aria-label={`Remove item ${idx + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>}
                        </TableRow>;
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={6} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Subtotal</TableCell>
                        <TableCell className="px-4 py-2 text-right font-mono font-semibold text-foreground">{formatAmount(subtotal)}</TableCell>
                        {isEditing && <TableCell />}
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Tax</TableCell>
                        <TableCell className="px-4 py-2 text-right font-mono font-semibold text-foreground">{formatAmount(taxAmount)}</TableCell>
                        {isEditing && <TableCell />}
                      </TableRow>
                      <TableRow className="border-t-2 border-border font-bold">
                        <TableCell colSpan={6} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-foreground">Total goods &amp; taxes</TableCell>
                        <TableCell className="px-4 py-3 text-right font-mono text-sm font-black text-foreground">{formatAmount(totalAmount)}</TableCell>
                        {isEditing && <TableCell />}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {isEditing && <div className="flex justify-end gap-2 border-t border-border p-4"><Button type="button" variant="outline" size="sm" onClick={() => { setIsEditing(false); reset(); }}>Cancel</Button><Button type="submit" size="sm" disabled={revisePO.isPending || updatePO.isPending || areSupplierCapabilitiesLoading || supplierValidationErrors.length > 0}>{revisePO.isPending || updatePO.isPending ? 'Saving…' : isDraftStatus ? 'Save Changes' : 'Apply Revision'}</Button></div>}
              </div>
            </form>
          </div>
        )}

        {/* Full Official Document View */}
        {viewMode === 'document' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-2 sm:p-4 shadow-inner flex items-start justify-center">
              <div className="w-full max-w-[850px] bg-surface shadow-modal rounded-sm border border-border/40">
                <PurchaseOrderPDF po={po as unknown as React.ComponentProps<typeof PurchaseOrderPDF>['po']} ref={printRef} />
              </div>
            </div>
          </div>
        )}

        <Dialog
          open={!!pricingEvidenceLine}
          onClose={() => setPricingEvidenceLine(null)}
          title="Rate calculation details"
          description={pricingEvidenceLine?.product?.name || pricingEvidenceLine?.material?.name || 'Purchase order line'}
          className="max-w-6xl"
        >
          {pricingEvidenceLine?.pricingEvidence && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Rate on this PO</p>
                  <p className="mt-2 font-mono text-xl font-black tabular-nums text-foreground">{pricingEvidenceLine.pricingEvidence.currency} {Number(pricingEvidenceLine.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">per {pricingEvidenceLine.pricingEvidence.uom}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Average previous PO rate</p>
                  <p className="mt-2 font-mono text-xl font-black tabular-nums text-foreground">
                    {pricingEvidenceLine.pricingEvidence.averageUnitPrice === null
                      ? 'No prior rate'
                      : `${pricingEvidenceLine.pricingEvidence.currency} ${pricingEvidenceLine.pricingEvidence.averageUnitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                  {pricingEvidenceLine.pricingEvidence.averageUnitPrice !== null && <p className="mt-1 text-xs font-semibold text-muted-foreground">per {pricingEvidenceLine.pricingEvidence.uom}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Based on <span className="font-semibold text-foreground">{pricingEvidenceLine.pricingEvidence.matchedLineCount}</span> matching PO line{pricingEvidenceLine.pricingEvidence.matchedLineCount === 1 ? '' : 's'}</p>
                </div>
              </div>
              {pricingEvidenceLine.pricingEvidence.decisionReason && (
                <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4 text-sm leading-6 text-foreground">
                  {pricingEvidenceLine.pricingEvidence.decisionReason}
                </div>
              )}
              <p className="rounded-lg bg-muted/30 px-3.5 py-3 text-xs leading-5 text-muted-foreground">{pricingEvidenceLine.pricingEvidence.basis}</p>
              {pricingEvidenceLine.pricingEvidence.records.length > 0 ? (
                <div className="rounded-xl border border-border">
                  <Table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col className="w-[28%]" />
                      <col className="w-[15%]" />
                      <col className="w-[27%]" />
                      <col className="w-[15%]" />
                      <col className="w-[15%]" />
                    </colgroup>
                    <TableHeader className="sticky top-0">
                      <TableRow><TableHead className="px-4 py-3 font-bold">Purchase Order</TableHead><TableHead className="px-4 py-3 font-bold">Date</TableHead><TableHead className="px-4 py-3 font-bold">Vendor</TableHead><TableHead className="px-4 py-3 text-right font-bold">Quantity</TableHead><TableHead className="px-4 py-3 text-right font-bold">Rate</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricingEvidenceLine.pricingEvidence.records.map((record, index) => (
                        <TableRow key={`${record.poNumber}-${index}`} className="hover:bg-muted/30">
                          <TableCell className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">{record.poNumber}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-3">{formatIndianDate(record.createdAt)}</TableCell>
                          <TableCell className="break-words px-4 py-3 font-medium">{record.vendorName}</TableCell>
                          <TableCell className="px-4 py-3 text-right tabular-nums">{Number(record.quantity).toLocaleString('en-IN')}</TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold tabular-nums">{pricingEvidenceLine.pricingEvidence?.currency} {Number(record.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No earlier priced purchase orders match this item, unit, and currency.</p>
              )}
            </div>
          )}
        </Dialog>
        <ConfirmDeleteDialog
          open={cancelDialogOpen}
          title="Cancel purchase order?"
          message={`Purchase order ${po.poNumber} will be marked cancelled. This action cannot be undone.`}
          error={cancelPO.error instanceof Error ? cancelPO.error.message : null}
          isDeleting={cancelPO.isPending}
          confirmText="Cancel PO"
          loadingText="Cancelling…"
          onClose={() => setCancelDialogOpen(false)}
          onConfirm={handleCancelPO}
        />
      </div>
    </div>
  );
}
