'use client';

import { Checkbox } from '@synergy/ui';
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Package,
  AlertCircle,
  User,
  Phone,
  RotateCcw,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input, PageHeader } from '@synergy/ui';
import { usePosCheckout, useSalesInventoryAvailability } from '../../../../features/sales/hooks';
import { useProducts, useCategories } from '../../../../hooks/useMasterData';
import { SalesOrder } from '../../../../features/sales/types';

interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  mrp: number;
  quantity: number;
  discountAmount: number;
  taxRate: number;
  availableStock: number;
}

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

function getProductPriceDetails(prod: any): { sellingPrice: number; mrp: number; gstRate: number } {
  if (!prod) return { sellingPrice: 0, mrp: 0, gstRate: 18 };

  const meta = prod.metadata || {};

  // Extract real commercial pricing from metadata or direct fields
  const rawSellingPrice =
    meta.sellingPrice ??
    prod.sellingPrice ??
    meta.wholesalePrice ??
    meta.distributorPrice ??
    meta.mrp ??
    prod.standardCost ??
    meta.costPrice ??
    0;

  const rawMrp =
    meta.mrp ??
    (rawSellingPrice ? Math.round(Number(rawSellingPrice) * 1.2) : 0);

  const rawGstRate = meta.gstRate ?? 18;

  const sellingPrice = Math.max(0, Number(rawSellingPrice) || 0);
  const mrp = Math.max(sellingPrice, Number(rawMrp) || sellingPrice);
  const gstRate = Number(rawGstRate) || 18;

  return { sellingPrice, mrp, gstRate };
}

