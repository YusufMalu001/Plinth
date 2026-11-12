'use client';

import { Checkbox } from '@plinth/ui';
import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  CheckCircle2,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Button } from '@plinth/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DebitCreditNote, NoteType, NoteParty } from '../types';
import { formatCurrency, localToday, formatDate } from '../utils';
import { accountsApi } from '../api';
import { showToast } from '@/components/toast-store';

export interface NoteLineItem {
  id: string;
  description: string;
  billedQty: number;
  creditQty: number;
  unitPrice: number;
  gstRate: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  reason?: string;
  productId?: string;
  materialId?: string;
}

interface DebitCreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  defaultType?: NoteType;
  defaultPartyType?: NoteParty;
  initialInvoice?: any;
  onSubmit?: (noteData: any) => Promise<void>;
  viewNote?: DebitCreditNote | null;
  onSuccess?: () => void;
}

export function DebitCreditNoteModal({
  isOpen,
  onClose,
  entityId,
  defaultType = 'CREDIT',
  defaultPartyType = 'CUSTOMER',
  initialInvoice,
  onSubmit,
  viewNote,
  onSuccess,
}: DebitCreditNoteModalProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [noteType, setNoteType] = useState<NoteType>(defaultType);
  const [partyType, setPartyType] = useState<NoteParty>(defaultPartyType);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [partyName, setPartyName] = useState('');
  const [partyGstin, setPartyGstin] = useState('');
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState('');
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState(localToday());
  const [creditDate, setCreditDate] = useState(localToday());
  const [reasonCode, setReasonCode] = useState<
    'RETURN' | 'PRICE_DIFFERENCE' | 'SHORTAGE' | 'DISCOUNT' | 'DEFICIENCY' | 'OTHER'
  >('RETURN');
  const [reasonDescription, setReasonDescription] = useState('');
  const [adjustGst, setAdjustGst] = useState(true);
  const [restockInventory, setRestockInventory] = useState(true);
  const [lines, setLines] = useState<NoteLineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualTaxable, setManualTaxable] = useState('');
  const [manualGstRate, setManualGstRate] = useState('18');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Invoices & Bills queries for standalone mode
  const arInvoicesQuery = useQuery({
    queryKey: ['accounts', 'ar', 'invoices', entityId],
    queryFn: () => accountsApi.arInvoices(entityId),
    enabled: isOpen && !initialInvoice && partyType === 'CUSTOMER',
  });

  const apBillsQuery = useQuery({
    queryKey: ['accounts', 'ap', 'bills', entityId],
    queryFn: () => accountsApi.apBills(entityId),
    enabled: isOpen && !initialInvoice && partyType === 'VENDOR',
  });

  // Populate from initialInvoice when modal opens with an existing invoice/bill
  useEffect(() => {
    if (!initialInvoice || !isOpen) return;

    // Detect whether it's a Customer Sales Invoice or a Supplier Purchase Bill
    const isSupplierBill = Boolean(
      initialInvoice.supplierInvoiceNumber ||
      initialInvoice.vendorNameSnapshot ||
      initialInvoice.supplierName ||
      initialInvoice.vendorId
    );

    if (isSupplierBill) {
      setPartyType('VENDOR');
      setNoteType(defaultType || 'DEBIT');
      setSelectedDocId(initialInvoice.id);
      setPartyName(
        initialInvoice.supplierName ||
        initialInvoice.vendorNameSnapshot ||
        initialInvoice.vendor?.name ||
        ''
      );
      setPartyGstin(
        initialInvoice.supplierGstin ||
        initialInvoice.vendorGstinSnapshot ||
        initialInvoice.vendor?.taxNumber ||
        ''
      );
      setOriginalInvoiceNumber(
        initialInvoice.supplierInvoiceNumber || initialInvoice.billNumber || ''
      );
      const rawDate = initialInvoice.billDate || initialInvoice.invoiceDate;
      setOriginalInvoiceDate(rawDate ? rawDate.slice(0, 10) : localToday());

      // Map line items
      const billLines: NoteLineItem[] = (initialInvoice.lines || []).map((l: any, idx: number) => {
        const billedQty = Number(l.quantity || 0);
        const unitPrice = Number(l.unitPrice || 0);
        const gstRate = Number(l.gstRate || 0);
        return {
          id: l.id || `bill-line-${idx}`,
          description: l.description || `Item #${idx + 1}`,
          billedQty,
          creditQty: 0, // start at 0 so user explicitly picks return amount
          unitPrice,
          gstRate,
          taxableAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          productId: l.productId,
          materialId: l.materialId,
        };
      });
      setLines(billLines);
    } else {
      // Customer Sales Invoice
      setPartyType('CUSTOMER');
      setNoteType('CREDIT');
      setSelectedDocId(initialInvoice.id);
      setPartyName(initialInvoice.customerName || '');
      setPartyGstin(initialInvoice.customerGstin || '');
      setOriginalInvoiceNumber(initialInvoice.invoiceNumber || '');
      const rawDate = initialInvoice.invoiceDate;
      setOriginalInvoiceDate(rawDate ? rawDate.slice(0, 10) : localToday());

      const invLines: NoteLineItem[] = (initialInvoice.lines || []).map((l: any, idx: number) => {
        const billedQty = Number(l.quantity || 0);
        const unitPrice = Number(l.unitPrice || 0);
        const gstRate = Number(l.gstRate || 18);
        return {
          id: l.id || `inv-line-${idx}`,
          description: l.description || `Item #${idx + 1}`,
          billedQty,
          creditQty: 0,
          unitPrice,
          gstRate,
          taxableAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          productId: l.itemId,
        };
      });
      setLines(invLines);
    }
  }, [initialInvoice, isOpen, defaultType]);

  // Handle selecting an existing document from the dropdown
  const handleSelectDocument = (docId: string) => {
    setSelectedDocId(docId);
    if (!docId) {
      setPartyName('');
      setPartyGstin('');
      setOriginalInvoiceNumber('');
      setLines([]);
      return;
    }

    if (partyType === 'CUSTOMER') {
      const inv = arInvoicesQuery.data?.items?.find((i) => i.id === docId);
      if (inv) {
        setPartyName(inv.customerName || '');
        setPartyGstin(inv.customerGstin || '');
        setOriginalInvoiceNumber(inv.invoiceNumber || '');
        setOriginalInvoiceDate(inv.invoiceDate ? inv.invoiceDate.slice(0, 10) : localToday());
        const invLines: NoteLineItem[] = (inv.lines || []).map((l, idx) => ({
          id: l.id || `inv-line-${idx}`,
          description: l.description || `Item #${idx + 1}`,
          billedQty: Number(l.quantity || 0),
          creditQty: 0,
          unitPrice: Number(l.unitPrice || 0),
          gstRate: Number(l.gstRate || 18),
          taxableAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          productId: l.itemId,
        }));
        setLines(invLines);
      }
    } else {
      const bill = apBillsQuery.data?.items?.find((b) => b.id === docId);
      if (bill) {
        setPartyName(bill.vendorNameSnapshot || (bill as any).supplierName || bill.vendor?.name || '');
        setPartyGstin(bill.vendorGstinSnapshot || (bill as any).supplierGstin || bill.vendor?.taxNumber || '');
        setOriginalInvoiceNumber(bill.supplierInvoiceNumber || (bill as any).billNumber || '');
        const bDate = bill.invoiceDate || (bill as any).billDate;
        setOriginalInvoiceDate(bDate ? bDate.slice(0, 10) : localToday());
        const billLines: NoteLineItem[] = (bill.lines || []).map((l, idx) => ({
          id: l.id || `bill-line-${idx}`,
          description: l.description || `Item #${idx + 1}`,
          billedQty: Number(l.quantity || 0),
          creditQty: 0,
          unitPrice: Number(l.unitPrice || 0),
          gstRate: Number(l.gstRate || 0),
          taxableAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          productId: l.product?.id,
          materialId: l.material?.id,
        }));
        setLines(billLines);
      }
    }
  };

  // Line item change handlers
  const handleLineQtyChange = (index: number, newQty: number) => {
    setLines((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      const safeQty = Math.max(0, Math.min(item.billedQty || 999999, newQty));
      item.creditQty = safeQty;
      const taxable = safeQty * item.unitPrice;
      const tax = adjustGst ? (taxable * item.gstRate) / 100 : 0;
      item.taxableAmount = Number(taxable.toFixed(2));
      item.taxAmount = Number(tax.toFixed(2));
      item.totalAmount = Number((taxable + tax).toFixed(2));
      copy[index] = item;
      return copy;
    });
  };

  const handleLinePriceChange = (index: number, newPrice: number) => {
    setLines((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      item.unitPrice = Math.max(0, newPrice);
      const taxable = item.creditQty * item.unitPrice;
      const tax = adjustGst ? (taxable * item.gstRate) / 100 : 0;
      item.taxableAmount = Number(taxable.toFixed(2));
      item.taxAmount = Number(tax.toFixed(2));
      item.totalAmount = Number((taxable + tax).toFixed(2));
      copy[index] = item;
      return copy;
    });
  };

  const handleLineGstChange = (index: number, newGst: number) => {
    setLines((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      item.gstRate = newGst;
      const taxable = item.creditQty * item.unitPrice;
      const tax = adjustGst ? (taxable * item.gstRate) / 100 : 0;
      item.taxableAmount = Number(taxable.toFixed(2));
      item.taxAmount = Number(tax.toFixed(2));
      item.totalAmount = Number((taxable + tax).toFixed(2));
      copy[index] = item;
      return copy;
    });
  };

  const setAllFullQuantity = () => {
    setLines((prev) =>
      prev.map((item) => {
        const safeQty = item.billedQty || 0;
        const taxable = safeQty * item.unitPrice;
        const tax = adjustGst ? (taxable * item.gstRate) / 100 : 0;
        return {
          ...item,
          creditQty: safeQty,
          taxableAmount: Number(taxable.toFixed(2)),
          taxAmount: Number(tax.toFixed(2)),
          totalAmount: Number((taxable + tax).toFixed(2)),
        };
      })
    );
  };

  const setAllZeroQuantity = () => {
    setLines((prev) =>
      prev.map((item) => ({
        ...item,
        creditQty: 0,
        taxableAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
      }))
    );
  };

  // Calculations
  const calculatedTaxable = useMemo(() => {
    if (manualMode || lines.length === 0) {
      return parseFloat(manualTaxable || '0');
    }
    return lines.reduce((sum, line) => sum + (line.creditQty > 0 ? line.taxableAmount : 0), 0);
  }, [lines, manualMode, manualTaxable]);

  const calculatedTax = useMemo(() => {
    if (!adjustGst) return 0;
    if (manualMode || lines.length === 0) {
      const rate = parseFloat(manualGstRate || '0');
      return (calculatedTaxable * rate) / 100;
    }
    return lines.reduce((sum, line) => sum + (line.creditQty > 0 ? line.taxAmount : 0), 0);
  }, [lines, adjustGst, manualMode, manualGstRate, calculatedTaxable]);

  const grandTotal = calculatedTaxable + calculatedTax;
  const activeItemsCount = lines.filter((l) => l.creditQty > 0).length;


  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, grandTotal, partyName, isSubmitting, lines, selectedDocId]);
  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  // View Modal
  if (viewNote) {
    const viewContent = (
      <div
        className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
        role="presentation"
      >
        <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
          <div className="flex items-start justify-between border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {viewNote.noteType === 'CREDIT' ? 'Credit Note' : 'Debit Note'}: {viewNote.noteNumber}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    viewNote.noteType === 'CREDIT'
                      ? 'bg-muted text-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {viewNote.partyType}
                </span>
                <span className="rounded-full bg-tone-emerald-bg/10 px-2.5 py-0.5 text-xs font-semibold text-tone-green-text ">
                  {viewNote.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Party: <span className="font-semibold text-foreground">{viewNote.partyName}</span> · Original Ref:{' '}
                {viewNote.originalInvoiceNumber || 'N/A'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl bg-muted/30 p-4 border border-border">
              <div>
                <span className="text-muted-foreground">Reason Code:</span>
                <p className="font-bold text-foreground mt-0.5">{viewNote.reasonCode}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Issue Date:</span>
                <p className="font-mono text-foreground mt-0.5">{viewNote.issueDate?.slice(0, 10)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">GST Output/Input Adjusted:</span>
                <p className="font-semibold text-foreground mt-0.5">{viewNote.adjustGst ? 'Yes' : 'No'}</p>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground font-semibold">Business Reason & Description:</span>
              <p className="mt-1 rounded-xl bg-muted/20 p-3 border border-border text-foreground">
                {viewNote.reasonDescription}
              </p>
            </div>

            <div className="w-full rounded-2xl bg-muted/40 p-4 border border-border space-y-2 font-mono">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Amount:</span>
                <span className="text-foreground">{formatCurrency(viewNote.taxableAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST Tax Component:</span>
                <span className="text-foreground">{formatCurrency(viewNote.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-border/70 pt-2 text-sm font-bold text-foreground">
                <span>Total Note Amount:</span>
                <span className="text-primary">
                  {formatCurrency(viewNote.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
    return createPortal(viewContent, document.body);
  }

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (grandTotal <= 0 || !partyName || isSubmitting) {
      if (grandTotal <= 0) {
        showToast({
          kind: 'error',
          title: 'Zero Amount',
          message: 'Please specify items or quantities to credit. Note total must be greater than zero.',
        });
      }
      return;
    }

    setIsSubmitting(true);
    const activeLines = lines.filter((l) => l.creditQty > 0);

    const payload = {
      entityId,
      noteType,
      partyType,
      partyName,
      partyGstin,
      originalInvoiceNumber,
      originalInvoiceDate,
      creditDate,
      reasonCode,
      reasonDescription:
        reasonDescription.trim() ||
        `${reasonCode} adjustment against ${originalInvoiceNumber || 'invoice'}`,
      adjustGst,
      restockInventory,
      taxableAmount: calculatedTaxable.toFixed(2),
      taxAmount: calculatedTax.toFixed(2),
      totalAmount: grandTotal.toFixed(2),
      lines: activeLines,
      invoiceId: selectedDocId,
      billId: selectedDocId,
    };

    try {
      if (onSubmit) {
        await onSubmit(payload);
      } else {
        // Automatic dispatch based on partyType
        if (partyType === 'CUSTOMER') {
          if (!selectedDocId) {
            throw new Error('Please select an existing sales invoice from the dropdown.');
          }
          await accountsApi.createArCreditNote({
            entityId,
            invoiceId: selectedDocId,
            reasonCode,
            reasonDescription: payload.reasonDescription,
            taxableAmount: payload.taxableAmount,
            taxAmount: payload.taxAmount,
            totalAmount: payload.totalAmount,
            creditDate,
          });
          showToast({
            kind: 'success',
            title: 'Credit Note Issued',
            message: `Credit note of ₹${payload.totalAmount} issued against Tax Invoice ${originalInvoiceNumber}.`,
          });
        } else {
          // Supplier Bill (AP)
          if (!selectedDocId) {
            throw new Error('Please select an existing supplier bill from the dropdown.');
          }
          await accountsApi.createBillDebitNote(selectedDocId, {
            reason: payload.reasonDescription,
            reasonCode,
            reasonCategory: reasonCode,
            taxableAmount: payload.taxableAmount,
            taxAmount: payload.taxAmount,
            totalAmount: payload.totalAmount,
            restockInventory,
            lines: activeLines.map((l) => ({
              description: l.description,
              quantity: l.creditQty,
              unitPrice: l.unitPrice,
              taxRate: l.gstRate,
              taxableAmount: l.taxableAmount,
              taxAmount: l.taxAmount,
              totalAmount: l.totalAmount,
              productId: l.productId,
              materialId: l.materialId,
              reason: reasonDescription || reasonCode,
            })),
          });
          showToast({
            kind: 'success',
            title: 'Debit Note Issued',
            message: `Debit note of ₹${payload.totalAmount} issued against supplier bill ${originalInvoiceNumber}.`,
          });
        }

        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
        onSuccess?.();
      }
      onClose();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Issuance Failed',
        message: err?.message || 'Could not issue note. Please verify all fields.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  const formContent = (
    <div
      className="fixed inset-0 z-[100] !m-0 !mt-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="presentation"
    >
      <div className="relative max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Issue {noteType === 'CREDIT' ? 'Credit Note' : 'Debit Note'}
              </h2>
              {initialInvoice && (
                <span className="inline-flex items-center gap-1 rounded-full bg-tone-emerald-bg/10 px-2.5 py-0.5 text-xs font-semibold text-tone-green-text  border border-tone-green-solid/20">
                  <CheckCircle2 className="h-3 w-3" /> Pre-filled from {partyType === 'VENDOR' ? 'Supplier Bill' : 'Tax Invoice'}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Smart commercial &amp; statutory adjustment with itemized returns, GST reversal, and automated ledger posting.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Top Classification Row (if not locked by initial invoice) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Note Classification</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as NoteType)}
              >
                <option value="CREDIT">Credit Note (Credit Customer / Supplier Allowance)</option>
                <option value="DEBIT">Debit Note (Debit Supplier / Customer Charge)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Transaction Party Type</label>
              <select
                disabled={Boolean(initialInvoice)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                value={partyType}
                onChange={(e) => {
                  const pt = e.target.value as NoteParty;
                  setPartyType(pt);
                  setSelectedDocId('');
                  setLines([]);
                  setPartyName('');
                  setPartyGstin('');
                  setOriginalInvoiceNumber('');
                  if (pt === 'VENDOR') {
                    setNoteType('DEBIT');
                  } else {
                    setNoteType('CREDIT');
                  }
                }}
              >
                <option value="CUSTOMER">Customer (Sales AR - Sales Return &amp; Rebates)</option>
                <option value="VENDOR">Vendor (Purchases AP - Purchase Return &amp; Debit Claims)</option>
              </select>
            </div>
          </div>

          {/* Existing Bill / Invoice Dropdown Selector */}
          {!initialInvoice && (
            <div className="rounded-2xl border border-border bg-n-50/50 p-4 ">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Select Existing {partyType === 'CUSTOMER' ? 'Customer Tax Invoice' : 'Supplier Bill'}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Pulls party details, GSTIN, and itemized billing automatically
                </span>
              </div>

              {partyType === 'CUSTOMER' ? (
                <select
                  required
                  value={selectedDocId}
                  onChange={(e) => handleSelectDocument(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                >
                  <option value="">-- Choose an issued Customer Tax Invoice --</option>
                  {(arInvoicesQuery.data?.items || []).map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} · {inv.customerName} ({formatDate(inv.invoiceDate)}) · Total: {formatCurrency(inv.totalAmount)} [{inv.status}]
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  required
                  value={selectedDocId}
                  onChange={(e) => handleSelectDocument(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                >
                  <option value="">-- Choose an approved Supplier Bill --</option>
                  {(apBillsQuery.data?.items || []).map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.supplierInvoiceNumber || (bill as any).billNumber || bill.id.slice(0, 8)} · {bill.vendorNameSnapshot || (bill as any).supplierName || 'Vendor'} ({formatDate(bill.invoiceDate || (bill as any).billDate)}) · Payable: {formatCurrency((bill as any).netPayable || (bill as any).totalAmount || 0)} [{bill.status}]
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Party and Original Document Meta */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl bg-muted/20 p-4 border border-border">
            <div>
              <label className="text-xs font-semibold text-foreground">Party Legal Name</label>
              <input
                required
                placeholder="Party Name"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Party GSTIN</label>
              <input
                placeholder="15-digit GSTIN"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono uppercase focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={partyGstin}
                onChange={(e) => setPartyGstin(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Original Invoice / Bill Ref</label>
              <input
                required
                placeholder="e.g. INV-2026-0042"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={originalInvoiceNumber}
                onChange={(e) => setOriginalInvoiceNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Original Document Date</label>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={originalInvoiceDate}
                onChange={(e) => setOriginalInvoiceDate(e.target.value)}
              />
            </div>
          </div>

          {/* Reason and Commercial Justification */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-foreground">Statutory Reason Category</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={reasonCode}
                onChange={(e) => {
                  const rc = e.target.value as any;
                  setReasonCode(rc);
                  if (rc === 'RETURN') {
                    setRestockInventory(true);
                  } else {
                    setRestockInventory(false);
                  }
                }}
              >
                <option value="RETURN">01 - Sales / Purchase Return (Goods Returned)</option>
                <option value="PRICE_DIFFERENCE">02 - Rate / Price Difference (Correction)</option>
                <option value="SHORTAGE">03 - Quantity Shortage / Transit Loss</option>
                <option value="DISCOUNT">04 - Post-Sale Volume Rebate / Discount</option>
                <option value="DEFICIENCY">05 - Deficiency in Service / Quality Defect</option>
                <option value="OTHER">06 - Other Commercial Adjustment</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Credit Note Issue Date</label>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={creditDate}
                onChange={(e) => setCreditDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground">Detailed Justification</label>
              <input
                required
                placeholder="Reason or reference agreement..."
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={reasonDescription}
                onChange={(e) => setReasonDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Itemized Line Items Section */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold text-foreground">
                  Bill Line Items Breakdown ({lines.length} items available)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {lines.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={setAllFullQuantity}
                      className="h-7 text-[11px] px-2.5"
                    >
                      Credit All Items (Full Return)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={setAllZeroQuantity}
                      className="h-7 text-[11px] px-2.5"
                    >
                      Clear Quantities
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setManualMode(!manualMode)}
                  className="h-7 text-[11px] text-muted-foreground"
                >
                  {manualMode ? 'Use Itemized Grid' : 'Enter Lump-sum Amount'}
                </Button>
              </div>
            </div>

            {/* If Manual Lump-sum mode */}
            {manualMode || lines.length === 0 ? (
              <div className="p-4 space-y-3 bg-card">
                <p className="text-xs text-muted-foreground">
                  Enter an ad-hoc adjustment amount directly without selecting individual line items:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Taxable Value (₹)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono text-right focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      value={manualTaxable}
                      onChange={(e) => setManualTaxable(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">GST Rate %</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      value={manualGstRate}
                      onChange={(e) => setManualGstRate(e.target.value)}
                    >
                      <option value="0">0% (Nil Tax)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              /* High-Density Item Table */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">Item Description</th>
                      <th className="p-3 text-right w-24">Billed Qty</th>
                      <th className="p-3 text-right w-32">Credit Qty</th>
                      <th className="p-3 text-right w-28">Unit Price (₹)</th>
                      <th className="p-3 text-center w-24">GST %</th>
                      <th className="p-3 text-right w-28">Taxable (₹)</th>
                      <th className="p-3 text-right w-28">GST (₹)</th>
                      <th className="p-3 text-right w-32">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {lines.map((line, idx) => {
                      const isActive = line.creditQty > 0;
                      return (
                        <tr
                          key={line.id}
                          className={`transition-colors ${
                            isActive ? 'bg-n-500/5 ' : 'hover:bg-muted/20'
                          }`}
                        >
                          <td className="p-3 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="p-3 font-sans font-medium text-foreground">
                            <div>{line.description}</div>
                            {isActive && (
                              <div className="text-[10px] text-primary font-normal">
                                Crediting {line.creditQty} of {line.billedQty} units
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {line.billedQty}
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={line.billedQty || 999999}
                              step="any"
                              value={line.creditQty === 0 ? '' : line.creditQty}
                              placeholder="0"
                              onChange={(e) =>
                                handleLineQtyChange(idx, parseFloat(e.target.value || '0'))
                              }
                              className={`w-24 rounded-lg border px-2 py-1 text-right text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                                isActive
                                  ? 'border-n-500 bg-background text-foreground '
                                  : 'border-border bg-background/50 text-foreground'
                              }`}
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) =>
                                handleLinePriceChange(idx, parseFloat(e.target.value || '0'))
                              }
                              className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <select
                              value={line.gstRate}
                              onChange={(e) => handleLineGstChange(idx, parseFloat(e.target.value))}
                              className="rounded-lg border border-border bg-background px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td className="p-3 text-right">
                            {formatCurrency(line.taxableAmount)}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {adjustGst ? formatCurrency(line.taxAmount) : '—'}
                          </td>
                          <td className="p-3 text-right font-bold text-foreground">
                            {formatCurrency(line.totalAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Statutory & Ledger Treatment Rules */}
          <div className="space-y-2 rounded-2xl bg-muted/20 p-4 border border-border text-xs">
            <label className="flex items-center gap-2 font-medium cursor-pointer">
              <Checkbox

                className="rounded border-border text-primary focus:ring-primary/20 focus:border-primary"
                checked={adjustGst}
                onChange={(e) => setAdjustGst(e.target.checked)}
              />
              <span>
                <strong>Statutory GST Adjustment:</strong> Reconcile and adjust tax component in GSTR-1 Table 9B (CDNR) or reverse GSTR-2B ITC
              </span>
            </label>

            {reasonCode === 'RETURN' && (
              <label className="flex items-center gap-2 font-medium cursor-pointer pl-6">
                <Checkbox

                  className="rounded border-border text-primary focus:ring-primary/20 focus:border-primary"
                  checked={restockInventory}
                  onChange={(e) => setRestockInventory(e.target.checked)}
                />
                <span>
                  <strong>Warehouse Restock &amp; COGS Reversal:</strong> Return credited items to stock and reverse Cost of Goods Sold in ledger
                </span>
              </label>
            )}
          </div>

          {/* Grand Totals Summary Card */}
          <div className="rounded-2xl bg-muted/40 p-4 border border-border flex flex-wrap justify-between items-center font-mono text-xs gap-3">
            <div className="space-y-1">
              <div className="text-muted-foreground">
                Items Credited: <span className="font-bold text-foreground">{activeItemsCount} items</span>
              </div>
              <div>
                <span className="text-muted-foreground">Taxable Value: </span>
                <span className="text-foreground font-bold">{formatCurrency(calculatedTaxable)}</span>
                {adjustGst && (
                  <span className="ml-3 text-muted-foreground">
                    Tax (GST): <span className="text-foreground font-bold">{formatCurrency(calculatedTax)}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-muted-foreground font-sans font-medium">Total Note Value</div>
              <div className="text-xl font-bold text-primary">
                {formatCurrency(grandTotal)}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md px-6"
              disabled={isSubmitting || !partyName || grandTotal <= 0}
            >
              {isSubmitting ? (
                'Issuing Note…'
              ) : (
                <>
                  Issue {noteType === 'CREDIT' ? 'Credit Note' : 'Debit Note'} ({formatCurrency(grandTotal)})
                  <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(formContent, document.body);
}
