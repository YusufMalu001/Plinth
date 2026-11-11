'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Dialog } from '@plinth/ui';
import { SalesOrder } from '../types';

interface SalesInvoiceModalProps {
  order: SalesOrder;
  open: boolean;
  onClose: () => void;
}

export function SalesInvoiceModal({ order, open, onClose }: SalesInvoiceModalProps) {
  const proForma = (order as any).proFormaInvoice as any;
  const invoices = ((order as any).accountingInvoices || []) as Array<{
    id: string;
    invoiceNumber: string | null;
    status: string;
    currency: string;
    totalAmount: number | string;
    invoiceDate: string;
    sourceShipmentId: string | null;
  }>;

  return (
    <Dialog open={open} onClose={onClose} title="Order documents" description={`Sales order ${order.orderNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The pro forma is the temporary commercial bill for this order. Order edits update it until dispatch, when it is locked. It is not a tax invoice and does not post receivables or revenue.
        </p>
        {proForma && <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3"><div><div className="font-semibold">Pro Forma {proForma.proFormaNumber}</div><div className="text-xs text-muted-foreground">{proForma.status} · {proForma.lockedAt ? 'Locked at dispatch' : 'Editable until dispatch'}</div></div><div className="font-mono font-semibold">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency || 'INR' }).format(Number(proForma.totalAmount))}</div></div>
          <div className="mt-3 space-y-1 text-xs">{(proForma.lines || []).map((line: any) => <div key={line.id} className="flex justify-between gap-3"><span>{line.description} × {line.quantity}</span><span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: order.currency || 'INR' }).format(Number(line.totalAmount || 0))}</span></div>)}</div>
        </div>}
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            No Accounts tax invoice draft has been created yet. Finance billing starts at shipment handover.
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="font-semibold">{invoice.invoiceNumber || 'Draft invoice'}</div>
                  <div className="text-xs text-muted-foreground">
                    {invoice.sourceShipmentId ? `Shipment ${invoice.sourceShipmentId}` : 'POS / order billing'} · {new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: invoice.currency || 'INR' }).format(Number(invoice.totalAmount))}</div>
                  <div className="text-xs text-muted-foreground">{invoice.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Link href="/accounts/pro-formas" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Open Accounts pro formas</Link>
        </div>
      </div>
    </Dialog>
  );
}
