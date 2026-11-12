'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { PurchaseBill, PurchaseBillKind, ReceiptLineCandidate, LedgerAccount } from '../types';
import { formatCurrency, localToday } from '../utils';
import { SearchableOption, SearchableSelector } from '@/components/ui/SearchableSelector';

interface PurchaseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  vendors: Array<{ id: string; code: string; name: string; taxNumber?: string }>;
  receipts: ReceiptLineCandidate[];
  chart: LedgerAccount[];
  onSubmit: (billData: any) => Promise<void>;
  viewBill?: PurchaseBill | null;
  fullPage?: boolean;
  initialBill?: PurchaseBill | null;
  closeOnSubmit?: boolean;
  initialValues?: {
    vendorId: string;
    supplierInvoiceNumber?: string;
    invoiceDate?: string;
    lines: Array<{ description: string; poLineId: string; grnLineId: string; quantity: string; unitPrice: string; gstRate?: string }>;
  };
}

export function PurchaseBillModal({
  isOpen,
  onClose,
  entityId,
  vendors,
  receipts,
  chart,
  onSubmit,
  viewBill,
  fullPage = false,
  initialBill = null,
  closeOnSubmit = true,
  initialValues,
}: PurchaseBillModalProps) {
  const [kind, setKind] = useState<PurchaseBillKind>(initialBill?.kind || 'STOCK');
  const [vendorId, setVendorId] = useState(initialBill?.vendorId || initialValues?.vendorId || '');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(initialBill?.supplierInvoiceNumber || initialValues?.supplierInvoiceNumber || '');
  const initialInvoiceDate = initialBill?.invoiceDate.slice(0, 10) || initialValues?.invoiceDate || localToday();
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate);
  const [dueDate, setDueDate] = useState(initialBill?.dueDate.slice(0, 10) || localToday());
  const [lines, setLines] = useState<any[]>(initialBill?.lines.map((line) => ({
    ...line,
    quantity: String(line.quantity), unitPrice: String(line.unitPrice), gstRate: String(line.gstRate),
    taxableAmount: String(line.taxableAmount), cgstAmount: String(line.cgstAmount),
    sgstAmount: String(line.sgstAmount), igstAmount: String(line.igstAmount),
  })) || initialValues?.lines.map((line) => {
    const taxableAmount = Number(line.quantity) * Number(line.unitPrice);
    const gstAmount = taxableAmount * Number(line.gstRate || 0) / 100;
    return {
      ...line,
      hsnSacCode: '', debitAccountId: '', gstRate: line.gstRate || '0',
      taxableAmount: taxableAmount.toFixed(2),
      cgstAmount: (gstAmount / 2).toFixed(2), sgstAmount: (gstAmount / 2).toFixed(2), igstAmount: '0.00',
    };
  }) || [
      {
        description: '',
        hsnSacCode: '',
        poLineId: '',
        grnLineId: '',
        debitAccountId: '',
        quantity: '',
        unitPrice: '',
        gstRate: '18',
        taxableAmount: '0.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '0.00',
      },
    ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);


  const vendorReceipts = receipts.filter((r) => !vendorId || r.vendorId === vendorId);
  const receiptOptions: SearchableOption[] = vendorReceipts.map((receipt) => ({
    id: receipt.id,
    name: receipt.item,
    code: receipt.grnNumber,
    sku: receipt.poNumber,
    status: 'APPROVED',
  }));
  const allowedExpenseAccounts = chart.filter(
    (a) => a.status === 'ACTIVE' && !a.isControl && (kind === 'CAPITAL' ? a.type === 'ASSET' : a.type === 'EXPENSE')
  );

  const calculateLineTaxes = (line: any) => {
    const qty = parseFloat(line.quantity || '0');
    const price = parseFloat(line.unitPrice || '0');
    const taxable = qty * price;
    const rate = parseFloat(line.gstRate || '0');
    const isInterstate = false; // Intrastate default for CGST+SGST, interstate for IGST

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

    return {
      taxableAmount: taxable.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      sgstAmount: sgst.toFixed(2),
      igstAmount: igst.toFixed(2),
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
        description: '',
        hsnSacCode: '',
        poLineId: '',
        grnLineId: '',
        debitAccountId: '',
        quantity: '',
        unitPrice: '',
        gstRate: '18',
        taxableAmount: '0.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        igstAmount: '0.00',
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
  const totalAmount = totalTaxable + totalTax;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!vendorId || !supplierInvoiceNumber || totalAmount <= 0 || isSubmitting) return;
    setSubmissionError('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        entityId,
        vendorId,
        supplierInvoiceNumber,
        invoiceDate,
        dueDate,
        kind,
        ...(initialBill ? { version: initialBill.version } : {}),
        lines: lines.map((l) => ({
          ...l,
          debitAccountId: kind === 'STOCK' ? undefined : l.debitAccountId || undefined,
          poLineId: kind === 'STOCK' ? l.poLineId || undefined : undefined,
          grnLineId: kind === 'STOCK' ? l.grnLineId || undefined : undefined,
        })),
      });
      if (closeOnSubmit) onClose();
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Could not create supplier bill. Please review the fields and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + A: Save / Submit
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      // Esc: Close modal
      if (e.key === 'Escape' && !fullPage) {
        e.preventDefault();
        onClose();
        return;
      }
      // Alt + A: Add line
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        addLine();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, vendorId, supplierInvoiceNumber, totalAmount, isSubmitting, lines, fullPage]);
  if (!isOpen) return null;


  if (viewBill) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
          <div className="flex items-start justify-between border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Supplier Bill: {viewBill.supplierInvoiceNumber}
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-foreground ">
                  {viewBill.kind}
                </span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary ">
                  {viewBill.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Vendor: {viewBill.vendorNameSnapshot} · GSTIN: {viewBill.vendorGstinSnapshot || 'N/A'} · Due:{' '}
                {viewBill.dueDate.slice(0, 10)}
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {/* Matching Findings & Exceptions */}
            {viewBill.matchFindings && viewBill.matchFindings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Match & Verification Findings
                </h3>
                {viewBill.matchFindings.map((finding, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${finding.severity === 'BLOCKING'
                      ? 'border-destructive/30 bg-destructive/100/5 text-destructive '
                      : 'border-border bg-muted/40 text-foreground '
                      }`}
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">{finding.code}:</span> {finding.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Line Items Table */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Line Items
              </h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-2.5 text-left font-semibold">#</TableHead>
                      <TableHead className="p-2.5 text-left font-semibold">Description</TableHead>
                      <TableHead className="p-2.5 text-left font-semibold">HSN/SAC</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Qty</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Unit Price</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">GST Rate</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Taxable</TableHead>
                      <TableHead className="p-2.5 text-right font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {viewBill.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="p-2.5 font-mono">{l.lineNumber}</TableCell>
                        <TableCell className="p-2.5 font-medium">{l.description}</TableCell>
                        <TableCell className="p-2.5 font-mono">{l.hsnSacCode || '—'}</TableCell>
                        <TableCell className="p-2.5 text-right font-mono">{l.quantity}</TableCell>
                        <TableCell className="p-2.5 text-right font-mono">{formatCurrency(l.unitPrice)}</TableCell>
                        <TableCell className="p-2.5 text-right font-mono">{l.gstRate}%</TableCell>
                        <TableCell className="p-2.5 text-right font-mono">{formatCurrency(l.taxableAmount)}</TableCell>
                        <TableCell className="p-2.5 text-right font-mono font-bold">
                          {formatCurrency(
                            parseFloat(l.taxableAmount) +
                            parseFloat(l.cgstAmount) +
                            parseFloat(l.sgstAmount) +
                            parseFloat(l.igstAmount)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <div className="flex justify-end pt-2">
              <div className="w-64 space-y-1.5 rounded-xl bg-muted/40 p-4 text-xs font-mono border border-border">
                <div className="flex justify-between text-muted-foreground">
                  <span>Match Status:</span>
                  <span className="font-bold text-foreground">{viewBill.matchStatus}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Version:</span>
                  <span className="text-foreground">v{viewBill.version}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={fullPage ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'}>
      <div className={fullPage ? 'w-full rounded-2xl bg-card p-5 shadow-sm border border-border md:p-7' : 'relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border'}>
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            {fullPage && <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Accounts · Purchase & Payables</p>}
            <h2 className="text-xl font-bold tracking-tight text-foreground">{initialBill ? `Edit Draft · ${initialBill.supplierInvoiceNumber}` : 'Capture Supplier Invoice (AP)'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {initialBill ? 'Update the draft before submission. Submitted bills are locked for audit history.' : 'Enter the supplier invoice. Accepted GRNs already appear in Accounts; link each stock line to its receipt for matching.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-5 space-y-5">
          {submissionError && (
            <div role="alert" className="sticky top-0 z-20 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg   ">
              <span>{submissionError}</span>
              <button type="button" onClick={() => setSubmissionError('')} className="shrink-0 text-xs font-semibold underline">Dismiss</button>
            </div>
          )}
          {/* Header Fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Bill Classification</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={kind}
                onChange={(e) => setKind(e.target.value as PurchaseBillKind)}
              >
                <option value="STOCK">Stock Bill (PO + GRN 3-Way Match)</option>
                <option value="SERVICE">Service / Operating Expense</option>
                <option value="CAPITAL">Capital Goods / Fixed Asset</option>
                <option value="LOGISTICS">Logistics & Freight Expense</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Approved Vendor</label>
              <select
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Select Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.taxNumber || v.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Supplier Invoice No.</label>
              <input
                required
                placeholder="e.g. INV-9042"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-foreground">Bill Date</label>
                <input
                  required
                  type="date"
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Due Date</label>
                <input
                  required
                  type="date"
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Invoice Lines & Tax Breakdown
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">Alt+D delete row</span>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground "
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-mono">Alt+A</kbd>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        {kind === 'STOCK' ? 'Material / Item' : 'Description'}
                      </label>
                      {kind === 'STOCK' ? (
                        <SearchableSelector
                          value={line.grnLineId}
                          options={receiptOptions}
                          placeholder={vendorId ? 'Search accepted GRN items…' : 'Select a vendor first'}
                          disabled={!vendorId}
                          size="sm"
                          onChange={(receiptId) => {
                            const receipt = vendorReceipts.find((candidate) => candidate.id === receiptId);
                            if (!receipt) return;
                            updateLine(idx, {
                              grnLineId: receipt.id,
                              poLineId: receipt.poLineId || '',
                              quantity: receipt.acceptedQuantity,
                              unitPrice: receipt.unitPrice || '',
                              description: receipt.item,
                            });
                          }}
                          renderOption={(option) => {
                            const receipt = vendorReceipts.find((candidate) => candidate.id === option.id);
                            return (
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium">{option.name}</span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                  GRN {option.code} · PO {option.sku} · Accepted qty {receipt?.acceptedQuantity ?? '—'} · PO rate {receipt?.unitPrice ? formatCurrency(receipt.unitPrice) : '—'}
                                </span>
                              </div>
                            );
                          }}
                        />
                      ) : (
                        <input
                          required
                          placeholder="Item / Service description"
                          data-row={idx}
                          data-col="description"
                          className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                          value={line.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                              e.preventDefault();
                              removeLine(idx);
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="hsn"]`);
                              nextInput?.focus();
                            }
                          }}
                        />
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">HSN / SAC</label>
                      <input
                        placeholder="e.g. 854140"
                        data-row={idx}
                        data-col="hsn"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                        value={line.hsnSacCode}
                        onChange={(e) => updateLine(idx, { hsnSacCode: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                            e.preventDefault();
                            removeLine(idx);
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const nextInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="quantity"]`);
                            nextInput?.focus();
                          }
                        }}
                      />
                    </div>

                    {kind !== 'STOCK' && (
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          {kind === 'CAPITAL' ? 'Asset Ledger' : 'Expense Ledger'}
                        </label>
                        <select
                          required
                          className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                          value={line.debitAccountId}
                          onChange={(e) => updateLine(idx, { debitAccountId: e.target.value })}
                        >
                          <option value="">Select Ledger Account</option>
                          {allowedExpenseAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Calculations row */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-center">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Quantity</label>
                      <input
                        required
                        type="number"
                        step="any"
                        placeholder="0"
                        data-row={idx}
                        data-col="quantity"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground/60"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                            e.preventDefault();
                            removeLine(idx);
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const nextInput = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="unitPrice"]`);
                            nextInput?.focus();
                          }
                        }}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Unit Price (₹)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        data-row={idx}
                        data-col="unitPrice"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono text-right focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground/60"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.altKey && (e.key === 'd' || e.key === 'D')) {
                            e.preventDefault();
                            removeLine(idx);
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (idx === lines.length - 1) {
                              addLine();
                              window.setTimeout(() => {
                                const nextRowDesc = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx + 1}"][data-col="description"]`) ||
                                  formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx + 1}"][data-col="quantity"]`);
                                nextRowDesc?.focus();
                              }, 50);
                            } else {
                              const nextRowDesc = formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx + 1}"][data-col="description"]`) ||
                                formRef.current?.querySelector<HTMLInputElement>(`input[data-row="${idx + 1}"][data-col="quantity"]`);
                              nextRowDesc?.focus();
                            }
                          }
                        }}
                      />
                      {kind === 'STOCK' && (() => {
                        const matchedReceipt = vendorReceipts.find((receipt) => receipt.id === line.grnLineId);
                        if (!matchedReceipt) return null;
                        const poRate = Number(matchedReceipt.unitPrice || 0);
                        const invoiceRate = Number(line.unitPrice || 0);
                        const variance = invoiceRate - poRate;
                        return (
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-muted-foreground">
                            <span>PO rate: <strong className="font-mono text-foreground">{formatCurrency(poRate)}</strong></span>
                            {line.unitPrice ? (
                              <span className={Math.abs(variance) < 0.005 ? 'text-tone-green-text' : 'text-tone-amber-text'}>
                                {Math.abs(variance) < 0.005 ? 'Matches PO rate' : `Variance ${variance > 0 ? '+' : ''}${formatCurrency(variance)}`}
                              </span>
                            ) : <span className="text-tone-amber-text">Invoice rate not extracted</span>}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">GST Rate %</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                        value={line.gstRate}
                        onChange={(e) => updateLine(idx, { gstRate: e.target.value })}
                      >
                        <option value="0">0% (Nil)</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Taxable Value</label>
                      <div className="mt-1 rounded-xl bg-background/50 border border-border/60 p-2 text-xs font-mono text-right font-bold text-foreground">
                        {formatCurrency(line.taxableAmount)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 sm:pt-0">
                      <div>
                        <span className="text-[10px] text-muted-foreground">GST: </span>
                        <span className="text-xs font-mono font-semibold">
                          {formatCurrency(
                            parseFloat(line.cgstAmount) + parseFloat(line.sgstAmount) + parseFloat(line.igstAmount)
                          )}
                        </span>
                      </div>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="rounded-lg p-1 text-destructive hover:bg-destructive/100/10"
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
                <strong>{initialBill ? 'Draft editing:' : 'Audit control:'}</strong> {initialBill
                  ? 'Changes are allowed only while this bill remains a draft. Submitting locks the invoice values for the review history.'
                  : 'Saving creates a draft. Submitting it compares the invoice against the purchase order and signed-off goods receipt.'}
              </p>
            </div>

            <div className="w-full sm:w-72 rounded-2xl bg-muted/40 p-4 border border-border space-y-2 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Total Taxable Value:</span>
                <span className="text-foreground">{formatCurrency(totalTaxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Input GST:</span>
                <span className="text-foreground">{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-bold text-foreground">
                <span>Invoice Total:</span>
                <span className="text-muted-foreground ">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel {!fullPage && <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>}
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
              disabled={isSubmitting || !vendorId || !supplierInvoiceNumber || totalAmount <= 0}
            >
              {isSubmitting ? (initialBill ? 'Saving Changes…' : 'Saving Draft…') : (initialBill ? 'Save Draft Changes' : 'Record Supplier Bill')}
              <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
