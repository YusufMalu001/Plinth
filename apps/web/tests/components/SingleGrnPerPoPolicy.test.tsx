import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PurchaseOrderDetailPage from '../../src/app/(dashboard)/procurement/purchase-orders/[id]/page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'po-101' }),
  useSearchParams: () => new URLSearchParams(),
}));

let mockPoData: any = null;

vi.mock('@/features/purchases/hooks', () => ({
  usePODetail: () => ({
    data: mockPoData,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdatePO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePOHistory: () => ({ data: [] }),
  useRevisePO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApprovePO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectPO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRequestChangesPO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelPO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendPO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResendPOEmail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePO: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePOLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApprovedVendors: () => ({ data: { items: [] } }),
  useActiveUOMs: () => ({ data: { items: [] } }),
  useApprovedProducts: () => ({ data: { items: [] } }),
  useProcurementSelectors: () => ({ data: { capabilities: { items: [] } }, isLoading: false }),
  useApprovedMaterials: () => ({ data: { items: [] } }),
  useSupplierPickerOptions: () => [],
}));

vi.mock('@/features/auth/hooks', () => ({
  useCurrentUser: () => ({
    data: { id: 'user-1', name: 'Store Admin', role: 'admin', roles: [{ key: 'admin' }] },
  }),
}));

describe('Single GRN per Purchase Order Policy', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <PurchaseOrderDetailPage params={{ id: 'po-101' }} />
      </QueryClientProvider>
    );

  it('renders "Create GRN" button when no GRN has been raised for the PO', () => {
    mockPoData = {
      id: 'po-101',
      poNumber: 'PO-2026-101',
      revisionNumber: 1,
      status: 'SENT',
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
      vendorId: 'v-1',
      vendor: { id: 'v-1', name: 'Tata Steel' },
      lines: [],
      goodsReceiptNotes: [], // No GRN yet
    };

    renderComponent();

    // "Create GRN" button MUST be visible
    expect(screen.getByRole('button', { name: /create grn/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /view grn/i })).toBeNull();
  });

  it('vanishes "Create GRN" button and shows "View GRN" once a GRN is raised', () => {
    mockPoData = {
      id: 'po-101',
      poNumber: 'PO-2026-101',
      revisionNumber: 1,
      status: 'FULLY_RECEIVED',
      createdAt: '2026-10-20T10:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
      vendorId: 'v-1',
      vendor: { id: 'v-1', name: 'Tata Steel' },
      lines: [],
      goodsReceiptNotes: [
        {
          id: 'grn-017',
          grnNumber: 'GRN-2026-017',
          status: 'ARRIVED',
          receivedAt: '2026-10-22T10:00:00.000Z',
        },
      ],
    };

    renderComponent();

    // "Create GRN" button MUST VANISH
    expect(screen.queryByRole('button', { name: /create grn/i })).toBeNull();

    // In its place, a View GRN button must be visible
    expect(screen.getByRole('button', { name: /view grn \(grn-2026-017\)/i })).toBeTruthy();
  });
});
