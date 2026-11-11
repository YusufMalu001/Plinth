'use client';

import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button, Checkbox, Dialog, Input } from '@plinth/ui';
import { SearchableSelector } from './ui/SearchableSelector';
import {
  useCategories,
  useCreateCategory,
  useCreateProductFamily,
  useCreateUom,
  useUoms,
} from '../hooks/useMasterData';
import { showToast } from './toast-store';
import { GST_UQC_SPECIFICATIONS } from '../features/master-data/uqc-specifications';

type Kind = 'category' | 'family' | 'uom';

export function InlineMasterDataDialog({
  kind,
  open,
  onClose,
  categoryId,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  categoryId?: string;
  onCreated: (id: string) => void;
}) {
  const categories = useCategories('ACTIVE');
  const createCategory = useCreateCategory();
  const createFamily = useCreateProductFamily();
  const createUom = useCreateUom();
  const uoms = useUoms('ACTIVE');
  const [form, setForm] = useState({ name: '', gstReferenceId: '', description: '', selectedCategoryId: categoryId || '', allowFractional: true });

  useEffect(() => {
    if (open) setForm({ name: '', gstReferenceId: '', description: '', selectedCategoryId: categoryId || '', allowFractional: true });
  }, [open, categoryId, kind]);

  const title = kind === 'category' ? 'Create parent category' : kind === 'family' ? 'Create sub category' : 'Create unit of measure';
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const generatedCode = (prefix: string) => {
    const normalized = form.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `${prefix}-${normalized || Date.now()}`.slice(0, 50);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      let created: { id: string };
      if (kind === 'category') {
        created = await createCategory.mutateAsync({ code: generatedCode('CATEGORY'), name: form.name.trim(), description: form.description.trim() || undefined });
      } else if (kind === 'family') {
        if (!form.selectedCategoryId) throw new Error('Select a parent category for this sub category.');
        created = await createFamily.mutateAsync({ code: generatedCode('FAMILY'), name: form.name.trim(), description: form.description.trim() || undefined, categoryId: form.selectedCategoryId });
      } else {
        const standardSpec = GST_UQC_SPECIFICATIONS.find((s) => s.id === form.gstReferenceId || s.code === form.gstReferenceId);
        if (!standardSpec) throw new Error('Select a Standard GST Reference specification.');
        const symbol = standardSpec.symbol;
        const code = form.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 50) || symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Check if an identical code or name already exists in active UOMs
        const existingUom = uoms.data?.items?.find(
          (u) => u.code.toUpperCase() === code || u.name.toLowerCase() === form.name.trim().toLowerCase()
        );

        if (existingUom) {
          showToast({
            kind: 'success',
            title: 'Using Existing Unit of Measure',
            message: `Selected existing UOM "${existingUom.name} (${existingUom.code})" for this form.`,
          });
          onCreated(existingUom.id);
          onClose();
          return;
        }

        created = await createUom.mutateAsync({
          code,
          name: form.name.trim(),
          symbol,
          dimension: standardSpec.dimension || null,
          isBaseUnit: true,
          allowFractional: form.allowFractional,
        });
      }
      showToast({ kind: 'success', title: `${title} complete`, message: 'The new option is now available in this form.' });
      onCreated(created.id);
      onClose();
    } catch (error) {
      showToast({ kind: 'error', title: `Unable to ${title.toLowerCase()}`, message: error instanceof Error ? error.message : 'Please review the fields and try again.' });
    }
  };

  const saving = createCategory.isPending || createFamily.isPending || createUom.isPending;
  return (
    <Dialog open={open} onClose={onClose} title={title} description="Create it here and continue without leaving the current form." className="max-w-md">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Name <span className="text-destructive">*</span>
            <Input
              required
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder={title.replace('Create ', '')}
            />
          </label>
        </div>
        {kind === 'uom' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Standard GST Reference <span className="text-destructive">*</span>
              <SearchableSelector
                value={form.gstReferenceId}
                onChange={(value) => set('gstReferenceId', value)}
                options={GST_UQC_SPECIFICATIONS}
                isLoading={false}
                placeholder="Search standard UOM specification..."
                renderOption={(uom) => <div><div className="font-medium">{uom.name}</div><div className="text-[11px] font-mono text-muted-foreground">{uom.code} · {uom.symbol}</div></div>}
              />
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                Select the standard commercial specification used for GST/UQC reporting.
              </span>
            </label>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 sm:col-span-2">
              <div><div className="text-sm font-semibold text-foreground">Allow decimal quantities</div><p className="text-xs font-normal text-muted-foreground">Turn off for whole-count units such as pieces or boxes.</p></div>
              <Checkbox checked={form.allowFractional} onChange={(event) => setForm((current) => ({ ...current, allowFractional: event.target.checked }))} aria-label="Allow decimal quantities" />
            </div>
          </div>
        ) : kind === 'family' ? (
          <label className="text-xs font-semibold text-muted-foreground">Parent category<select required value={form.selectedCategoryId} onChange={(event) => set('selectedCategoryId', event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Select parent category</option>{categories.data?.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        ) : null}
        {kind !== 'uom' && <label className="text-xs font-semibold text-muted-foreground">Description<textarea value={form.description} onChange={(event) => set('description', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" placeholder="Optional description" /></label>}
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving} icon={saving ? undefined : Save}><Plus className="mr-1 h-4 w-4" />Create</Button></div>
      </form>
    </Dialog>
  );
}
