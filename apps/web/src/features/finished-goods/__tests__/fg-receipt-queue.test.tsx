import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FgReceiptQueueWorkspace } from '../components/FgReceiptQueueWorkspace';
import * as hooks from '../hooks';

// Mock Next.js navigation and router
vi.mock('next/navigation', () => ({
  usePathname: () => '/inventory/fg-receipts',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

describe('Module 13: Finished Goods Receipt Queue UI Components', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <FgReceiptQueueWorkspace />
      </QueryClientProvider>
    );

  it('renders the 3 distinct receipt queue states clearly (Ready, Awaiting Gate, Blocked by V-009)', () => {
    vi.spyOn(hooks, 'useFgReadyOutputs').mockReturnValue({
      data: {
        items: [
          {
            id: 'out-1',
            outputNumber: 'FG-OUT-2026-0001',
            productId: 'prod-1',
            productName: 'CS11 - Online Ironing Mat',
            productSku: 'CS11-ONL',
            quantity: 20,
            uomSymbol: 'pcs',
            hasApprovedQcCriteria: true,
            isQcPassed: true,
            isPackagingReady: true,
            isReadyToReceive: true,
            createdAt: '2026-09-21T00:00:00.000Z',
            updatedAt: '2026-09-21T00:00:00.000Z'
          },
          {
            id: 'out-2',
            outputNumber: 'FG-OUT-2026-0002',
            productId: 'prod-2',
            productName: 'CS8 - Steel Frame',
            productSku: 'CS8-FRM',
            quantity: 30,
            uomSymbol: 'pcs',
            hasApprovedQcCriteria: true,
            isQcPassed: false,
            isPackagingReady: false,
            isReadyToReceive: false,
            gateBlockReason: 'BLOCKED_QC_NOT_PASSED: FINAL_FG Inspection result is not PASS.',
            createdAt: '2026-09-21T00:00:00.000Z',
            updatedAt: '2026-09-21T00:00:00.000Z'
          },
          {
            id: 'out-3',
            outputNumber: 'FG-OUT-2026-0003',
            productId: 'prod-3',
            productName: 'Custom Stand CS9',
            productSku: 'CS9-CUST',
            quantity: 15,
            uomSymbol: 'pcs',
            hasApprovedQcCriteria: false,
            isQcPassed: false,
            isPackagingReady: false,
            isReadyToReceive: false,
            createdAt: '2026-09-21T00:00:00.000Z',
            updatedAt: '2026-09-21T00:00:00.000Z'
          }
        ],
        total: 3
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);

    vi.spyOn(hooks, 'useFgReceipts').mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn()
    } as any);

    renderComponent();

    // 1. Ready to receive category
    expect(screen.getByText(/1\. Ready to Receive into FG Stock/i)).toBeInTheDocument();
    expect(screen.getByText('CS11 - Online Ironing Mat')).toBeInTheDocument();

    // 2. Awaiting gate clearance category
    expect(screen.getByText(/2\. Awaiting QC \/ Packaging Gate Clearance/i)).toBeInTheDocument();
    expect(screen.getByText('CS8 - Steel Frame')).toBeInTheDocument();

    // 3. Blocked No Approved V-009 QC Criteria category
    expect(screen.getByText(/3\. Blocked — No Approved V-009 QC Criteria/i)).toBeInTheDocument();
    expect(screen.getByText('Custom Stand CS9')).toBeInTheDocument();
  });

  it('renders hold dialog with prominent stock reservation override warnings', () => {
    vi.spyOn(hooks, 'useFgReadyOutputs').mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      refetch: vi.fn()
    } as any);

    vi.spyOn(hooks, 'useFgReceipts').mockReturnValue({
      data: {
        items: [
          {
            id: 'rcpt-1',
            receiptNumber: 'FGR-2026-0001',
            productId: 'prod-1',
            productName: 'CS11 - Online Ironing Mat',
            productSku: 'CS11-ONL',
            quantity: 50,
            uomSymbol: 'pcs',
            status: 'RECEIVED',
            locationName: 'Finished Goods Bay A',
            receivedAt: '2026-09-21T00:00:00.000Z',
            createdAt: '2026-09-21T00:00:00.000Z',
            updatedAt: '2026-09-21T00:00:00.000Z'
          }
        ],
        total: 1
      },
      isLoading: false,
      refetch: vi.fn()
    } as any);

    renderComponent();

    // Switch to Finished Goods Inventory tab
    const receiptsTab = screen.getByRole('button', { name: /Finished Goods Inventory/i });
    fireEvent.click(receiptsTab);

    // Find and click the Hold button
    const holdButton = screen.getByRole('button', { name: /^Hold$/i });
    fireEvent.click(holdButton);

    // Verify the hold dialog and reservation override warning are visible
    expect(screen.getByText(/Place FG Batch on QA Hold/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Placing this batch on hold will override any existing active stock reservations for this product\./i)
    ).toBeInTheDocument();
  });
});
