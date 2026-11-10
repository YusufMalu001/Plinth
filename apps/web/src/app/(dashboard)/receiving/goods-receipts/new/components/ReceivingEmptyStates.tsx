'use client';

import React from 'react';
import Link from 'next/link';
import { PackageCheck, ArrowRight, ShieldAlert } from 'lucide-react';

export function NoReceivablePosState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-xs border border-border">
        <PackageCheck className="h-7 w-7 text-primary" />
      </div>

      <h3 className="mt-4 text-base font-bold text-foreground">
        No Receivable Purchase Orders
      </h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        Approved purchase orders must be officially issued (status{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground border border-border/60">
          SENT
        </code>{' '}
        or{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground border border-border/60">
          PARTIALLY_RECEIVED
        </code>
        ) before goods receipts can be created.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <Link
          href="/procurement/purchase-orders"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90 cursor-pointer"
        >
          <span>View purchase orders</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/receiving/expected"
          className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-muted cursor-pointer"
        >
          Expected schedule
        </Link>
      </div>
    </div>
  );
}

export function ReceivingForbiddenState({ message }: { message?: string }) {
  return (
    <main className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-border/80 bg-card p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h2 className="mt-5 text-lg font-bold text-foreground">
          Receiving Access Restricted
        </h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {message ||
            'You do not have the required permissions to register incoming shipments or process goods receipt notes.'}
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            href="/receiving/expected"
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90"
          >
            Return to receiving overview
          </Link>
        </div>
      </div>
    </main>
  );
}
