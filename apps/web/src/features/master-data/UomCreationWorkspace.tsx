'use client';

import React, { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, RotateCcw, Save } from 'lucide-react';
import { Button, PageHeader } from '@plinth/ui';
import { SearchableSelector } from '../../components/ui/SearchableSelector';
import { useCreateUom } from '../../hooks/useMasterData';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../../features/auth/access-control';
import { GST_UQC_SPECIFICATIONS } from './uqc-specifications';

interface UomFormState { name: string; gstReferenceId: string }
const INITIAL_FORM: UomFormState = { name: '', gstReferenceId: '' };

// The API keeps a code for integrations, but users only enter the two
// business-facing values. Use the name first so the code stays predictable.
function buildInternalCode(name: string, symbol: string) {
  const fromName = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 50);
  return fromName || symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 50);
}

export function UomCreationWorkspace() {
  const router = useRouter();
  const [form, setForm] = useState<UomFormState>(INITIAL_FORM);
  const createUom = useCreateUom();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const standardSpec = GST_UQC_SPECIFICATIONS.find((s) => s.id === form.gstReferenceId || s.code === form.gstReferenceId);
    const symbol = standardSpec?.symbol.trim() || '';
    if (!name) { showToast({ kind: 'error', title: 'UOM Name Required', message: 'Enter the unit name.' }); return; }
    if (!standardSpec) { showToast({ kind: 'error', title: 'Standard GST Reference Required', message: 'Select a standard GST reference specification.' }); return; }

    try {
      const payload = { code: buildInternalCode(name, symbol), name, symbol, dimension: standardSpec.dimension || null, isBaseUnit: true };
      const created = await createUom.mutateAsync(payload);
      showToast({ kind: 'success', title: 'Unit of Measure Created', message: `${name} (${symbol}) was added with status ${created.status}.` });
      router.push('/inventory/uom');
    } catch (error) {
      showToast({ kind: 'error', title: 'UOM Creation Failed', message: friendlyErrorMessage(error) });
    }
  };

  return (
    <div className="flex-1 min-h-screen overflow-y-auto bg-muted/20 p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/products" className="transition-colors hover:text-primary">Products Catalog</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/inventory/uom" className="transition-colors hover:text-primary">Units of Measure</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground">Create Unit of Measure</span>
        </nav>

        <PageHeader title="Create Unit of Measure" description="Define the name and Standard GST Reference used across products, inventory, BOMs, and production." actions={
          <div className="flex items-center gap-2.5">
            <Button variant="outline" size="sm" type="button" onClick={() => router.push('/inventory/uom')} icon={ArrowLeft}>Back to UOMs</Button>
            <Button variant="outline" size="sm" type="button" onClick={() => setForm(INITIAL_FORM)} icon={RotateCcw}>Reset</Button>
            <Button size="sm" type="submit" form="uom-create-form" disabled={createUom.isPending} icon={Save}>{createUom.isPending ? 'Creating...' : 'Create UOM'}</Button>
          </div>
        } />

        <form id="uom-create-form" onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border/70 px-6 py-5">
            <h2 className="text-base font-bold text-foreground">Unit of Measure</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only the unit name and Standard GST Reference are required.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
            <div><label htmlFor="uom-name" className="mb-1.5 block text-xs font-semibold text-foreground">Name <span className="text-destructive">*</span></label><input id="uom-name" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Kilograms" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
            <div><label htmlFor="uom-gst-reference" className="mb-1.5 block text-xs font-semibold text-foreground">Standard GST Reference <span className="text-destructive">*</span></label><SearchableSelector value={form.gstReferenceId} onChange={(value) => setForm((current) => ({ ...current, gstReferenceId: value }))} options={GST_UQC_SPECIFICATIONS} isLoading={false} placeholder="Search standard UOM specification..." renderOption={(uom) => <div><div className="font-medium">{uom.name}</div><div className="text-[11px] font-mono text-muted-foreground">{uom.code} · {uom.symbol}</div></div>} /><p className="mt-1 text-[11px] font-normal text-muted-foreground">Select the standard commercial specification used for GST/UQC reporting.</p></div>
          </div>
          <div className="mx-6 mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">The symbol is also used to generate the internal UQC code automatically, so the same unit can be selected consistently throughout the platform.</div>
        </form>
      </div>
    </div>
  );
}
