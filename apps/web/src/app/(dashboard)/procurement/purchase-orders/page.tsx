'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Download } from 'lucide-react';
import { StatusPill } from '../../../../components/status/StatusPill';
import { ListView, ListViewColumn, ListViewFilterConfig } from '../../../../components/listview/ListView';
import { usePOList, useDeletePO } from '../../../../features/purchases/hooks';
import { useCurrentUser } from '../../../../features/auth/hooks';
import { PO } from '../../../../features/purchases/api';
import { ConfirmDeleteDialog } from '../../../../components/ConfirmDeleteDialog';
import { showToast } from '../../../../components/toast-store';

const EMPTY_FILTERS: Record<string, string> = {
  poNumber: '',
  vendor: '',
  status: '',
};

export default function PurchaseOrdersListPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const deletePO = useDeletePO();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; poNumber: string } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'createdAt', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => setPage(1), [filters, sort]);

  const { data: allData } = usePOList({ limit: 100 });
  const { data, isLoading, error, refetch } = usePOList({
    search: filters.poNumber || undefined,
    status: (filters.status as PO['status']) || undefined,
    sortBy: sort.field,
    sortOrder: sort.direction,
    page,
    limit: pageSize,
  });

  const items = Array.isArray(data) ? data : (data?.items ?? []);
  const rawRoles = [currentUser?.role, currentUser?.roleDefinition?.key, currentUser?.roleDefinition?.name, ...(currentUser?.roles?.map(r => r.key) ?? []), ...(currentUser?.roles?.map(r => r.name) ?? [])].filter(Boolean) as string[];
  const normalizedRoles = rawRoles.map(role => role.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const canDeletePO = normalizedRoles.some(role => ['admin', 'super_admin'].includes(role));
  const canEditPO = normalizedRoles.some(role => ['admin', 'super_admin', 'procurement_manager', 'store_manager', 'inventory_manager', 'manager'].includes(role));
  const total = data?.total !== undefined ? data.total : (Array.isArray(data) ? data.length : items.length);
  void allData; // totals for the upcoming metric strip are supplied by the list API

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deletePO.mutateAsync({ id: target.id, poNumber: target.poNumber });
      setDeleteTarget(null);
      showToast({ kind: 'success', title: 'Purchase order deleted', message: `${target.poNumber} was deleted.` });
      await refetch();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = rawMessage.includes('not found')
        ? `${target.poNumber} could not be found. Refresh the register and try again.`
        : rawMessage || 'Unable to delete the purchase order. Please try again.';
      showToast({ kind: 'error', title: 'Delete failed', message });
    }
  };

  const calcTotalAmount = (po: PO) => {
    if (po.totalAmount !== undefined && po.totalAmount !== null && Number(po.totalAmount) > 0) {
      return Number(po.totalAmount);
    }
    if (po.subtotal !== undefined && po.subtotal !== null && Number(po.subtotal) > 0) {
      return Number(po.subtotal) + Number(po.taxAmount || 0);
    }
    if (po.lines?.length) {
      return po.lines.reduce((sum, line) => {
        const lineTotal = Number(line.lineTotal) || (Number(line.quantity || 0) * Number(line.unitPrice || 0));
        return sum + lineTotal;
      }, 0);
    }
    return 0;
  };

  const columns: ListViewColumn<PO>[] = [
    {
      key: 'poNumber',
      label: 'PO Number',
      cell: (po) => (
        <span className="inline-flex flex-col">
          <span className="font-mono font-semibold text-ink">{po.poNumber}</span>
          {po.sourcePr?.prNumber && (
            <span className="text-[11px] text-ink-muted">PR: {po.sourcePr.prNumber}</span>
          )}
        </span>
      ),
      raw: (po) => po.poNumber,
      sortable: true,
    },
    {
      key: 'vendor',
      label: 'Vendor',
      cell: (po) => po.vendor?.name ?? po.vendorId,
      raw: (po) => po.vendor?.name ?? po.vendorId,
      sortable: true,
    },
    {
      key: 'totalAmount',
      label: 'Order Value',
      align: 'right',
      money: true,
      sortable: true,
      cell: (po) => {
        const totalVal = calcTotalAmount(po);
        return (
          <span className="inline-flex flex-col items-end">
            <span>{totalVal > 0 ? totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
            <span className="text-[10px] text-ink-muted uppercase">{po.currency || 'INR'}</span>
          </span>
        );
      },
      raw: (po) => calcTotalAmount(po),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      sortable: true,
      cell: (po) => (
        <StatusPill
          status={
            ['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status)
              ? 'APPROVED'
              : ['REJECTED', 'SUPERSEDED'].includes(po.status)
                ? 'CANCELLED'
                : po.status
          }
        />
      ),
      raw: (po) => po.status,
    },
    {
      key: 'createdAt',
      label: 'Order Date',
      align: 'right',
      sortable: true,
      cell: (po) => new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      raw: (po) => po.createdAt,
    },
  ];

  const filterConfigs: ListViewFilterConfig[] = [
    { key: 'poNumber', label: 'PO Number', type: 'text', placeholder: 'PO number' },
    { key: 'vendor', label: 'Supplier', type: 'text', placeholder: 'Supplier name' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'DRAFT', label: 'Draft' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
    },
  ];

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <ListView<PO>
      title="Purchase Orders"
      documentName="Purchase Order"
      columns={columns}
      filterConfigs={filterConfigs}
      filters={filters}
      onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
      activeFilterCount={activeFilterCount}
      onClearFilters={() => setFilters(EMPTY_FILTERS)}
      sort={sort}
      onSortChange={(field, direction) => setSort({ field, direction })}
      rows={items}
      total={total}
      loading={isLoading}
      error={error}
      onRetry={refetch}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
      savedFilterStorageKey="listview-saved-filters:purchase-orders"
      onRefresh={refetch}
      onAdd={() => router.push('/procurement/purchase-orders/generate')}
      onRowClick={(po) => {
        const poId = po.id || (po as PO & { poId?: string }).poId;
        if (poId) router.push(`/procurement/purchase-orders/${poId}`);
      }}
      meta={{
        updated: (po) => {
          const created = new Date(po.createdAt);
          const diffMinutes = Math.max(1, Math.floor((Date.now() - created.getTime()) / 60000));
          if (diffMinutes < 12 * 30 * 24 * 60) return `${Math.min(diffMinutes, 999)} M`;
          return '1 y';
        },
        comments: (po) => po.lines?.length ?? 0,
        liked: () => false,
        onToggleLike: () => undefined,
      }}
      rowActions={(po) => {
        const poId = po.id || (po as PO & { poId?: string }).poId;
        if (!poId) return null;
        return (
          <>
            {canEditPO && po.status === 'DRAFT' && (
              <button
                type="button"
                className="h-8 w-8 rounded-control inline-flex items-center justify-center text-ink-secondary hover:bg-surface-muted hover:text-ink"
                title="Edit purchase order"
                aria-label={`Edit ${po.poNumber}`}
                onClick={() => router.push(`/procurement/purchase-orders/${poId}?edit=1`)}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDeletePO && po.status === 'DRAFT' && (
              <button
                type="button"
                className="h-8 w-8 rounded-control inline-flex items-center justify-center text-ink-secondary hover:bg-surface-muted hover:text-ink"
                title="Delete purchase order"
                disabled={deletePO.isPending}
                aria-label={`Delete ${po.poNumber}`}
                onClick={() => setDeleteTarget({ id: poId, poNumber: po.poNumber })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        );
      }}
      bulkActions={[
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onRun: async (selectedRows) => {
            showToast({
              kind: 'error',
              title: 'Bulk delete unavailable',
              message: `Batch deletion is limited to the register actions. (${selectedRows.length} selected)`,
            });
          },
        },
        { label: 'Export', icon: Download, onRun: () => undefined },
      ]}
    >
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete purchase order?"
        message={deleteTarget ? `Delete ${deleteTarget.poNumber}? This action cannot be undone.` : ''}
        isDeleting={deletePO.isPending}
        confirmText="Delete PO"
        loadingText="Deleting…"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </ListView>
  );
}
