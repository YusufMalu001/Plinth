'use client';

import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { X, Plus, Trash2, Printer } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { SalesInvoice, InvoiceType, SalesInvoiceLine } from '../types';
import { formatCurrency, localToday } from '../utils';

interface SalesInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  viewInvoice?: SalesInvoice | null;
  onCreateInvoice?: (invoiceData: any) => Promise<void>;
  onRecordPayment?: (invoice: SalesInvoice) => void;
}

export function SalesInvoiceModal({
  isOpen,
  onClose,
  entityId,
  viewInvoice,
  onCreateInvoice,
  onRecordPayment,
}: SalesInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: viewInvoice?.invoiceNumber || 'Sales-Tax-Invoice',
  });
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('B2B');
  const [customerName, setCustomerName] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(localToday());
  const [dueDate, setDueDate] = useState(localToday());
  const [lines, setLines] = useState<SalesInvoiceLine[]>([
    {
      id: 'l1',
      lineNumber: 1,
      description: '',
      hsnSacCode: '',
      quantity: '',
      unitPrice: '',
      gstRate: '18',
      taxableAmount: '0.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      igstAmount: '0.00',
      totalAmount: '0.00',
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const calculateLineTaxes = (line: any) => {
    const qty = parseFloat(line.quantity || '0');
    const price = parseFloat(line.unitPrice || '0');
    const taxable = qty * price;
    const rate = parseFloat(line.gstRate || '0');
    const isInterstate = placeOfSupply && !placeOfSupply.startsWith('27');

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (rate > 0) {
      if (isInterstate) {
        igst = (taxable * rate) / 100;
      } else {
        cgst = (taxable * (rate / 2)) / 100;
        sgst = (taxable * (rate / 2)) / 100;
      }
    }

    const total = taxable + cgst + sgst + igst;

    return {
      taxableAmount: taxable.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      sgstAmount: sgst.toFixed(2),
      igstAmount: igst.toFixed(2),
      totalAmount: total.toFixed(2),
    };
  };

  const updateLine = (index: number, patch: any) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        const taxes = calculateLineTaxes(updated);
        return { ...updated, ...taxes };
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `l-${Date.now()}`,
        lineNumber: prev.length + 1,
        description: '',
        hsnSacCode: '',
        quantity: '',
        unitPrice: '',
        gstRate: '18',
        taxableAmount: '0.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '0.00',
        totalAmount: '0.00',
      },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const totalTaxable = lines.reduce((sum, l) => sum + parseFloat(l.taxableAmount || '0'), 0);
  const totalTax = lines.reduce(
    (sum, l) => sum + parseFloat(l.cgstAmount || '0') + parseFloat(l.sgstAmount || '0') + parseFloat(l.igstAmount || '0'),
    0
  );
  const grandTotal = totalTaxable + totalTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateInvoice) return;
    setIsSubmitting(true);
    try {
      await onCreateInvoice({
        entityId,
        type: invoiceType,
        customerName,
        customerGstin,
        placeOfSupply,
        invoiceDate,
        dueDate,
        taxableAmount: totalTaxable.toFixed(2),
        taxAmount: totalTax.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        lines,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (viewInvoice) {
    const outstandingNum = parseFloat(viewInvoice.outstandingAmount || '0');
    const allPayments = viewInvoice.payments || [];
    const directOrderPayments = viewInvoice.orderPayments || [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
          <div className="flex items-start justify-between border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Accounts Tax Invoice: {viewInvoice.invoiceNumber}
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  {viewInvoice.type}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  viewInvoice.status === 'POSTED' || viewInvoice.status === 'PAID'
                    ? 'bg-muted text-foreground'
                    : 'bg-muted text-foreground'
                }`}>
                  {viewInvoice.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Customer: <span className="font-semibold text-foreground">{viewInvoice.customerName}</span>
                {viewInvoice.salesOrderNumber && (
                  <span> · Linked Order: <span className="font-mono font-semibold text-foreground">{viewInvoice.salesOrderNumber}</span></span>
                )}
                {viewInvoice.customerGstin && <span> · GSTIN: {viewInvoice.customerGstin}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onRecordPayment && outstandingNum > 0 && (
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 text-xs rounded-xl shadow-sm"
                  onClick={() => {
                    onClose();
                    onRecordPayment(viewInvoice);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Record Payment
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs rounded-xl"
                onClick={() => handlePrint()}
              >
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </Button>
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            id="sales-invoice-document"
            ref={printRef}
            data-printable="true"
            className="mt-5 space-y-5 printable-document print-target bg-white text-slate-900 dark:bg-card dark:text-foreground p-4 rounded-xl"
          >
            {/* Invoice Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-muted/30 p-4 border border-border text-xs">
              <div>
                <span className="text-muted-foreground">Invoice Date:</span>
                <p className="font-mono font-bold text-foreground mt-0.5">{viewInvoice.invoiceDate.slice(0, 10)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Due Date:</span>
                <p className="font-mono font-bold text-foreground mt-0.5">{viewInvoice.dueDate.slice(0, 10)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Paid Amount:</span>
                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(viewInvoice.paidAmount)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Outstanding Balance:</span>
                <p className={`font-mono font-bold mt-0.5 ${outstandingNum > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatCurrency(viewInvoice.outstandingAmount)}
                </p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Billed Items & Output GST
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-2.5 text-left font-semibold">#</TableHead>
                      <TableHead className="p-2.5 text-left font-semibold">Item Description</TableHead>
                      <TableHead className="p-2.5 text-left font-semibold">HSN/SAC</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Qty</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Rate</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Taxable (₹)</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">GST %</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Total (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60 font-mono">
                    {viewInvoice.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="p-2.5">{l.lineNumber}</TableCell>
                        <TableCell className="p-2.5 font-sans font-medium">{l.description}</TableCell>
                        <TableCell className="p-2.5">{l.hsnSacCode || '—'}</TableCell>
                        <TableCell className="p-2.5 text-right">{l.quantity}</TableCell>
                        <TableCell className="p-2.5 text-right">{formatCurrency(l.unitPrice)}</TableCell>
                        <TableCell className="p-2.5 text-right">{formatCurrency(l.taxableAmount)}</TableCell>
                        <TableCell className="p-2.5 text-right">{l.gstRate}%</TableCell>
                        <TableCell className="p-2.5 text-right font-bold">{formatCurrency(l.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <div className="flex justify-end pt-2">
              <div className="w-72 space-y-2 rounded-2xl bg-muted/40 p-4 text-xs font-mono border border-border">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable Value:</span>
                  <span className="text-foreground">{formatCurrency(viewInvoice.taxableAmount)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Output GST:</span>
                  <span className="text-foreground">{formatCurrency(viewInvoice.taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-bold text-foreground">
                  <span>Invoice Total:</span>
                  <span className="text-primary">
                    {formatCurrency(viewInvoice.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Recorded Payments Section */}
            <div className="border-t border-border/70 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recorded Order Payments & Receipts
                </h3>
                {onRecordPayment && outstandingNum > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs rounded-xl gap-1 text-primary"
                    onClick={() => {
                      onClose();
                      onRecordPayment(viewInvoice);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Record Payment
                  </Button>
                )}
              </div>

              {allPayments.length > 0 || directOrderPayments.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table className="w-full text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="p-2.5 text-left font-semibold">Date</TableHead>
                        <TableHead className="p-2.5 text-left font-semibold">Payment Mode</TableHead>
                        <TableHead className="p-2.5 text-left font-semibold">Reference / UTR</TableHead>
                        <TableHead className="p-2.5 text-right font-semibold">Amount (₹)</TableHead>
                        <TableHead className="p-2.5 text-center font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60 font-mono">
                      {allPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="p-2.5 text-muted-foreground">{String(p.paymentDate).slice(0, 10)}</TableCell>
                          <TableCell className="p-2.5 font-sans font-medium">{p.paymentMode}</TableCell>
                          <TableCell className="p-2.5 font-mono">{p.reference}</TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell className="p-2.5 text-center font-sans">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              {p.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {allPayments.length === 0 && directOrderPayments.map((op: any) => (
                        <TableRow key={op.id}>
                          <TableCell className="p-2.5 text-muted-foreground">{String(op.paidAt || op.createdAt || '').slice(0, 10)}</TableCell>
                          <TableCell className="p-2.5 font-sans font-medium">{op.method}</TableCell>
                          <TableCell className="p-2.5 font-mono">{op.reference || '—'}</TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(op.amount)}
                          </TableCell>
                          <TableCell className="p-2.5 text-center font-sans">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              {op.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    No customer payments recorded yet for this invoice.
                  </p>
                  {onRecordPayment && outstandingNum > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-xs rounded-xl"
                      onClick={() => {
                        onClose();
                        onRecordPayment(viewInvoice);
                      }}
                    >
                      Record First Payment
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Create Sales Tax Invoice</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Issue an approved GST tax invoice for domestic B2B, B2C, POS or export dispatches.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Header Controls */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Invoice Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
              >
                <option value="B2B">B2B Registered Tax Invoice</option>
                <option value="B2C">B2C Retail / Direct Consumer</option>
                <option value="EXPORT">Export with / without LUT</option>
                <option value="MARKETPLACE">Marketplace Channel Invoice</option>
                <option value="POS">POS Walk-In Invoice</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Customer Name</label>
              <input
                required
                placeholder="e.g. AeroTech Dynamics Ltd"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Customer GSTIN</label>
              <input
                placeholder="15-digit GSTIN (optional for B2C)"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono uppercase focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Place of Supply (POS)</label>
              <input
                required
                placeholder="e.g. 27-Maharashtra"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Invoice Issue Date</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Payment Due Date</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Line Items & Pricing
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary dark:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item Line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={line.id || idx} className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-muted-foreground">Item Description</label>
                      <input
                        required
                        placeholder="Product name / item description"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">HSN / SAC Code</label>
                      <input
                        placeholder="e.g. 854140"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        value={line.hsnSacCode}
                        onChange={(e) => updateLine(idx, { hsnSacCode: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-center">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Quantity</label>
                      <input
                        required
                        type="number"
                        step="any"
                        placeholder="0"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Unit Price (₹)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">GST Rate %</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        value={line.gstRate}
                        onChange={(e) => updateLine(idx, { gstRate: e.target.value })}
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Total Line (₹)</label>
                      <div className="mt-1 rounded-xl bg-background/50 border border-border/60 p-2 text-xs font-mono text-right font-bold text-foreground">
                        {formatCurrency(line.totalAmount)}
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-4 sm:pt-0">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="rounded-lg p-1 text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grand Totals */}
          <div className="flex flex-col sm:flex-row items-end justify-between gap-4 border-t border-border/70 pt-4">
            <div className="text-xs text-muted-foreground max-w-sm">
              <p>
                <strong>GST Posting Note:</strong> Creating this invoice posts Dr Accounts Receivable (Customer) / Cr
                Sales Revenue & Cr Output GST upon approval.
              </p>
            </div>

            <div className="w-full sm:w-72 rounded-2xl bg-muted/40 p-4 border border-border space-y-2 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Amount:</span>
                <span className="text-foreground">{formatCurrency(totalTaxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Output GST:</span>
                <span className="text-foreground">{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-bold text-foreground">
                <span>Grand Total:</span>
                <span className="text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={isSubmitting || !customerName || grandTotal <= 0}
            >
              {isSubmitting ? 'Generating Invoice…' : 'Generate Tax Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
