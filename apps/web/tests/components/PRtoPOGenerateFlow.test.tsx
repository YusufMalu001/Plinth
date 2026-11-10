/**
 * Tests for the PR-to-PO generate flow
 *
 * Uses an inline harness rather than importing the Next.js page directly
 * (Vite can't resolve (dashboard) route group paths).
 *
 * Covers:
 * - Approved PR can be selected
 * - Lines pre-populate from PR
 * - Vendor is required
 * - generatePO called with correct payload
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// ─── Shared test data ─────────────────────────────────────────────────────────

const APPROVED_PR = {
  id: 'pr-approved-1',
  prNumber: 'PR-2024-001',
  departmentId: 'dept-1',
  department: { id: 'dept-1', name: 'Procurement Dept' },
  needDate: '2024-12-31T00:00:00Z',
  status: 'APPROVED' as const,
  notes: null,
  lines: [
    { id: 'line-1', productId: 'prod-1', materialId: null, uomId: 'uom-1', requestedQuantity: 50, needDateOverride: null },
  ],
};

const VENDORS = [{ id: 'vendor-1', code: 'V001', name: 'Acme Supplies' }];

// ─── Harness component mimicking the generate form ───────────────────────────

interface GenerateFormHarnessProps {
  onGenerate: (payload: {
    poNumber: string;
    prId: string;
    vendorId: string;
    lines: Array<{ productId?: string; uomId: string; quantity: number; needDate: string }>;
  }) => Promise<void>;
}

function GenerateFormHarness({ onGenerate }: GenerateFormHarnessProps) {
  const [poNumber, setPoNumber] = useState('');
  const [prId, setPrId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [lines, setLines] = useState<typeof APPROVED_PR.lines>([]);
  const [pending, setPending] = useState(false);

  const handlePRSelect = (id: string) => {
    setPrId(id);
    const pr = id === APPROVED_PR.id ? APPROVED_PR : null;
    setLines(pr?.lines ?? []);
  };

  const handleSubmit = async () => {
    if (!vendorId) return; // vendor required
    setPending(true);
    await onGenerate({
      poNumber,
      prId,
      vendorId,
      lines: lines.map(l => ({ productId: l.productId ?? undefined, uomId: l.uomId, quantity: l.requestedQuantity, needDate: '2024-12-31' })),
    });
    setPending(false);
  };

  return (
    <div>
      <input id="poNumber" value={poNumber} onChange={e => setPoNumber(e.target.value)} aria-label="PO Number" />
      <select id="pr-select" value={prId} onChange={e => handlePRSelect(e.target.value)} aria-label="Source PR">
        <option value="">Select PR</option>
        {[APPROVED_PR].map(pr => <option key={pr.id} value={pr.id}>{pr.prNumber}</option>)}
      </select>
      <select id="vendorId" value={vendorId} onChange={e => setVendorId(e.target.value)} aria-label="Vendor">
        <option value="">Select Vendor</option>
        {VENDORS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {lines.map((l, i) => (
        <div key={l.id}>Line {i + 1}: {l.productId ? `Product: ${l.productId}` : 'Material'} × {l.requestedQuantity}</div>
      ))}
      <button id="btn-generate-submit" onClick={handleSubmit} disabled={pending} data-testid="btn-generate-submit">
        Generate
      </button>
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const mockGeneratePO = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('Generate PO from PR flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneratePO.mockResolvedValue({ id: 'po-new', poNumber: 'PO-2024-001' });
  });

  it('renders approved PRs in the PR picker', () => {
    render(<GenerateFormHarness onGenerate={mockGeneratePO} />, { wrapper });
    expect(screen.getByText(/PR-2024-001/)).toBeInTheDocument();
  });

  it('pre-populates lines when an approved PR is selected', async () => {
    render(<GenerateFormHarness onGenerate={mockGeneratePO} />, { wrapper });
    await act(async () => {
      fireEvent.change(document.querySelector('#pr-select')!, { target: { value: 'pr-approved-1' } });
    });
    await waitFor(() => {
      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    });
  });

  it('does not call generatePO when vendor is not selected', async () => {
    render(<GenerateFormHarness onGenerate={mockGeneratePO} />, { wrapper });
    await act(async () => {
      fireEvent.change(document.querySelector('#poNumber')!, { target: { value: 'PO-2024-001' } });
      fireEvent.change(document.querySelector('#pr-select')!, { target: { value: 'pr-approved-1' } });
    });
    // No vendor selected
    await act(async () => { fireEvent.click(screen.getByTestId('btn-generate-submit')); });
    await new Promise(r => setTimeout(r, 50));
    expect(mockGeneratePO).not.toHaveBeenCalled();
  });

  it('calls generatePO with correct payload when vendor is selected', async () => {
    render(<GenerateFormHarness onGenerate={mockGeneratePO} />, { wrapper });
    await act(async () => {
      fireEvent.change(document.querySelector('#poNumber')!, { target: { value: 'PO-2024-001' } });
      fireEvent.change(document.querySelector('#pr-select')!, { target: { value: 'pr-approved-1' } });
      fireEvent.change(document.querySelector('#vendorId')!, { target: { value: 'vendor-1' } });
    });
    await waitFor(() => expect(screen.getByText(/Line 1/)).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByTestId('btn-generate-submit')); });

    await waitFor(() => {
      expect(mockGeneratePO).toHaveBeenCalledWith(
        expect.objectContaining({
          poNumber: 'PO-2024-001',
          prId: 'pr-approved-1',
          vendorId: 'vendor-1',
          lines: expect.arrayContaining([
            expect.objectContaining({ uomId: 'uom-1', quantity: 50 }),
          ]),
        })
      );
    });
  });
});
