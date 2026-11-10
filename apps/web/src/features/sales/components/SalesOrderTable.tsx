'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Eye, MapPin, Package, Truck } from 'lucide-react';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@synergy/ui';
import { StatusBadge } from '../../../components/StatusBadge';
import { SalesOrder } from '../types';

interface SalesOrderTableProps {
  orders: SalesOrder[];
  onAction?: (order: SalesOrder, action: string) => void;
}

const formatCurrency = (val: number | string, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(val || 0));
};

export function SalesOrderTable({ orders, onAction }: SalesOrderTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">Order Details</TableHead>
          <TableHead className="w-[120px]">Channel</TableHead>
          <TableHead className="min-w-[220px]">Customer / Ship To</TableHead>
          <TableHead className="w-[150px]">Order Status</TableHead>
          <TableHead className="w-[160px]">Allocation</TableHead>
          <TableHead className="w-[160px] text-right">Grand Total</TableHead>
          <TableHead className="w-[180px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const shippingAddress = order.addresses?.find((a) => a.kind === 'SHIPPING');
          const customerDisplay = shippingAddress?.name || order.customerId || 'Walk-in / Direct Customer';

          return (
            <TableRow
              key={order.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors group"
            >
              {/* Order # & Date */}
              <TableCell className="py-3.5">
                <Link
                  href={`/sales/orders/${order.id}`}
                  className="font-mono font-bold text-sm text-foreground group-hover:text-primary transition-colors hover:underline inline-block"
                >
                  {order.orderNumber}
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Calendar className="h-3 w-3 text-muted-foreground/70" />
                  <span>
                    {new Date(order.orderedAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </TableCell>

              {/* Channel */}
              <TableCell className="py-3.5">
                <Badge
                  variant="outline"
                  className="font-mono text-[11px] uppercase tracking-wider bg-background/60 font-semibold px-2 py-0.5 border-border/80"
                >
                  {order.channel.replace('_', ' ')}
                </Badge>
              </TableCell>

              {/* Customer / Destination */}
              <TableCell className="py-3.5">
                <div className="font-semibold text-sm text-foreground line-clamp-1">
                  {customerDisplay}
                </div>
                {shippingAddress?.city ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                    <span className="truncate">
                      {shippingAddress.city}, {shippingAddress.state || shippingAddress.country || ''}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/60 mt-0.5">No dispatch address</div>
                )}
              </TableCell>

              {/* Status Badges */}
              <TableCell className="py-3.5">
                <StatusBadge status={order.status as any} />
              </TableCell>

              <TableCell className="py-3.5">
                <StatusBadge status={order.allocationStatus as any} />
              </TableCell>

              {/* Grand Total */}
              <TableCell className="text-right py-3.5">
                <div className="font-mono font-bold text-sm text-foreground">
                  {formatCurrency(order.grandTotal, order.currency)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {order.lines?.length || 0} {order.lines?.length === 1 ? 'item' : 'items'}
                </div>
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right py-3.5">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={`/sales/orders/${order.id}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Eye}
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View
                    </Button>
                  </Link>
                  {['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(order.status) && onAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Package}
                      onClick={() => onAction(order, 'allocate')}
                      className="h-8 px-2.5 text-xs"
                    >
                      {order.status === 'PARTIALLY_ALLOCATED' ? 'Allocate More' : 'Allocate'}
                    </Button>
                  )}
                  {order.status === 'READY_TO_DISPATCH' && onAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Truck}
                      onClick={() => onAction(order, 'dispatch')}
                      className="h-8 px-2.5 text-xs"
                    >
                      Dispatch
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
