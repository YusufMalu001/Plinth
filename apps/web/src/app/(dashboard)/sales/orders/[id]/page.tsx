'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  FileCheck,
  FileText,
  GitBranch,
  Layers,
  Lock,
  MapPin,
  Package,
  Pencil,
  Printer,
  Receipt,
  Save,
  ShieldAlert,
  ShieldCheck,
  SplitSquareHorizontal,
  TrendingUp,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Badge, Button } from '@plinth/ui';
import { useReactToPrint } from 'react-to-print';
import { StatusBadge } from '../../../../../components/StatusBadge';
import { LoadingState } from '../../../../../components/LoadingState';
import { ErrorState } from '../../../../../components/ErrorState';
import { useCurrentUser } from '../../../../../features/auth/hooks';
import {
  useSalesOrder,
  useSalesOrderAction,
  useCustomerCreditExposure,
  useSalesCustomer,
  useSalesInventoryAvailability,
} from '../../../../../features/sales/hooks';
import { SalesInvoiceModal } from '../../../../../features/sales/components/SalesInvoiceModal';
import { EditSalesOrderModal } from '../../../../../features/sales/components/EditSalesOrderModal';
import { AdminCreditOverrideModal } from '../../../../../features/sales/components/AdminCreditOverrideModal';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { SalesProFormaDocument } from '../../../../../features/sales/components/SalesProFormaDocument';
import {
  SalesOrderCommercialsEditor,
  type CommercialEditorLine,
  type CommercialEditorTerms,
} from '../../../../../features/sales/components/SalesOrderCommercialsEditor';
import { ProFormaModal } from '../../../../../features/accounts/components/ProFormaModal';
import { ProFormaInvoice } from '../../../../../features/accounts/types';
import { salesApi } from '../../../../../features/sales/api';
import { showToast } from '@/components/toast-store';
import {
  formatINR,
  formatIndianDate,
  numberToIndianWords,
} from '../../../../../features/purchases/utils';

type ViewMode = 'split' | 'document' | 'fulfillment';

