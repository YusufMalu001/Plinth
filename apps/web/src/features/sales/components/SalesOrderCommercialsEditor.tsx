'use client';

import React, { useState, useEffect } from 'react';
import {
  Save,
  Pencil,
  RotateCcw,
  X,
  CreditCard,
  Lock,
  Building2,
  Truck,
  Plus,
  Trash2,
  Package,
  AlertCircle,
  Phone,
  Mail,
  User,
} from 'lucide-react';
import {
  Button,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@synergy/ui';
import { formatINR, formatIndianDate } from '../../purchases/utils';
import { useProducts } from '../../../hooks/useMasterData';
import { showToast } from '@/components/toast-store';


export interface CommercialEditorLine {
  salesOrderLineId: string;
  productId: string;
  productVariantId?: string | null;
  sku: string;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  // Execution tracking from sales order
  orderedQuantity?: number;
  allocatedQuantity?: number;
  packedQuantity?: number;
  shippedQuantity?: number;
  status?: string;
}

export interface CommercialEditorTerms {
  paymentTerms: string;
  customerPoNumber: string;
  promisedAt: string;
  notes: string;
  salesRepresentative?: string;
  deliveryInstructions?: string;
}

export interface SalesOrderCommercialsEditorProps {
  order: any;
  proForma: any;
  customer?: any;
  creditExposure?: any;
  inventoryMap?: Map<string, number>;
  canEdit: boolean;
  isEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  onLiveChange?: (lines: CommercialEditorLine[], terms: CommercialEditorTerms) => void;
  onSave: (payload: { lines: CommercialEditorLine[]; terms: CommercialEditorTerms }) => Promise<void>;
  onCancel?: () => void;
}

export function SalesOrderCommercialsEditor({
  order,
  proForma,
  customer,
  creditExposure,
  inventoryMap = new Map(),
  canEdit,
  isEditing: externalIsEditing,
  onEditingChange,
  onLiveChange,
  onSave,
  onCancel,
}: SalesOrderCommercialsEditorProps) {
  // Helper to extract initial lines with execution tracking
  const parseInitialLines = (): CommercialEditorLine[] => {
    const rawLines = proForma?.lines && proForma.lines.length > 0 ? proForma.lines : order?.lines || [];
    return rawLines.map((l: any) => {
      const match = (order?.lines || []).find(
        (ol: any) => ol.id === l.salesOrderLineId || ol.id === l.id
      );
      const qty = Number(l.quantity || match?.orderedQuantity || l.orderedQuantity || 1);
      const price = Number(l.unitPrice || match?.unitPrice || 0);
      const discount = Number(l.discountAmount || match?.discountAmount || 0);
      const rate = Number(l.taxRate || match?.taxRate || l.gstRate || 18);
      const gross = qty * price;
      const taxable = Math.max(0, gross - discount);
      const tax = taxable * (rate / 100);
      return {
        salesOrderLineId: l.salesOrderLineId || l.id || '',
        productId: l.productId || match?.productId || '',
        productVariantId: l.productVariantId || match?.productVariantId || null,
        sku: l.sku || match?.sku || '',
        description: l.description || match?.description || '',
        uom: l.uom || match?.uom || 'PCS',
        quantity: qty,
        unitPrice: price,
        discountAmount: discount,
        taxRate: rate,
        taxableAmount: taxable,
        taxAmount: tax,
        totalAmount: taxable + tax,
        orderedQuantity: Number(match?.orderedQuantity ?? qty),
        allocatedQuantity: Number(match?.allocatedQuantity ?? 0),
        packedQuantity: Number(match?.packedQuantity ?? 0),
        shippedQuantity: Number(match?.shippedQuantity ?? 0),
        status: match?.status || 'OPEN',
      };
    });
  };

  // Helper to extract initial terms
  const parseInitialTerms = (): CommercialEditorTerms => {
    const extPo = order?.customerPoNumber || order?.externalOrderId || '';
    const dateStr = order?.promisedAt ? new Date(order.promisedAt).toISOString().split('T')[0] : '';
    return {
      paymentTerms: order?.paymentTerms || (order?.notes?.includes('Terms:')
        ? order.notes.split('Terms:')[1]?.trim() || ''
        : 'Net 30 Days'),
      customerPoNumber: extPo,
      promisedAt: dateStr,
      notes: order?.notes || '',
      salesRepresentative: order?.salesRepresentative || '',
      deliveryInstructions: order?.deliveryInstructions || '',
    };
  };

  const [lines, setLines] = useState<CommercialEditorLine[]>(parseInitialLines);
  const [terms, setTerms] = useState<CommercialEditorTerms>(parseInitialTerms);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [internalIsEditing, setInternalIsEditing] = useState(false);

  const isEditing = externalIsEditing !== undefined ? externalIsEditing : internalIsEditing;
  const setEditing = (val: boolean) => {
    setInternalIsEditing(val);
    onEditingChange?.(val);
  };

  const { data: productData } = useProducts('ACTIVE', 1, 1000);
  const products = Array.isArray(productData) ? productData : productData?.items ?? [];

  // Re-sync with incoming order when changed
  useEffect(() => {
    const parsed = parseInitialLines();
    const parsedTerms = parseInitialTerms();
    setLines(parsed);
    setTerms(parsedTerms);
    setIsDirty(false);
    onLiveChange?.(parsed, parsedTerms);
  }, [order?.id, order?.updatedAt, proForma?.id, proForma?.updatedAt]);

  // Recalculate line & notify live change
  const updateLineField = (
    index: number,
    field: 'quantity' | 'unitPrice' | 'discountAmount' | 'taxRate',
    val: number
  ) => {
    const updated = [...lines];
    const item = { ...updated[index], [field]: val };
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice || 0);
    const discount = Number(item.discountAmount || 0);
    const rate = Number(item.taxRate || 0);
    const gross = qty * price;
    const taxable = Math.max(0, gross - discount);
    const tax = taxable * (rate / 100);
    item.taxableAmount = taxable;
    item.taxAmount = tax;
    item.totalAmount = taxable + tax;
    updated[index] = item;
    setLines(updated);
    setIsDirty(true);
    onLiveChange?.(updated, terms);
  };

  const updateProduct = (index: number, productId: string) => {
    const product = products.find((item: any) => item.id === productId);
    if (!product) return;
    const updated = [...lines];
    const current = updated[index];
    const metadata = (product.metadata || {}) as Record<string, unknown>;
    const rawTaxRate = Number(metadata.gstRate ?? current.taxRate);
    const taxRate = rawTaxRate <= 1 && rawTaxRate > 0 ? rawTaxRate * 100 : (rawTaxRate || 18);
    const item: CommercialEditorLine = {
      ...current,
      productId: product.id,
      productVariantId: null,
      sku: product.sku || '',
      description: product.name || '',
      uom: product.uom?.symbol || product.uom?.name || current.uom || 'PCS',
      unitPrice: Number(product.standardPrice ?? current.unitPrice),
      taxRate,
      quantity: current.quantity,
      discountAmount: current.discountAmount,
      taxableAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    };
    const taxable = Math.max(0, item.quantity * item.unitPrice - item.discountAmount);
    item.taxableAmount = taxable;
    item.taxAmount = taxable * (item.taxRate / 100);
    item.totalAmount = item.taxableAmount + item.taxAmount;
    updated[index] = item;
    setLines(updated);
    setIsDirty(true);
    onLiveChange?.(updated, terms);
  };

  const handleAddLine = () => {
    const defaultProduct = products[0];
    const metadata = (defaultProduct?.metadata || {}) as Record<string, unknown>;
    const rawTaxRate = Number(metadata.gstRate ?? 18);
    const taxRate = rawTaxRate <= 1 && rawTaxRate > 0 ? rawTaxRate * 100 : (rawTaxRate || 18);
    const unitPrice = Number(defaultProduct?.standardPrice ?? 0);
    const taxable = unitPrice;
    const tax = taxable * (taxRate / 100);
    const newLine: CommercialEditorLine = {
      salesOrderLineId: `line-new-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: defaultProduct?.id || '',
      productVariantId: null,
      sku: defaultProduct?.sku || 'PROD-NEW',
      description: defaultProduct?.name || 'New Item',
      uom: defaultProduct?.uom?.symbol || 'PCS',
      quantity: 1,
      unitPrice,
      discountAmount: 0,
      taxRate,
      taxableAmount: taxable,
      taxAmount: tax,
      totalAmount: taxable + tax,
      orderedQuantity: 1,
      allocatedQuantity: 0,
      packedQuantity: 0,
      shippedQuantity: 0,
      status: 'OPEN',
    };
    const updated = [...lines, newLine];
    setLines(updated);
    setIsDirty(true);
    onLiveChange?.(updated, terms);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      showToast({
        kind: 'warning',
        title: 'Action Restricted',
        message: 'A Sales Order must retain at least one product line item.',
      });
      return;
    }
    const updated = lines.filter((_, i) => i !== index);
    setLines(updated);
    setIsDirty(true);
    onLiveChange?.(updated, terms);
  };

  const updateTermField = (field: keyof CommercialEditorTerms, val: string) => {
    const updated = { ...terms, [field]: val };
    setTerms(updated);
    setIsDirty(true);
    onLiveChange?.(lines, updated);
  };

  const handleReset = () => {
    const parsed = parseInitialLines();
    const parsedTerms = parseInitialTerms();
    setLines(parsed);
    setTerms(parsedTerms);
    setIsDirty(false);
    onLiveChange?.(parsed, parsedTerms);
  };

  const handleCancelEdit = () => {
    handleReset();
    setEditing(false);
    onCancel?.();
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      await onSave({ lines, terms });
      setIsDirty(false);
      setEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculations
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discountAmount, 0);
  const taxableTotal = Math.max(0, subtotal - discountTotal);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = taxableTotal + taxTotal;
  const totalQuantity = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  const isBeforeConfirmed = [
    'DRAFT',
    'IMPORTED',
    'VALIDATING',
    'VALIDATION_FAILED',
    'PENDING_APPROVAL',
    'ON_HOLD',
  ].includes(order?.status || '');
  const isDispatched =
    Boolean(order?.dispatchedAt) ||
    ['DISPATCHED', 'DELIVERED', 'CLOSED'].includes(order?.status);
  const canModify = canEdit && isBeforeConfirmed && isEditing && !isDispatched;

  const shipping = order?.addresses?.find((a: any) => a.kind === 'SHIPPING');
  const billing = order?.addresses?.find((a: any) => a.kind === 'BILLING') || shipping;

  const creditLimit = Number(creditExposure?.creditLimit ?? customer?.creditLimit ?? 0);
  const creditUtilized = Number(creditExposure?.creditUtilized ?? 0);
  const availableCredit = Math.max(0, creditLimit - creditUtilized);
  const creditRatio = creditLimit > 0 ? Math.min(100, Math.round((creditUtilized / creditLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* 1. Customer & Statutory Profile Card (Matches PO Vendor & Billing card) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Customer &amp; Statutory Specifications
            </h2>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Customer Code: {customer?.code || order?.customer?.code || order?.customerId?.slice(0, 8) || 'CUST-B2B'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Buyer Details */}
          <div className="space-y-2 rounded-xl bg-muted/40 p-4 border border-border/60">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" /> Customer Profile &amp; Billing
              </p>
              {customer?.customerType && (
                <Badge variant="outline" className="text-[10px] font-mono uppercase">
                  {customer.customerType}
                </Badge>
              )}
            </div>

            <div>
              <p className="font-bold text-foreground text-sm">
                {customer?.name || order?.customer?.name || billing?.name || 'Customer Organization'}
              </p>
              <p className="text-muted-foreground text-[11px] leading-relaxed mt-0.5">
                {billing?.line1 || 'Commercial Complex, M.G. Road'}
                {billing?.line2 ? `, ${billing.line2}` : ''}
                <br />
                {billing?.city || 'Indore'}, {billing?.state || 'Madhya Pradesh'} - {billing?.postalCode || '452001'}, {billing?.country || 'India'}
              </p>
            </div>

            <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px] font-medium">GSTIN/UIN:</span>
                <span className="font-mono font-bold text-foreground">
                  {customer?.taxNumber || order?.customerGstin || billing?.taxNumber || '23AAACA0000A1Z5'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] font-medium">PAN Number:</span>
                <span className="font-mono font-bold text-foreground">
                  {customer?.panNumber || 'AAACA0000A'}
                </span>
              </div>
            </div>

            {(customer?.contactPhone || billing?.phone || customer?.contactEmail) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                {(customer?.contactPhone || billing?.phone) && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground/70" /> {customer?.contactPhone || billing?.phone}
                  </span>
                )}
                {customer?.contactEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground/70" /> {customer.contactEmail}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Shipping & Credit Logistics */}
          <div className="space-y-3 rounded-xl bg-muted/40 p-4 border border-border/60 text-[11px]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-primary" /> Delivery &amp; Credit Exposure
              </p>
              <Badge variant="outline" className="text-[10px] font-mono">
                {order.channel?.replace('_', ' ') || 'DIRECT'}
              </Badge>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground block text-[10px] font-medium">Consignee Shipping Address:</span>
              <p className="font-medium text-foreground text-[11px] leading-relaxed">
                {shipping?.name || customer?.name || 'Same as billing address'}
                <br />
                {shipping?.line1 || billing?.line1 || 'Indore Godown & Distribution Hub'}
                {shipping?.line2 ? `, ${shipping.line2}` : ''}
                <br />
                {shipping?.city || billing?.city || 'Indore'}, {shipping?.state || billing?.state || 'Madhya Pradesh'} - {shipping?.postalCode || billing?.postalCode || '452001'}
              </p>
            </div>

            {/* Credit Exposure Box */}
            <div className="pt-2 border-t border-border/60 space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground font-medium">Credit Limit Status:</span>
                <span className="font-mono font-bold text-foreground">
                  {creditLimit > 0 ? formatINR(creditLimit) : 'Uncapped / Open'}
                </span>
              </div>

              {creditLimit > 0 && (
                <>
                  <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all rounded-full ${
                        creditRatio > 90
                          ? 'bg-destructive'
                          : creditRatio > 70
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${creditRatio}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                    <span>Utilized: <strong className="text-foreground font-mono">{formatINR(creditUtilized)}</strong> ({creditRatio}%)</span>
                    <span>Available: <strong className="text-foreground font-mono">{formatINR(availableCredit)}</strong></span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Commercial Terms & Delivery Instructions */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Commercial &amp; Delivery Instructions
            </h2>
          </div>
          {canModify && (
            <span className="text-[10px] font-bold text-primary animate-pulse flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Live updating Pro Forma
            </span>
          )}
        </div>

        {canModify ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Payment Terms
                </label>
                <input
                  type="text"
                  placeholder="e.g. Net 30 Days"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  value={terms.paymentTerms}
                  onChange={(e) => updateTermField('paymentTerms', e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Customer PO Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-2026-9921"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  value={terms.customerPoNumber}
                  onChange={(e) => updateTermField('customerPoNumber', e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Promised Delivery Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  value={terms.promisedAt}
                  onChange={(e) => updateTermField('promisedAt', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Sales Representative / Account Owner
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Sharma"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  value={terms.salesRepresentative || ''}
                  onChange={(e) => updateTermField('salesRepresentative', e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Commercial Notes &amp; Terms
                </label>
                <input
                  type="text"
                  placeholder="e.g. Commercial delivery via road transport; transit insurance included."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  value={terms.notes}
                  onChange={(e) => updateTermField('notes', e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
            <div className="rounded-xl bg-muted/40 p-3 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Payment Terms</span>
              <span className="font-semibold text-foreground text-sm mt-0.5 block">{terms.paymentTerms || 'Net 30 Days'}</span>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Customer PO Ref</span>
              <span className="font-mono font-bold text-foreground text-sm mt-0.5 block">{terms.customerPoNumber || 'None Specified'}</span>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Promised Delivery</span>
              <span className="font-mono font-semibold text-foreground text-sm mt-0.5 block">
                {terms.promisedAt ? formatIndianDate(terms.promisedAt) : 'Pending Confirmation'}
              </span>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">Sales Representative</span>
              <span className="font-semibold text-foreground text-sm mt-0.5 block">{terms.salesRepresentative || 'Institutional Desk'}</span>
            </div>
            {terms.notes && (
              <div className="col-span-2 sm:col-span-4 rounded-xl bg-muted/40 p-3 border border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Order Instructions &amp; Notes</span>
                <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">{terms.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Main Line Items Table Card (Exact Synergy ERP Table UI from PO details) */}
      <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> Order Items &amp; Commercials
              </h2>
              {isDirty && (
                <Badge variant="warning" className="text-[10px] animate-pulse">
                  Unsaved Changes
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEditing
                ? 'Edit quantities, pricing, and tax rates inline. All adjustments instantly preview on the Pro Forma.'
                : 'Itemized goods, stock availability status, and statutory tax breakdown.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && isBeforeConfirmed && !isDispatched && !isEditing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="h-8 text-xs font-semibold gap-1.5 border-border hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5 text-primary" /> Edit Commercials
              </Button>
            )}

            {canModify ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                {isDirty && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReset}
                    disabled={isSaving}
                    className="h-8 text-xs font-semibold gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  loading={isSaving}
                  disabled={!isDirty || isSaving}
                  className="h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </Button>
              </div>
            ) : (
              !isBeforeConfirmed && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold px-2.5 py-1 rounded-lg bg-muted border border-border">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Order Confirmed (Locked)
                </div>
              )
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow className="bg-muted/40 border-b border-border">
                <TableHead className="w-12 text-center font-bold text-xs px-3 py-3">#</TableHead>
                <TableHead className="min-w-[280px] font-bold text-xs text-left px-4 py-3">SKU / Item Description</TableHead>
                <TableHead className="text-right font-bold text-xs w-28 px-4 py-3">Ordered</TableHead>
                <TableHead className="text-right font-bold text-xs w-24 px-4 py-3">Allocated</TableHead>
                <TableHead className="text-right font-bold text-xs w-24 px-4 py-3">Packed</TableHead>
                <TableHead className="text-right font-bold text-xs w-24 px-4 py-3">Shipped</TableHead>
                <TableHead className="text-right font-bold text-xs w-32 px-4 py-3">Unit Price</TableHead>
                <TableHead className="text-right font-bold text-xs w-28 px-4 py-3">Discount</TableHead>
                <TableHead className="text-right font-bold text-xs w-32 px-4 py-3">GST Tax</TableHead>
                <TableHead className="text-right font-bold text-xs w-36 px-4 py-3">Line Total</TableHead>
                {canModify && <TableHead className="w-14 text-center font-bold text-xs px-2 py-3">Action</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {lines.map((line, idx) => {
                const avail = inventoryMap.get(line.productId) ?? 0;
                const hasStockDeficit = avail < line.quantity;
                const allocated = Number(line.allocatedQuantity || 0);
                const packed = Number(line.packedQuantity || 0);
                const shipped = Number(line.shippedQuantity || 0);
                const ordered = Number(line.quantity || 0);

                return (
                  <TableRow key={line.salesOrderLineId || idx} className="hover:bg-muted/20 border-b border-border/50">
                    <TableCell className="w-12 text-center font-medium text-muted-foreground text-xs px-3 py-3.5">
                      {idx + 1}
                    </TableCell>

                    <TableCell className="min-w-[280px] text-left px-4 py-3.5">
                      {canModify ? (
                        <div className="space-y-1.5 py-1">
                          <select
                            aria-label={`Product for line ${idx + 1}`}
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            value={line.productId}
                            onChange={(event) => updateProduct(idx, event.target.value)}
                          >
                            <option value="">Select a product</option>
                            {products.map((product: any) => (
                              <option key={product.id} value={product.id}>
                                {product.sku} · {product.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{line.sku}</span> · <span>UOM: {line.uom}</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-mono font-bold text-foreground text-xs">{line.sku}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{line.description}</div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {line.status && (
                          <Badge variant="outline" className="text-[10px] uppercase font-mono py-0">
                            {line.status.replace('_', ' ')}
                          </Badge>
                        )}
                        {hasStockDeficit ? (
                          <Badge
                            variant="destructive"
                            className="font-mono text-[10px] py-0"
                          >
                            Deficit: {line.quantity - avail} {line.uom}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                          >
                            Available: {avail} {line.uom}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Ordered Quantity Input */}
                    <TableCell className="w-28 text-right px-4 py-3.5">
                      {canModify ? (
                        <input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`Quantity for ${line.description}`}
                          className="w-20 text-right px-2 py-1 border border-border rounded-lg bg-background text-foreground font-mono text-xs font-bold focus:ring-1 focus:ring-primary focus:outline-none ml-auto"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLineField(idx, 'quantity', Math.max(1, Number(e.target.value) || 0))
                          }
                        />
                      ) : (
                        <span className="font-mono font-bold text-xs">{ordered} {line.uom}</span>
                      )}
                    </TableCell>

                    {/* Allocated */}
                    <TableCell className="w-24 text-right font-mono text-xs px-4 py-3.5">
                      <span
                        className={
                          allocated >= ordered
                            ? 'text-emerald-600 font-semibold'
                            : allocated > 0
                            ? 'text-amber-600 font-semibold'
                            : 'text-muted-foreground'
                        }
                      >
                        {allocated}
                      </span>
                    </TableCell>

                    {/* Packed */}
                    <TableCell className="w-24 text-right font-mono text-xs px-4 py-3.5">
                      <span
                        className={
                          packed >= ordered
                            ? 'text-emerald-600 font-semibold'
                            : packed > 0
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        }
                      >
                        {packed}
                      </span>
                    </TableCell>

                    {/* Shipped */}
                    <TableCell className="w-24 text-right font-mono text-xs px-4 py-3.5">
                      <span
                        className={
                          shipped >= ordered
                            ? 'text-emerald-600 font-semibold'
                            : shipped > 0
                            ? 'text-blue-600'
                            : 'text-muted-foreground'
                        }
                      >
                        {shipped}
                      </span>
                    </TableCell>

                    {/* Unit Price Input */}
                    <TableCell className="w-32 text-right px-4 py-3.5">
                      {canModify ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Unit price for ${line.description}`}
                          className="w-24 text-right px-2 py-1 border border-border rounded-lg bg-background text-foreground font-mono text-xs font-semibold focus:ring-1 focus:ring-primary focus:outline-none ml-auto"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLineField(idx, 'unitPrice', Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground font-medium">
                          {formatINR(line.unitPrice)}
                        </span>
                      )}
                    </TableCell>

                    {/* Discount Input */}
                    <TableCell className="w-28 text-right px-4 py-3.5">
                      {canModify ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Discount for ${line.description}`}
                          className="w-20 text-right px-2 py-1 border border-border rounded-lg bg-background text-amber-700 dark:text-amber-400 font-mono text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:outline-none ml-auto"
                          value={line.discountAmount}
                          onChange={(e) =>
                            updateLineField(idx, 'discountAmount', Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {Number(line.discountAmount || 0) > 0 ? formatINR(line.discountAmount) : '—'}
                        </span>
                      )}
                    </TableCell>

                    {/* Tax Rate & Computed Amount */}
                    <TableCell className="w-32 text-right px-4 py-3.5">
                      {canModify ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            aria-label={`GST Rate for ${line.description}`}
                            className="px-1.5 py-1 border border-border rounded-lg bg-background text-foreground font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                            value={String(line.taxRate)}
                            onChange={(e) =>
                              updateLineField(idx, 'taxRate', Number(e.target.value) || 0)
                            }
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatINR(line.taxAmount)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatINR(line.taxAmount)} <span className="text-[10px]">({line.taxRate}%)</span>
                        </span>
                      )}
                    </TableCell>

                    {/* Line Total */}
                    <TableCell className="w-36 text-right font-mono font-bold text-foreground text-xs px-4 py-3.5">
                      {formatINR(line.totalAmount)}
                    </TableCell>

                    {/* Delete action in edit mode */}
                    {canModify && (
                      <TableCell className="w-14 text-center px-2 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                          title="Remove Line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>

            {/* Table Footer */}
            <TableFooter>
              <TableRow className="border-t border-border bg-muted/20">
                <TableCell colSpan={9} className="text-right font-semibold text-muted-foreground text-xs px-4 py-3">
                  Net Taxable Subtotal ({lines.length} items, {totalQuantity} units):
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-foreground text-xs px-4 py-3">
                  {formatINR(subtotal)}
                </TableCell>
                {canModify && <TableCell className="w-14 px-2 py-3" />}
              </TableRow>
              {discountTotal > 0 && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={9} className="text-right font-semibold text-muted-foreground text-xs px-4 py-3">
                    Total Discounts:
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-emerald-600 text-xs px-4 py-3">
                    -{formatINR(discountTotal)}
                  </TableCell>
                  {canModify && <TableCell className="w-14 px-2 py-3" />}
                </TableRow>
              )}
              <TableRow className="bg-muted/20">
                <TableCell colSpan={9} className="text-right font-semibold text-muted-foreground text-xs px-4 py-3">
                  GST Tax Total (CGST + SGST / IGST):
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-foreground text-xs px-4 py-3">
                  {formatINR(taxTotal)}
                </TableCell>
                {canModify && <TableCell className="w-14 px-2 py-3" />}
              </TableRow>
              <TableRow className="bg-primary/5 text-sm sm:text-base border-t border-primary/20">
                <TableCell colSpan={9} className="text-right font-black text-foreground px-4 py-3.5">
                  Grand Total (Payable Value):
                </TableCell>
                <TableCell className="text-right font-mono font-black text-primary text-base sm:text-lg px-4 py-3.5">
                  {formatINR(grandTotal)}
                </TableCell>
                {canModify && <TableCell className="w-14 px-2 py-3.5" />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* Add Line Action in Edit Mode */}
        {canModify && (
          <div className="p-3 bg-muted/20 border-t border-border flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 text-xs font-bold border-dashed border-border hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Product Line</span>
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Total {lines.length} line items ready
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