export default function StorePosPage() {
  const posCheckout = usePosCheckout();
  const { data: productsData, isLoading: isLoadingProducts } = useProducts('ACTIVE', 1, 1000);
  const { data: categoriesData } = useCategories();
  const { data: inventoryData } = useSalesInventoryAvailability();

  const products = Array.isArray(productsData) ? productsData : productsData?.items || [];
  const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.items || [];
  const inventoryItems = inventoryData?.items || [];

  // Live Inventory lookup map
  const inventoryMap = useMemo(() => {
    const map = new Map<string, { availableQuantity: number; onHandQuantity: number }>();
    inventoryItems.forEach((item: any) => {
      const pId = item.productId || item.itemId;
      if (pId) {
        map.set(pId, {
          availableQuantity: Number(item.availableQuantity ?? 0),
          onHandQuantity: Number(item.onHandQuantity ?? 0),
        });
      }
    });
    return map;
  }, [inventoryItems]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [completedOrder, setCompletedOrder] = useState<SalesOrder | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtered product catalog
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      // Category filter
      if (selectedCategory !== 'ALL') {
        const matchesCategory = p.categoryId === selectedCategory || p.category?.code === selectedCategory;
        if (!matchesCategory) return false;
      }

      // In stock only filter
      const inv = inventoryMap.get(p.id);
      const stock = inv ? inv.availableQuantity : 0;
      if (inStockOnly && stock <= 0) {
        return false;
      }

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const skuMatch = p.sku?.toLowerCase().includes(q);
      const nameMatch = p.name?.toLowerCase().includes(q);
      const categoryMatch = p.category?.name?.toLowerCase().includes(q);
      const barcodeMatch = String(p.metadata?.barcode || '').toLowerCase().includes(q);

      return skuMatch || nameMatch || categoryMatch || barcodeMatch;
    });
  }, [products, search, selectedCategory, inStockOnly, inventoryMap]);

  const addToCart = (prod: any) => {
    const existing = cart.find((i) => i.productId === prod.id);
    const { sellingPrice, mrp, gstRate } = getProductPriceDetails(prod);
    const inv = inventoryMap.get(prod.id);
    const availableStock = inv ? inv.availableQuantity : 0;

    if (existing) {
      setCart(
        cart.map((i) =>
          i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          unitPrice: sellingPrice,
          mrp,
          quantity: 1,
          discountAmount: 0,
          taxRate: gstRate,
          availableStock,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(
      cart
        .map((i) => {
          if (i.productId === productId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((i) => i.productId !== productId));
  };

  const totals = useMemo(() => {
    return cart.reduce(
      (acc, item) => {
        const gross = item.quantity * item.unitPrice;
        const discount = item.discountAmount || 0;
        const taxable = Math.max(0, gross - discount);
        const tax = taxable * ((item.taxRate || 0) / 100);
        acc.itemCount += item.quantity;
        acc.subtotal += gross;
        acc.discount += discount;
        acc.tax += tax;
        acc.grandTotal += taxable + tax;
        return acc;
      },
      { itemCount: 0, subtotal: 0, discount: 0, tax: 0, grandTotal: 0 }
    );
  }, [cart]);

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart.length) {
      setError('Cart is empty. Please add items to checkout.');
      return;
    }

    setError(null);
    posCheckout.mutate(
      {
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || undefined,
        lines: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          taxRate: i.taxRate,
        })),
      },
      {
        onSuccess: (order) => {
          setCompletedOrder(order);
          setReceiptModalOpen(true);
          setCart([]);
        },
        onError: (err: any) => {
          setError(err?.message || 'Checkout transaction failed.');
        },
      }
    );
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Top Breadcrumb & Status */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/sales"
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Sales Control Center
          </Link>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live POS Terminal Active
            </span>
          </div>
        </div>

        <PageHeader
          title="Store Point of Sale (POS)"
          description="Counter billing terminal with instant catalog search, real-time inventory deduction, and GST-compliant invoicing"
        />

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Product Catalog & Fast Search (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="shadow-xs border-border">
              <CardHeader className="p-4 border-b border-border space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Input
                    placeholder="Search product by SKU, name, or scan barcode..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    icon={Search}
                    className="h-10 text-xs"
                    autoFocus
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Category Pills and Stock Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedCategory === 'ALL'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      All Items ({products.length})
                    </button>
                    {categories.slice(0, 5).map((cat: any) => (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          selectedCategory === cat.id
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox

                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span>In Stock Only</span>
                  </label>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {isLoadingProducts ? (
                  <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                    Loading product catalog...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <div className="text-xs font-semibold text-foreground">No matching products found</div>
                    <div className="text-xs text-muted-foreground">Try adjusting your search or category filter</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredProducts.map((p: any) => {
                      const { sellingPrice, mrp } = getProductPriceDetails(p);
                      const inv = inventoryMap.get(p.id);
                      const stock = inv ? inv.availableQuantity : 0;
                      const inCartItem = cart.find((i) => i.productId === p.id);

                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border transition-all p-3 flex flex-col justify-between relative group ${
                            inCartItem
                              ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/20'
                              : 'border-border bg-card hover:border-primary/40 hover:shadow-xs'
                          }`}
                        >
                          <div>
                            {/* SKU & Stock Badge */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-mono text-[11px] font-bold text-primary truncate max-w-[120px]">
                                {p.sku}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
                                  stock > 10
                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                    : stock > 0
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    : 'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                              </span>
                            </div>

                            {/* Product Name */}
                            <div
                              className="font-medium text-xs text-foreground line-clamp-2 leading-tight"
                              title={p.name}
                            >
                              {p.name}
                            </div>
                          </div>

                          {/* Price & Action Row */}
                          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between gap-2">
                            <div>
                              <div className="font-mono font-bold text-sm text-foreground">
                                {formatCurrency(sellingPrice)}
                              </div>
                              {mrp > sellingPrice && (
                                <div className="text-[10px] text-muted-foreground line-through">
                                  MRP {formatCurrency(mrp)}
                                </div>
                              )}
                            </div>

                            {inCartItem ? (
                              <div className="flex items-center gap-1 bg-background border border-primary/30 rounded-lg p-0.5 shadow-xs">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, -1)}
                                  className="h-6 w-6 rounded flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="font-mono text-xs font-bold px-1.5 text-primary">
                                  {inCartItem.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, 1)}
                                  className="h-6 w-6 rounded flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addToCart(p)}
                                className="h-7 px-2.5 text-xs font-semibold rounded-lg hover:bg-primary hover:text-primary-foreground transition-all"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Active Cart & Fast Checkout (5 cols) */}
          <div className="lg:col-span-5 space-y-4 sticky top-6">
            <Card className="shadow-xs border-border">
              <CardHeader className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                    <ShoppingCart className="h-4 w-4 text-primary" /> Active Cart ({totals.itemCount} items)
                  </CardTitle>
                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCart([])}
                      className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* Customer Details */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground" /> Customer Name
                    </label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in Customer"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground" /> Phone Number
                    </label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Optional phone"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Cart Items List */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground px-1">Order Items</div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-border border rounded-xl border-border bg-background/50">
                    {cart.length === 0 ? (
                      <div className="p-8 text-center space-y-1 text-xs text-muted-foreground">
                        <ShoppingCart className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1" />
                        <div className="font-medium text-foreground">Cart is empty</div>
                        <div>Click on items from the catalog on the left to add</div>
                      </div>
                    ) : (
                      cart.map((item) => {
                        const lineGross = item.quantity * item.unitPrice;
                        const lineTax = lineGross * ((item.taxRate || 0) / 100);
                        const lineTotal = lineGross + lineTax;

                        return (
                          <div key={item.productId} className="p-3 flex items-center justify-between text-xs gap-2">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-mono font-bold text-[11px] text-primary truncate">
                                {item.sku}
                              </div>
                              <div className="truncate text-foreground font-medium text-xs">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {formatCurrency(item.unitPrice)} + {item.taxRate}% GST
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Quantity Stepper */}
                              <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.productId, -1)}
                                  className="h-7 w-7 flex items-center justify-center hover:bg-muted transition-colors text-foreground"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="px-2 font-mono font-bold text-xs">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.productId, 1)}
                                  className="h-7 w-7 flex items-center justify-center hover:bg-muted transition-colors text-foreground"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>

                              {/* Line Total */}
                              <span className="font-mono font-bold text-xs text-foreground w-18 text-right">
                                {formatCurrency(lineTotal)}
                              </span>

                              {/* Remove */}
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.productId)}
                                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="space-y-2 text-xs pt-3 border-t border-border">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal ({totals.itemCount} items):</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(totals.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST (CGST 9% + SGST 9%):</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(totals.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-extrabold text-foreground pt-2 border-t border-border">
                    <span>Total Payable:</span>
                    <span className="font-mono text-primary font-black text-xl">
                      {formatCurrency(totals.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Checkout Button */}
                <Button
                  onClick={handleCheckout}
                  loading={posCheckout.isPending}
                  disabled={cart.length === 0}
                  className="w-full h-11 text-xs font-bold shadow-xs"
                >
                  Complete Sale & Create Accounts Invoice Draft ({formatCurrency(totals.grandTotal)})
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      {completedOrder && (
        <Dialog
          open={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          title="POS sale summary"
          description={`Order ${completedOrder.orderNumber} · official invoice and receipts are managed in Accounts`}
          className="max-w-md"
        >
          <div className="space-y-4 text-xs font-mono p-3 bg-card border border-border rounded-xl">
            {/* Store Header */}
            <div className="text-center border-b border-border pb-3 space-y-1">
              <h2 className="text-base font-black tracking-wider text-foreground">SYNERGY ENTERPRISES</h2>
              <p className="text-muted-foreground text-[11px]">Retail Store & Direct Sales Terminal</p>
              <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                <span>Order: #{completedOrder.orderNumber}</span>
                <span>{new Date().toLocaleString('en-IN')}</span>
              </div>
              <div className="text-left text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                <span>Customer: {(completedOrder as any).customer?.name || (completedOrder as any).customerName || customerName || 'Walk-in Customer'}</span>
              </div>
            </div>

            {/* Line Items */}
            <div className="divide-y divide-border">
              {completedOrder.lines.map((l) => (
                <div key={l.id} className="py-2 flex justify-between items-center text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-foreground truncate">{l.sku}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {l.orderedQuantity} x {formatCurrency(l.unitPrice)} (+{l.taxRate || 18}% GST)
                    </div>
                  </div>
                  <div className="font-bold text-foreground font-mono shrink-0">
                    {formatCurrency(l.lineTotal)}
                  </div>
                </div>
              ))}
            </div>

            {/* Tax & Total Summary */}
            <div className="border-t-2 border-dashed border-border pt-2.5 space-y-1.5">
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal:</span>
                <span className="font-mono">{formatCurrency(completedOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>GST Tax (18%):</span>
                <span className="font-mono">{formatCurrency(completedOrder.taxTotal)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-foreground pt-1.5 border-t border-border">
                <span>GRAND TOTAL:</span>
                <span className="font-mono text-primary text-base">{formatCurrency(completedOrder.grandTotal)}</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-muted-foreground pt-2 border-t border-border">
              This is an operational order summary, not an invoice or payment receipt. Accounts must issue the invoice and record payment.
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 pt-3 print:hidden">
              <Button
                variant="outline"
                className="w-full text-xs font-semibold"
                onClick={() => setReceiptModalOpen(false)}
              >
                Close
              </Button>
              <Button
                className="w-full text-xs font-bold"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print Order Summary
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
