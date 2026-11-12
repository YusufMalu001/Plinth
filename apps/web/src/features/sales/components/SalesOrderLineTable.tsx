'use client';

import React from 'react';
import {
 Table,
 TableBody,
 TableCell,
 TableFooter,
 TableHead,
 TableHeader,
 TableRow,
 Badge,
} from '@plinth/ui';
import { SalesOrder, SalesOrderLine } from '../types';

interface SalesOrderLineTableProps {
 order: SalesOrder;
}

const formatCurrency = (val: number | string, currency = 'INR') => {
 return new Intl.NumberFormat('en-IN', {
 style: 'currency',
 currency,
 maximumFractionDigits: 2,
 }).format(Number(val || 0));
};

export function SalesOrderLineTable({ order }: SalesOrderLineTableProps) {
 const lines = order.lines || [];

 return (
 <div className="overflow-x-auto rounded-xl border border-border bg-card">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>SKU / Item</TableHead>
 <TableHead className="text-right">Ordered</TableHead>
 <TableHead className="text-right">Allocated</TableHead>
 <TableHead className="text-right">Packed</TableHead>
 <TableHead className="text-right">Shipped</TableHead>
 <TableHead className="text-right">Unit Price</TableHead>
 <TableHead className="text-right">Discount</TableHead>
 <TableHead className="text-right">Tax</TableHead>
 <TableHead className="text-right">Line Total</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {lines.map((line: SalesOrderLine) => {
 const ordered = Number(line.orderedQuantity || 0);
 const allocated = Number(line.allocatedQuantity || 0);
 const packed = Number(line.packedQuantity || 0);
 const shipped = Number(line.shippedQuantity || 0);

 return (
 <TableRow key={line.id} className="hover:bg-muted/30">
 <TableCell>
 <div className="font-mono font-bold text-foreground">{line.sku}</div>
 <div className="text-xs text-muted-foreground line-clamp-1">{line.description}</div>
 {line.status && (
 <Badge variant="outline" className="mt-1 text-[10px] uppercase">
 {line.status.replace('_', ' ')}
 </Badge>
 )}
 </TableCell>

 <TableCell className="text-right font-mono font-semibold">
 {ordered}
 </TableCell>

 <TableCell className="text-right font-mono">
 <span
 className={
 allocated >= ordered
 ? 'text-tone-green-text font-semibold'
 : allocated > 0
 ? 'text-tone-amber-text font-semibold'
 : 'text-muted-foreground'
 }
 >
 {allocated}
 </span>
 </TableCell>

 <TableCell className="text-right font-mono">
 <span
 className={
 packed >= ordered
 ? 'text-tone-green-text font-semibold'
 : packed > 0
 ? 'text-tone-amber-text'
 : 'text-muted-foreground'
 }
 >
 {packed}
 </span>
 </TableCell>

 <TableCell className="text-right font-mono">
 <span
 className={
 shipped >= ordered
 ? 'text-tone-green-text font-semibold'
 : shipped > 0
 ? 'text-tone-blue-text'
 : 'text-muted-foreground'
 }
 >
 {shipped}
 </span>
 </TableCell>

 <TableCell className="text-right font-mono text-muted-foreground">
 {formatCurrency(line.unitPrice, order.currency)}
 </TableCell>

 <TableCell className="text-right font-mono text-muted-foreground">
 {Number(line.discountAmount || 0) > 0
 ? formatCurrency(line.discountAmount || 0, order.currency)
 : '—'}
 </TableCell>

 <TableCell className="text-right font-mono text-xs text-muted-foreground">
 {formatCurrency(line.taxAmount, order.currency)}
 {line.taxRate ? ` (${line.taxRate}%)` : ''}
 </TableCell>

 <TableCell className="text-right font-mono font-bold text-foreground">
 {formatCurrency(line.lineTotal, order.currency)}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 <TableFooter>
 <TableRow className="border-t border-border">
 <TableCell colSpan={7} className="text-right font-semibold text-muted-foreground">
 Subtotal:
 </TableCell>
 <TableCell colSpan={2} className="text-right font-mono font-bold text-foreground">
 {formatCurrency(order.subtotal, order.currency)}
 </TableCell>
 </TableRow>
 {Number(order.discountTotal || 0) > 0 && (
 <TableRow>
 <TableCell colSpan={7} className="text-right font-semibold text-muted-foreground">
 Discounts:
 </TableCell>
 <TableCell colSpan={2} className="text-right font-mono font-bold text-tone-green-text">
 -{formatCurrency(order.discountTotal, order.currency)}
 </TableCell>
 </TableRow>
 )}
 <TableRow>
 <TableCell colSpan={7} className="text-right font-semibold text-muted-foreground">
 Taxes (GST):
 </TableCell>
 <TableCell colSpan={2} className="text-right font-mono font-bold text-foreground">
 {formatCurrency(order.taxTotal, order.currency)}
 </TableCell>
 </TableRow>
 <TableRow className="bg-primary/5 text-base">
 <TableCell colSpan={7} className="text-right font-extrabold text-foreground">
 Grand Total:
 </TableCell>
 <TableCell colSpan={2} className="text-right font-mono font-black text-primary text-lg">
 {formatCurrency(order.grandTotal, order.currency)}
 </TableCell>
 </TableRow>
 </TableFooter>
 </Table>
 </div>
 );
}
