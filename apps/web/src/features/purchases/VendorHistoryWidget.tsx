import React from 'react';
import { Card } from '@plinth/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { useVendorHistory } from './hooks';
import { BarChart3, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function VendorHistoryWidget({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { data: history, isLoading: loadingHistory, error } = useVendorHistory(vendorId);

  if (loadingHistory) return <LoadingState message="Loading vendor history..." />;
  if (error) return <ErrorState error={error as Error} />;
  if (!history) return <EmptyState title="No History" description="This vendor has no purchase order history." />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total Orders</span>
          </div>
          <p className="text-2xl font-bold">{history.totalOrders}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total Value</span>
          </div>
          <p className="text-2xl font-bold">
            {history.totalValue?.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) ?? '—'}
          </p>
        </Card>
      </div>

      {/* Order list */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white">Purchase Orders</h2>
        {!history.orders || history.orders.length === 0 ? (
          <EmptyState title="No Orders" description="No purchase orders found for this vendor." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-medium text-muted-foreground">PO Number</th>
                <th className="py-2 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.orders.map(order => (
                <tr key={order.id} role="link" tabIndex={0} onClick={() => router.push(`/procurement/purchase-orders/${order.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); router.push(`/procurement/purchase-orders/${order.id}`); } }} className="cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors">
                  <td className="py-2 font-mono text-xs font-semibold">{order.poNumber}</td>
                  <td className="py-2">
                    <StatusBadge status={order.status} className="text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
