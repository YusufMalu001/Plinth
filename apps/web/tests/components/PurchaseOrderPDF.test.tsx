import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PurchaseOrderPDF } from '../../src/components/PurchaseOrderPDF';
import { PO } from '../../src/features/purchases/api';

describe('PurchaseOrderPDF Component', () => {
  const mockPO: PO = {
    id: 'po-123',
    poNumber: 'PO-2026-002',
    revisionNumber: 1,
    status: 'SENT',
    vendorId: 'vend-1',
    vendor: {
      id: 'vend-1',
      code: 'VEND-NATASHA-CAST',
      name: 'Natasha Cast',
    },
    currency: 'INR',
    deliveryLocation: 'Indore HQ Plant',
    paymentTerms: 'Net 30 Days',
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    issuedAt: '2026-09-04T11:00:00.000Z',
    lines: [
      {
        id: 'line-1',
        productId: 'prod-1',
        uomId: 'uom-kg',
        quantity: 10,
        unitPrice: 100,
        lineTotal: 1000,
        needDate: '2026-09-11T00:00:00.000Z',
        product: {
          id: 'prod-1',
          sku: '18-18-SQUARE-BOTTOM-CAP',
          name: '18*18 SQUARE BOTTOM CAP',
        },
        uom: {
          id: 'uom-kg',
          code: 'KG',
          symbol: 'kg',
        },
      },
    ],
  };

  it('renders header, vendor, and delivery information accurately', () => {
    render(<PurchaseOrderPDF po={mockPO} />);

    expect(screen.getByRole('heading', { level: 1, name: /purchase order/i })).toBeInTheDocument();
    expect(screen.getAllByText('PO-2026-002').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Natasha Cast')).toBeInTheDocument();
    expect(screen.queryByText('VEND-NATASHA-CAST')).not.toBeInTheDocument();
    expect(screen.getAllByText('Indore HQ Plant').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('SENT')).not.toBeInTheDocument();
  });

  it('renders goods table with all required columns', () => {
    const { container } = render(<PurchaseOrderPDF po={mockPO} />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table?.className).toContain('w-full');

    // Verify column headers
    expect(screen.getByText(/Sl/i)).toBeInTheDocument();
    expect(screen.getByText('Description of Goods')).toBeInTheDocument();
    expect(screen.getByText('HSN/SAC')).toBeInTheDocument();
    expect(screen.getByText('Due on')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Rate')).toBeInTheDocument();
    expect(screen.getByText('per')).toBeInTheDocument();
    expect(screen.getByText('Disc. %')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('renders line item data and correctly calculated totals', () => {
    render(<PurchaseOrderPDF po={mockPO} />);

    expect(screen.getByText('18-18-SQUARE-BOTTOM-CAP')).toBeInTheDocument();
    expect(screen.getByText('18*18 SQUARE BOTTOM CAP')).toBeInTheDocument();
    expect(screen.getAllByText(/10\s*kg/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('1,000.00')).toBeInTheDocument();
    expect(screen.getByText('INR One Thousand Only')).toBeInTheDocument();
  });

  it('renders empty line state when no lines exist', () => {
    const emptyPO: PO = {
      ...mockPO,
      lines: [],
    };
    render(<PurchaseOrderPDF po={emptyPO} />);

    expect(screen.getByText('No line items recorded for this purchase order.')).toBeInTheDocument();
  });
});
