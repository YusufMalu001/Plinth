'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@synergy/ui';
import { usePricingMasters, useDeletePricingMaster, type PricingMaster, type PricingTier } from '../../../../hooks/useMasterData';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { showToast } from '../../../../components/toast-store';
import { ConfirmDeleteDialog } from '../../../../components/ConfirmDeleteDialog';
import { PaginationControls } from '../../../../components/PaginationControls';

export default function PricingMastersPage() {
  const router = useRouter();
  const query = usePricingMasters();
  const deleteMaster = useDeletePricingMaster();
  const [deleteTarget, setDeleteTarget] = useState<PricingMaster | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [search, setSearch] = useState('');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteError(null);
      await deleteMaster.mutateAsync(deleteTarget.id);
      showToast({ kind: 'success', title: 'Pricing Master Deleted', message: `Deleted "${deleteTarget.name}".` });
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error deleting master');
    }
  };

  if (query.isLoading) return <LoadingState message="Loading pricing masters..." />;
  if (query.error) return <ErrorState error={query.error as Error} retry={query.refetch} />;

  const rawData = query.data as unknown;
  const masters: any[] = Array.isArray(rawData)
    ? rawData
    : (rawData && typeof rawData === 'object' && 'items' in rawData && Array.isArray((rawData as any).items))
      ? (rawData as any).items
      : [];
  const filteredMasters = masters.filter((master) =>
    `${master.name || ''} ${master.code || ''} ${master.tiers?.map((tier: PricingTier) => tier.name).join(' ') || ''}`
      .toLowerCase().includes(search.trim().toLowerCase())
  );
  const paginatedMasters = filteredMasters.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Pricing Masters</h1>
          <Link
            href="/products/pricing-masters/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
          >
            <Plus className="h-4 w-4" /> Create pricing master
          </Link>
        </div>

        <Card className="rounded-2xl border border-border overflow-hidden shadow-xs w-full bg-card">
          <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold text-foreground">Pricing Masters</span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">{filteredMasters.length} Records</span>
            </div>
            <label className="relative block w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search pricing masters..." className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
          </div>
          <div className="w-full overflow-x-auto">
            <Table className="w-full min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Master name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Pricing tiers</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {paginatedMasters.map((master) => {
                const tiers = master.tiers || [];
                return (
                  <TableRow key={master.id} role="link" tabIndex={0} onClick={() => router.push(`/products/pricing-masters/${master.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); router.push(`/products/pricing-masters/${master.id}`); } }} className="cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors">
                    <TableCell>
                      <p className="font-bold text-foreground text-sm">{master.name}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{master.description || '—'}</TableCell>
                    <TableCell>
                      {tiers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-sm">
                          {tiers.map((tier: PricingTier) => (
                            <span
                              key={tier.id || tier.name}
                              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary border border-primary/20"
                            >
                              {tier.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/products/pricing-masters/${master.id}?edit=1`}
                          aria-label={`Edit ${master.name}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deleteMaster.isPending}
                          onClick={() => { setDeleteError(null); setDeleteTarget(master); }}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete pricing master"
                          aria-label={`Delete ${master.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredMasters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    <p className="font-bold">{search ? 'No pricing masters match your search.' : 'No pricing masters yet.'}</p>
                  </TableCell>
                </TableRow>
              )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={filteredMasters.length}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
          />
        </Card>
      </div>
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete pricing master?"
        message={deleteTarget && <>Permanently delete <strong>{deleteTarget.name} ({deleteTarget.code})</strong>? This cannot be undone.</>}
        error={deleteError}
        isDeleting={deleteMaster.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
