'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Save, Send, X } from 'lucide-react';
import { Button, Card, Checkbox } from '@plinth/ui';
import { fetchApi } from '../api/client';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { ApprovalFlow } from '../../components/ApprovalFlow';
import { showToast } from '../../components/toast-store';
import { friendlyErrorMessage } from '../auth/access-control';
import { SearchableSelector } from '../../components/ui/SearchableSelector';
import { getUomSpecificationId, getUomSpecificationOptions } from './uqc-specifications';
import type { LifecycleStatus } from '@plinth/types';

export interface DetailedUom {
  id: string;
  code: string;
  name: string;
  symbol: string;
  dimension?: string | null;
  allowFractional?: boolean;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

interface UomDetailWorkspaceProps {
  id: string;
}

export function UomDetailWorkspace({ id }: UomDetailWorkspaceProps) {
  const queryClient = useQueryClient();
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  const { data: uom, isLoading, error, refetch } = useQuery<DetailedUom>({
    queryKey: ['uom', id],
    queryFn: () => fetchApi(`/uom/${id}`),
    enabled: Boolean(id),
  });

  const submitValidationMutation = useMutation({
    mutationFn: () => fetchApi(`/uom/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom', id] });
      queryClient.invalidateQueries({ queryKey: ['uoms'] });
      showToast({ kind: 'success', title: 'Validation submitted', message: `UOM ${uom?.code} is now submitted for technical review.` });
      refetch();
    },
    onError: (err) => showToast({ kind: 'error', title: 'Submission failed', message: friendlyErrorMessage(err) }),
  });

  if (isLoading) return <LoadingState message="Loading unit of measure…" />;
  if (error) return <ErrorState error={error as Error} retry={refetch} />;
  if (!uom) return <ErrorState error={new Error('Unit of measure not found')} retry={refetch} />;

  return (
    <main className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href="/inventory/uom" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Units of Measure
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{uom.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {uom.status === 'DRAFT' && (
              <Button
                variant="outline"
                onClick={() => submitValidationMutation.mutate()}
                loading={submitValidationMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" /> Submit for validation
              </Button>
            )}
            <Button onClick={() => setIsEditDrawerOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit unit
            </Button>
          </div>
        </header>

        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-foreground">Unit details</h2>
          </div>
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            {[
              { label: 'Name', value: uom.name },
              { label: 'Symbol', value: uom.symbol, mono: true },
              { label: 'Allow decimal quantities', value: uom.allowFractional === false ? 'No' : 'Yes' },
            ].map((item) => (
              <div key={item.label} className="min-w-0 bg-card px-5 py-4 sm:px-6">
                <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                <dd className={`mt-1 break-words text-sm font-semibold text-foreground ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {uom.status === 'PENDING_VALIDATION' && (
          <ApprovalFlow
            entityId={uom.id}
            entityTypePath="uom"
            currentStatus={uom.status}
            hasPermission={true}
            onSuccess={refetch}
          />
        )}
      </div>

      <UomEditDrawer
        isOpen={isEditDrawerOpen}
        onClose={() => {
          setIsEditDrawerOpen(false);
          refetch();
        }}
        uom={uom}
      />
    </main>
  );
}

// ----------------------------------------------------------------------------
// SLIDE-OVER UOM EDIT DRAWER
// ----------------------------------------------------------------------------
function UomEditDrawer({
  isOpen,
  onClose,
  uom,
}: {
  isOpen: boolean;
  onClose: () => void;
  uom: DetailedUom;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(uom.name);
  const [gstReferenceId, setGstReferenceId] = useState(() => getUomSpecificationId(uom));
  const [allowFractional, setAllowFractional] = useState(uom.allowFractional !== false);
  const specificationOptions = getUomSpecificationOptions(uom);

  useEffect(() => {
    if (!isOpen) return;
    setName(uom.name);
    setGstReferenceId(getUomSpecificationId(uom));
    setAllowFractional(uom.allowFractional !== false);
  }, [isOpen, uom]);

  const updateMutation = useMutation({
    mutationFn: (body: unknown) =>
      fetchApi(`/uom/${uom.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uom', uom.id] });
      queryClient.invalidateQueries({ queryKey: ['uoms'] });
      showToast({
        kind: 'success',
        title: 'UOM Updated',
        message: `${name} saved successfully.`,
      });
      onClose();
    },
    onError: (err) => {
      showToast({
        kind: 'error',
        title: 'Update Failed',
        message: friendlyErrorMessage(err),
      });
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const spec = specificationOptions.find((entry) => entry.id === gstReferenceId);
    if (!spec) {
      showToast({ kind: 'error', title: 'Specification required', message: 'Select a standard UOM specification.' });
      return;
    }
    updateMutation.mutate({
      name,
      symbol: spec.symbol,
      dimension: spec.dimension || null,
      allowFractional,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-xl flex-col bg-card border-l border-border shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Edit {uom.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form id="uom-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-muted-foreground">Unit Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border border-input bg-background p-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-muted-foreground">Standard GST reference</label>
            <SearchableSelector
              value={gstReferenceId}
              onChange={setGstReferenceId}
              options={specificationOptions}
              placeholder="Search standard UOM..."
              renderOption={(spec) => <div><div className="font-medium">{spec.name}</div><div className="text-[11px] font-mono text-muted-foreground">{spec.code} · {spec.symbol}</div></div>}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
            <div className="space-y-1">
              <label htmlFor="uom-allow-fractional" className="text-sm font-semibold text-foreground">Allow decimal quantities</label>
              <p className="text-xs text-muted-foreground">Turn this off for whole-count units such as pieces or boxes.</p>
            </div>
            <Checkbox
              id="uom-allow-fractional"
              checked={allowFractional}
              onChange={(event) => setAllowFractional(event.target.checked)}
            />
          </div>
        </form>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="uom-edit-form"
            type="submit"
            icon={Save}
            loading={updateMutation.isPending}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
