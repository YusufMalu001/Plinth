'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState, useEffect, useMemo } from 'react';
import { effectiveTierPrice } from '../../products/utils/tierPricing';
import {
  AlertTriangle,
  BellRing,
  Calendar,
  Check,
  CreditCard,
  FileText,
  Hash,
  Loader2,
  MapPin,
  Package,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { useUpdateSalesOrder, useNotifyStockShortage, useSalesCustomers } from '../hooks';
import { SalesOrder, UpdateSalesOrderInput, Customer } from '../types';
import { FormInput, FormSelect, TableNumericInput, PhoneInput } from './FormControls';
import {
  STATE_OPTIONS,
  getCitiesForState,
  getCityOptionsForState,
} from '../data/indianStatesAndCities';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { useProducts } from '@/hooks/useMasterData';
import { useSalesInventoryAvailability } from '../hooks';
import { formatErrorMessage } from '../utils/error';

interface EditLineItem {
  id?: string;
  productId: string;
  sku: string;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
}

interface EditSalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder;
  onSuccess?: () => void;
}

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

export function EditSalesOrderModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: EditSalesOrderModalProps) {
  const updateOrder = useUpdateSalesOrder();
  const notifyShortage = useNotifyStockShortage();

  const { data: productsData, isLoading: isLoadingProducts } = useProducts('ACTIVE', 1, 1000);
  const { data: customersData } = useSalesCustomers({ limit: 1000 });
  const { data: inventoryData, isLoading: isLoadingInventory } = useSalesInventoryAvailability();

  const products = Array.isArray(productsData) ? productsData : productsData?.items || [];
  const customers = customersData?.items || [];
  const inventoryItems = inventoryData?.items || [];

  const orderCustomer = useMemo(() => {
    if (!order?.customerId) return null;
    return customers.find((c: Customer) => c.id === order.customerId) || null;
  }, [order?.customerId, customers]);

  // Real-time Inventory Map for rapid lookup (Single Enterprise Source of Truth)
  const inventoryMap = useMemo(() => {
    const map = new Map<string, { availableQuantity: number; onHandQuantity: number; reservedQuantity: number }>();
    inventoryItems.forEach((item: any) => {
      const pId = item.productId || item.itemId;
      if (pId) {
        map.set(pId, {
          availableQuantity: Number(item.availableQuantity ?? 0),
          onHandQuantity: Number(item.onHandQuantity ?? 0),
          reservedQuantity: Number(item.reservedQuantity ?? 0),
        });
      }
    });

    // Single source of truth consistency: cross-reference product catalog opening stock
    products.forEach((p: any) => {
      if (!p?.id) return;
      const existing = map.get(p.id);
      if (!existing || (existing.availableQuantity === 0 && existing.onHandQuantity === 0)) {
        const meta = (p.metadata || {}) as any;
        const initialStock = Number(
          p.openingStock ??
          meta.initialQuantity ??
          meta.openingStock ??
          p.initialQuantity ??
          0
        );
        if (initialStock > 0) {
          map.set(p.id, {
            availableQuantity: initialStock,
            onHandQuantity: initialStock,
            reservedQuantity: 0,
          });
        }
      }
    });

    return map;
  }, [inventoryItems, products]);

  // Helper to extract commercial pricing details with Customer Tier resolution
  const getProductPricing = (prod: any) => {
    if (!prod) return { sellingPrice: 0, gstRate: 0.18, tierName: 'Standard' };
    const meta = (prod.metadata || {}) as Record<string, any>;
    const rawGst = meta.gstRate ?? 18;
    const gstRate = Number(rawGst) > 1 ? Number(rawGst) / 100 : Number(rawGst) || 0.18;
    const tierPricing = Array.isArray(meta.tierPricing) ? meta.tierPricing : [];

    const customerType = orderCustomer?.customerType ? String(orderCustomer.customerType).toUpperCase() : undefined;
    const priceTier = orderCustomer?.priceTier ? String(orderCustomer.priceTier).toUpperCase() : undefined;

    if (tierPricing.length > 0 && (priceTier || customerType)) {
      const matchedTier = tierPricing.find((t: any) => {
        const tName = String(t.tierName || t.tierId || '').toUpperCase();
        return tName === priceTier || tName === customerType || t.tierId === priceTier || t.tierId === customerType;
      });
      if (matchedTier) {
        const tierPrice = effectiveTierPrice(matchedTier);
        if (tierPrice > 0) {
          return { sellingPrice: tierPrice, gstRate, tierName: matchedTier.tierName || matchedTier.tierId };
        }
      }
    }

    if (customerType === 'DISTRIBUTOR' && meta.distributorPrice) {
      return { sellingPrice: Number(meta.distributorPrice), gstRate, tierName: 'Distributor Master' };
    }
    if ((customerType === 'DEALER' || customerType === 'WHOLESALE') && meta.wholesalePrice) {
      return { sellingPrice: Number(meta.wholesalePrice), gstRate, tierName: 'Dealer / Wholesale Master' };
    }

    const rawPrice =
      meta.baseNetPrice ??
      meta.sellingPrice ??
      prod.sellingPrice ??
      meta.distributorPrice ??
      meta.wholesalePrice ??
      meta.mrp ??
      prod.standardCost ??
      meta.costPrice ??
      0;

    return { sellingPrice: Math.max(0, Number(rawPrice) || 0), gstRate, tierName: meta.pricingMasterName || 'Standard' };
  };

  // Product selector options formatted for SearchableSelector with stock
  const productOptions = useMemo(() => {
    return products.map((p: any) => {
      const inv = inventoryMap.get(p.id);
      const avail = inv ? inv.availableQuantity : 0;
      const { sellingPrice, tierName } = getProductPricing(p);
      const stockBadge = inv
        ? avail > 0
          ? `⚡ ${avail} in stock`
          : '⚠️ Out of Stock (0)'
        : 'Stock: 0';
      return {
        id: p.id,
        name: `${p.sku} · ${p.name}`,
        code: p.sku,
        sku: p.sku,
        subText: `${p.uom?.code || p.uomId || 'PCS'} • ${tierName}: ₹${sellingPrice.toLocaleString('en-IN')} • ${stockBadge}`,
      };
    });
  }, [products, inventoryMap, orderCustomer]);

  // Form states
  const [notifiedLines, setNotifiedLines] = useState<Record<number, boolean>>({});
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [customerPoDate, setCustomerPoDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('NET_30');
  const [salesRepresentative, setSalesRepresentative] = useState('');
  const [carrier, setCarrier] = useState('');
  const [dispatchInstructions, setDispatchInstructions] = useState('');
  const [notes, setNotes] = useState('');

  // Address states
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPostalCode, setShippingPostalCode] = useState('');
  const [shippingContactPerson, setShippingContactPerson] = useState('');
  const [shippingContactPhone, setShippingContactPhone] = useState('');

  const [sameAsShipping, setSameAsShipping] = useState(false);
  const [billingLine1, setBillingLine1] = useState('');
  const [billingLine2, setBillingLine2] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingContactPerson, setBillingContactPerson] = useState('');
  const [billingContactPhone, setBillingContactPhone] = useState('');

  // Lines state
  const [lines, setLines] = useState<EditLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state from order prop when modal opens or order changes
  useEffect(() => {
    if (!isOpen || !order) return;

    setCustomerPoNumber(order.externalOrderId || (order as any).customerPoNumber || '');
    setCustomerPoDate((order as any).customerPoDate || '');
    setPaymentTerms((order as any).paymentTerms || 'NET_30');
    setSalesRepresentative((order as any).salesRepresentative || '');
    setCarrier((order as any).shippingCarrier || (order as any).carrier || '');
    setDispatchInstructions(
      (order as any).deliveryInstructions || (order as any).dispatchInstructions || ''
    );
    setNotes(order.notes || '');

    const shipping = order.addresses?.find((a) => a.kind === 'SHIPPING');
    const billing = order.addresses?.find((a) => a.kind === 'BILLING');

    if (shipping) {
      setShippingLine1(shipping.line1 || '');
      setShippingLine2(shipping.line2 || '');
      setShippingCity(shipping.city || '');
      setShippingState(shipping.state || '');
      setShippingPostalCode(shipping.postalCode || '');
      setShippingContactPerson(shipping.name || '');
      setShippingContactPhone(shipping.phone || '');
    }

    if (billing) {
      setBillingLine1(billing.line1 || '');
      setBillingLine2(billing.line2 || '');
      setBillingCity(billing.city || '');
      setBillingState(billing.state || '');
      setBillingPostalCode(billing.postalCode || '');
      setBillingContactPerson(billing.name || '');
      setBillingContactPhone(billing.phone || '');
    }

    if (order.lines && order.lines.length > 0) {
      setLines(
        order.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          sku: l.sku,
          description: l.description,
          uom: (l as any).uom || 'EA',
          quantity: Number(l.orderedQuantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          discountAmount: Number(l.discountAmount) || 0,
          taxRate: Number(l.taxRate) ?? 0.18,
        }))
      );
    } else {
      setLines([]);
    }

    setError(null);
  }, [isOpen, order]);

  // Cascading City Options
  const shippingCityOptions = useMemo(() => getCityOptionsForState(shippingState), [shippingState]);
  const billingCityOptions = useMemo(() => getCityOptionsForState(billingState), [billingState]);

  const handleShippingStateChange = (selectedState: string) => {
    setShippingState(selectedState);
    const validCities = getCitiesForState(selectedState);
    if (shippingCity && !validCities.includes(shippingCity)) {
      setShippingCity('');
    }
  };

  const handleBillingStateChange = (selectedState: string) => {
    setBillingState(selectedState);
    const validCities = getCitiesForState(selectedState);
    if (billingCity && !validCities.includes(billingCity)) {
      setBillingCity('');
    }
  };

  // Line item manipulation
  const addLineItem = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: '',
        sku: '',
        description: '',
        uom: 'EA',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        taxRate: 0.18,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineProduct = (index: number, productId: string) => {
    const product = products.find((p: any) => p.id === productId);
    if (!product) return;

    const { sellingPrice, gstRate } = getProductPricing(product);

    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return {
          ...line,
          productId: product.id,
          sku: product.sku,
          description: product.name,
          uom: (product as any).uom?.code || (product as any).uom || 'PCS',
          unitPrice: sellingPrice,
          taxRate: gstRate,
        };
      })
    );
  };

  const updateLineField = <K extends keyof EditLineItem>(
    index: number,
    field: K,
    val: EditLineItem[K]
  ) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        return { ...line, [field]: val };
      })
    );
  };

  // Financial calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    lines.forEach((l) => {
      const lineNetBeforeDiscount = Number(l.quantity || 0) * Number(l.unitPrice || 0);
      const lineDiscount = Number(l.discountAmount || 0);
      const lineTaxable = Math.max(0, lineNetBeforeDiscount - lineDiscount);
      const lineTax = lineTaxable * Number(l.taxRate || 0.18);

      subtotal += lineNetBeforeDiscount;
      totalDiscount += lineDiscount;
      totalTax += lineTax;
    });

    const grandTotal = subtotal - totalDiscount + totalTax;

    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal,
    };
  }, [lines]);

  const handleSave = async () => {
    if (lines.length === 0) {
      setError('At least one order line item is required.');
      return;
    }

    const invalidLine = lines.find((l) => !l.productId || l.quantity <= 0);
    if (invalidLine) {
      setError('Please select a valid product and positive quantity for all line items.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const updateInput: UpdateSalesOrderInput = {
      customerPoNumber: customerPoNumber.trim() || undefined,
      customerPoDate: customerPoDate || undefined,
      paymentTerms: paymentTerms || undefined,
      salesRepresentative: salesRepresentative.trim() || undefined,
      shippingCarrier: carrier.trim() || undefined,
      deliveryInstructions: dispatchInstructions.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: lines.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discountAmount: Number(l.discountAmount) || 0,
        taxRate: Number(l.taxRate) ?? 0.18,
      })),
      shippingAddress: {
        name: shippingContactPerson.trim() || undefined,
        phone: shippingContactPhone.trim() || undefined,
        line1: shippingLine1.trim(),
        line2: shippingLine2.trim() || undefined,
        city: shippingCity.trim(),
        state: shippingState.trim(),
        postalCode: shippingPostalCode.trim(),
        country: 'IN',
      },
      billingAddress: {
        name:
          (sameAsShipping ? shippingContactPerson.trim() : billingContactPerson.trim()) ||
          undefined,
        phone:
          (sameAsShipping ? shippingContactPhone.trim() : billingContactPhone.trim()) ||
          undefined,
        line1: sameAsShipping ? shippingLine1.trim() : billingLine1.trim(),
        line2: (sameAsShipping ? shippingLine2.trim() : billingLine2.trim()) || undefined,
        city: sameAsShipping ? shippingCity.trim() : billingCity.trim(),
        state: sameAsShipping ? shippingState.trim() : billingState.trim(),
        postalCode: sameAsShipping ? shippingPostalCode.trim() : billingPostalCode.trim(),
        country: 'IN',
      },
    };

    try {
      await updateOrder.mutateAsync({ id: order.id, input: updateInput });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      const formattedErr = formatErrorMessage(
        err,
        'Failed to update sales order. Please verify input data.'
      );
      setError(formattedErr);
      if (typeof document !== 'undefined') {
        const dialogEl = document.querySelector('.overflow-y-auto');
        if (dialogEl) dialogEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNotifyShortage = (idx: number, line: EditLineItem) => {
    const prod = products.find((p: any) => p.id === line.productId);
    const inv = inventoryMap.get(line.productId);
    const available = inv ? inv.availableQuantity : 0;
    const shortage = Math.max(0, line.quantity - available);

    notifyShortage.mutate(
      {
        productId: line.productId,
        productName: prod ? `${prod.name} (${prod.sku})` : line.description || 'Product',
        requestedQuantity: line.quantity,
        availableQuantity: available,
        shortageQuantity: shortage,
        customerId: order.customerId || undefined,
        customerName: (order as any).customer?.name,
        salesOrderId: order.id,
        salesOrderNumber: order.orderNumber,
        notes: `Sales requisition generated during order edit for SO #${order.orderNumber}.`,
      },
      {
        onSuccess: () => {
          setNotifiedLines((prev) => ({ ...prev, [idx]: true }));
        },
      }
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Edit Sales Order · ${order.orderNumber}`}
      description="Update commercial purchase details, order line items, pricing, and destination addresses."
      className="max-w-5xl max-h-[92vh] overflow-y-auto"
    >
      {error && (
        <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-xs pt-1 pb-2 -mt-1 mb-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive font-medium flex items-center justify-between gap-3 shadow-none">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-semibold text-destructive/80 hover:text-destructive underline cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6 pt-2">
        {/* Section 1: Commercial & PO References */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" /> Commercial Reference & Terms
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <FormInput
              label="Customer PO Number"
              icon={Hash}
              value={customerPoNumber}
              onChange={(e) => setCustomerPoNumber(e.target.value)}
              placeholder="e.g. PO-2026-9812"
            />
            <FormInput
              label="Customer PO Date"
              type="date"
              icon={Calendar}
              value={customerPoDate}
              onChange={(e) => setCustomerPoDate(e.target.value)}
            />
            <FormSelect
              label="Payment Terms"
              icon={CreditCard}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            >
              <option value="IMMEDIATE">Immediate / Advance</option>
              <option value="NET_15">Net 15 Days</option>
              <option value="NET_30">Net 30 Days</option>
              <option value="NET_45">Net 45 Days</option>
              <option value="NET_60">Net 60 Days</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </FormSelect>
            <FormInput
              label="Sales Representative"
              icon={User}
              value={salesRepresentative}
              onChange={(e) => setSalesRepresentative(e.target.value)}
              placeholder="e.g. Rahul Sharma"
            />
          </div>
        </div>

        {/* Section 2: Order Line Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" /> Line Items ({lines.length})
            </h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={addLineItem}
              className="text-xs"
            >
              Add Item
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Product / SKU</TableHead>
                <TableHead className="w-28 text-center">Store Stock</TableHead>
                <TableHead className="w-16 text-center">UOM</TableHead>
                <TableHead className="w-24 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Unit Price (₹)</TableHead>
                <TableHead className="w-24 text-right">Discount (₹)</TableHead>
                <TableHead className="w-28 text-right">Net Amount</TableHead>
                <TableHead className="w-10 text-center"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No line items added. Click &quot;Add Item&quot; to configure products for
                    this order.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line, idx) => {
                  const netBeforeDiscount =
                    Number(line.quantity || 0) * Number(line.unitPrice || 0);
                  const discount = Number(line.discountAmount || 0);
                  const lineTaxable = Math.max(0, netBeforeDiscount - discount);
                  const lineTax = lineTaxable * Number(line.taxRate || 0.18);
                  const lineTotal = lineTaxable + lineTax;

                  const inv = inventoryMap.get(line.productId);
                  const availableStock = inv ? inv.availableQuantity : 0;
                  const hasShortage = Boolean(line.productId && line.quantity > availableStock);
                  const shortageQty = hasShortage ? line.quantity - availableStock : 0;
                  const isNotified = notifiedLines[idx] || false;

                  return (
                    <React.Fragment key={idx}>
                      <TableRow className={`hover:bg-muted/20 transition-colors ${hasShortage ? 'bg-rose-500/[0.02]' : ''}`}>
                        <TableCell className="py-2 px-3">
                          <SearchableSelector
                            options={productOptions}
                            value={line.productId}
                            onChange={(newId) => updateLineProduct(idx, newId)}
                            placeholder="Select product SKU..."
                            isLoading={isLoadingProducts || isLoadingInventory}
                            className="w-full"
                          />
                        </TableCell>
                        <TableCell className="py-2 px-2 text-center">
                          {line.productId ? (
                            availableStock > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border whitespace-nowrap">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                {availableStock} {line.uom || 'EA'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border whitespace-nowrap">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                                0 {line.uom || 'EA'}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground/40 font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-center">
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-muted text-muted-foreground font-mono">
                            {line.uom || 'EA'}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right">
                          <TableNumericInput
                            type="number"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLineField(idx, 'quantity', Number(e.target.value))
                            }
                            min={1}
                            step={1}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right">
                          <TableNumericInput
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLineField(idx, 'unitPrice', Number(e.target.value))
                            }
                            min={0}
                            step={0.01}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right">
                          <TableNumericInput
                            type="number"
                            value={line.discountAmount}
                            onChange={(e) =>
                              updateLineField(idx, 'discountAmount', Number(e.target.value))
                            }
                            min={0}
                            step={1}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right font-medium text-foreground">
                          {formatCurrency(lineTotal)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            className="text-muted-foreground/60 hover:text-destructive p-1 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>

                          {hasShortage && (
                            <tr className="bg-muted/20 border-b border-border/70">
                              <td colSpan={8} className="p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-card border border-border/80 text-xs">
                                  <div className="flex items-center gap-2.5">
                                    <div className="h-7 w-7 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                                      <AlertTriangle className="h-3.5 w-3.5 text-foreground" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-foreground">Stock Shortage</span>
                                        <Badge variant="outline" className="text-[10px] font-mono">
                                          Deficit: {shortageQty} {line.uom || 'EA'}
                                        </Badge>
                                      </div>
                                      <p className="text-muted-foreground text-[11px]">
                                        Requested <strong>{line.quantity}</strong>, available store stock is <strong>{availableStock}</strong>.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isNotified || notifyShortage.isPending}
                                      onClick={() => handleNotifyShortage(idx, line)}
                                      className="h-7 text-xs font-semibold"
                                    >
                                      {notifyShortage.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                      ) : isNotified ? (
                                        <Check className="h-3.5 w-3.5 mr-1 text-foreground" />
                                      ) : (
                                        <BellRing className="h-3.5 w-3.5 mr-1" />
                                      )}
                                      {isNotified ? 'Admin Notified ✓' : 'Notify Store & Admin'}
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>

            {/* Live Financial Totals Footer */}
            <div className="bg-muted/30 border-t border-border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="text-xs text-muted-foreground">
                All prices include Standard GST (18%). Order amounts will be recalculated on save.
              </div>
              <div className="flex items-center gap-6 self-end sm:self-auto text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Subtotal</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Discount</span>
                    <span className="font-semibold text-emerald-600">
                      -{formatCurrency(totals.totalDiscount)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground block">Estimated GST (18%)</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(totals.totalTax)}
                  </span>
                </div>
                <div className="border-l border-border pl-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary block">
                    Grand Total
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {formatCurrency(totals.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
        </div>

        {/* Section 3: Addresses */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" /> Delivery & Invoicing Addresses
          </h4>

          {/* Shipping Address */}
          <div className="rounded-xl border border-border/80 p-4 bg-card space-y-3 shadow-none">
            <div className="text-xs font-bold uppercase text-foreground">Shipping Destination</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <FormInput
                  label="Address Line 1 *"
                  value={shippingLine1}
                  onChange={(e) => setShippingLine1(e.target.value)}
                  placeholder="Street address, unit, building"
                />
              </div>
              <FormInput
                label="Address Line 2"
                value={shippingLine2}
                onChange={(e) => setShippingLine2(e.target.value)}
                placeholder="Locality / Landmark"
              />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">State *</label>
                <SearchableSelector
                  options={STATE_OPTIONS}
                  value={shippingState}
                  onChange={handleShippingStateChange}
                  placeholder="Select state..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">City *</label>
                <SearchableSelector
                  options={shippingCityOptions}
                  value={shippingCity}
                  onChange={setShippingCity}
                  placeholder={shippingState ? 'Select city...' : 'Select state first'}
                  disabled={!shippingState}
                />
              </div>
              <FormInput
                label="PIN Code *"
                value={shippingPostalCode}
                onChange={(e) => setShippingPostalCode(e.target.value)}
                placeholder="e.g. 400001"
              />
              <FormInput
                label="Contact Person"
                value={shippingContactPerson}
                onChange={(e) => setShippingContactPerson(e.target.value)}
                placeholder="Name of recipient"
              />
              <PhoneInput
                label="Contact Phone"
                value={shippingContactPhone}
                onChange={setShippingContactPhone}
                placeholder="98765 43210"
              />
            </div>
          </div>

          {/* Billing Address Toggle */}
          <div className="flex items-center gap-2 px-1">
            <Checkbox

              id="sameAsShipping"
              checked={sameAsShipping}
              onChange={(e) => setSameAsShipping(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label
              htmlFor="sameAsShipping"
              className="text-xs font-medium text-muted-foreground cursor-pointer"
            >
              Billing address is same as Shipping address
            </label>
          </div>

          {!sameAsShipping && (
            <div className="rounded-xl border border-border/80 p-4 bg-card space-y-3 shadow-none">
              <div className="text-xs font-bold uppercase text-foreground">
                Billing / Invoicing Address
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <FormInput
                    label="Address Line 1 *"
                    value={billingLine1}
                    onChange={(e) => setBillingLine1(e.target.value)}
                    placeholder="Street address, unit, building"
                  />
                </div>
                <FormInput
                  label="Address Line 2"
                  value={billingLine2}
                  onChange={(e) => setBillingLine2(e.target.value)}
                  placeholder="Locality / Landmark"
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">State *</label>
                  <SearchableSelector
                    options={STATE_OPTIONS}
                    value={billingState}
                    onChange={handleBillingStateChange}
                    placeholder="Select state..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">City *</label>
                  <SearchableSelector
                    options={billingCityOptions}
                    value={billingCity}
                    onChange={setBillingCity}
                    placeholder={billingState ? 'Select city...' : 'Select state first'}
                    disabled={!billingState}
                  />
                </div>
                <FormInput
                  label="PIN Code *"
                  value={billingPostalCode}
                  onChange={(e) => setBillingPostalCode(e.target.value)}
                  placeholder="e.g. 400001"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Logistics & Notes */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-primary" /> Logistics & Internal Notes
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Preferred Carrier"
              icon={Truck}
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. BlueDart Express / VRL Logistics"
            />
            <FormInput
              label="Dispatch Instructions"
              icon={FileText}
              value={dispatchInstructions}
              onChange={(e) => setDispatchInstructions(e.target.value)}
              placeholder="e.g. Fragile glass packaging required"
            />
            <div className="sm:col-span-2">
              <FormInput
                label="Order Notes"
                icon={FileText}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes or customer requests"
              />
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={Save}
            loading={isSubmitting}
            onClick={() => handleSave()}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
