'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { effectiveTierPrice } from '../../../../../features/products/utils/tierPricing';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  Package,
  Plus,
  ShieldAlert,
  Trash2,
  Truck,
  User,
  UserPlus,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import {
  useCreateSalesOrder,
  useSalesOrderAction,
  useSalesCustomers,
  useCustomerCreditExposure,
  useNotifyStockShortage,
  useSalesInventoryAvailability,
} from '../../../../../features/sales/hooks';
import { showToast } from '@/components/toast-store';
import { useProducts } from '../../../../../hooks/useMasterData';
import {
  Customer,
  SalesChannel,
} from '../../../../../features/sales/types';
import { CustomerRegistrationModal } from '../../../../../features/sales/components/CustomerRegistrationModal';
import { CustomerSnapshotCard } from '../../../../../features/sales/components/CustomerSnapshotCard';
import {
  FormInput,
  FormSelect,
  TableNumericInput,
  PhoneInput,
} from '../../../../../features/sales/components/FormControls';
import {
  STATE_OPTIONS,
  getCitiesForState,
  getCityOptionsForState,
} from '../../../../../features/sales/data/indianStatesAndCities';

/* ========================================================================= */
/* Helper: Dynamic Customer-Tier Pricing Master Resolution Engine             */
/* ========================================================================= */

function getResolvedCustomerPrice(
  prod: any,
  customer?: Customer | null,
  _channel?: SalesChannel
): { unitPrice: number; mrp: number; gstRate: number; appliedTierName: string } {
  if (!prod) return { unitPrice: 0, mrp: 0, gstRate: 18, appliedTierName: 'Standard' };

  const meta = (prod.metadata || {}) as Record<string, any>;
  const rawMrp = meta.mrp ?? prod.sellingPrice ?? 0;
  const rawGstRate = meta.gstRate ?? 18;
  const tierPricing = Array.isArray(meta.tierPricing) ? meta.tierPricing : [];

  const customerType = customer?.customerType ? String(customer.customerType).toUpperCase() : undefined;
  const priceTier = customer?.priceTier ? String(customer.priceTier).toUpperCase() : undefined;

  // 1. Match Tier Pricing from Pricing Master
  if (tierPricing.length > 0 && (priceTier || customerType)) {
    const matchedTier = tierPricing.find((t: any) => {
      const tName = String(t.tierName || t.tierId || '').toUpperCase();
      return (
        tName === priceTier ||
        tName === customerType ||
        t.tierId === priceTier ||
        t.tierId === customerType
      );
    });

    if (matchedTier) {
      const tierPrice = effectiveTierPrice(matchedTier);
      if (tierPrice > 0) {
        return {
          unitPrice: tierPrice,
          mrp: Math.max(tierPrice, Number(rawMrp) || tierPrice),
          gstRate: Number(rawGstRate) || 18,
          appliedTierName: matchedTier.tierName || matchedTier.tierId || 'Tier Pricing',
        };
      }
    }
  }

  // 2. Channel or Role-based Commercial Price from Metadata
  if (customerType === 'DISTRIBUTOR' && meta.distributorPrice) {
    const p = Number(meta.distributorPrice);
    if (p > 0) {
      return {
        unitPrice: p,
        mrp: Math.max(p, Number(rawMrp) || p),
        gstRate: Number(rawGstRate) || 18,
        appliedTierName: 'Distributor Master',
      };
    }
  }
  if ((customerType === 'DEALER' || customerType === 'WHOLESALE') && meta.wholesalePrice) {
    const p = Number(meta.wholesalePrice);
    if (p > 0) {
      return {
        unitPrice: p,
        mrp: Math.max(p, Number(rawMrp) || p),
        gstRate: Number(rawGstRate) || 18,
        appliedTierName: 'Dealer / Wholesale Master',
      };
    }
  }

  // 3. Base Net Price from Pricing Master or Standard Selling Price
  const rawSellingPrice =
    meta.baseNetPrice ??
    meta.sellingPrice ??
    prod.sellingPrice ??
    prod.unitCost ??
    0;

  return {
    unitPrice: Number(rawSellingPrice) || 0,
    mrp: Number(rawMrp) || Number(rawSellingPrice) || 0,
    gstRate: Number(rawGstRate) || 18,
    appliedTierName: 'Standard Commercial Price',
  };
}

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

export interface OrderLineDraft {
  productId: string;
  sku: string;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
}

