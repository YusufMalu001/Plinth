'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { Button } from '@plinth/ui';
import { AccountingPeriod } from '../types';

interface PeriodCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  period: AccountingPeriod | null;
  onClosePeriod: (periodId: string) => Promise<void>;
}

export function PeriodCloseModal({ isOpen, onClose, period, onClosePeriod }: PeriodCloseModalProps) {
  const [checklist, setChecklist] = useState({
    bankRecon: true,
    subledgers: true,
    grniCleared: true,
    marketplaceCleared: true,
    tcsTdsVerified: true,
    gstReconciled: true,
    tallySyncVerified: true,
  });
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen || !period) return null;

  const allChecksPassed = Object.values(checklist).every(Boolean);

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await onClosePeriod(period.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Period Close Checklist: {period.code}
              </h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary dark:text-primary">
                {period.fiscalYear}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify all balance reconciliation criteria before permanently locking the accounting period.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Mandatory Balance Reconciliation Sign-Off
            </h3>

            {[
              {
                id: 'bankRecon',
                label: 'Bank Book to GL Reconciliation (Zero unexplained differences)',
                desc: 'All bank statement lines matched or accounted for in BRS statement.',
              },
              {
                id: 'subledgers',
                label: 'AP / AR Subledgers Reconciled to Control Accounts',
                desc: 'Vendor open balances match Trade Payables GL; Customer aging matches AR GL.',
              },
              {
                id: 'grniCleared',
                label: 'Goods Received Not Invoiced (GRNI) Clearing Verified',
                desc: 'Accepted stocked GRNs matched to supplier bills or valid accrual held.',
              },
              {
                id: 'marketplaceCleared',
                label: 'Marketplace Clearing Accounts Reconciled',
                desc: 'Gross channel orders, returns, commissions, and bank payouts net to zero.',
              },
              {
                id: 'tcsTdsVerified',
                label: 'Statutory GST TCS & TDS (194-O) Ledgers Balanced',
                desc: 'Tax deductions matched with portal certificates and MTR reports.',
              },
              {
                id: 'gstReconciled',
                label: 'GSTR-1, 2B and 3B Tax Workpapers Finalized',
                desc: 'Outward supplies and input tax credits verified for portal filing.',
              },
              {
                id: 'tallySyncVerified',
                label: 'Parallel Run TallyPrime Trial Balance Variance Zero',
                desc: 'Dual-book debit and credit sums match official Tally trial balance.',
              },
            ].map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-3 p-2 rounded-xl hover:bg-muted/40 transition-all cursor-pointer text-xs"
              >
                <Checkbox

                  className="mt-0.5 rounded border-border text-muted-foreground focus:ring-ring"
                  checked={(checklist as any)[item.id]}
                  onChange={(e) => setChecklist((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                />
                <div>
                  <p className="font-semibold text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs text-foreground dark:text-muted-foreground">
            <p className="font-semibold flex items-center gap-1.5">
              <Lock className="h-4 w-4" />
              Period Lock Effect
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Once closed, backdated journal vouchers and supplier bills cannot be posted into this period without an
              authorized financial reopen workflow and full audit log.
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isClosing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleClose}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-1.5"
              disabled={isClosing || !allChecksPassed}
            >
              <Lock className="h-4 w-4" />
              {isClosing ? 'Closing Period…' : 'Close & Lock Period'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
