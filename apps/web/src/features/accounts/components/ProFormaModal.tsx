'use client';

import React, { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { X, Plus, Trash2, ArrowRightCircle, Printer } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { showToast } from '@/components/toast-store';
import { salesApi } from '@/features/sales/api';
import { SalesProFormaDocument } from '@/features/sales/components/SalesProFormaDocument';
import { ProFormaInvoice } from '../types';
import { formatCurrency, localToday } from '../utils';

interface ProFormaModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  viewProForma?: ProFormaInvoice | null;
  onCreateProForma?: (proFormData: any) => Promise<void>;
  onConvertToInvoice?: (proForma: ProFormaInvoice) => Promise<void>;
  onSaveProForma?: (id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>) => Promise<void>;
}

export function ProFormaModal({
  isOpen,
  onClose,
  entityId,
  viewProForma,
  onCreateProForma,
  onConvertToInvoice,
  onSaveProForma,
}: ProFormaModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const salesOrderQuery = useQuery({
    queryKey: ['sales', 'order', viewProForma?.salesOrderId],
    queryFn: () => salesApi.get(viewProForma!.salesOrderId!),
    enabled: Boolean(viewProForma?.salesOrderId),
  });

  const salesOrder = salesOrderQuery.data;

  // Compute live, synchronized pro forma lines from latest Sales Order if updated
  const effectiveProForma = useMemo(() => {
    if (!viewProForma) return null;
    if (!salesOrder) return viewProForma;

    const orderAny = salesOrder as any;
    if (Array.isArray(orderAny.lines) && orderAny.lines.length > 0) {
      return {
        ...viewProForma,
        customerName: orderAny.customer?.name || viewProForma.customerName,
        customerGstin: orderAny.customer?.taxNumber || viewProForma.customerGstin,
        totalAmount: orderAny.totalAmount || viewProForma.totalAmount,
        taxableAmount: orderAny.taxableAmount || viewProForma.taxableAmount,
        taxAmount: orderAny.taxAmount || viewProForma.taxAmount,
        lines: orderAny.lines.map((ol: any) => ({
          id: ol.id,
          salesOrderLineId: ol.id,
          description: ol.description || ol.itemName || 'Commercial Product',
          sku: ol.sku || ol.itemCode || '',
          quantity: ol.orderedQuantity || ol.quantity,
          unitPrice: ol.unitPrice,
          discountAmount: ol.discountAmount || '0',
          gstRate: ol.taxRate || '18',
          taxRate: ol.taxRate || '18',
          taxableAmount: ol.taxableAmount,
          taxAmount: ol.taxAmount,
          totalAmount: ol.totalAmount,
        })),
      };
    }
    return viewProForma;
  }, [viewProForma, salesOrder]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: viewProForma?.proFormaNumber || 'Pro-Forma-Invoice',
  });
  const [customerName, setCustomerName] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [issueDate, setIssueDate] = useState(localToday());
  const [validUntil, setValidUntil] = useState(localToday());
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<any[]>([
    {
      description: '',
      hsnSacCode: '',
      quantity: '',
      unitPrice: '',
      gstRate: '18',
      taxableAmount: '0.00',
      totalAmount: '0.00',
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingQuotedPrices, setIsEditingQuotedPrices] = useState(false);
  const [quotedLines, setQuotedLines] = useState<Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>>([]);

  if (!isOpen) return null;

  const updateLine = (index: number, patch: any) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        const qty = parseFloat(updated.quantity || '0');
        const price = parseFloat(updated.unitPrice || '0');
        const taxable = qty * price;
        const rate = parseFloat(updated.gstRate || '0');
        const tax = (taxable * rate) / 100;
        return {
          ...updated,
          taxableAmount: taxable.toFixed(2),
          totalAmount: (taxable + tax).toFixed(2),
        };
      })
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        description: '',
        hsnSacCode: '',
        quantity: '',
        unitPrice: '',
        gstRate: '18',
        taxableAmount: '0.00',
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
  const grandTotal = lines.reduce((sum, l) => sum + parseFloat(l.totalAmount || '0'), 0);
  const totalTax = grandTotal - totalTaxable;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateProForma) return;
    setIsSubmitting(true);
    try {
      await onCreateProForma({
        entityId,
        customerName,
        customerGstin,
        placeOfSupply,
        issueDate,
        validUntil,
        termsAndConditions: terms,
        taxableAmount: totalTaxable.toFixed(2),
        taxAmount: totalTax.toFixed(2),
        totalAmount: grandTotal.toFixed(2),
        lines,
      });
      onClose();
    } catch (err: any) {
      showToast({ kind: 'error', title: 'Pro Forma Creation Failed', message: err?.message || 'Could not create the pro forma document.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (viewProForma) {
    const subtotal = viewProForma.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
    const discountTotal = viewProForma.lines.reduce((s, l) => s + Number(l.discountAmount || 0), 0);
    const taxableTotal = parseFloat(viewProForma.taxableAmount || String(subtotal - discountTotal));
    const taxTotal = parseFloat(viewProForma.taxAmount || '0');
    const grandTotal = parseFloat(viewProForma.totalAmount || String(taxableTotal + taxTotal));

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm print:p-0 print:bg-white print:static print:inset-auto">
        <div className="relative max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-card p-4 sm:p-6 shadow-2xl border border-border print:max-h-none print:overflow-visible print:border-none print:shadow-none print:p-0">
          <div className="flex flex-wrap items-center justify-between border-b border-border/70 pb-4 gap-3 print:hidden">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  Pro Forma: {viewProForma.proFormaNumber}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    viewProForma.status === 'CONVERTED'
                      ? 'bg-muted text-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {viewProForma.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Commercial quotation document · Pre-dispatch bill · Syncs with Sales Order
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrint()}
                className="gap-1.5 text-xs h-8"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </Button>
              {viewProForma.status === 'DRAFT' && onSaveProForma && (
                <Button
                  variant={isEditingQuotedPrices ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => {
                    if (!isEditingQuotedPrices) {
                      const baseLines = effectiveProForma?.lines || viewProForma.lines;
                      setQuotedLines(
                        baseLines.map((line: any) => ({
                          salesOrderLineId: line.salesOrderLineId || '',
                          unitPrice: line.unitPrice,
                          discountAmount: line.discountAmount || '0',
                          taxRate: line.gstRate ?? (line as any).taxRate ?? '18',
                        }))
                      );
                    }
                    setIsEditingQuotedPrices(!isEditingQuotedPrices);
                  }}
                >
                  {isEditingQuotedPrices ? 'View Document' : 'Edit Commercial Rates'}
                </Button>
              )}
              {viewProForma.salesOrderId && (
                <Link href={`/sales/orders/${viewProForma.salesOrderId}`} onClick={onClose}>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 text-primary">
                    Open Sales Order
                  </Button>
                </Link>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-colors ml-1"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            {/* Metadata Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-muted/30 p-4 border border-border text-xs print:hidden">
              <div>
                <span className="text-muted-foreground">Customer:</span>
                <p className="font-semibold text-foreground mt-0.5">{viewProForma.customerName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">GSTIN:</span>
                <p className="font-mono text-foreground mt-0.5">{viewProForma.customerGstin || 'Unregistered'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Issue Date:</span>
                <p className="font-mono text-foreground mt-0.5">{viewProForma.issueDate.slice(0, 10)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Grand Total:</span>
                <p className="font-mono font-bold text-primary mt-0.5">{formatCurrency(viewProForma.totalAmount)}</p>
              </div>
            </div>

            {!isEditingQuotedPrices ? (
              <div className="rounded-2xl border border-border bg-slate-100/70 p-3 sm:p-6 dark:bg-card/40 flex justify-center">
                <div className="w-full max-w-4xl">
                  <SalesProFormaDocument
                    ref={printRef}
                    order={salesOrder || {
                      orderNumber: viewProForma.salesOrderNumber || viewProForma.salesOrderId,
                      customer: { name: effectiveProForma?.customerName || viewProForma.customerName, taxNumber: effectiveProForma?.customerGstin || viewProForma.customerGstin },
                      lines: effectiveProForma?.lines || viewProForma.lines,
                      totalAmount: effectiveProForma?.totalAmount || viewProForma.totalAmount,
                    }}
                    proForma={effectiveProForma || viewProForma}
                    onPrint={() => handlePrint()}
                  />
                </div>
              </div>
            ) : (
              <article
                id="accounts-proforma-document"
                data-printable="true"
                className="printable-document print-target mx-auto rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8 dark:border-border dark:bg-card dark:text-foreground print:border-none print:shadow-none print:p-0 print:max-w-none print:bg-white print:text-slate-900"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-n-800 via-n-700 to-amber-500 rounded-t-sm" />

                <header className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-slate-200 pb-5 pt-4 dark:border-border print:border-b-2 print:border-black">
                  <div className="flex items-start gap-3">
                    <span className="text-xl font-black tracking-tight text-ink uppercase">Plinth</span>
                    <div>
                      <h1 className="text-base font-black tracking-wide uppercase text-slate-900 dark:text-foreground">
                        PLINTH
                      </h1>
                      <p className="text-[11px] leading-tight text-slate-600 dark:text-muted-foreground mt-0.5">
                        Godown 10, Radheshyam Warehouse, Nemawar Road, Indore - 452001, Madhya Pradesh, India
                      </p>
                      <p className="text-[10.5px] font-semibold text-slate-700 dark:text-muted-foreground mt-1">
                        GSTIN: <span className="font-mono font-bold text-slate-900 dark:text-foreground">23AOYPP8347M1ZW</span> · State: Madhya Pradesh (23)
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="inline-block rounded-md bg-n-900 text-white px-2.5 py-1 text-xs font-black tracking-wider uppercase">
                      PRO FORMA INVOICE (RATES EDITOR)
                    </span>
                    <div className="mt-2 text-xs space-y-0.5">
                      <div>
                        <span className="text-slate-500 dark:text-muted-foreground">Pro Forma No: </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-foreground">{viewProForma.proFormaNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-muted-foreground">Date: </span>
                        <span className="font-semibold text-slate-900 dark:text-foreground">{viewProForma.issueDate.slice(0, 10)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-muted-foreground">Sales Order: </span>
                        <span className="font-mono font-bold text-primary">{viewProForma.salesOrderNumber || viewProForma.salesOrderId}</span>
                      </div>
                    </div>
                  </div>
                </header>

                {/* Customer Box */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-border dark:bg-muted/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground block mb-1">
                    Billed To (Customer):
                  </span>
                  <p className="font-bold text-sm text-slate-900 dark:text-foreground">{effectiveProForma?.customerName || viewProForma.customerName}</p>
                  <p className="text-slate-600 dark:text-muted-foreground mt-0.5">
                    GSTIN / Tax ID: <strong className="font-mono text-slate-900 dark:text-foreground">{effectiveProForma?.customerGstin || viewProForma.customerGstin || 'Unregistered'}</strong>
                  </p>
                </div>

                {/* Itemized Table */}
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-border">
                  <Table className="w-full text-xs">
                    <TableHeader className="bg-n-900 text-white font-semibold print:bg-slate-800">
                      <TableRow>
                        <TableHead className="p-2.5 text-center text-white w-10">#</TableHead>
                        <TableHead className="p-2.5 text-left text-white">Description</TableHead>
                        <TableHead className="p-2.5 text-right text-white">Qty</TableHead>
                        <TableHead className="p-2.5 text-right text-white">Rate (₹)</TableHead>
                        <TableHead className="p-2.5 text-right text-white">Discount (₹)</TableHead>
                        <TableHead className="p-2.5 text-right text-white">GST %</TableHead>
                        <TableHead className="p-2.5 text-right text-white">Taxable (₹)</TableHead>
                        <TableHead className="p-2.5 text-right text-white">Total (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60 font-mono text-[11.5px]">
                      {(effectiveProForma?.lines || viewProForma.lines).map((l: any, idx: number) => (
                        <TableRow key={l.id || idx} className="hover:bg-muted/20">
                          <TableCell className="p-2.5 text-center font-sans text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="p-2.5 font-sans font-medium text-foreground">{l.description}</TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-foreground">{l.quantity}</TableCell>
                          <TableCell className="p-2.5 text-right">
                            {isEditingQuotedPrices ? (
                              <input
                                aria-label={`Unit price ${l.description}`}
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-24 rounded border border-primary/50 bg-background px-2 py-1 text-right font-mono text-xs focus:ring-1 focus:ring-primary"
                                value={quotedLines.find((line) => line.salesOrderLineId === l.salesOrderLineId)?.unitPrice ?? l.unitPrice}
                                onChange={(event) =>
                                  setQuotedLines((current) =>
                                    current.map((line) =>
                                      line.salesOrderLineId === l.salesOrderLineId ? { ...line, unitPrice: event.target.value } : line
                                    )
                                  )
                                }
                              />
                            ) : (
                              formatCurrency(l.unitPrice)
                            )}
                          </TableCell>
                          <TableCell className="p-2.5 text-right text-amber-700 dark:text-amber-400">
                            {isEditingQuotedPrices ? (
                              <input
                                aria-label={`Discount ${l.description}`}
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-20 rounded border border-amber-500/50 bg-background px-2 py-1 text-right font-mono text-xs focus:ring-1 focus:ring-amber-500"
                                value={quotedLines.find((line) => line.salesOrderLineId === l.salesOrderLineId)?.discountAmount ?? l.discountAmount ?? '0'}
                                onChange={(event) =>
                                  setQuotedLines((current) =>
                                    current.map((line) =>
                                      line.salesOrderLineId === l.salesOrderLineId ? { ...line, discountAmount: event.target.value } : line
                                    )
                                  )
                                }
                              />
                            ) : Number(l.discountAmount || 0) > 0 ? (
                              `− ${formatCurrency(l.discountAmount)}`
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="p-2.5 text-right">
                            {isEditingQuotedPrices ? (
                              <input
                                aria-label={`Tax rate ${l.description}`}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                className="w-16 rounded border border-primary/50 bg-background px-2 py-1 text-right font-mono text-xs focus:ring-1 focus:ring-primary"
                                value={quotedLines.find((line) => line.salesOrderLineId === l.salesOrderLineId)?.taxRate ?? l.gstRate ?? (l as any).taxRate ?? '18'}
                                onChange={(event) =>
                                  setQuotedLines((current) =>
                                    current.map((line) =>
                                      line.salesOrderLineId === l.salesOrderLineId ? { ...line, taxRate: event.target.value } : line
                                    )
                                  )
                                }
                              />
                            ) : (
                              `${l.gstRate ?? (l as any).taxRate ?? '18'}%`
                            )}
                          </TableCell>
                          <TableCell className="p-2.5 text-right font-medium">{formatCurrency(l.taxableAmount)}</TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-foreground">{formatCurrency(l.totalAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Commercial Summary Box */}
                <div className="mt-5 ml-auto max-w-sm space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs dark:border-border dark:bg-muted/10 font-mono">
                  <div className="flex justify-between font-sans text-slate-600 dark:text-muted-foreground">
                    <span>Gross Subtotal</span>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(subtotal)}</span>
                  </div>
                  {discountTotal > 0 && (
                    <div className="flex justify-between font-sans text-amber-700 dark:text-amber-400">
                      <span>Discount Total</span>
                      <span className="font-mono font-bold">− {formatCurrency(discountTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-sans text-slate-600 dark:text-muted-foreground pt-1 border-t border-slate-200 dark:border-border">
                    <span>Net Taxable Value</span>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(taxableTotal)}</span>
                  </div>
                  <div className="flex justify-between font-sans text-slate-600 dark:text-muted-foreground">
                    <span>GST Amount</span>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(taxTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t-2 border-border pt-2.5 text-sm font-bold text-foreground">
                    <span className="font-sans uppercase">Grand Total</span>
                    <span className="font-mono text-base text-primary">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                {/* Bank Details & Terms */}
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-border text-[11px] text-slate-600 dark:text-muted-foreground">
                  <p className="font-semibold text-slate-800 dark:text-foreground">Remittance Bank Account:</p>
                  <p>HDFC Bank Limited · A/C No: 50200088921134 · IFSC: HDFC0001234 · Indore Branch</p>
                  <p className="mt-2 text-[10px] italic">
                    Note: This is a pre-dispatch commercial valuation quotation. Official Tax Invoice is issued upon warehouse shipment under GST rules.
                  </p>
                </div>
              </article>
            )}

            {/* Save Buttons in Edit Mode */}
            {viewProForma.status === 'DRAFT' && onSaveProForma && isEditingQuotedPrices && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditingQuotedPrices(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      // An empty discount means no discount. Keep it editable as a
                      // blank while focused, but never send an empty amount to the API.
                      const linesToSave = quotedLines.map((line) => ({
                        ...line,
                        discountAmount: line.discountAmount.trim() || '0',
                      }));
                      await onSaveProForma(viewProForma.id, linesToSave);
                      setIsEditingQuotedPrices(false);
                      showToast({ kind: 'success', title: 'Pro Forma Updated', message: `Pro Forma ${viewProForma.proFormaNumber} was updated.` });
                      onClose();
                    } catch (err: any) {
                      showToast({ kind: 'error', title: 'Pro Forma Update Failed', message: err?.message || 'Could not save the pro forma changes.' });
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  loading={isSubmitting}
                  className="font-bold"
                >
                  Save Pro Forma Changes
                </Button>
              </div>
            )}

            {viewProForma.status !== 'CONVERTED' && onConvertToInvoice && (
              <div className="flex items-center justify-between rounded-2xl border border-border bg-n-500/5 p-4 print:hidden">
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    Ready to convert to Official Tax Invoice?
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Generates a sequential Tax Invoice and links this Pro Forma for a complete audit trail.
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    await onConvertToInvoice(viewProForma);
                    onClose();
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 rounded-xl font-semibold"
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  Convert to Tax Invoice
                </Button>
              </div>
            )}
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
            <h2 className="text-xl font-bold tracking-tight text-foreground">Create Pro Forma Invoice</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Commercial document for customer advances & quotations. Creates no ledger journals until converted.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-foreground">Customer Name</label>
              <input
                required
                placeholder="e.g. Vertex Engineering Corp"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Customer GSTIN</label>
              <input
                placeholder="15-digit GSTIN (optional)"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono uppercase focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Place of Supply (POS)</label>
              <input
                placeholder="e.g. 27-Maharashtra"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Issue Date</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Valid Until</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estimated Items & Freight
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
                <div key={idx} className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-muted-foreground">Item Description</label>
                      <input
                        required
                        placeholder="Quoted product or assembly"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">HSN / SAC</label>
                      <input
                        placeholder="e.g. 854442"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                        value={line.hsnSacCode}
                        onChange={(e) => updateLine(idx, { hsnSacCode: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 items-center">
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground">Quantity</label>
                      <input
                        required
                        type="number"
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
                    <div className="flex items-center justify-between pt-4 sm:pt-0">
                      <div>
                        <span className="text-[10px] text-muted-foreground">Line Total: </span>
                        <span className="text-xs font-mono font-bold">{formatCurrency(line.totalAmount)}</span>
                      </div>
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

          <div>
            <label className="text-xs font-semibold text-foreground">Commercial Terms & Payment Conditions</label>
            <textarea
              rows={2}
              placeholder="e.g. 100% advance against Pro Forma before dispatch."
              className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-end justify-between gap-4 border-t border-border/70 pt-4">
            <div className="text-xs text-muted-foreground max-w-sm">
              <p>
                <strong>Pro Forma Rule:</strong> A pro forma invoice is a commercial pre-dispatch quotation. It creates
                no accounts receivable or output GST until converted to a Tax Invoice.
              </p>
            </div>

            <div className="w-full sm:w-72 rounded-2xl bg-muted/40 p-4 border border-border space-y-2 text-xs font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Total:</span>
                <span className="text-foreground">{formatCurrency(totalTaxable)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated Tax:</span>
                <span className="text-foreground">{formatCurrency(totalTax)}</span>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-bold text-foreground">
                <span>Pro Forma Total:</span>
                <span className="text-primary">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={isSubmitting || !customerName || grandTotal <= 0}
            >
              {isSubmitting ? 'Saving Pro Forma…' : 'Issue Pro Forma Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