export default function CreateSalesOrderPage() {
  const router = useRouter();

  // Core Data Queries
  const { data: productsData, isLoading: isLoadingProducts } = useProducts('ACTIVE', 1, 500);
  const { data: customersData, isLoading: isLoadingCustomers } = useSalesCustomers();
  // Sales availability uses the unified enterprise inventory balance. Physical
  // locations remain an internal fulfillment concern and do not filter stock
  // available to the order-entry user.
  const { data: inventoryData, isLoading: isLoadingInventory } = useSalesInventoryAvailability();

  // Mutations
  const createOrder = useCreateSalesOrder();
  const salesOrderAction = useSalesOrderAction();
  const notifyShortage = useNotifyStockShortage();

  const products = Array.isArray(productsData) ? productsData : productsData?.items || [];
  const customers = customersData?.items || [];
  const inventoryItems = inventoryData?.items || [];
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
    // ensuring orders/new matches the /products catalog exactly
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

  // Form State - Commercial & Customer Context
  const [channel, setChannel] = useState<SalesChannel>('PHYSICAL');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentTerms, setPaymentTerms] = useState('NET_30');
  const [salesRepresentative, setSalesRepresentative] = useState('');
  const [priority, setPriority] = useState<'STANDARD' | 'URGENT' | 'HIGH_PRIORITY'>('STANDARD');
  const [applyCreditLimit, setApplyCreditLimit] = useState(true);

  // Live Customer Credit Exposure Query
  const { data: creditExposure } = useCustomerCreditExposure(selectedCustomer?.id);

  // Modal State
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Requisition notification status tracking per line item
  const [notifiedLines, setNotifiedLines] = useState<Record<number, boolean>>({});

  // Logistics & Delivery
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [notes, setNotes] = useState('');

  // Shipping Address
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
  });

  // Billing Address
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    taxNumber: '',
  });

  // Lines State
  const [lines, setLines] = useState<OrderLineDraft[]>([
    {
      productId: '',
      sku: '',
      description: '',
      uom: 'PCS',
      quantity: 1,
      unitPrice: 0,
      discountAmount: 0,
      taxRate: 18,
    },
  ]);

  const [freightCharges, setFreightCharges] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const focusInvalidField = (field: string, lineIndex?: number) => {
    const aliases: Record<string, string[]> = {
      customerId: ['customer'], customer: ['customer'], channel: ['channel'], paymentTerms: ['paymentTerms'],
      productId: ['product'], quantity: ['quantity'], unitPrice: ['unitPrice'], taxRate: ['taxRate'],
      line1: ['shippingLine1', 'billingLine1'], state: ['shippingState', 'billingState'],
      city: ['shippingCity', 'billingCity'], postalCode: ['shippingPostalCode', 'billingPostalCode'],
      'shippingAddress.line1': ['shippingLine1'], 'shippingAddress.city': ['shippingCity'], 'shippingAddress.postalCode': ['shippingPostalCode'],
      'billingAddress.line1': ['billingLine1'], 'billingAddress.city': ['billingCity'], 'billingAddress.postalCode': ['billingPostalCode'],
      lines: ['product'],
      shippingAddress: ['shippingLine1'], billingAddress: ['billingLine1'],
    };
    const candidates = aliases[field] ?? [field];
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-sales-field]'))
      .filter((element) => candidates.includes(element.dataset.salesField ?? '') && element.getClientRects().length > 0);
    const target = lineIndex !== undefined && targets.length > 1 ? targets[lineIndex] : targets[0];
    if (!target) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      const focusable = target.matches('input,select,button,[tabindex]')
        ? target
        : target.querySelector<HTMLElement>('input,select,button,[tabindex]');
      focusable?.focus({ preventScroll: true });
    }, 250);
  };

  const reportInputError = (message: string, field: string, title = 'Check Order Details', lineIndex?: number) => {
    setError(message);
    showToast({ kind: 'error', title, message });
    focusInvalidField(field, lineIndex);
  };

  // Searchable options for customers
  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      sku: c.code,
      subText: `${c.customerType || 'Customer'} • ${c.taxNumber ? `GSTIN: ${c.taxNumber}` : (c.contactPhone || 'Registered Account')}`,
    }));
  }, [customers]);

  // Searchable options for products with live inventory availability & customer-tier pricing
  const productOptions = useMemo(() => {
    return products.map((p: any) => {
      const inv = inventoryMap.get(p.id);
      const avail = inv ? inv.availableQuantity : 0;
      const { unitPrice, appliedTierName } = getResolvedCustomerPrice(p, selectedCustomer, channel);
      const stockBadge = inv
        ? avail > 0
          ? `⚡ ${avail} in stock`
          : '⚠️ Out of Stock (0)'
        : 'Stock: 0';
      const parentId = p.parentProductId || p.productId || (p.metadata && typeof p.metadata === 'object' && 'parentProductId' in p.metadata ? String(p.metadata.parentProductId) : undefined);
      const isVar = Boolean(p.isVariant || (p.metadata && typeof p.metadata === 'object' && 'isVariant' in p.metadata && p.metadata.isVariant) || parentId);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        code: p.sku,
        status: p.status,
        isVariant: isVar,
        parentOptionId: parentId,
        parentItemName: p.parentProductName,
        category: p.category,
        subText: `${p.uom?.code || p.uomId || 'PCS'} • ${appliedTierName}: ₹${unitPrice.toLocaleString('en-IN')} • ${stockBadge}`,
      };
    });
  }, [products, inventoryMap, selectedCustomer, channel]);

  const handleNotifyShortage = (idx: number, line: OrderLineDraft) => {
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
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        notes: `Sales requisition generated during order intake by sales team.`,
      },
      {
        onSuccess: () => {
          setNotifiedLines((prev) => ({ ...prev, [idx]: true }));
        },
      }
    );
  };

  // Cascading City Options for Shipping and Billing Addresses
  const shippingCityOptions = useMemo(() => {
    return getCityOptionsForState(shippingAddress.state);
  }, [shippingAddress.state]);

  const billingCityOptions = useMemo(() => {
    return getCityOptionsForState(billingAddress.state);
  }, [billingAddress.state]);

  // Handle Customer Selection & dynamically re-evaluate line item prices based on customer pricing tier
  const handleCustomerSelect = (custOrId: string | Customer) => {
    const cust =
      typeof custOrId === 'string'
        ? customers.find((c) => c.id === custOrId)
        : custOrId;
    if (cust) {
      setSelectedCustomer(cust);
      const billingMeta = cust.billingAddress && typeof cust.billingAddress === 'object'
        ? cust.billingAddress
        : {};
      const shippingMeta = cust.shippingAddress && typeof cust.shippingAddress === 'object'
        ? cust.shippingAddress
        : {};

      if (cust.paymentTerms || (billingMeta as any).paymentTerms) {
        setPaymentTerms(cust.paymentTerms || (billingMeta as any).paymentTerms);
      }

      setShippingAddress({
        name: (shippingMeta as any).name || cust.name,
        phone: (shippingMeta as any).phone || cust.contactPhone || '',
        line1: (shippingMeta as any).line1 || (billingMeta as any).line1 || (cust as any).address || 'Main Delivery Facility',
        line2: (shippingMeta as any).line2 || (billingMeta as any).line2 || '',
        city: (shippingMeta as any).city || (billingMeta as any).city || 'Mumbai',
        state: (shippingMeta as any).state || (billingMeta as any).state || 'Maharashtra',
        postalCode: (shippingMeta as any).postalCode || (billingMeta as any).postalCode || '400001',
        country: (shippingMeta as any).country || 'IN',
      });

      setBillingAddress({
        name: (billingMeta as any).name || cust.name,
        phone: (billingMeta as any).phone || cust.contactPhone || '',
        line1: (billingMeta as any).line1 || (cust as any).address || 'Corporate Billing Office',
        line2: (billingMeta as any).line2 || '',
        city: (billingMeta as any).city || 'Mumbai',
        state: (billingMeta as any).state || 'Maharashtra',
        postalCode: (billingMeta as any).postalCode || '400001',
        country: (billingMeta as any).country || 'IN',
        taxNumber: cust.taxNumber || '',
      });

      // Automatically re-evaluate line prices based on customer pricing master tier
      setLines((prev) =>
        prev.map((line) => {
          if (!line.productId) return line;
          const prod = products.find((p: any) => p.id === line.productId);
          if (!prod) return line;
          const { unitPrice, gstRate } = getResolvedCustomerPrice(prod, cust, channel);
          return {
            ...line,
            unitPrice,
            taxRate: gstRate,
          };
        })
      );
    } else {
      setSelectedCustomer(null);
    }
  };

  // Handle line product selection with automatic Pricing Master extraction & duplicate consolidation
  const handleProductSelect = (index: number, prodId: string) => {
    if (!prodId) {
      const updated = [...lines];
      updated[index] = {
        ...updated[index],
        productId: '',
        sku: '',
        description: '',
        unitPrice: 0,
        taxRate: 18,
      };
      setLines(updated);
      return;
    }

    const prod = products.find((p: any) => p.id === prodId);
    if (!prod) return;

    const { unitPrice, gstRate } = getResolvedCustomerPrice(prod, selectedCustomer, channel);
    const existingIndex = lines.findIndex((l, i) => i !== index && l.productId === prodId);

    if (existingIndex !== -1) {
      // Product is already present in another row -> Append quantity to existing line
      const qtyToAdd = Math.max(1, Number(lines[index]?.quantity) || 1);
      const updated = [...lines];
      const newQty = Number(updated[existingIndex].quantity || 0) + qtyToAdd;
      const uom = prod.uom?.code || prod.uomId || 'PCS';

      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        unitPrice,
        taxRate: gstRate,
      };

      // Remove the current row if there are multiple rows
      if (updated.length > 1) {
        updated.splice(index, 1);
      }

      setLines(updated);
      showToast({
        kind: 'info',
        title: 'Item Consolidated',
        message: `Appended +${qtyToAdd} qty to existing ${prod.name} line (Total: ${newQty} ${uom}).`,
      });
      return;
    }

    // Normal case: first instance of this product in line items
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      productId: prod.id,
      sku: prod.sku,
      description: prod.name,
      uom: prod.uom?.code || prod.uomId || 'PCS',
      unitPrice,
      taxRate: gstRate,
    };
    setLines(updated);
  };

  const updateLine = (index: number, field: keyof OrderLineDraft, value: any) => {
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setLines(updated);
  };

  const addLine = () => {
    setLines([
      ...lines,
      {
        productId: '',
        sku: '',
        description: '',
        uom: 'PCS',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        taxRate: 18,
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  // Commercial Math Calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableAmount = 0;
    let taxTotal = 0;

    lines.forEach((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const discount = Number(l.discountAmount) || 0;
      const rate = Number(l.taxRate) || 0;

      const gross = qty * price;
      const taxable = Math.max(0, gross - discount);
      const tax = taxable * (rate / 100);

      subtotal += gross;
      discountTotal += discount;
      taxableAmount += taxable;
      taxTotal += tax;
    });

    const grandTotal = taxableAmount + taxTotal + freightCharges;

    return {
      subtotal,
      discountTotal,
      taxableAmount,
      taxTotal,
      grandTotal,
    };
  }, [lines, freightCharges]);

  // Credit Limit Check
  const isCreditExceeded = useMemo(() => {
    if (!applyCreditLimit || !selectedCustomer) return false;
    const limit = Number(creditExposure?.creditLimit ?? selectedCustomer.creditLimit ?? 0);
    if (limit <= 0) return false;
    const currentExposure = Number(creditExposure?.creditUtilized ?? 0);
    return currentExposure + totals.grandTotal > limit;
  }, [applyCreditLimit, selectedCustomer, creditExposure, totals.grandTotal]);

  // Inventory Shortage Check
  const hasInventoryShortage = useMemo(() => {
    return lines.some((line) => {
      if (!line.productId) return false;
      const inv = inventoryMap.get(line.productId);
      const available = inv?.availableQuantity ?? 0;
      return line.quantity > available;
    });
  }, [lines, inventoryMap]);

  const isHoldRequired = isCreditExceeded || hasInventoryShortage;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCustomer) {
      const msg = 'Please select a Customer / Dealer Account before submitting.';
      reportInputError(msg, 'customer', 'Customer Missing');
      return;
    }
    const missingProductIndex = lines.findIndex((line) => !line.productId);
    if (lines.length === 0 || missingProductIndex >= 0) {
      const msg = 'Select a product for each order line.';
      reportInputError(msg, 'product', 'Product Required', Math.max(0, missingProductIndex));
      return;
    }
    const invalidQuantityIndex = lines.findIndex((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0);
    if (invalidQuantityIndex >= 0) {
      const msg = 'Enter a quantity greater than zero for each order line.';
      reportInputError(msg, 'quantity', 'Invalid Quantity', invalidQuantityIndex);
      return;
    }
    const invalidPriceIndex = lines.findIndex((line) => !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0);
    if (invalidPriceIndex >= 0) {
      const msg = 'Enter a valid non-negative unit price for each order line.';
      reportInputError(msg, 'unitPrice', 'Invalid Unit Price', invalidPriceIndex);
      return;
    }
    if (!shippingAddress.line1 || !shippingAddress.state || !shippingAddress.city || !shippingAddress.postalCode) {
      const field = !shippingAddress.line1 ? 'shippingLine1' : !shippingAddress.state ? 'shippingState' : !shippingAddress.city ? 'shippingCity' : 'shippingPostalCode';
      const msg = `Please complete the required shipping ${field.replace('shipping', '').replace(/([A-Z])/g, ' $1').toLowerCase()} field.`;
      reportInputError(msg, field, 'Shipping Address Incomplete');
      return;
    }
    if (!sameAsShipping && (!billingAddress.line1 || !billingAddress.state || !billingAddress.city || !billingAddress.postalCode)) {
      const field = !billingAddress.line1 ? 'billingLine1' : !billingAddress.state ? 'billingState' : !billingAddress.city ? 'billingCity' : 'billingPostalCode';
      const msg = `Please complete the required billing ${field.replace('billing', '').replace(/([A-Z])/g, ' $1').toLowerCase()} field.`;
      reportInputError(msg, field, 'Billing Address Incomplete');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const newOrder = await createOrder.mutateAsync({
        channel,
        customerId: selectedCustomer.id,
        paymentTerms,
        notes: notes ? `${notes} [Sales Rep: ${salesRepresentative || 'N/A'}]` : salesRepresentative ? `Sales Rep: ${salesRepresentative}` : undefined,
        shippingAddress: {
          name: shippingAddress.name || selectedCustomer.name,
          phone: shippingAddress.phone || selectedCustomer.contactPhone || undefined,
          line1: shippingAddress.line1,
          line2: shippingAddress.line2 || undefined,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || 'IN',
        },
        billingAddress: sameAsShipping
          ? {
              name: shippingAddress.name || selectedCustomer.name,
              phone: shippingAddress.phone || selectedCustomer.contactPhone || undefined,
              line1: shippingAddress.line1,
              line2: shippingAddress.line2 || undefined,
              city: shippingAddress.city,
              state: shippingAddress.state,
              postalCode: shippingAddress.postalCode,
              country: shippingAddress.country || 'IN',
              taxNumber: selectedCustomer.taxNumber || undefined,
            }
          : {
              name: billingAddress.name || selectedCustomer.name,
              phone: billingAddress.phone || selectedCustomer.contactPhone || undefined,
              line1: billingAddress.line1,
              line2: billingAddress.line2 || undefined,
              city: billingAddress.city,
              state: billingAddress.state,
              postalCode: billingAddress.postalCode,
              country: billingAddress.country || 'IN',
              taxNumber: billingAddress.taxNumber || undefined,
            },
        lines: (() => {
          const map = new Map<string, {
            productId: string;
            quantity: number;
            unitPrice: number;
            discountAmount: number;
            taxRate: number;
          }>();
          lines.forEach((l) => {
            if (!l.productId) return;
            const existing = map.get(l.productId);
            if (existing) {
              existing.quantity += Number(l.quantity) || 0;
              existing.discountAmount += Number(l.discountAmount) || 0;
            } else {
              map.set(l.productId, {
                productId: l.productId,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                discountAmount: Number(l.discountAmount) || 0,
                taxRate: Number(l.taxRate) || 18,
              });
            }
          });
          return Array.from(map.values());
        })(),
      });

      // Creating an order always starts in DRAFT. If the client-side checks
      // identify a credit/inventory hold, explicitly transition it to ON_HOLD
      // so it appears in the Hold Queue instead of remaining an invisible
      // draft with only a warning banner.
      if (isHoldRequired) {
        const holdReason = isCreditExceeded && hasInventoryShortage
          ? 'Credit limit exceeded and inventory shortage detected.'
          : isCreditExceeded
            ? 'Credit limit exceeded; awaiting administrative approval.'
            : 'Inventory shortage detected; awaiting replenishment.';
        await salesOrderAction.mutateAsync({
          id: newOrder.id,
          action: 'hold',
          reason: holdReason,
        });
      }

      showToast({
        kind: 'success',
        title: isHoldRequired ? 'Order Submitted to Hold Queue' : 'Sales Order Created',
        message: `Order ${newOrder.orderNumber || ''} created successfully with grand total ${formatCurrency(totals.grandTotal)}.`,
      });

      router.push(`/sales/orders/${newOrder.id}`);
    } catch (err: any) {
      const apiError = err?.data?.error ?? err?.response?.data?.error;
      const details = Array.isArray(apiError?.details) ? apiError.details : [];
      const field = typeof details[0]?.field === 'string' ? details[0].field : '';
      const msg = apiError?.message || err?.message || 'Failed to create sales order.';
      setError(msg);
      showToast({ kind: 'error', title: field ? 'Check Order Details' : 'Order Creation Failed', message: msg });
      if (field) focusInvalidField(field, Number.isInteger(details[0]?.line) ? details[0].line : undefined);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/15 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Customer Registration Modal */}
      <CustomerRegistrationModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(newCust) => {
          handleCustomerSelect(newCust);
        }}
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-[1550px] space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-border-strong border-border/70">
          <div className="space-y-1">
            <Link
              href="/sales"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sales Control Center
            </Link>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Create Sales Order
              </h1>
              {isHoldRequired && (
                <Badge variant="outline" className="text-xs font-bold text-tone-amber-text border-tone-amber-solid/25 bg-tone-amber-bg">
                  <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Requires Hold Queue Approval
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ingest commercial orders with automated pricing master resolution, live inventory deduction, and customer credit validation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/sales')}
              className="h-9 px-4 text-xs font-bold"
            >
              Cancel
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive font-medium flex items-center justify-between gap-3 shadow-none">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 text-destructive" />
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
        )}

        {/* ============================================================ */}
        {/* SECTION 1: Customer & Commercial Parameters (2 Balanced Cols) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Customer Account (6 cols) */}
          <Card className="lg:col-span-6 rounded-2xl border-border/80 bg-card overflow-hidden shadow-xs hover:border-border transition-all">
            <CardHeader className="bg-muted/30 border-border-strong border-border/60 py-3.5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                  <Building2 className="h-4 w-4 text-primary" /> Customer & Credit Account
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={UserPlus}
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="h-7 text-xs font-bold text-primary border-primary/30 hover:bg-primary/10"
                >
                  + New Customer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5" data-sales-field="customer" tabIndex={-1}>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Select Customer / Dealer Account *
                </label>
                <SearchableSelector
                  value={selectedCustomer?.id || ''}
                  onChange={(id) => handleCustomerSelect(id)}
                  options={customerOptions}
                  isLoading={isLoadingCustomers}
                  placeholder="Search by customer name, dealer code, GSTIN, or phone..."
                  className="w-full"
                />
              </div>

              {selectedCustomer ? (
                <div className="space-y-3">
                  <CustomerSnapshotCard
                    customer={selectedCustomer}
                    orderTotal={totals.grandTotal}
                    creditExposure={creditExposure}
                    onClear={() => setSelectedCustomer(null)}
                  />

                  {/* Clean Single-Row Credit Check Switch */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20 text-xs">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <Checkbox

                        checked={applyCreditLimit}
                        onChange={(e) => setApplyCreditLimit(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="font-bold text-foreground">
                        Enforce Revolving Credit Limit
                      </span>
                    </label>
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      {applyCreditLimit ? 'Credit Check: ACTIVE' : 'Credit Check: BYPASSED'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground bg-muted/10 space-y-1">
                  <p className="font-medium text-foreground">No customer selected</p>
                  <p>Select an account above to resolve commercial payment terms, address profiles, and pricing tiers.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Order Parameters & Commercial Metadata (6 cols) */}
          <Card className="lg:col-span-6 rounded-2xl border-border/80 bg-card overflow-hidden shadow-xs hover:border-border transition-all">
            <CardHeader className="bg-muted/30 border-border-strong border-border/60 py-3.5 px-5">
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                <FileText className="h-4 w-4 text-primary" /> Order Parameters & Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div data-sales-field="channel" tabIndex={-1}>
                <FormSelect
                  label="Sales Channel *"
                  icon={Package}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as SalesChannel)}
                >
                  <option value="PHYSICAL">Physical / Dealer B2B</option>
                  <option value="E_TRADE">E-trade (Online Portal)</option>
                  <option value="STORE_POS">Store POS (Counter Sale)</option>
                  <option value="AMAZON">Amazon Marketplace</option>
                </FormSelect>
                </div>

                <div data-sales-field="paymentTerms" tabIndex={-1}>
                <FormSelect
                  label="Payment Terms"
                  icon={CreditCard}
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                >
                  <option value="ADVANCE">Advance / 100% Pre-payment</option>
                  <option value="NET_15">Net 15 Days</option>
                  <option value="NET_30">Net 30 Days</option>
                  <option value="NET_45">Net 45 Days</option>
                  <option value="NET_60">Net 60 Days</option>
                  <option value="COD">Cash on Delivery (COD)</option>
                </FormSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormInput
                  label="Sales Representative"
                  icon={User}
                  placeholder="Executive name"
                  value={salesRepresentative}
                  onChange={(e) => setSalesRepresentative(e.target.value)}
                />

                <FormSelect
                  label="Order Priority / SLA"
                  icon={Clock}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                >
                  <option value="STANDARD">Standard Fulfillment</option>
                  <option value="URGENT">Urgent (Expedited)</option>
                  <option value="HIGH_PRIORITY">High Priority Dispatch</option>
                </FormSelect>

                <FormInput
                  label="Internal Notes"
                  icon={FileText}
                  placeholder="Commercial remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Clean Payment Notice Strip */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-muted/20 text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" /> Ingestion Payment Mode:
                </span>
                <span className="font-mono font-bold text-foreground">
                  {paymentTerms === 'ADVANCE' ? 'ADVANCE (Pre-paid)' : 'CREDIT / INVOICE (Collect on Net Terms)'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ============================================================ */}
        {/* SECTION 2: FULL-WIDTH ORDER LINE ITEMS WORKSPACE              */}
        {/* ============================================================ */}
        <Card className="rounded-2xl border-border/80 bg-card overflow-hidden shadow-xs hover:border-border transition-all w-full">
          <CardHeader className="bg-muted/30 border-border-strong border-border/60 py-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Package className="h-4 w-4 text-primary" /> Order Line Items & Pricing Master Allocation
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Finished goods auto-resolve customer pricing tiers. Stock availability is verified in real-time.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={addLine}
              className="font-bold h-8 text-xs shrink-0 self-start sm:self-auto bg-background"
            >
              + Add Item
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="w-[34%] min-w-[280px] py-3.5 pl-5">Product / Finished Good *</TableHead>
                    <TableHead className="text-center w-[12%] min-w-[110px] py-3.5">Available Stock</TableHead>
                    <TableHead className="w-[6%] min-w-[60px] py-3.5">UOM</TableHead>
                    <TableHead className="text-right w-[10%] min-w-[90px] py-3.5">Qty *</TableHead>
                    <TableHead className="text-right w-[13%] min-w-[120px] py-3.5">Unit Price (₹)</TableHead>
                    <TableHead className="text-right w-[10%] min-w-[90px] py-3.5">Discount (₹)</TableHead>
                    <TableHead className="text-right w-[8%] min-w-[80px] py-3.5">GST Rate</TableHead>
                    <TableHead className="text-right w-[12%] min-w-[110px] py-3.5">Line Total</TableHead>
                    <TableHead className="text-center w-[4%] pr-5 py-3.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const gross = (line.quantity || 0) * (line.unitPrice || 0);
                    const discount = Number(line.discountAmount || 0);
                    const taxable = Math.max(0, gross - discount);
                    const tax = taxable * ((Number(line.taxRate) || 0) / 100);
                    const lineTotal = taxable + tax;

                    const inv = inventoryMap.get(line.productId);
                    const availableStock = inv ? inv.availableQuantity : 0;
                    const hasShortage = Boolean(line.productId && line.quantity > availableStock);
                    const shortageQty = hasShortage ? line.quantity - availableStock : 0;
                    const isNotified = notifiedLines[idx] || false;

                    return (
                      <React.Fragment key={idx}>
                        <TableRow className={`hover:bg-muted/10 transition-colors border-border-strong border-border/70 ${hasShortage ? 'bg-tone-amber-solid/[0.03]' : ''}`}>
                          <TableCell className="pl-5 py-3" data-sales-field="product">
                            <SearchableSelector
                              value={line.productId}
                              onChange={(prodId) => handleProductSelect(idx, prodId)}
                              options={productOptions}
                              isLoading={isLoadingProducts || isLoadingInventory}
                              placeholder="Search product by SKU or name..."
                              size="sm"
                            />
                          </TableCell>

                          <TableCell className="text-center py-3">
                            {line.productId ? (
                              availableStock > 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-tone-green-solid shrink-0" />
                                  {availableStock} {line.uom}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-tone-amber-solid shrink-0" />
                                  0 {line.uom}
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground/40 font-mono">-</span>
                            )}
                          </TableCell>

                          <TableCell className="font-mono font-bold text-xs text-muted-foreground py-3">
                            {line.uom}
                          </TableCell>

                          <TableCell className="py-3" data-sales-field="quantity">
                            <TableNumericInput
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(idx, 'quantity', Math.max(1, Number(e.target.value)))
                              }
                            />
                          </TableCell>

                          <TableCell className="py-3" data-sales-field="unitPrice">
                            <TableNumericInput
                              type="number"
                              min="0"
                              step="0.01"
                              prefixSymbol="₹"
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(idx, 'unitPrice', Math.max(0, Number(e.target.value)))
                              }
                            />
                          </TableCell>

                          <TableCell className="py-3">
                            <TableNumericInput
                              type="number"
                              min="0"
                              step="0.01"
                              prefixSymbol="-"
                              value={line.discountAmount}
                              onChange={(e) =>
                                updateLine(idx, 'discountAmount', Math.max(0, Number(e.target.value)))
                              }
                            />
                          </TableCell>

                          <TableCell className="py-3">
                            <div className="relative w-full">
                              <select
                                value={line.taxRate}
                                onChange={(e) => updateLine(idx, 'taxRate', Number(e.target.value))}
                                className="w-full h-8 pl-2 pr-6 appearance-none rounded-lg border border-border/70 bg-background hover:bg-muted/20 text-xs font-semibold text-right transition-all outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-none"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                              <ChevronDown className="h-3 w-3 text-muted-foreground/70 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" />
                            </div>
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-foreground py-3">
                            {formatCurrency(lineTotal)}
                          </TableCell>

                          <TableCell className="text-center pr-5 py-3">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              disabled={lines.length === 1}
                              className="text-muted-foreground/60 hover:text-destructive disabled:opacity-20 transition-colors p-1"
                              title="Remove Line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </TableCell>
                        </TableRow>

                        {hasShortage && (
                          <tr className="bg-tone-amber-solid/[0.04] border-border-strong border-border/70">
                            <td colSpan={9} className="px-5 py-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-tone-amber-solid/25">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-lg bg-tone-amber-bg border border-tone-amber-solid/25 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="h-4 w-4 text-tone-amber-text" />
                                  </div>
                                  <div className="text-xs space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-foreground">Inventory Shortage</span>
                                      <Badge variant="outline" className="text-[10px] font-mono text-tone-amber-text border-tone-amber-solid/25">
                                        Deficit: {shortageQty} {line.uom}
                                      </Badge>
                                    </div>
                                    <p className="text-muted-foreground text-[11px]">
                                      Order requested <strong className="text-foreground">{line.quantity} {line.uom}</strong>, available inventory is <strong className="text-foreground">{availableStock} {line.uom}</strong>.
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
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    ) : isNotified ? (
                                      <Check className="h-3.5 w-3.5 mr-1.5 text-tone-green-text" />
                                    ) : (
                                      <BellRing className="h-3.5 w-3.5 mr-1.5" />
                                    )}
                                    {isNotified ? 'Admin & Store Notified ✓' : 'Notify Store Manager & Admin'}
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Responsive Card Rows */}
            <div className="md:hidden divide-y divide-border/70 p-4 space-y-4">
              {lines.map((line, idx) => {
                const gross = (line.quantity || 0) * (line.unitPrice || 0);
                const discount = Number(line.discountAmount || 0);
                const taxable = Math.max(0, gross - discount);
                const tax = taxable * ((Number(line.taxRate) || 0) / 100);
                const lineTotal = taxable + tax;

                const inv = inventoryMap.get(line.productId);
                const availableStock = inv ? inv.availableQuantity : 0;
                const hasShortage = Boolean(line.productId && line.quantity > availableStock);
                const shortageQty = hasShortage ? line.quantity - availableStock : 0;

                return (
                  <div key={idx} className="p-4 rounded-xl border border-border bg-card space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">Item #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="text-xs text-destructive hover:underline disabled:opacity-40 font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div data-sales-field="product"><SearchableSelector
                      label="Product *"
                      value={line.productId}
                      onChange={(prodId) => handleProductSelect(idx, prodId)}
                      options={productOptions}
                      isLoading={isLoadingProducts || isLoadingInventory}
                      placeholder="Select product..."
                    /></div>

                    <div className="grid grid-cols-2 gap-3">
                      <div data-sales-field="quantity">
                        <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Quantity *</label>
                        <TableNumericInput
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                      <div data-sales-field="unitPrice">
                        <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Unit Price (₹)</label>
                        <TableNumericInput
                          type="number"
                          min="0"
                          prefixSymbol="₹"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, 'unitPrice', Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Discount (₹)</label>
                        <TableNumericInput
                          type="number"
                          min="0"
                          prefixSymbol="-"
                          value={line.discountAmount}
                          onChange={(e) => updateLine(idx, 'discountAmount', Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground mb-1">GST Rate</label>
                        <select
                          value={line.taxRate}
                          onChange={(e) => updateLine(idx, 'taxRate', Number(e.target.value))}
                          className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs font-semibold"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium">Line Total:</span>
                      <span className="font-mono font-bold text-foreground text-sm">{formatCurrency(lineTotal)}</span>
                    </div>

                    {hasShortage && (
                      <div className="p-2.5 rounded-lg bg-tone-amber-bg border border-tone-amber-solid/25 text-xs text-tone-amber-text font-medium">
                        Shortage: {shortageQty} {line.uom} (Store available: {availableStock})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Subtotal Preview Bar */}
            <div className="p-4 bg-muted/25 border-t border-border/70 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
              <div className="text-muted-foreground flex items-center gap-2">
                <span>Items: <strong className="text-foreground">{lines.length}</strong></span>
                <span>•</span>
                <span>Total Units: <strong className="text-foreground">{lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)}</strong></span>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  Taxable Value:{' '}
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(totals.taxableAmount)}
                  </span>
                </div>
                <div>
                  GST Total:{' '}
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(totals.taxTotal)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/* SECTION 3: Logistics & Commercial Settlement (2 Balanced Cols) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Delivery & Billing Addresses (7 cols) */}
          <Card className="lg:col-span-7 rounded-2xl border-border/80 bg-card overflow-hidden shadow-xs hover:border-border transition-all">
            <CardHeader className="bg-muted/30 border-border-strong border-border/60 py-3.5 px-5">
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                <MapPin className="h-4 w-4 text-primary" /> Delivery & Billing Logistics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Shipping Address */}
                <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-muted/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-primary" /> Shipping Address
                  </h4>
                  <div className="space-y-3">
                    <FormInput
                      label="Recipient / Contact Name *"
                      icon={User}
                      value={shippingAddress.name}
                      onChange={(e) =>
                        setShippingAddress((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="e.g. Acme Delivery Hub"
                    />

                    <PhoneInput
                      label="Contact Phone"
                      value={shippingAddress.phone || ''}
                      onChange={(val) =>
                        setShippingAddress((p) => ({ ...p, phone: val }))
                      }
                      placeholder="98765 43210"
                    />

                    <div data-sales-field="shippingLine1"><FormInput
                      label="Address Line 1 *"
                      icon={MapPin}
                      value={shippingAddress.line1}
                      onChange={(e) =>
                        setShippingAddress((p) => ({ ...p, line1: e.target.value }))
                      }
                      placeholder="Plot / Street / Building"
                    /></div>

                    <FormInput
                      label="Address Line 2 (Optional)"
                      value={shippingAddress.line2}
                      onChange={(e) =>
                        setShippingAddress((p) => ({ ...p, line2: e.target.value }))
                      }
                      placeholder="Area / Landmark"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div data-sales-field="shippingState"><SearchableSelector
                        label="State *"
                        value={shippingAddress.state}
                        onChange={(val) => {
                          setShippingAddress((p) => {
                            const validCities = getCitiesForState(val);
                            return {
                              ...p,
                              state: val,
                              city: p.city && validCities.includes(p.city) ? p.city : '',
                            };
                          });
                        }}
                        options={STATE_OPTIONS}
                        placeholder="State..."
                        allowCustom
                      /></div>
                      <div data-sales-field="shippingCity"><SearchableSelector
                        label="City *"
                        value={shippingAddress.city}
                        onChange={(val) =>
                          setShippingAddress((p) => ({ ...p, city: val }))
                        }
                        options={shippingCityOptions}
                        placeholder={shippingAddress.state ? 'City...' : 'Select state'}
                        disabled={!shippingAddress.state}
                        allowCustom
                      /></div>
                      <div data-sales-field="shippingPostalCode"><FormInput
                        label="Pincode *"
                        value={shippingAddress.postalCode}
                        onChange={(e) =>
                          setShippingAddress((p) => ({ ...p, postalCode: e.target.value }))
                        }
                        placeholder="400001"
                      /></div>
                    </div>
                  </div>
                </div>

                {/* Billing Address */}
                <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" /> Billing Address
                    </h4>
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                      <Checkbox

                        checked={sameAsShipping}
                        onChange={(e) => setSameAsShipping(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      Same as Shipping
                    </label>
                  </div>

                  {sameAsShipping ? (
                    <div className="rounded-xl bg-background/60 border border-border/60 p-6 text-center text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">Using Shipping Address for Invoicing</p>
                      <p>Invoices will be registered to {shippingAddress.name || 'the recipient entity'}.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <FormInput
                        label="Billing Entity Name *"
                        icon={Building2}
                        value={billingAddress.name}
                        onChange={(e) =>
                          setBillingAddress((p) => ({ ...p, name: e.target.value }))
                        }
                        placeholder="Company legal name"
                      />

                      <FormInput
                        label="Customer GSTIN"
                        icon={FileText}
                        value={billingAddress.taxNumber}
                        onChange={(e) =>
                          setBillingAddress((p) => ({ ...p, taxNumber: e.target.value.toUpperCase() }))
                        }
                        placeholder="27AAACG9876B1Z5"
                      />

                      <div data-sales-field="billingLine1"><FormInput
                        label="Address Line 1 *"
                        icon={MapPin}
                        value={billingAddress.line1}
                        onChange={(e) =>
                          setBillingAddress((p) => ({ ...p, line1: e.target.value }))
                        }
                        placeholder="Registered address line 1"
                      /></div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div data-sales-field="billingState"><SearchableSelector
                          label="State *"
                          value={billingAddress.state}
                          onChange={(val) => {
                            setBillingAddress((p) => {
                              const validCities = getCitiesForState(val);
                              return {
                                ...p,
                                state: val,
                                city: p.city && validCities.includes(p.city) ? p.city : '',
                              };
                            });
                          }}
                          options={STATE_OPTIONS}
                          placeholder="State..."
                          allowCustom
                        /></div>
                        <div data-sales-field="billingCity"><SearchableSelector
                          label="City *"
                          value={billingAddress.city}
                          onChange={(val) =>
                            setBillingAddress((p) => ({ ...p, city: val }))
                          }
                          options={billingCityOptions}
                          placeholder={billingAddress.state ? 'City...' : 'Select state'}
                          disabled={!billingAddress.state}
                          allowCustom
                        /></div>
                        <div data-sales-field="billingPostalCode"><FormInput
                          label="Pincode *"
                          value={billingAddress.postalCode}
                          onChange={(e) =>
                            setBillingAddress((p) => ({ ...p, postalCode: e.target.value }))
                          }
                          placeholder="400001"
                        /></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Transporter & Carrier Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/60">
                <FormInput
                  label="Carrier / Transporter Preference"
                  icon={Truck}
                  placeholder="e.g. VRL Logistics / Delhivery / Self Pickup"
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                />

                <FormInput
                  label="Dispatch & Delivery Instructions"
                  icon={MapPin}
                  placeholder="e.g. Dock delivery between 10am-2pm, Call on arrival"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Commercial Summary (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="rounded-2xl border-border/80 bg-card shadow-xs hover:border-border transition-all">
              <CardHeader className="bg-muted/30 border-border-strong border-border/60 py-3.5 px-5">
                <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                  <CreditCard className="h-4 w-4 text-primary" /> Commercial Settlement Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="space-y-2.5 pb-4 border-border-strong border-border/70">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Gross Subtotal</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(totals.subtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Discount Total</span>
                    <span className="font-mono font-semibold text-tone-green-text">
                      - {formatCurrency(totals.discountTotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Net Taxable Value</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(totals.taxableAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>GST (CGST + SGST / IGST)</span>
                    <span className="font-mono font-semibold text-foreground">
                      + {formatCurrency(totals.taxTotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-muted-foreground font-medium">Freight & Handling (₹)</span>
                    <div className="w-28">
                      <TableNumericInput
                        type="number"
                        min="0"
                        prefixSymbol="₹"
                        value={freightCharges}
                        onChange={(e) => setFreightCharges(Math.max(0, Number(e.target.value)))}
                      />
                    </div>
                  </div>
                </div>

                {/* Grand Total */}
                <div className="pt-1 pb-2 flex items-baseline justify-between">
                  <span className="text-sm sm:text-base font-bold text-foreground">Grand Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-primary font-mono tracking-tight">
                    {formatCurrency(totals.grandTotal)}
                  </span>
                </div>

                {/* Submit Action Button */}
                <div className="pt-2 space-y-2.5">
                  <Button
                    type="submit"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmit(e);
                    }}
                    loading={isSubmitting || createOrder.isPending}
                    icon={isHoldRequired ? ShieldAlert : CheckCircle2}
                    className="w-full h-11 text-xs sm:text-sm font-bold shadow-sm"
                  >
                    {isHoldRequired ? 'Save & Submit to Hold Queue' : 'Create Sales Order'}
                  </Button>
                  {isHoldRequired && (
                    <p className="text-[11px] text-muted-foreground text-center font-medium">
                      {isCreditExceeded
                        ? 'Order exceeds customer credit limit and will be routed to Hold Queue for Admin approval.'
                        : 'Order contains items with stock shortages and will be routed to Hold Queue.'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
