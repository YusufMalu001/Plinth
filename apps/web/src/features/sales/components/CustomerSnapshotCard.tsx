'use client';

import React from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  ShieldAlert,
  User,
  Phone,
  CheckCircle2,
  X,
  Building,
} from 'lucide-react';
import { Button, Badge } from '@synergy/ui';
import { Customer } from '../types';

interface CustomerSnapshotCardProps {
  customer: Customer;
  orderTotal?: number;
  creditExposure?: {
    creditLimit: number;
    creditUtilized: number;
    availableCredit: number;
    utilizationPercent: number;
    activeOrdersCount?: number;
  } | null;
  onClear?: () => void;
}

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

export function CustomerSnapshotCard({
  customer,
  orderTotal = 0,
  creditExposure,
  onClear,
}: CustomerSnapshotCardProps) {
  const creditLimit = Number(creditExposure?.creditLimit ?? customer.creditLimit ?? 0);
  const creditUtilized = Number(creditExposure?.creditUtilized ?? 0);
  const projectedExposure = creditUtilized + orderTotal;
  const isOverCredit = creditLimit > 0 && projectedExposure > creditLimit;
  const excessAmount = Math.max(0, projectedExposure - creditLimit);
  const remainingAfterOrder = Math.max(0, creditLimit - projectedExposure);

  // Extract address metadata if available
  const billingMeta =
    customer.billingAddress && typeof customer.billingAddress === 'object'
      ? customer.billingAddress
      : {};

  const customerType = customer.customerType || (billingMeta as any).customerType || 'DEALER';
  const paymentTerms = customer.paymentTerms || (billingMeta as any).paymentTerms || 'NET_30';
  const contactPerson = customer.contactPerson || (billingMeta as any).contactPerson || '';

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-xs transition-all">
      {/* Header Row: Customer Identity */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            <Building className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                {customer.name}
              </h3>
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {customer.code}
              </span>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                {customerType}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5 flex-wrap">
              {contactPerson && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground/80" />
                  <span className="text-foreground/90 font-medium">{contactPerson}</span>
                </span>
              )}
              {customer.contactPhone && (
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="h-3 w-3 text-muted-foreground/80" />
                  <span>{customer.contactPhone}</span>
                </span>
              )}
              {customer.taxNumber && (
                <span className="font-mono text-[11px] bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                  GSTIN: {customer.taxNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/sales/customers/${customer.id}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline px-2.5 py-1 rounded-lg hover:bg-primary/10 transition-colors border border-primary/20"
          >
            <span>Customer 360</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
          {onClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onClear}
              title="Change Customer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Credit & Terms Telemetry Strip */}
      {creditLimit > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Approved Limit
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm text-foreground">
                {formatCurrency(creditLimit)}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Current Dues
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm text-foreground">
                {formatCurrency(creditUtilized)}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Order Value
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm text-primary">
                {formatCurrency(orderTotal)}
              </span>
            </div>

            <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                {isOverCredit ? 'Excess Exposure' : 'Available Balance'}
              </span>
              <span
                className={`font-mono font-bold text-xs sm:text-sm ${
                  isOverCredit ? 'text-destructive font-black' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isOverCredit ? `+ ${formatCurrency(excessAmount)}` : formatCurrency(remainingAfterOrder)}
              </span>
            </div>
          </div>

          {/* Status Alert Banner */}
          {isOverCredit ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs font-semibold">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                Credit Limit Breached by <strong className="font-mono font-bold">{formatCurrency(excessAmount)}</strong>. Order will require Admin / Accounts approval in Hold Queue.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                Account is in good credit standing ({formatCurrency(remainingAfterOrder)} remaining after this order).
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Payment Terms
            </span>
            <span className="font-medium text-foreground">
              {paymentTerms.replace('_', ' ')}
            </span>
          </div>
          <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Credit Mode
            </span>
            <span className="font-medium text-muted-foreground">
              No Pre-set Limit (Direct Billing)
            </span>
          </div>
          <div className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Tax ID / GSTIN
            </span>
            <span className="font-mono font-medium text-foreground">
              {customer.taxNumber || 'Unregistered'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
