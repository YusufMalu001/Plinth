'use client';

import React, { useState } from 'react';
import {
  Button,
  Dialog,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { RotateCcw } from 'lucide-react';
import { SalesOrder } from '../types';
import { useCreateSalesReturn, useProcessReturnDisposition } from '../hooks';

interface SalesReturnModalProps {
  order: SalesOrder;
  open: boolean;
  onClose: () => void;
}

export function SalesReturnModal({ order, open, onClose }: SalesReturnModalProps) {
  const isDispositionMode = order.status === 'RETURNED';

  const createReturn = useCreateSalesReturn();
  const processDisposition = useProcessReturnDisposition();

  const lines = order.lines || [];

  // State for return creation
  const [returnReason, setReturnReason] = useState<string>('DAMAGED_IN_TRANSIT');
  const [returnRemarks, setReturnRemarks] = useState<string>('');
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    lines.forEach((l) => {
      const shipped = Number(l.shippedQuantity || 0);
      init[l.id] = shipped > 0 ? shipped : 0;
    });
    return init;
  });

  // State for disposition
  const [disposition, setDisposition] = useState<'RESTOCK' | 'QUARANTINE' | 'SCRAP'>('RESTOCK');
  const [creditedNetAmount, setCreditedNetAmount] = useState<string>('');
  const [taxCreditAmount, setTaxCreditAmount] = useState<string>('');
  const [sourceReference, setSourceReference] = useState<string>('');
  const [creditOccurredAt, setCreditOccurredAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dispositionNotes, setDispositionNotes] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  const handleInitiateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(returnQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([lineId, quantity]) => ({
        salesOrderLineId: lineId,
        quantity,
        reason: returnReason,
      }));

    if (!items.length) {
      setError('Please specify return quantities for at least one item.');
      return;
    }

    setError(null);
    createReturn.mutate(
      {
        id: order.id,
        returnInput: {
          reason: `${returnReason}${returnRemarks ? `: ${returnRemarks}` : ''}`,
          items,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => {
          setError(err?.message || 'Failed to initiate return.');
        },
      }
    );
  };

  const handleProcessDisposition = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    processDisposition.mutate(
      {
        id: order.id,
          dispositionInput: {
            disposition,
            creditedNetAmount: creditedNetAmount.trim() ? Number(creditedNetAmount) : undefined,
            taxCreditAmount: taxCreditAmount.trim() ? Number(taxCreditAmount) : undefined,
            sourceReference: sourceReference.trim() || undefined,
            occurredAt: creditOccurredAt ? new Date(`${creditOccurredAt}T12:00:00`).toISOString() : undefined,
            notes: dispositionNotes || undefined,
        },
      },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => {
          setError(err?.message || 'Failed to process return disposition.');
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isDispositionMode ? 'Process Return & Inspection Disposition' : 'Authorize Sales Return (RMA)'}
      description={`Order: ${order.orderNumber} · Customer: ${order.customerId || 'Direct'}`}
      className="max-w-xl"
    >
      {isDispositionMode ? (
        <form onSubmit={handleProcessDisposition} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Items have been received at the warehouse. Select the quality inspection disposition and
            optionally issue a customer refund.
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Quality Inspection Disposition *
            </label>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as any)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm"
            >
              <option value="RESTOCK">Restock (Passed Inspection — Return to Saleable Inventory)</option>
              <option value="QUARANTINE">Quarantine (Requires Further Engineering / Lab Review)</option>
              <option value="SCRAP">Scrap / Write-off (Damaged beyond repair)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-foreground/80 mb-1">
                Credited Net Amount (₹, optional)
              </label>
              <Input type="number" step="0.01" min="0" value={creditedNetAmount} onChange={(e) => setCreditedNetAmount(e.target.value)} />
              <p className="mt-1 text-[10px] text-muted-foreground">This creates a credit-note candidate for Finance review. Any cash refund must be handled in Accounts.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground/80 mb-1">
                Recorded Tax Credit (₹, optional)
              </label>
              <Input type="number" step="0.01" min="0" value={taxCreditAmount} onChange={(e) => setTaxCreditAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Credit Note / Source Reference (optional)
            </label>
            <Input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} maxLength={80} placeholder="Credit note or approval document ID" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">Credit Occurrence Date</label>
            <Input type="date" value={creditOccurredAt} onChange={(e) => setCreditOccurredAt(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Inspection Notes / Disposition Remarks
            </label>
            <Input
              value={dispositionNotes}
              onChange={(e) => setDispositionNotes(e.target.value)}
              placeholder="e.g. Inspected packaging, intact seal, restocked to shelf"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={processDisposition.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={processDisposition.isPending} icon={RotateCcw}>
              Resolve Return & Close
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleInitiateReturn} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Reason for Return *
            </label>
            <select
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm"
            >
              <option value="DAMAGED_IN_TRANSIT">Damaged in Transit</option>
              <option value="DEFECTIVE_PRODUCT">Defective / Non-functional Product</option>
              <option value="WRONG_ITEM_SENT">Incorrect Item Sent</option>
              <option value="CUSTOMER_CANCELLED">Customer Changed Mind / Refused Delivery</option>
              <option value="QUALITY_NOT_SATISFACTORY">Quality Not Satisfactory</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1">
              Detailed Remarks
            </label>
            <Input
              value={returnRemarks}
              onChange={(e) => setReturnRemarks(e.target.value)}
              placeholder="Specific customer feedback or damage details"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/80 mb-1.5">
              Items to Return
            </label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Shipped</TableHead>
                  <TableHead className="text-right w-24">Return Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const shipped = Number(line.shippedQuantity || 0);

                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono font-medium">{line.sku}</TableCell>
                      <TableCell className="text-right font-mono">{shipped}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          max={shipped}
                          value={returnQuantities[line.id] ?? 0}
                          onChange={(e) =>
                            setReturnQuantities({
                              ...returnQuantities,
                              [line.id]: Math.min(shipped, Math.max(0, Number(e.target.value))),
                            })
                          }
                          className="h-8 text-right font-mono text-xs w-20 ml-auto"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={createReturn.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={createReturn.isPending} icon={RotateCcw}>
              Authorize Return (RMA)
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
