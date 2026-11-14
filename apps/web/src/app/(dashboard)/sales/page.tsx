'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@plinth/ui';
import { useSalesMetrics, useSalesOrders } from '../../../features/sales/hooks';
import { SalesOrderTable } from '../../../features/sales/components/SalesOrderTable';
import { TableToolbar } from '../../../components/TableToolbar';
import { PaginationControls } from '../../../components/PaginationControls';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { EmptyState } from '../../../components/EmptyState';
import { SalesAllocationModal } from '../../../features/sales/components/SalesAllocationModal';
import { SalesDispatchModal } from '../../../features/sales/components/SalesDispatchModal';
import { SalesOrder, SalesOrderStatus, SalesChannel } from '../../../features/sales/types';
import { ModuleRecommendationsPanel } from '@/features/intelligence/components/ModuleRecommendationsPanel';

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: any;
}) {
  return (
    <Card className="rounded-2xl border-border/70 overflow-hidden shadow-none hover:border-border transition-all">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span className="rounded-xl p-2.5 bg-muted/70 text-foreground border border-border/50">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground">
          {value}
        </div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');
  const [channel, setChannel] = useState<SalesChannel | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);

  const {
    data: ordersData,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
    isFetching,
  } = useSalesOrders({
    page,
    limit: pageSize,
    search: search || undefined,
    status: status || undefined,
    channel: channel || undefined,
  });

  const { data: metricsData } = useSalesMetrics();

  const orders = ordersData?.items ?? [];
  const totalOrders = ordersData?.total ?? 0;

  const handleAction = (order: SalesOrder, action: string) => {
    setSelectedOrder(order);
    if (action === 'allocate') {
      setAllocationModalOpen(true);
    } else if (action === 'dispatch') {
      setDispatchModalOpen(true);
    }
  };

  const statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'On Hold', value: 'ON_HOLD' },
    { label: 'Partially Allocated', value: 'PARTIALLY_ALLOCATED' },
    { label: 'Allocated', value: 'ALLOCATED' },
    { label: 'Packing', value: 'PACKING' },
    { label: 'Packed', value: 'PACKED' },
    { label: 'Ready To Dispatch', value: 'READY_TO_DISPATCH' },
    { label: 'Dispatched', value: 'DISPATCHED' },
    { label: 'Delivered', value: 'DELIVERED' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'Returned', value: 'RETURNED' },
  ];

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          title="Sales & Order Control Center"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchOrders()}
                loading={isFetching}
                icon={RefreshCw}
              >
                Refresh
              </Button>
              <Link href="/sales/orders/new">
                <Button size="sm" icon={Plus}>
                  New Sales Order
                </Button>
              </Link>
            </div>
          }
        />

        <ModuleRecommendationsPanel module="SALES" />

        {/* Top KPI Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Open Orders"
            value={metricsData?.openOrders ?? 0}
            icon={ShoppingCart}
          />
          <MetricCard
            title="Allocation Queue"
            value={metricsData?.allocationNeeded ?? 0}
            icon={PackageCheck}
          />
          <MetricCard
            title="Fulfillment Queue"
            value={metricsData?.fulfillmentQueue ?? 0}
            icon={Package}
          />
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(metricsData?.totalRevenue ?? 0)}
            icon={DollarSign}
          />
        </div>

        {/* Order Register Table */}
        <Card className="rounded-2xl border-border/70 overflow-hidden shadow-none hover:border-border transition-all">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-5 border-border-strong border-border/60 bg-card/40">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>Sales Order Register</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-muted text-muted-foreground">
                  {totalOrders}
                </span>
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TableToolbar
                search={search}
                onSearch={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                searchPlaceholder="Search order #, customer, external ID…"
                filter={status}
                onFilter={(val) => {
                  setStatus(val as SalesOrderStatus | '');
                  setPage(1);
                }}
                filterOptions={statusOptions}
                filterVariant="dropdown"
                filterLabel="Filter by status"
              />
              <select
                aria-label="Filter by channel"
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as SalesChannel | '');
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-border/80 bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-none"
              >
                <option value="">All Channels</option>
                <option value="E_TRADE">E-trade</option>
                <option value="STORE_POS">Store POS</option>
                <option value="AMAZON">Amazon</option>
              </select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {ordersError ? (
              <ErrorState
                title="Failed to load orders"
                description="Check network connectivity or API health."
                retry={() => void refetchOrders()}
              />
            ) : ordersLoading ? (
              <LoadingState message="Loading live sales orders..." />
            ) : orders.length === 0 ? (
              <EmptyState
                title="No sales orders found"
                description="Try adjusting your search filters, or create a new order."
                action={
                  <Link href="/sales/orders/new">
                    <Button size="sm" icon={Plus}>
                      Create Sales Order
                    </Button>
                  </Link>
                }
              />
            ) : (
              <>
                <SalesOrderTable orders={orders} onAction={handleAction} />
                <div className="p-4 border-t border-border">
                  <PaginationControls
                    page={page}
                    pageSize={pageSize}
                    total={totalOrders}
                    onPageChange={setPage}
                    onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocation Modal */}
      {selectedOrder && (
        <SalesAllocationModal
          order={selectedOrder}
          open={allocationModalOpen}
          onClose={() => {
            setAllocationModalOpen(false);
            setSelectedOrder(null);
            void refetchOrders();
          }}
        />
      )}

      {/* Dispatch Modal */}
      {selectedOrder && (
        <SalesDispatchModal
          order={selectedOrder}
          open={dispatchModalOpen}
          onClose={() => {
            setDispatchModalOpen(false);
            setSelectedOrder(null);
            void refetchOrders();
          }}
        />
      )}
    </div>
  );
}
