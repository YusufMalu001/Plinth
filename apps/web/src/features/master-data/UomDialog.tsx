'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Save, Plus } from 'lucide-react';
import { Button, Checkbox, Dialog, Input } from '@synergy/ui';
import { fetchApi } from '../api/client';
import { SearchableSelector } from '../../components/ui/SearchableSelector';
import { getUomSpecificationId, getUomSpecificationOptions } from './uqc-specifications';
import type { DetailedUom } from './UomDetailWorkspace';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../auth/access-control';

type UomDialogMode = 'create' | 'view' | 'edit';

export function UomDialog({ mode, uom, open, onClose, onEdit, onSaved }: {
  mode: UomDialogMode;
  uom?: DetailedUom;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onSaved?: (uom: DetailedUom) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [gstReferenceId, setGstReferenceId] = useState('');
  const [allowFractional, setAllowFractional] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(uom?.name || '');
    setGstReferenceId(getUomSpecificationId(uom));
    setAllowFractional(uom?.allowFractional !== false);
  }, [open, uom]);

  const specificationOptions = getUomSpecificationOptions(uom);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const spec = specificationOptions.find((entry) => entry.id === gstReferenceId);
      if (!spec) throw new Error('Select a standard UOM specification.');
      if (mode === 'edit' && uom) {
        return fetchApi<DetailedUom>(`/uom/${uom.id}`, { method: 'PUT', body: JSON.stringify({ name: name.trim(), symbol: spec.symbol, dimension: spec.dimension || null, allowFractional }) });
      }
      const code = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 50) || spec.symbol.toUpperCase();
      return fetchApi<DetailedUom>('/uom', { method: 'POST', body: JSON.stringify({ code, name: name.trim(), symbol: spec.symbol, dimension: spec.dimension || null, isBaseUnit: true, allowFractional }) });
    },
    onSuccess: async (saved) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['uom'] }), queryClient.invalidateQueries({ queryKey: ['uoms'] })]);
      showToast({ kind: 'success', title: mode === 'edit' ? 'UOM updated' : 'UOM created', message: `${saved.name} (${saved.symbol}) was saved.` });
      onSaved?.(saved);
      onClose();
    },
    onError: (error) => showToast({ kind: 'error', title: 'Unable to save UOM', message: friendlyErrorMessage(error) }),
  });

  const viewing = mode === 'view';
  const editing = mode === 'edit';
  const title = viewing ? uom?.name || 'Unit of measure' : editing ? 'Edit unit of measure' : 'Create unit of measure';
  return (
    <Dialog open={open} onClose={onClose} title={title} description={viewing ? undefined : 'Set the unit details and whether quantities can include decimals.'} className="max-w-lg">
      {viewing && uom ? (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4"><dt className="text-xs font-medium text-muted-foreground">Name</dt><dd className="mt-1 font-semibold text-foreground">{uom.name}</dd></div>
            <div className="rounded-xl border border-border bg-muted/20 p-4"><dt className="text-xs font-medium text-muted-foreground">Symbol</dt><dd className="mt-1 font-mono font-semibold text-foreground">{uom.symbol}</dd></div>
          </dl>
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3"><span className="text-sm text-foreground">Allow decimal quantities</span><span className="text-sm font-semibold text-foreground">{uom.allowFractional === false ? 'No' : 'Yes'}</span></div>
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={onEdit} icon={Pencil}>Edit unit</Button></div>
        </div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-semibold text-foreground">Name <span className="text-destructive">*</span><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Kilograms" /></label>
          <label className="block space-y-1.5 text-xs font-semibold text-foreground">Standard GST reference <span className="text-destructive">*</span><SearchableSelector value={gstReferenceId} onChange={setGstReferenceId} options={specificationOptions} isLoading={false} placeholder="Search standard UOM..." renderOption={(spec) => <div><div className="font-medium">{spec.name}</div><div className="text-[11px] font-mono text-muted-foreground">{spec.code} · {spec.symbol}</div></div>} /></label>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4"><div><div className="text-sm font-semibold text-foreground">Allow decimal quantities</div><p className="mt-1 text-xs text-muted-foreground">Turn this off for whole-count units such as pieces or boxes.</p></div><Checkbox checked={allowFractional} onChange={(event) => setAllowFractional(event.target.checked)} aria-label="Allow decimal quantities" /></div>
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={saveMutation.isPending} icon={editing ? Save : Plus}>{editing ? 'Save changes' : 'Create UOM'}</Button></div>
        </form>
      )}
    </Dialog>
  );
}