export default function SalesOrderDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const userRoleKey = (currentUser?.roleDefinition?.key || currentUser?.role || '').toLowerCase();
  const isOrderApprover = [
    'admin',
    'super_admin',
    'super-admin',
    'system_admin',
    'store_manager',
    'store-manager',
    'manager',
  ].includes(userRoleKey);

  const { data: order, isLoading, isError, refetch } = useSalesOrder(params.id);
  const action = useSalesOrderAction();

  // Customer, live credit exposure, and unified inventory
  const { data: customer } = useSalesCustomer(order?.customerId || undefined);
  const { data: creditExposure } = useCustomerCreditExposure(order?.customerId || undefined, order?.id);
  const { data: inventoryData } = useSalesInventoryAvailability();
  const inventoryItems = inventoryData?.items || [];

  const inventoryMap = useMemo(() => {
    const map = new Map<string, number>();
    inventoryItems.forEach((item: any) => {
      const pId = item.productId || item.itemId;
      if (pId) {
        map.set(pId, Number(item.availableQuantity ?? 0));
      }
    });
    return map;
  }, [inventoryItems]);

  // Inventory deficiency is checked against the single enterprise-wide balance.
  const deficientLines = useMemo(() => {
    if (!order?.lines) return [];
    return order.lines
      .map((l: any) => {
        const avail = inventoryMap.get(l.productId) ?? 0;
        const ordered = Number(l.orderedQuantity || 0);
        if (ordered > avail) {
          return {
            productId: l.productId,
            sku: l.sku,
            description: l.description,
            uom: l.uom || 'PCS',
            ordered,
            available: avail,
            deficit: ordered - avail,
          };
        }
        return null;
      })
      .filter(Boolean) as {
        productId: string;
        sku: string;
        description: string;
        uom: string;
        ordered: number;
        available: number;
        deficit: number;
      }[];
  }, [order?.lines, inventoryMap]);

  const hasShortages = deficientLines.length > 0;

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [adminOverrideModalOpen, setAdminOverrideModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [proFormaModalOpen, setProFormaModalOpen] = useState(false);
  const [isGeneratingProForma, setIsGeneratingProForma] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // View state & editor state
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveLines, setLiveLines] = useState<CommercialEditorLine[]>([]);
  const [liveTerms, setLiveTerms] = useState<CommercialEditorTerms | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: order ? `PROFORMA-${order.orderNumber}` : 'Proforma Invoice',
  });

  const rawProForma = (order as any)?.proFormaInvoice;
  const isTerminalStatus = ['CANCELLED', 'CLOSED', 'DISPATCHED', 'DELIVERED', 'RETURNED'].includes(
    order?.status || ''
  );

  // Auto-generate Pro Forma if missing on load
  useEffect(() => {
    if (order && !rawProForma && !isTerminalStatus && !isGeneratingProForma) {
      setIsGeneratingProForma(true);
      salesApi
        .generateProForma(order.id)
        .then(() => refetch())
        .catch((e) => console.warn('Auto pro forma generation notice:', e))
        .finally(() => setIsGeneratingProForma(false));
    }
  }, [order?.id, rawProForma, isTerminalStatus, isGeneratingProForma, refetch]);

  const isSalesRole = [
    'sales_executive',
    'sales-executive',
    'sales',
    'sales_representative',
    'sales-representative',
    'sales_agent',
    'sales_manager',
    'sales-manager',
  ].includes(userRoleKey);

  const isBeforeConfirmed = [
    'DRAFT',
    'IMPORTED',
    'VALIDATING',
    'VALIDATION_FAILED',
    'PENDING_APPROVAL',
    'ON_HOLD',
  ].includes(order?.status || '');

  // Sales Executive and Approvers can edit order details before confirmation
  const canEdit = (isOrderApprover || isSalesRole) && isBeforeConfirmed;
  const canConfirm =
    isOrderApprover &&
    ['DRAFT', 'VALIDATING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'IMPORTED'].includes(order?.status || '');
  const canCancel =
    isOrderApprover &&
    !['CANCELLED', 'CLOSED', 'DISPATCHED', 'DELIVERED', 'RETURNED'].includes(order?.status || '');

  // Automatically close edit mode if order status changes to confirmed or locked
  useEffect(() => {
    if (!canEdit && isEditing) {
      setIsEditing(false);
    }
  }, [canEdit, isEditing]);

  if (isLoading) {
    return (
      <div className="flex-1 p-8">
        <LoadingState message="Loading live sales order & commercial workspace..." />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex-1 p-8">
        <ErrorState
          title="Order not found"
          description="Could not load the requested sales order. It may have been removed or access is restricted."
          retry={() => void refetch()}
        />
      </div>
    );
  }

  const shipping = order.addresses?.find((a) => a.kind === 'SHIPPING');
  const billing = order.addresses?.find((a) => a.kind === 'BILLING') || shipping;

  const proFormaForEditor: ProFormaInvoice | null = rawProForma
    ? {
        id: rawProForma.id,
        entityId: rawProForma.entityId,
        proFormaNumber: rawProForma.proFormaNumber,
        issueDate: rawProForma.issueDate,
        validUntil: rawProForma.issueDate,
        customerName: rawProForma.customerName,
        customerGstin: rawProForma.customerGstin ?? undefined,
        placeOfSupply: '',
        salesOrderId: order.id,
        salesOrderNumber: order.orderNumber,
        status: rawProForma.status === 'LOCKED' ? 'SENT' : rawProForma.status,
        taxableAmount: String(Number(rawProForma.subtotal || 0) - Number(rawProForma.discountTotal || 0)),
        taxAmount: String(rawProForma.taxTotal),
        totalAmount: String(rawProForma.totalAmount),
        termsAndConditions: 'Temporary commercial bill. Editable until dispatch; not a tax invoice.',
        lines: (rawProForma.lines || []).map((line: any, index: number) => ({
          id: line.id,
          lineNumber: index + 1,
          description: line.description,
          hsnSacCode: '',
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          discountAmount: String(line.discountAmount || 0),
          gstRate: String(line.taxRate || 0),
          taxableAmount: String(line.taxableAmount),
          cgstAmount: '0',
          sgstAmount: '0',
          igstAmount: String(line.taxAmount || 0),
          totalAmount: String(line.totalAmount ?? Number(line.taxableAmount) + Number(line.taxAmount)),
          salesOrderLineId: line.salesOrderLineId,
        })),
      }
    : null;

  const approvedLimit = Number(creditExposure?.creditLimit ?? customer?.creditLimit ?? 0);
  const existingDues = Number(creditExposure?.creditUtilized ?? 0);
  const orderAmount = order.paymentStatus === 'PAID' ? 0 : Number(order.grandTotal || 0);
  const isCreditExceeded = approvedLimit > 0 && existingDues + orderAmount > approvedLimit;
  const isHoldRequired = isCreditExceeded || hasShortages;

  // Copy order number handler
  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    setCopied(true);
    showToast({
      kind: 'success',
      title: 'Copied',
      message: `Sales Order ${order.orderNumber} copied to clipboard.`,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Save commercial changes handler
  const handleSaveCommercials = async ({
    lines,
    terms,
  }: {
    lines: CommercialEditorLine[];
    terms: CommercialEditorTerms;
  }) => {
    if (!canEdit || !isBeforeConfirmed) {
      showToast({
        kind: 'error',
        title: 'Order is Confirmed',
        message: 'This sales order is confirmed and locked. Orders can only be updated before confirmation.',
      });
      return;
    }

    try {
      await salesApi.update(order.id, {
        notes: terms.notes,
        paymentTerms: terms.paymentTerms,
        customerPoNumber: terms.customerPoNumber,
        promisedAt: terms.promisedAt || undefined,
        salesRepresentative: terms.salesRepresentative || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          productVariantId: l.productVariantId || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRate: l.taxRate,
        })),
      });

      if (rawProForma) {
        try {
          await salesApi.updateProForma(
            order.id,
            lines.map((l) => ({
              salesOrderLineId: l.salesOrderLineId,
              unitPrice: String(l.unitPrice),
              discountAmount: String(l.discountAmount),
              taxRate: String(l.taxRate),
            }))
          );
        } catch (e) {
          console.warn('Pro-forma line sync notice:', e);
        }
      }

      await refetch();
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'pro-formas'] });
      await queryClient.invalidateQueries({ queryKey: ['sales', 'inventory-availability'] });
      setIsEditing(false);
      showToast({
        kind: 'success',
        title: 'Commercial Changes Saved',
        message: `Order lines, commercial terms and Pro Forma synced for ${order.orderNumber}.`,
      });
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Failed to Save Commercial Changes',
        message: err?.message || 'Could not update commercial values.',
      });
      throw err;
    }
  };

  // Financial Metrics (Real-time reactive to liveLines if currently editing)
  const activeLines = liveLines && liveLines.length > 0 ? liveLines : (order.lines || []);
  const subtotal = activeLines.reduce(
    (sum: number, line: any) =>
      sum + Number(line.quantity || line.orderedQuantity || 0) * Number(line.unitPrice || 0),
    0
  );
  const discountTotal = activeLines.reduce(
    (sum: number, line: any) => sum + Number(line.discountAmount || 0),
    0
  );
  const taxableSubtotal = Math.max(0, subtotal - discountTotal);
  const taxAmount = activeLines.reduce(
    (sum: number, line: any) =>
      sum +
      (line.taxAmount !== undefined
        ? Number(line.taxAmount)
        : (Math.max(0, Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.discountAmount || 0)) *
            Number(line.taxRate || 18)) /
          100),
    0
  );
  const grandTotal = taxableSubtotal + taxAmount;
  const totalItemsCount = activeLines.length;
  const totalQuantity = activeLines.reduce(
    (acc: number, l: any) => acc + Number(l.quantity || l.orderedQuantity || 0),
    0
  );

  return (
    <div className="flex-1 min-h-screen bg-background p-4 sm:p-6 md:p-8 overflow-y-auto">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Top Breadcrumbs & Mode Bar */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Link href="/sales" className="hover:text-foreground transition-colors">
                Sales Control Center
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <Link href="/sales/orders" className="hover:text-foreground transition-colors">
                Sales Orders
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                {order.orderNumber}
                <button
                  type="button"
                  onClick={handleCopyOrderNumber}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  title="Copy Order Number"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </span>
            </nav>

            {/* View Mode Toggle Controls (Matches PO Details style) */}
            <div className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'split'
                    ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                <span>Order Items &amp; Commercials</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('document')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'document'
                    ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Official Pro Forma</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('fulfillment')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'fulfillment'
                    ? 'bg-card text-foreground shadow-2xs font-bold border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>Fulfillment &amp; Audit</span>
              </button>
            </div>
          </div>

          {/* Clean Executive Header Card (Matches PO & Supplier Bill Details) */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                      <FileCheck className="h-5 w-5" />
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
                      {order.orderNumber}
                    </h1>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                    <Layers className="h-3 w-3" />
                    {order.channel?.replace('_', ' ') || 'DIRECT'}
                  </span>

                  <StatusBadge status={order.status as any} className="text-xs px-3 py-1 font-bold shadow-2xs" />

                  {order.paymentStatus && (
                    <Badge variant={order.paymentStatus === 'PAID' ? 'default' : 'outline'} className="text-xs font-mono uppercase">
                      Payment: {order.paymentStatus}
                    </Badge>
                  )}
                </div>

                {/* Sub-Header Metadata Details */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-medium">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-foreground">
                      {customer?.name || (order as any).customer?.name || billing?.name || 'Customer Organization'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span>
                      Dated: <strong className="text-foreground">{formatIndianDate(order.orderedAt)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span>
                      Destination:{' '}
                      <strong className="text-foreground">
                        {shipping?.city ? `${shipping.city}, ${shipping.state}` : 'Indore Hub'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                    <span>
                      Terms:{' '}
                      <strong className="text-foreground">
                        {(order as any).paymentTerms || liveTerms?.paymentTerms || 'Net 30 Days'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5">
                {order.status === 'ON_HOLD' && isOrderApprover && (
                  <Button
                    size="sm"
                    onClick={() => setAdminOverrideModalOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-2xs"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Executive Override</span>
                  </Button>
                )}

                {canConfirm && (!isHoldRequired || isOrderApprover) && (
                  <Button
                    size="sm"
                    onClick={() => action.mutate({ id: order.id, action: 'confirm' })}
                    disabled={action.isPending}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{action.isPending ? 'Confirming...' : 'Confirm Order'}</span>
                  </Button>
                )}

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePrint()}
                  className="inline-flex items-center gap-1.5 bg-primary hover:bg-amber-600 text-white font-bold shadow-2xs cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Pro Forma</span>
                </Button>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      className="font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        handleSaveCommercials({
                          lines: liveLines.length > 0 ? liveLines : (order.lines as any),
                          terms: liveTerms || {
                            paymentTerms: (order as any).paymentTerms || 'Net 30 Days',
                            customerPoNumber: (order as any).customerPoNumber || '',
                            promisedAt: order.promisedAt || '',
                            notes: order.notes || '',
                          },
                        })
                      }
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-2xs"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Save Changes</span>
                    </Button>
                  </div>
                ) : (
                  canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                      <span>Edit Commercials</span>
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvoiceModalOpen(true)}
                  className="inline-flex items-center gap-1.5 font-semibold border-border hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>Order Documents</span>
                </Button>

                {!isBeforeConfirmed && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground border border-border">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Order Confirmed (Locked)</span>
                  </span>
                )}

                {order.status !== 'DRAFT' && order.status !== 'CANCELLED' && (
                  <Link
                    href="/accounts/sales"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-n-50 text-n-700 hover:bg-n-100 dark:bg-n-950/40 dark:text-n-300 border border-n-200 dark:border-n-900/50 transition-colors"
                  >
                    <Receipt className="h-3.5 w-3.5 text-n-600" />
                    <span>Accounts Tax Invoice</span>
                  </Link>
                )}

                {canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={action.isPending}
                    className="inline-flex items-center gap-1.5 font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                    title="Cancel Order"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Quick 4-Stat Metric Strip (PO & Supplier Bill pattern) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Net Taxable Subtotal</span>
                <Package className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {formatINR(taxableSubtotal)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                {totalItemsCount} line items · {totalQuantity.toLocaleString('en-IN')} units
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>GST Tax Value</span>
                <CreditCard className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {formatINR(taxAmount)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                CGST + SGST (23-MP) or IGST
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Total Order Value</span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-1 font-mono text-2xl font-black text-foreground">
                {formatINR(grandTotal)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground font-semibold truncate">
                {numberToIndianWords(grandTotal)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Fulfillment &amp; Credit</span>
                <Truck className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {order.status === 'DELIVERED'
                  ? '100% Delivered'
                  : order.status === 'DISPATCHED'
                  ? 'In Transit'
                  : hasShortages
                  ? 'Stock Shortage'
                  : 'Fulfillment Ready'}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                {approvedLimit > 0
                  ? `Credit Limit: ${formatINR(approvedLimit)}`
                  : 'Target Delivery: In Progress'}
              </div>
            </div>
          </div>
        </div>

        {/* Hold Queue Banner if on hold */}
        {order.status === 'ON_HOLD' && (
          <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">
                      Order is in the Executive Hold Queue
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase font-bold text-amber-600 border-amber-500/40">
                      ON_HOLD
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This order is held pending review. <strong className="text-foreground">Fulfillment, stock allocation, and dispatch remain locked</strong> until inventory is replenished or executive clearance is granted.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isOrderApprover ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setAdminOverrideModalOpen(true)}
                      className="font-bold flex items-center gap-1.5 bg-primary text-white shadow-2xs"
                    >
                      <TrendingUp className="h-4 w-4" />
                      Executive Override
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        className="font-semibold flex items-center gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5 text-primary" />
                        Edit Quantities
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Awaiting Executive Admin Approval
                  </div>
                )}
              </div>
            </div>

            {hasShortages && (
              <div className="pt-2 border-t border-border/60 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-foreground" /> Store Inventory Shortages
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {deficientLines.map((d, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-muted/30 border border-border/60 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-foreground block">{d.sku || d.description}</span>
                        <span className="text-[11px] text-muted-foreground">Store Stock: {d.available} {d.uom}</span>
                      </div>
                      <Badge variant="outline" className="font-mono text-[11px] font-bold text-destructive border-destructive/40">
                        Deficit: {d.deficit} {d.uom}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Mode 1: Full-Width Order Items & Commercials with Pro Forma Document at bottom */}
        {viewMode === 'split' && (
          <div className="space-y-8">
            {/* Full-width Operational Commercials Editor & Items Table */}
            <SalesOrderCommercialsEditor
              order={order}
              proForma={rawProForma}
              customer={customer}
              creditExposure={creditExposure}
              inventoryMap={inventoryMap}
              canEdit={canEdit}
              isEditing={isEditing}
              onEditingChange={setIsEditing}
              onLiveChange={(lines, terms) => {
                setLiveLines(lines);
                setLiveTerms(terms);
              }}
              onSave={handleSaveCommercials}
              onCancel={() => setIsEditing(false)}
            />

            {/* Official Statutory Pro Forma Document rendered at the end of the page */}
            <div className="pt-4 border-t border-border/80">

              {/* Printable Document Box */}
              <div className="rounded-2xl border border-border bg-muted/10 p-4 sm:p-6 shadow-2xs flex justify-center">
                <div className="w-full max-w-5xl">
                  <SalesProFormaDocument
                    ref={printRef}
                    order={order}
                    proForma={rawProForma}
                    canEdit={canEdit}
                    liveLines={liveLines}
                    liveTerms={liveTerms || undefined}
                    onPrint={() => handlePrint()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 2: Official Pro Forma Document Full-Width */}
        {viewMode === 'document' && (
          <div className="max-w-4xl mx-auto flex justify-center">
            <SalesProFormaDocument
              ref={printRef}
              order={order}
              proForma={rawProForma}
              canEdit={canEdit}
              liveLines={liveLines}
              liveTerms={liveTerms || undefined}
              onPrint={() => handlePrint()}
            />
          </div>
        )}

        {/* View Mode 3: Fulfillment & Audit Trail */}
        {viewMode === 'fulfillment' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-primary" /> Fulfillment &amp; Logistics Execution
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Picking, carton packing, barcode scanning, and carrier dispatch are orchestrated via the Logistics Hub.
                </p>
              </div>
              <Link href="/dispatch">
                <Button variant="outline" size="sm" icon={Truck} className="font-semibold">
                  Open Logistics &amp; Dispatch
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Shipping Details */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Shipping Destination Address
                </h4>
                <div className="text-xs space-y-1.5 leading-relaxed text-muted-foreground">
                  <div className="font-bold text-foreground text-sm">{shipping?.name || 'Customer'}</div>
                  <div>{shipping?.line1}</div>
                  {shipping?.line2 && <div>{shipping?.line2}</div>}
                  <div>
                    {shipping?.city}, {shipping?.state} - {shipping?.postalCode}
                  </div>
                  <div>{shipping?.country || 'India'}</div>
                  {shipping?.phone && (
                    <div className="pt-2 text-foreground flex items-center gap-1.5 font-medium">
                      <User className="h-3 w-3 text-primary" /> Contact Phone: {shipping.phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Billing Details */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Statutory Billing Address
                </h4>
                <div className="text-xs space-y-1.5 leading-relaxed text-muted-foreground">
                  <div className="font-bold text-foreground text-sm">{billing?.name || 'Customer'}</div>
                  <div>{billing?.line1}</div>
                  {billing?.line2 && <div>{billing?.line2}</div>}
                  <div>
                    {billing?.city}, {billing?.state} - {billing?.postalCode}
                  </div>
                  <div>{billing?.country || 'India'}</div>
                  {billing?.taxNumber && (
                    <div className="pt-2 text-foreground font-mono font-bold text-xs">
                      GSTIN/UIN: {billing.taxNumber}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fulfillment Packages */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" /> Dispatched Packages &amp; Shipments
                </h4>
                <span className="text-xs font-mono text-muted-foreground">
                  {order.fulfillments?.length || 0} fulfillments recorded
                </span>
              </div>

              {(!order.fulfillments || order.fulfillments.length === 0) ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No fulfillment package has been released yet. Packages will be generated upon order confirmation.
                </div>
              ) : (
                <div className="space-y-4">
                  {order.fulfillments.map((fulfillment) => (
                    <div key={fulfillment.id} className="rounded-xl border border-border bg-muted/20 p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-bold text-primary">{fulfillment.fulfillmentNumber}</p>
                        </div>
                        <Badge variant="outline">{fulfillment.status.replaceAll('_', ' ')}</Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-background p-3">
                          <p className="text-muted-foreground">Pick lists</p>
                          <p className="mt-1 font-mono text-lg font-black">{fulfillment.pickLists.length}</p>
                        </div>
                        <div className="rounded-lg bg-background p-3">
                          <p className="text-muted-foreground">Packages</p>
                          <p className="mt-1 font-mono text-lg font-black">{fulfillment.packages.length}</p>
                        </div>
                        <div className="rounded-lg bg-background p-3">
                          <p className="text-muted-foreground">Shipments</p>
                          <p className="mt-1 font-mono text-lg font-black">{fulfillment.shipments.length}</p>
                        </div>
                        <div className="rounded-lg bg-background p-3">
                          <p className="text-muted-foreground">Latest state</p>
                          <p className="mt-1 font-bold">{fulfillment.shipments[0]?.status.replaceAll('_', ' ') || 'Not shipped'}</p>
                        </div>
                      </div>
                      {fulfillment.shipments.map((shipment) => (
                        <div
                          key={shipment.id}
                          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                        >
                          <div>
                            <p className="font-mono font-bold">{shipment.shipmentNumber}</p>
                            <p className="text-muted-foreground">
                              {shipment.carrier?.name || 'Manual carrier'} · {shipment.awbNumber || 'AWB pending'}
                            </p>
                          </div>
                          <Link href={`/dispatch/shipments/${shipment.id}`} className="font-bold text-primary hover:underline">
                            Open shipment
                          </Link>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit History & Timeline */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border pb-3">
                <Clock className="h-4 w-4 text-primary" /> Lifecycle Audit History &amp; Event Trail
              </h4>

              {(!order.statusHistory || order.statusHistory.length === 0) ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No status transition history recorded yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {order.statusHistory.map((item) => (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary" />
                      <div className="font-semibold text-xs text-foreground">
                        {item.toStatus.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {new Date(item.createdAt).toLocaleString('en-IN')} · Actor: {item.actorId}
                      </div>
                      {item.reason && (
                        <div className="mt-1.5 rounded-lg bg-muted/40 p-2 text-xs text-foreground/90 font-medium">
                          {item.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      <EditSalesOrderModal
        order={order}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => void refetch()}
      />

      <AdminCreditOverrideModal
        order={order}
        customer={customer}
        creditExposure={creditExposure}
        isOpen={adminOverrideModalOpen}
        onClose={() => setAdminOverrideModalOpen(false)}
        onSuccess={() => void refetch()}
      />

      <SalesInvoiceModal
        order={order}
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
      />

      {proFormaModalOpen && proFormaForEditor && (
        <ProFormaModal
          isOpen={proFormaModalOpen}
          onClose={() => setProFormaModalOpen(false)}
          entityId={rawProForma.entityId}
          viewProForma={proFormaForEditor}
          onSaveProForma={async (_id, lines) => {
            await salesApi.updateProForma(order.id, lines);
            await refetch();
            await queryClient.invalidateQueries({ queryKey: ['accounts', 'pro-formas'] });
          }}
        />
      )}

      {/* Cancel Order Dialog */}
      <ConfirmDeleteDialog
        open={cancelDialogOpen}
        title="Cancel Sales Order"
        message={`Are you sure you want to cancel order "${order.orderNumber}"? Any commercial reservation or booking will be terminated.`}
        isDeleting={action.isPending}
        confirmText="Cancel Order"
        loadingText="Cancelling…"
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={() => {
          action.mutate(
            {
              id: order.id,
              action: 'cancel',
              reason: 'Cancelled by user from sales order workspace',
            },
            {
              onSuccess: () => setCancelDialogOpen(false),
            }
          );
        }}
      />
    </div>
  );
}
