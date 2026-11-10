'use client';

import React from 'react';
import { CheckCircle2, Clock3, ShieldCheck, Loader2 } from 'lucide-react';
import { BomVersionDetail } from '../types';
import { useApproveBom } from '../hooks';
import { useCurrentUser } from '../../auth/hooks';

interface Props { version: BomVersionDetail; }

function isAdmin(user: { role?: string; roleDefinition?: { key?: string } | null; roles?: Array<{ key?: string; name?: string }> } | undefined) {
  const values = [user?.role, user?.roleDefinition?.key, ...(user?.roles || []).flatMap((role) => [role.key, role.name])]
    .filter(Boolean).map((value) => String(value).toLowerCase().replace(/[\s-]+/g, '_'));
  return values.some((value) => value === 'admin' || value === 'system_admin' || value === 'super_admin');
}

export function BomValidationPanel({ version }: Props) {
  const approveMutation = useApproveBom();
  const { data: currentUser } = useCurrentUser();
  const admin = isAdmin(currentUser);
  const needsApproval = version.status === 'VALIDATION_PENDING';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div><h3 className="text-base font-semibold">BOM workflow</h3><p className="text-xs text-muted-foreground">Simple creator-based approval for production formulas.</p></div>
        </div>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold">{version.status}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Formula saved</div><p className="mt-1 text-xs text-muted-foreground">{version.lines.length} component line(s) are attached to this BOM.</p></div>
        <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-center gap-2 text-sm font-semibold">{needsApproval ? <Clock3 className="h-4 w-4 text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}{needsApproval ? 'Admin approval required' : 'Approval complete'}</div><p className="mt-1 text-xs text-muted-foreground">{needsApproval ? 'This BOM was created by a Store Manager and is waiting for Admin approval.' : 'Admin-created BOMs are approved automatically after saving.'}</p></div>
      </div>
      {needsApproval && admin && <div className="flex justify-end border-t border-border pt-4"><button type="button" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(version.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50">{approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{approveMutation.isPending ? 'Approving…' : 'Approve BOM'}</button></div>}
      {needsApproval && !admin && <p className="border-t border-border pt-4 text-right text-xs text-muted-foreground">Only an Admin can approve this BOM.</p>}
    </div>
  );
}
