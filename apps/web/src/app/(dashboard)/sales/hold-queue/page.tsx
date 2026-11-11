'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Users,
  CreditCard,
  Pencil,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  useSalesOrders,
  useSalesOrderAction,
  useSalesCustomers,
  useCustomerCreditExposure,
} from '@/features/sales/hooks';
import { SalesOrder, Customer } from '@/features/sales/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { AdminCreditOverrideModal } from '@/features/sales/components/AdminCreditOverrideModal';
import { EditSalesOrderModal } from '@/features/sales/components/EditSalesOrderModal';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

const formatCurrency = (val: number | string, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

const formatDate = (val: string | Date) =>
  new Date(val).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

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
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span className="rounded-xl p-2.5 bg-muted text-foreground">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 text-3xl font-black font-mono tracking-tight text-foreground">
          {value}
        </div>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function CreditHoldQueuePage() {
  const [search, setSearch] = useState('');
  const [selectedOrderForOverride, setSelectedOrderForOverride] = useState<SalesOrder | null>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<SalesOrder | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<SalesOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Queries
  const {
    data: ordersData,
    isLoading: isLoadingOrders,
    refetch: refetchOrders,
    isFetching,
  } = useSalesOrders({ status: 'ON_HOLD', limit: 100 });

  const { data: customersData } = useSalesCustomers({ limit: 1000 });
  const customers = customersData?.items || [];
  const selectedCustomerId = selectedOrderForOverride?.customerId || undefined;
  const { data: selectedCustomerCreditExposure } = useCustomerCreditExposure(
    selectedCustomerId,
    selectedOrderForOverride?.id
  );

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const orderActionMutation = useSalesOrderAction();

  const orders = ordersData?.items || [];

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const query = search.toLowerCase();
    return orders.filter((o) => {
      const customer = o.customerId ? customerMap.get(o.customerId) : null;
      return (
        o.orderNumber.toLowerCase().includes(query) ||
        (customer?.name && customer.name.toLowerCase().includes(query)) ||
        (customer?.code && customer.code.toLowerCase().includes(query)) ||
        (o.notes && o.notes.toLowerCase().includes(query))
      );
    });
  }, [orders, search, customerMap]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalHeldRevenue = 0;
    let totalExcessBreached = 0;
    const uniqueCustomerIds = new Set<string>();

    orders.forEach((o) => {
      const orderTotal = Number(o.grandTotal || 0);
      totalHeldRevenue += orderTotal;
      if (o.customerId) uniqueCustomerIds.add(o.customerId);

      const customer = o.customerId ? customerMap.get(o.customerId) : null;
      const creditLimit = Number(customer?.creditLimit || 0);
      if (creditLimit > 0 && orderTotal > creditLimit) {
        totalExcessBreached += orderTotal - creditLimit;
      }
    });

    return {
      count: orders.length,
      totalHeldRevenue,
      totalExcessBreached,
      uniqueAccounts: uniqueCustomerIds.size,
    };
  }, [orders, customerMap]);

  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;
    try {
      setIsCancelling(true);
      setCancelError(null);
      await orderActionMutation.mutateAsync({
        id: orderToCancel.id,
        action: 'cancel',
        reason: 'Cancelled by Executive from Hold Queue',
      });
      setOrderToCancel(null);
      refetchOrders();
    } catch (err: any) {
      setCancelError(err?.message || 'Failed to cancel order.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Navigation & Header */}
        <Link
          href="/sales"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sales Control Center
        </Link>

        <PageHeader
          title="Hold & Approval Queue"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchOrders()}
                loading={isFetching}
                icon={RefreshCw}
              >
                Refresh Queue
              </Button>
            </div>
          }
        />

        {/* KPI Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Orders on Hold"
            value={metrics.count}
            icon={Clock}
          />
          <MetricCard
            title="Held Order Value"
            value={formatCurrency(metrics.totalHeldRevenue)}
            icon={CreditCard}
          />
          <MetricCard
            title="Excess Risk Exposure"
            value={formatCurrency(metrics.totalExcessBreached)}
            icon={AlertCircle}
          />
          <MetricCard
            title="Accounts Impacted"
            value={metrics.uniqueAccounts}
            icon={Users}
          />
        </div>

        {/* Main Queue Ledger */}
        <Card className="rounded-2xl border-border/70 overflow-hidden shadow-none hover:border-border transition-all">
          <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/60 bg-card/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span>Active Hold Ledger</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {filteredOrders.length} pending
                  </Badge>
                </CardTitle>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search order #, customer name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border/80 bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-none"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoadingOrders ? (
              <div className="p-12 text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span>Loading hold queue records...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground/60 mx-auto" />
                <p className="text-sm font-bold text-foreground">Hold Queue is Clear</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[18%]">Order Details</TableHead>
                    <TableHead className="w-[20%]">Customer / Account</TableHead>
                    <TableHead className="w-[14%] text-right">Approved Limit</TableHead>
                    <TableHead className="w-[14%] text-right">Order Value</TableHead>
                    <TableHead className="w-[14%] text-center">Exposure / Ratio</TableHead>
                    <TableHead className="w-[12%]">Hold Context</TableHead>
                    <TableHead className="w-[10%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const customer = order.customerId ? customerMap.get(order.customerId) : null;
                    const creditLimit = Number(customer?.creditLimit || 0);
                    const orderTotal = Number(order.grandTotal || 0);
                    const ratio = creditLimit > 0 ? Math.round((orderTotal / creditLimit) * 100) : 0;
                    const isOverLimit = creditLimit > 0 && orderTotal > creditLimit;

                    return (
                      <TableRow key={order.id} className="hover:bg-muted/20 transition-colors group">
                        {/* Order Details */}
                        <TableCell>
                          <div className="space-y-1">
                            <Link
                              href={`/sales/orders/${order.id}`}
                              className="font-mono font-bold text-foreground hover:text-primary transition-colors block"
                            >
                              {order.orderNumber}
                            </Link>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>{formatDate(order.orderedAt)}</span>
                              <span>&bull;</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                                {order.channel}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>

                        {/* Customer */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-bold text-foreground block">
                              {customer?.name || order.customerId || 'Direct Buyer'}
                            </span>
                            <span className="text-[11px] text-muted-foreground block font-mono">
                              {customer?.code || 'NO-CODE'} &bull; {customer?.priceTier || customer?.customerType || 'STANDARD'}
                            </span>
                          </div>
                        </TableCell>

                        {/* Approved Limit */}
                        <TableCell className="text-right font-mono">
                          <span className="font-bold text-foreground block">
                            {creditLimit > 0 ? formatCurrency(creditLimit) : 'No Limit Set'}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            {customer?.paymentTerms || 'NET 30'}
                          </span>
                        </TableCell>

                        {/* Order Value */}
                        <TableCell className="text-right font-mono">
                          <span className="font-bold text-foreground block">
                            {formatCurrency(orderTotal)}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            {(order.lines || []).length} items
                          </span>
                        </TableCell>

                        {/* Exposure / Ratio */}
                        <TableCell className="text-center">
                          <div className="space-y-1 max-w-[120px] mx-auto">
                            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                              <span>Utilized</span>
                              <span className="font-bold text-foreground">{ratio}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border/40">
                              <div
                                className={`h-full transition-all ${isOverLimit ? 'bg-foreground' : 'bg-primary'}`}
                                style={{ width: `${Math.min(100, ratio)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Hold Context */}
                        <TableCell className="max-w-[180px]">
                          <p className="text-[11px] text-muted-foreground line-clamp-2" title={order.notes || ''}>
                            {order.notes || 'Order placed in hold queue pending administrative review.'}
                          </p>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedOrderForOverride(order)}
                              className="h-7 px-2.5 text-[11px] font-bold flex items-center gap-1"
                              title="Executive Override & Confirm"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Override
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedOrderForEdit(order)}
                              className="h-7 px-2 text-[11px] font-medium flex items-center gap-1"
                              title="Edit Order Quantities"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>

                            <Link href={`/sales/orders/${order.id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="View Order Details"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setOrderToCancel(order)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Cancel Order"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Admin Override Modal */}
        {selectedOrderForOverride && (
          <AdminCreditOverrideModal
            isOpen={Boolean(selectedOrderForOverride)}
            onClose={() => setSelectedOrderForOverride(null)}
            order={selectedOrderForOverride}
            customer={
              selectedOrderForOverride.customerId
                ? customerMap.get(selectedOrderForOverride.customerId)
                : null
            }
            creditExposure={selectedCustomerCreditExposure}
            onSuccess={() => {
              void refetchOrders();
              setSelectedOrderForOverride(null);
            }}
          />
        )}

        {/* Edit Order Modal */}
        {selectedOrderForEdit && (
          <EditSalesOrderModal
            isOpen={Boolean(selectedOrderForEdit)}
            onClose={() => setSelectedOrderForEdit(null)}
            order={selectedOrderForEdit}
            onSuccess={() => {
              void refetchOrders();
              setSelectedOrderForEdit(null);
            }}
          />
        )}

        {/* Confirm Cancel Order Dialog */}
        <ConfirmDeleteDialog
          open={Boolean(orderToCancel)}
          title="Cancel Sales Order"
          message={`Are you sure you want to cancel order "${orderToCancel?.orderNumber}"? This will release any queue locks and terminate the commercial booking.`}
          error={cancelError}
          isDeleting={isCancelling}
          confirmText="Cancel Order"
          loadingText="Cancelling…"
          onClose={() => {
            setOrderToCancel(null);
            setCancelError(null);
          }}
          onConfirm={handleConfirmCancel}
        />
      </div>
    </div>
  );
}
