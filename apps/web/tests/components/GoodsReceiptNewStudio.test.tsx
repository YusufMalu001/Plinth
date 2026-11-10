import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PoSearchSelector } from '../../src/app/(dashboard)/receiving/goods-receipts/new/components/PoSearchSelector';
import { PoSummaryCard } from '../../src/app/(dashboard)/receiving/goods-receipts/new/components/PoSummaryCard';
import { PoLinesTable } from '../../src/app/(dashboard)/receiving/goods-receipts/new/components/PoLinesTable';
import { DebitNoteForm } from '../../src/app/(dashboard)/receiving/goods-receipts/new/components/DebitNoteForm';
import type { PO } from '@/features/purchases/api';

describe('Goods Receipt Intake Redesign Components', () => {
  const mockPoOptions = [
    { id: 'po-1', number: 'PO-2026-001', vendor: 'Acme Steel Corp', status: 'SENT', lineCount: 3, currency: 'INR' },
    { id: 'po-2', number: 'PO-2026-002', vendor: 'Global Logistics Ltd', status: 'PARTIALLY_RECEIVED', lineCount: 1, currency: 'USD' },
  ];

  const mockPo: PO = {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    revisionNumber: 1,
    status: 'SENT',
    vendorId: 'v-1',
    vendor: { id: 'v-1', code: 'V-ACM', name: 'Acme Steel Corp' },
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    currency: 'INR',
    totalAmount: 154000,
    deliveryLocation: 'Central Store Bay 4',
    lines: [
      {
        id: 'line-1',
        quantity: 50,
        unitPrice: 2000,
        needDate: '2026-09-10T00:00:00Z',
        uomId: 'uom-1',
        uom: { id: 'uom-1', code: 'KG', symbol: 'kg' },
        product: { id: 'p-1', sku: 'STL-ROD-01', name: 'Carbon Steel Rod 12mm' },
      },
      {
        id: 'line-2',
        quantity: 100,
        unitPrice: 540,
        needDate: '2026-09-12T00:00:00Z',
        uomId: 'uom-2',
        uom: { id: 'uom-2', code: 'PCS', symbol: 'pcs' },
        material: { id: 'm-1', code: 'FAST-M8', name: 'Hex Bolts M8x40' },
      },
    ],
  };

  describe('PoSearchSelector', () => {
    it('renders search input and available orders list when no PO selected', () => {
      render(
        <PoSearchSelector
          options={mockPoOptions}
          selectedPoId=""
          onSelect={vi.fn()}
        />
      );
      expect(screen.getByPlaceholderText(/Search by PO number/i)).toBeInTheDocument();
      expect(screen.getByText(/2 receivable orders available/i)).toBeInTheDocument();
      expect(screen.getByText('PO-2026-001')).toBeInTheDocument();
      expect(screen.getByText('PO-2026-002')).toBeInTheDocument();
    });

    it('displays selected PO number and vendor with Selected badge', () => {
      render(
        <PoSearchSelector
          options={mockPoOptions}
          selectedPoId="po-1"
          onSelect={vi.fn()}
        />
      );
      expect(screen.getByText('PO-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Steel Corp')).toBeInTheDocument();
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });
  });

  describe('PoSummaryCard', () => {
    it('renders PO telemetry metrics and vendor code', () => {
      render(<PoSummaryCard po={mockPo} />);
      expect(screen.getByText('PO-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Acme Steel Corp')).toBeInTheDocument();
      expect(screen.getByText('V-ACM')).toBeInTheDocument();
      // Receiving is intentionally single-location; delivery bay/location data
      // is no longer rendered in the PO summary.
      expect(screen.queryByText('Central Store Bay 4')).not.toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // 2 lines
    });
  });

  describe('PoLinesTable', () => {
    it('renders contractual lines and filters properly', () => {
      render(<PoLinesTable lines={mockPo.lines} currency="INR" />);
      expect(screen.getAllByText('Carbon Steel Rod 12mm').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('STL-ROD-01').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Hex Bolts M8x40').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DebitNoteForm', () => {
    it('handles store manager notification submission (isAccountant=false)', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <DebitNoteForm
          onSubmit={onSubmit}
          isSubmitting={false}
          isCreated={false}
          isAccountant={false}
        />
      );

      const textarea = screen.getByPlaceholderText(/Provide clear justification/i);
      fireEvent.change(textarea, { target: { value: 'Delivered quantity shortage noted by store team' } });

      const button = screen.getByRole('button', { name: /Notify Accountant/i });
      fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith('Delivered quantity shortage noted by store team', 'SHORTAGE');
    });

    it('handles accountant direct debit note draft creation (isAccountant=true)', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <DebitNoteForm
          onSubmit={onSubmit}
          isSubmitting={false}
          isCreated={false}
          isAccountant={true}
        />
      );

      const textarea = screen.getByPlaceholderText(/Provide clear justification/i);
      fireEvent.change(textarea, { target: { value: 'Quantity shortage on delivered goods' } });

      const button = screen.getByRole('button', { name: /Create debit note draft/i });
      fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith('Quantity shortage on delivered goods', 'SHORTAGE');
    });
  });

});
