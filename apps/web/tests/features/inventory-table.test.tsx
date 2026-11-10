import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryPage from '../../src/app/(dashboard)/inventory/page';
import type { InventoryItemSummary } from '../../src/features/inventory/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockItems: InventoryItemSummary[] = [
  {
    itemKey: 'mat-1',
    itemId: 'mat-1',
    itemType: 'MATERIAL',
    materialId: 'mat-1',
    material: {
      id: 'mat-1',
      code: '1-2-X0-6MM-2-FEET',
      name: '1/2"x0.6mm - 2 Feet',
      materialType: 'Raw Material',
      status: 'ACTIVE',
      category: { id: 'cat-1', code: 'PKG', name: 'Packaging Material & Consumables' },
      uom: { id: 'uom-1', code: 'PCS', symbol: 'PCS' },
    },
    category: { id: 'cat-1', code: 'PKG', name: 'Packaging Material & Consumables' },
    uom: { id: 'uom-1', code: 'PCS', symbol: 'PCS' },
    onHandQuantity: 5000,
    reservedQuantity: 0,
    availableQuantity: 5000,
    inventoryValue: 25000,
  },
];

const mockDashboard = {
  inventoryValue: 25000,
  availableQuantity: 5000,
  quarantinedQuantity: 0,
  damagedQuantity: 0,
  totalSkus: 1,
  stockedSkus: 1,
  lowStockAlerts: 0,
  openReservations: 0,
};

vi.mock('../../src/features/inventory/api', () => ({
  inventoryApi: {
    dashboard: vi.fn(async () => mockDashboard),
    listItems: vi.fn(async () => ({ items: mockItems })),
  },
}));

describe('Inventory Unified Table Column Alignment', () => {
  it('renders 8 distinct table heads and aligns data in correct cells without shift', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <InventoryPage />
      </QueryClientProvider>
    );

    // 1. Verify all 7 column headers exist
    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(7);
      expect(headers[0]).toHaveTextContent('Item Name');
      expect(headers[1]).toHaveTextContent('Category');
      expect(headers[2]).toHaveTextContent('Condition');
      expect(headers[3]).toHaveTextContent('On-Hand');
      expect(headers[4]).toHaveTextContent('Reserved');
      expect(headers[5]).toHaveTextContent('Available');
      expect(headers[6]).toHaveTextContent('Action');
    });

    // 2. Verify row cells align 1:1 with headers
    const nameEl = await screen.findByText('1/2"x0.6mm - 2 Feet');
    const row = nameEl.closest('tr');
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll('td');
    expect(cells).toHaveLength(7);

    // Cell 0: Item Name
    expect(cells[0]).toHaveTextContent('1/2"x0.6mm - 2 Feet');
    expect(cells[0]).toHaveTextContent('PCS');
    expect(cells[0]).not.toHaveTextContent('Packaging Material & Consumables');

    // Cell 1: Category
    expect(cells[1]).toHaveTextContent('Packaging Material & Consumables');
    expect(cells[1]).not.toHaveTextContent('IN STOCK');

    // Cell 2: Condition
    expect(cells[2]).toHaveTextContent('IN STOCK');
    expect(cells[2]).not.toHaveTextContent('5,000');

    // Cell 3: On-Hand
    expect(cells[3]).toHaveTextContent('5,000 PCS');

    // Cell 4: Reserved
    expect(cells[4]).toHaveTextContent('0');

    // Cell 5: Available
    expect(cells[5]).toHaveTextContent('5,000 PCS');

    // Cell 6: Action (delete button)
    const deleteBtn = cells[6].querySelector('button[aria-label="Delete 1/2\\"x0.6mm - 2 Feet"]');
    expect(deleteBtn).not.toBeNull();
  });
});
