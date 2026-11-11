'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldAlert, Save, AlertCircle } from 'lucide-react';
import { Button, Input } from '@plinth/ui';
import { accountsApi } from '../api';
import { showToast } from '@/components/toast-store';

interface EditTaxInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  onSuccess: () => void;
}

export function EditTaxInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: EditTaxInvoiceModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<
    Array<{
      id?: string;
      salesOrderLineId?: string;
      lineNumber: number;
      description: string;
      quantity: string;
      unitPrice: string;
      discountAmount: string;
      taxRate: string;
    }>
  >([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (invoice && isOpen) {
      setNotes(invoice.notes || '');
      const mapped = (invoice.lines || []).map((l: any, idx: number) => ({
        id: l.id,
        salesOrderLineId: l.salesOrderLineId,
        lineNumber: l.lineNumber || idx + 1,
        description: l.description || '',
        quantity: String(l.quantity || '1'),
        unitPrice: String(l.unitPrice || '0'),
        discountAmount: String(l.discountAmount || '0'),
        taxRate: String(l.taxRate || l.gstRate || '18'),
      }));
      setLines(mapped);
    }
  }, [invoice, isOpen]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const updateLine = (index: number, field: string, value: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const calculatedTotals = lines.reduce(
    (acc, l) => {
      const q = parseFloat(l.quantity || '0');
      const p = parseFloat(l.unitPrice || '0');
      const d = parseFloat(l.discountAmount || '0');
      const r = parseFloat(l.taxRate || '0');
      const gross = q * p;
      const taxable = Math.max(0, gross - d);
      const tax = (taxable * r) / 100;
      acc.subtotal += gross;
      acc.discountTotal += d;
      acc.taxTotal += tax;
      acc.grandTotal += taxable + tax;
      return acc;
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) {
      showToast({
        kind: 'error',
        title: 'Validation Error',
        message: 'The invoice must have at least one line item.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await accountsApi.updateArInvoice(invoice.id, {
        lines: lines.map((l) => ({
          salesOrderLineId: l.salesOrderLineId,
          lineNumber: l.lineNumber,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRate: l.taxRate,
        })),
        notes,
      });

      showToast({
        kind: 'success',
        title: 'Tax Invoice Updated',
        message: `Tax Invoice ${invoice.invoiceNumber} was updated successfully under Administrator authority.`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: err?.status === 403 ? 'Admin Authorization Required' : 'Invoice Modification Failed',
        message:
          err?.message ||
          'Failed to update tax invoice. Administrator authorization is required.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-foreground border border-amber-500/30">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Admin Authorization Required</span>
            </div>
            <h2 className="text-xl font-black text-foreground">
              Modify Accounts Tax Invoice
            </h2>
            <p className="text-xs text-muted-foreground">
              Editing Tax Invoice{' '}
              <span className="font-mono font-bold text-foreground">
                {invoice?.invoiceNumber}
              </span>{' '}
              for {invoice?.customerName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Line Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Invoice Lines &amp; Pricing
              </h3>
              <span className="text-xs text-muted-foreground">
                {lines.length} Line Items
              </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-[11px] font-bold uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3 w-10">#</th>
                      <th className="p-3 min-w-[200px]">Description</th>
                      <th className="p-3 w-24">Qty</th>
                      <th className="p-3 w-28">Unit Price (₹)</th>
                      <th className="p-3 w-24">Disc (₹)</th>
                      <th className="p-3 w-20">GST %</th>
                      <th className="p-3 w-28 text-right">Taxable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, idx) => {
                      const q = parseFloat(line.quantity || '0');
                      const p = parseFloat(line.unitPrice || '0');
                      const d = parseFloat(line.discountAmount || '0');
                      const taxable = Math.max(0, q * p - d);

                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="p-3 font-mono text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="p-3">
                            <Input
                              value={line.description}
                              onChange={(e) =>
                                updateLine(idx, 'description', e.target.value)
                              }
                              className="h-8 text-xs font-medium"
                              required
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="any"
                              min="0.001"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(idx, 'quantity', e.target.value)
                              }
                              className="h-8 text-xs font-mono"
                              required
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(idx, 'unitPrice', e.target.value)
                              }
                              className="h-8 text-xs font-mono"
                              required
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.discountAmount}
                              onChange={(e) =>
                                updateLine(idx, 'discountAmount', e.target.value)
                              }
                              className="h-8 text-xs font-mono"
                            />
                          </td>
                          <td className="p-3">
                            <select
                              value={line.taxRate}
                              onChange={(e) =>
                                updateLine(idx, 'taxRate', e.target.value)
                              }
                              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-mono"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-foreground">
                            ₹{taxable.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Changes will adjust invoice totals, General Ledger journals upon
                posting, and remaining customer dues.
              </span>
            </div>

            <div className="space-y-1 text-right text-xs">
              <div className="text-muted-foreground">
                Subtotal: ₹{calculatedTotals.subtotal.toFixed(2)}
              </div>
              <div className="text-muted-foreground">
                GST Tax: ₹{calculatedTotals.taxTotal.toFixed(2)}
              </div>
              <div className="text-base font-black font-mono text-foreground">
                Grand Total: ₹{calculatedTotals.grandTotal.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm"
            >
              <Save className="h-4 w-4" />
              <span>{isSubmitting ? 'Saving...' : 'Apply Admin Modification'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
