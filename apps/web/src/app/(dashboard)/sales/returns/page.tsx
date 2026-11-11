'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader } from '@plinth/ui';
import { StatusBadge } from '../../../../components/StatusBadge';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useSalesOrders } from '../../../../features/sales/hooks';
import { SalesReturnModal } from '../../../../features/sales/components/SalesReturnModal';
import { SalesOrder } from '../../../../features/sales/types';

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

export default function ReturnsPage() {
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useSalesOrders({
    page: 1,
    limit: 100,
    search: search || undefined,
  });

  const allOrders = data?.items ?? [];
  // Orders with returns: either status is RETURNED or has lines with returnedQuantity > 0
  const returnsQueue = allOrders.filter(
    (o) =>
      o.status === 'RETURNED' ||
      (o.lines || []).some((l) => Number(l.returnedQuantity || 0) > 0)
  );

  const handleOpenReturnModal = (order: SalesOrder) => {
    setSelectedOrder(order);
    setReturnModalOpen(true);
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
          title="Returns & Refunds Control"
          description="Manage customer return authorizations (RMA), warehouse receipt inspection, inventory restock, and credit refunds"
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
                  Active Returns
                </span>
                <div className="mt-2 text-3xl font-black font-mono text-rose-600">
                  {returnsQueue.filter((o) => o.status === 'RETURNED').length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600">
                <RotateCcw className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Resolved Returns
                </span>
                <div className="mt-2 text-3xl font-black font-mono text-emerald-600">
                  {returnsQueue.filter((o) => o.status === 'CLOSED').length}
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
                  Return Value
                </span>
                <div className="mt-2 text-3xl font-black font-mono text-foreground">
                  {formatCurrency(
                    returnsQueue.reduce((s, o) => s + Number(o.grandTotal || 0), 0)
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Returns Queue Table */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border">
            <div>
              <CardTitle className="text-base font-bold">Return Authorizations & Exceptions</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Process warehouse receipt, quality inspection disposition (Restock, Quarantine, Scrap), and refunds
              </p>
            </div>
            <div className="w-64">
              <Input
                placeholder="Search return orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={Search}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isError ? (
              <ErrorState
                title="Failed to load returns"
                description="Check network connectivity."
                retry={() => void refetch()}
              />
            ) : isLoading ? (
              <LoadingState message="Loading returns queue..." />
            ) : returnsQueue.length === 0 ? (
              <EmptyState
                title="No active returns"
                description="Orders requiring return authorization or inspection disposition will appear here."
              />
            ) : (
              <div className="divide-y divide-border">
                {returnsQueue.map((order) => {
                  const returnException = order.exceptions?.find((e) => e.code === 'RETURN_REQUESTED');

                  return (
                    <div
                      key={order.id}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/sales/orders/${order.id}`}
                            className="font-bold text-primary hover:underline text-sm"
                          >
                            {order.orderNumber}
                          </Link>
                          <Badge variant="outline">{order.channel.replace('_', ' ')}</Badge>
                          <StatusBadge status={order.status as any} />
                          <StatusBadge status={order.paymentStatus as any} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {returnException?.message || 'Return pending warehouse inspection'} · Value: {formatCurrency(order.grandTotal)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {order.status === 'RETURNED' ? (
                          <Button
                            size="sm"
                            icon={RotateCcw}
                            onClick={() => handleOpenReturnModal(order)}
                          >
                            Process Disposition
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={RotateCcw}
                            onClick={() => handleOpenReturnModal(order)}
                          >
                            Return Details
                          </Button>
                        )}
                        <Link href={`/sales/orders/${order.id}`}>
                          <Button variant="ghost" size="icon" aria-label="View Order">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedOrder && (
        <SalesReturnModal
          order={selectedOrder}
          open={returnModalOpen}
          onClose={() => {
            setReturnModalOpen(false);
            setSelectedOrder(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
