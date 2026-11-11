'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  RefreshCw,
  ShoppingBag,
  UploadCloud,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader } from '@plinth/ui';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useImportAmazonOrder, useSalesOrders } from '../../../../features/sales/hooks';
import { useProducts } from '../../../../hooks/useMasterData';
import { SalesOrder } from '../../../../features/sales/types';

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

export default function AmazonChannelPage() {
  const importAmazon = useImportAmazonOrder();
  const { data: productsData } = useProducts('ACTIVE', 1, 500);
  const products = Array.isArray(productsData) ? productsData : productsData?.items || [];

  const { data: ordersData, isLoading, isError, refetch, isFetching } = useSalesOrders({
    channel: 'AMAZON',
    page: 1,
    limit: 50,
  });

  const amazonOrders = ordersData?.items ?? [];

  // Import form state
  const [amazonOrderId, setAmazonOrderId] = useState(`402-${Math.floor(1000000 + Math.random() * 9000000)}-${Math.floor(1000000 + Math.random() * 9000000)}`);
  const [buyerName, setBuyerName] = useState('Rahul Sharma');
  const [buyerEmail, setBuyerEmail] = useState('rahul.sharma@example.com');
  const [selectedSku, setSelectedSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [itemPrice, setItemPrice] = useState(1299);
  const [city, setCity] = useState('Bengaluru');
  const [state, setState] = useState('Karnataka');
  const [postalCode, setPostalCode] = useState('560001');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amazonOrderId) {
      setError('Amazon Order ID is required.');
      return;
    }
    if (!selectedSku) {
      setError('Please select a product SKU.');
      return;
    }

    setError(null);
    setSuccess(null);

    importAmazon.mutate(
      {
        amazonOrderId,
        purchaseDate: new Date().toISOString(),
        orderTotal: itemPrice * quantity,
        currency: 'INR',
        buyerName,
        buyerEmail,
        shippingAddress: {
          name: buyerName,
          phone: '9876543210',
          line1: '12th Cross, Indiranagar',
          city,
          state,
          postalCode,
          country: 'IN',
        },
        items: [
          {
            sku: selectedSku,
            title: products.find((p: any) => p.sku === selectedSku)?.name || 'Amazon Product',
            quantity,
            itemPrice: itemPrice * quantity,
          },
        ],
      },
      {
        onSuccess: (order) => {
          setSuccess(`Successfully imported order ${order.orderNumber} (Amazon: ${amazonOrderId})`);
          setAmazonOrderId(`402-${Math.floor(1000000 + Math.random() * 9000000)}-${Math.floor(1000000 + Math.random() * 9000000)}`);
          void refetch();
        },
        onError: (err: any) => {
          setError(err?.message || 'Failed to import Amazon order.');
        },
      }
    );
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <Link
          href="/sales"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sales Control Center
        </Link>

        <PageHeader
          title="Amazon Marketplace Sync"
          description="Manage Amazon channel order ingestion, SKU mapping validation, and marketplace settlement reconciliation"
          actions={
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={isFetching}
              onClick={() => void refetch()}
            >
              Refresh
            </Button>
          }
        />

        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Amazon Orders
                </span>
                <div className="mt-2 text-3xl font-black font-mono text-primary">
                  {amazonOrders.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <ShoppingBag className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Channel Revenue
                </span>
                <div className="mt-2 text-3xl font-black font-mono text-emerald-600">
                  {formatCurrency(
                    amazonOrders.reduce((s, o) => s + Number(o.grandTotal || 0), 0)
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Adapter Status
                </span>
                <div className="mt-2 text-lg font-bold text-emerald-600 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live / Synchronized
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                <UploadCloud className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ingestion Sandbox & Live Register */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Import Sandbox Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Ingest Amazon Order
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Simulate or test external order feed import with idempotency protection
              </p>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleImport} className="space-y-3 text-xs">
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-700">
                    {success}
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-foreground/80 mb-1">
                    Amazon Order ID *
                  </label>
                  <Input
                    value={amazonOrderId}
                    onChange={(e) => setAmazonOrderId(e.target.value)}
                    required
                    className="h-9 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">Buyer Name</label>
                    <Input
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">Buyer Email</label>
                    <Input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-foreground/80 mb-1">Product SKU *</label>
                  <select
                    value={selectedSku}
                    onChange={(e) => setSelectedSku(e.target.value)}
                    required
                    className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-xs font-medium"
                  >
                    <option value="">Select SKU...</option>
                    {products.map((p: any) => (
                      <option key={p.id} value={p.sku}>
                        {p.sku} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">Quantity</label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className="h-9 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">Unit Price (₹)</label>
                    <Input
                      type="number"
                      min="1"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                      className="h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">City</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">State</label>
                    <Input value={state} onChange={(e) => setState(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground/80 mb-1">PIN Code</label>
                    <Input
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  loading={importAmazon.isPending}
                  className="w-full h-10 mt-2 font-bold"
                >
                  Import Amazon Order
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Amazon Orders Register */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-bold">Imported Amazon Orders</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Orders normalized into core ERP demand ready for warehouse allocation and fulfillment
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {isError ? (
                <ErrorState
                  title="Failed to load Amazon orders"
                  description="Check network connectivity."
                  retry={() => void refetch()}
                />
              ) : isLoading ? (
                <LoadingState message="Loading Amazon channel orders..." />
              ) : amazonOrders.length === 0 ? (
                <EmptyState
                  title="No Amazon orders imported yet"
                  description="Use the Ingest panel on the left to simulate incoming Amazon Marketplace orders."
                />
              ) : (
                <div className="divide-y divide-border">
                  {amazonOrders.map((order: SalesOrder) => {
                    const shipping = order.addresses?.find((a) => a.kind === 'SHIPPING');

                    return (
                      <div
                        key={order.id}
                        className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/sales/orders/${order.id}`}
                              className="font-bold text-primary hover:underline"
                            >
                              {order.orderNumber}
                            </Link>
                            <span className="font-mono text-muted-foreground">
                              ({order.externalOrderId})
                            </span>
                            <StatusBadge status={order.status as any} />
                          </div>
                          <div className="text-muted-foreground">
                            Customer: {shipping?.name || 'Amazon Customer'} · {shipping?.city}, {shipping?.state} · Value: {formatCurrency(order.grandTotal)}
                          </div>
                        </div>

                        <Link href={`/sales/orders/${order.id}`}>
                          <Button variant="outline" size="sm">
                            Open Order <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
