'use client';

import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import { X, BookOpen, Printer, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@plinth/ui';
import { accountsApi } from '../api';
import { CustomerCreditBalance } from '../types';
import { formatCurrency } from '../utils';

interface CustomerLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  customer: CustomerCreditBalance;
}

export function CustomerLedgerModal({
  isOpen,
  onClose,
  entityId,
  customer,
}: CustomerLedgerModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Customer-Statement-${customer.name}`,
  });
  const ledger = useQuery({
    queryKey: ['accounts', 'ar', 'customer-ledger', entityId, customer.id],
    queryFn: () => accountsApi.customerLedger(entityId, customer.id),
    enabled: isOpen && Boolean(entityId) && Boolean(customer.id),
  });

  if (!isOpen) return null;

  const entries = ledger.data || [];
  const creditLimitNum = parseFloat(customer.creditLimit || '0');
  const outstandingNum = parseFloat(customer.outstandingBalance || '0');
  const availableCreditNum = parseFloat(customer.availableCredit || '0');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      role="presentation"
    >
      <div
        id="customer-ledger-document"
        ref={printRef}
        data-printable="true"
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl flex flex-col printable-document print-target bg-white text-ink  "
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/70 p-6 bg-card sticky top-0 z-10 print:static print:border-b-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary border border-border">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Customer Ledger Statement
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground font-mono">
                  {customer.code}
                </span>
                {customer.isCreditExceeded && (
                  <span className="rounded-full bg-tone-rose-bg/10 px-2.5 py-0.5 text-xs font-semibold text-tone-red-text  flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Credit Exceeded
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Customer: <span className="font-semibold text-foreground">{customer.name}</span> · GSTIN:{' '}
                {customer.taxNumber || 'Unregistered / Consumer'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => handlePrint()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print Statement
            </Button>
            <button
              onClick={onClose}
              type="button"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Customer Credit Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6 bg-muted/20 border-b border-border/70">
          <div className="rounded-xl border border-border bg-card p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Approved Credit Limit</span>
            <p className="mt-1 text-base font-bold font-mono text-foreground">{formatCurrency(creditLimitNum)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Authorised customer credit</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Invoiced (All Orders)</span>
            <p className="mt-1 text-base font-bold font-mono text-foreground">{formatCurrency(customer.totalInvoiced)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{customer.invoiceCount} total orders/bills</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Payments Settled</span>
            <p className="mt-1 text-base font-bold font-mono text-tone-green-text ">{formatCurrency(customer.totalPaid)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Realized collections</p>
          </div>

          <div className={`rounded-xl border p-3 ${
            outstandingNum > 0 ? 'bg-tone-amber-bg/5 border-tone-amber-solid/30' : 'bg-card border-border'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-tone-amber-text ">Total Dues to Collect</span>
              <span className="text-[10px] font-mono font-bold text-muted-foreground">{customer.utilizationPercent}% limit</span>
            </div>
            <p className="mt-1 text-base font-bold font-mono text-tone-amber-text ">{formatCurrency(outstandingNum)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Available limit: {formatCurrency(availableCreditNum)}</p>
          </div>
        </div>

        {/* Ledger Entries Table */}
        <div className="p-6 flex-1 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Running Ledger & Transaction History
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {entries.length} recorded transaction{entries.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table className="w-full text-xs">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                  <TableHead className="p-3 text-left font-semibold">Reference Document</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Debit / Billed (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Credit / Paid (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Settled (₹)</TableHead>
                  <TableHead className="p-3 text-right font-semibold">Running Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60 font-mono">
                {ledger.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading customer ledger entries…
                    </TableCell>
                  </TableRow>
                ) : entries.length ? (
                  entries.map((entry, idx) => {
                    const balanceNum = parseFloat(String(entry.balance || 0));
                    return (
                      <TableRow key={idx} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="p-3 text-muted-foreground font-mono">
                          {String(entry.entryDate).slice(0, 10)}
                        </TableCell>
                        <TableCell className="p-3 font-sans">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            entry.entryType === 'INVOICE'
                              ? 'bg-muted text-foreground'
                              : entry.entryType === 'RECEIPT'
                              ? 'bg-muted text-foreground'
                              : 'bg-muted text-foreground'
                          }`}>
                            {entry.entryType}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 font-mono font-bold text-foreground">
                          {entry.reference}
                        </TableCell>
                        <TableCell className="p-3 text-right text-foreground">
                          {Number(entry.debit) > 0 ? formatCurrency(entry.debit) : '—'}
                        </TableCell>
                        <TableCell className="p-3 text-right text-tone-green-text  font-bold">
                          {Number(entry.credit) > 0 ? formatCurrency(entry.credit) : '—'}
                        </TableCell>
                        <TableCell className="p-3 text-right text-muted-foreground">
                          {Number(entry.settled) > 0 ? formatCurrency(entry.settled) : '—'}
                        </TableCell>
                        <TableCell className={`p-3 text-right font-bold ${
                          balanceNum > 0 ? 'text-tone-amber-text ' : 'text-tone-green-text '
                        }`}>
                          {formatCurrency(balanceNum)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="p-8 text-center text-muted-foreground font-sans">
                      No ledger transactions found for this customer.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/70 p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Plinth Accounts Receivables & Customer Credit Control. Outstanding amounts represent total dues to collect from customer.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl text-xs"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
