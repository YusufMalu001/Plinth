'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@plinth/ui';
import { PurchaseBill, PurchaseBillKind } from '../types';
import { formatCurrency } from '../utils';

interface EditBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: PurchaseBill;
  isAdmin: boolean;
  onSave: (payload: any) => Promise<void>;
}

interface EditableLine {
  id?: string;
  lineNumber: number;
  description: string;
  hsnSacCode: string;
  quantity: string;
  unitPrice: string;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  poLineId?: string;
  grnLineId?: string;
  debitAccountId?: string;
}

export function EditBillModal({ isOpen, onClose, bill, isAdmin, onSave }: EditBillModalProps) {
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(bill.supplierInvoiceNumber || '');
  const [invoiceDate, setInvoiceDate] = useState(
    bill.invoiceDate ? bill.invoiceDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(
    bill.dueDate ? bill.dueDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [kind, setKind] = useState<PurchaseBillKind>(bill.kind || 'STOCK');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateTaxes = (qtyStr: string, priceStr: string, gstStr: string) => {
    const qty = parseFloat(qtyStr) || 0;
    const price = parseFloat(priceStr) || 0;
    const taxable = Math.round(qty * price * 100) / 100;
    const rate = parseFloat(gstStr) || 0;
    const totalTax = Math.round(((taxable * rate) / 100) * 100) / 100;
    const halfTax = Math.round((totalTax / 2) * 100) / 100;

    return {
      taxableAmount: taxable.toFixed(2),
      cgstAmount: halfTax.toFixed(2),
      sgstAmount: (totalTax - halfTax).toFixed(2),
      igstAmount: '0.00',
    };
  };

  const [lines, setLines] = useState<EditableLine[]>(() => {
    if (bill.lines && bill.lines.length > 0) {
      return bill.lines.map((l) => ({
        id: l.id,
        lineNumber: l.lineNumber,
        description: l.description,
        hsnSacCode: l.hsnSacCode || '',
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        gstRate: String(l.gstRate ?? '18'),
        taxableAmount: String(l.taxableAmount || '0.00'),
        cgstAmount: String(l.cgstAmount || '0.00'),
        sgstAmount: String(l.sgstAmount || '0.00'),
        igstAmount: String(l.igstAmount || '0.00'),
        poLineId: l.poLineId,
        grnLineId: l.grnLineId,
        debitAccountId: l.debitAccountId,
      }));
    }
    return [
      {
        lineNumber: 1,
        description: 'Item',
        hsnSacCode: '',
        quantity: '1',
        unitPrice: '0.00',
        gstRate: '18',
        taxableAmount: '0.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '0.00',
      },
    ];
  });

  if (!isOpen) return null;

  const handleLineChange = (index: number, field: keyof EditableLine, value: string) => {
    setLines((prev) => {
      const next = [...prev];
      const current = { ...next[index], [field]: value };

      if (field === 'quantity' || field === 'unitPrice' || field === 'gstRate') {
        const calcs = calculateTaxes(
          field === 'quantity' ? value : current.quantity,
          field === 'unitPrice' ? value : current.unitPrice,
          field === 'gstRate' ? value : current.gstRate
        );
        current.taxableAmount = calcs.taxableAmount;
        current.cgstAmount = calcs.cgstAmount;
        current.sgstAmount = calcs.sgstAmount;
        current.igstAmount = calcs.igstAmount;
      }

      next[index] = current;
      return next;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        lineNumber: prev.length + 1,
        description: '',
        hsnSacCode: '',
        quantity: '1',
        unitPrice: '0.00',
        gstRate: '18',
        taxableAmount: '0.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '0.00',
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((l, i) => ({ ...l, lineNumber: i + 1 }))
    );
  };

  const totalTaxable = lines.reduce((acc, l) => acc + (parseFloat(l.taxableAmount) || 0), 0);
  const totalCgst = lines.reduce((acc, l) => acc + (parseFloat(l.cgstAmount) || 0), 0);
  const totalSgst = lines.reduce((acc, l) => acc + (parseFloat(l.sgstAmount) || 0), 0);
  const totalIgst = lines.reduce((acc, l) => acc + (parseFloat(l.igstAmount) || 0), 0);
  const totalTax = totalCgst + totalSgst + totalIgst;
  const grossTotal = totalTaxable + totalTax;
  const debitNoteDeduction = parseFloat(bill.debitNoteDeduction || '0');
  const netPayable = Math.max(0, grossTotal - debitNoteDeduction);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierInvoiceNumber.trim()) {
      setError('Supplier Invoice Number is required.');
      return;
    }
    if (lines.length === 0) {
      setError('At least one line item is required.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        entityId: bill.entityId,
        vendorId: bill.vendorId,
        version: bill.version,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        invoiceDate,
        dueDate,
        kind,
        note: note.trim() || undefined,
        lines: lines.map((l, idx) => ({
          lineNumber: idx + 1,
          description: l.description.trim() || `Item ${idx + 1}`,
          hsnSacCode: l.hsnSacCode?.trim() || undefined,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
          taxableAmount: l.taxableAmount,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          poLineId: l.poLineId || undefined,
          grnLineId: l.grnLineId || undefined,
          debitAccountId: l.debitAccountId || undefined,
        })),
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update supplier bill.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-foreground ">
                Accounts Modification
              </span>
              <span className="text-xs text-muted-foreground font-mono">v{bill.version}</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-foreground">Edit Supplier Bill Details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update invoice reference, settlement dates, quantities, rates, and HSN codes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Notice */}
        <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-xs text-foreground    flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-foreground mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {isAdmin
                ? 'Admin Edit Mode: As an Administrator, your modifications will remain approved.'
                : 'Pending Admin Approval Workflow: Saving changes will notify the Admin. The bill will transition to "Awaiting Approval" and will require Admin approval before payments can be disbursed.'}
            </p>
            <p className="text-muted-foreground">
              Direct conversion from GRN lines ensures item integrity. All modifications are logged in the audit trail.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-semibold text-destructive  ">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Top Form Fields */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Supplier Invoice # *
              </label>
              <input
                type="text"
                required
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-001"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Invoice Date *
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment Due Date *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Bill Classification
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as PurchaseBillKind)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="STOCK">STOCK (Inventory / Raw Material)</option>
                <option value="SERVICE">SERVICE (Operational Expense)</option>
                <option value="CAPITAL">CAPITAL (Fixed Asset)</option>
                <option value="LOGISTICS">LOGISTICS (Freight / Transport)</option>
              </select>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Line Items &amp; Taxable Values</h3>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </Button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-2.5 font-semibold w-10">#</th>
                    <th className="p-2.5 font-semibold min-w-[180px]">Item Description</th>
                    <th className="p-2.5 font-semibold w-24">HSN/SAC</th>
                    <th className="p-2.5 font-semibold w-24">Qty</th>
                    <th className="p-2.5 font-semibold w-28">Unit Price (₹)</th>
                    <th className="p-2.5 font-semibold w-20">GST %</th>
                    <th className="p-2.5 font-semibold w-28">Taxable</th>
                    <th className="p-2.5 font-semibold w-28">Tax (₹)</th>
                    <th className="p-2.5 font-semibold w-32">Total (₹)</th>
                    <th className="p-2.5 font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const lineTax = (parseFloat(line.cgstAmount) || 0) + (parseFloat(line.sgstAmount) || 0) + (parseFloat(line.igstAmount) || 0);
                    const lineTotal = (parseFloat(line.taxableAmount) || 0) + lineTax;

                    return (
                      <tr key={idx} className="hover:bg-muted/10 transition">
                        <td className="p-2.5 font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            required
                            value={line.description}
                            onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                            placeholder="Description"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={line.hsnSacCode}
                            onChange={(e) => handleLineChange(idx, 'hsnSacCode', e.target.value)}
                            placeholder="e.g. 7208"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            required
                            value={line.quantity}
                            onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={line.unitPrice}
                            onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono focus:ring-1 focus:ring-ring"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={line.gstRate}
                            onChange={(e) => handleLineChange(idx, 'gstRate', e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold focus:ring-1 focus:ring-ring"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground">
                          {formatCurrency(line.taxableAmount)}
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground">
                          {formatCurrency(lineTax)}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-foreground">
                          {formatCurrency(lineTotal)}
                        </td>
                        <td className="p-2.5 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-destructive hover:text-destructive transition"
                              title="Remove Line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes & Summary Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Modification Note / Reason (Optional)
              </label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain the changes made (e.g., corrected rate to match physical invoice, revised tax percentage, etc.)"
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Total Taxable Amount</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(totalTaxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total GST (CGST + SGST)</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(totalTax)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-foreground">
                <span>Gross Invoice Total</span>
                <span className="font-mono text-foreground ">{formatCurrency(grossTotal)}</span>
              </div>
              {debitNoteDeduction > 0 && (
                <div className="flex justify-between text-destructive  font-semibold">
                  <span>Less: Debit Notes Deductions</span>
                  <span className="font-mono">- {formatCurrency(debitNoteDeduction)}</span>
                </div>
              )}
              {debitNoteDeduction > 0 && (
                <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-foreground">
                  <span>Net Payable to Vendor</span>
                  <span className="font-mono text-primary">{formatCurrency(netPayable)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSaving ? 'Saving Changes…' : isAdmin ? 'Save & Update Bill' : 'Submit for Admin Approval'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
