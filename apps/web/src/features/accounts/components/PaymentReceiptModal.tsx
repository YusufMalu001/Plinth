'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { PaymentRecord, PaymentType, PaymentMode, BankAccount, SalesInvoice } from '../types';
import { formatCurrency, localToday } from '../utils';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  bankAccounts: BankAccount[];
  invoices: SalesInvoice[];
  defaultType?: PaymentType;
  onSubmit: (paymentData: any) => Promise<void>;
  viewPayment?: PaymentRecord | null;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  entityId,
  bankAccounts,
  invoices,
  defaultType = 'VENDOR_PAYMENT',
  onSubmit,
  viewPayment,
}: PaymentReceiptModalProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>(defaultType);
  const [partyName, setPartyName] = useState('');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('NEFT_RTGS');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);


  const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (paymentType === 'CUSTOMER_RECEIPT' && !selectedInvoice) return;
    if (isSubmitting || !partyName || !referenceNumber || parseFloat(amount || '0') <= 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        entityId,
        paymentType,
        partyName,
        bankAccountId,
        bankAccountName: selectedBank ? `${selectedBank.bankName} (${selectedBank.accountNumber.slice(-4)})` : '',
        paymentMode,
        referenceNumber,
        paymentDate,
        amount: parseFloat(amount || '0').toFixed(2),
        invoiceId: paymentType === 'CUSTOMER_RECEIPT' ? selectedInvoice?.id : undefined,
        customerId: paymentType === 'CUSTOMER_RECEIPT' ? selectedInvoice?.customerId || undefined : undefined,
        unallocatedAmount: '0.00',
        description,
        allocations: [],
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, partyName, referenceNumber, amount, paymentType, selectedInvoice]);
  if (!isOpen) return null;


  if (viewPayment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
          <div className="flex items-start justify-between border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {viewPayment.paymentType === 'CUSTOMER_RECEIPT' ? 'Receipt Voucher' : 'Payment Voucher'}:{' '}
                  {viewPayment.paymentNumber}
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary dark:text-primary">
                  {viewPayment.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Date: {viewPayment.paymentDate.slice(0, 10)} · Mode: {viewPayment.paymentMode} · Ref:{' '}
                {viewPayment.referenceNumber}
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl bg-muted/30 p-4 border border-border">
              <div>
                <span className="text-muted-foreground">Party:</span>
                <p className="font-bold text-foreground mt-0.5">{viewPayment.partyName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Bank Account:</span>
                <p className="font-semibold text-foreground mt-0.5">{viewPayment.bankAccountName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Amount:</span>
                <p className="font-mono font-bold text-muted-foreground dark:text-primary mt-0.5">
                  {formatCurrency(viewPayment.amount)}
                </p>
              </div>
            </div>

            {viewPayment.description && (
              <div>
                <span className="text-muted-foreground font-semibold">Description / Purpose:</span>
                <p className="mt-1 rounded-xl bg-muted/20 p-3 border border-border text-foreground">
                  {viewPayment.description}
                </p>
              </div>
            )}

            {viewPayment.allocations && viewPayment.allocations.length > 0 && (
              <div>
                <h3 className="font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Settled Open Documents
                </h3>
                <div className="overflow-x-auto rounded-2xl border border-border font-mono">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="p-2.5 text-left font-semibold">Document Ref</TableHead>
                        <TableHead className="p-2.5 text-left font-semibold">Date</TableHead>
                        <TableHead className="p-2.5 text-right font-semibold">Original Amt</TableHead>
                        <TableHead className="p-2.5 text-right font-semibold">Allocated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60">
                      {viewPayment.allocations.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="p-2.5">{a.documentNumber}</TableCell>
                          <TableCell className="p-2.5">{a.documentDate}</TableCell>
                          <TableCell className="p-2.5 text-right">{formatCurrency(a.originalAmount)}</TableCell>
                          <TableCell className="p-2.5 text-right font-bold text-primary dark:text-primary">
                            {formatCurrency(a.allocatedAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {paymentType === 'CUSTOMER_RECEIPT' ? 'Record Customer Receipt' : 'Record Payment Proposal'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Record bank/cash voucher and allocate against open AP bills or AR customer invoices.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {paymentType === 'CUSTOMER_RECEIPT' && (
            <div>
              <label className="text-xs font-semibold text-foreground">Posted Accounts Invoice</label>
              <select
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                value={invoiceId}
                onChange={(e) => {
                  const invoice = invoices.find((item) => item.id === e.target.value);
                  setInvoiceId(e.target.value);
                  if (invoice) setPartyName(invoice.customerName);
                }}
              >
                <option value="">Select a posted invoice with an open balance</option>
                {invoices.filter((invoice) => invoice.status === 'POSTED' && Number(invoice.availableReceiptAmount ?? invoice.outstandingAmount) > 0).map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} · {invoice.customerName} · Available {formatCurrency(invoice.availableReceiptAmount ?? invoice.outstandingAmount)}
                  </option>
                ))}
              </select>
              {selectedInvoice && <p className="mt-1 text-[11px] text-muted-foreground">Receipt will be allocated to this invoice. Partial collection is allowed.</p>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Transaction Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as PaymentType)}
              >
                <option value="VENDOR_PAYMENT">Vendor Payment (AP Settlement)</option>
                <option value="CUSTOMER_RECEIPT">Customer Receipt (AR Collection)</option>
                <option value="DIRECT_EXPENSE">Direct Bank Expense</option>
                <option value="ADVANCE">Advance Deposit</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Party Name</label>
              <input
                required
                placeholder="e.g. Apex Electronics / AeroTech"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                readOnly={paymentType === 'CUSTOMER_RECEIPT' && Boolean(selectedInvoice)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {paymentType !== 'CUSTOMER_RECEIPT' && <div>
              <label className="text-xs font-semibold text-foreground">Bank Account</label>
              <select
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - {b.accountNumber}
                  </option>
                ))}
              </select>
            </div>}

            <div>
              <label className="text-xs font-semibold text-foreground">Payment Mode</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              >
                <option value="NEFT_RTGS">NEFT / RTGS Online Transfer</option>
                <option value="UPI">UPI Digital Payout</option>
                <option value="CHEQUE">Cheque / Demand Draft</option>
                <option value="CASH">Cash Transaction</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Bank Ref / UTR / Cheque No.</label>
              <input
                required
                placeholder="e.g. UTR98234710"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Date</label>
              <input
                required
                type="date"
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Total Payment Amount (₹)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono font-bold text-right focus:ring-2 focus:ring-ring focus:outline-none placeholder:text-muted-foreground/60"
              value={amount}
              max={selectedInvoice?.availableReceiptAmount ?? selectedInvoice?.outstandingAmount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Narration / Internal Reference</label>
            <textarea
              rows={2}
              placeholder="e.g. Cleared bill BILL-9082 and partial payment on order PO-4482..."
              className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
              disabled={isSubmitting || !partyName || !referenceNumber || parseFloat(amount || '0') <= 0}
            >
              {isSubmitting ? 'Recording…' : 'Record Voucher'}
              <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
