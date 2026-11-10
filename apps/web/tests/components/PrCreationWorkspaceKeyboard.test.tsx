import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrCreationWorkspace } from '../../src/components/procurement/PrCreationWorkspace';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockData = {
  materials: {
    items: [
      { id: 'mat-1', rawId: 'mat-1', name: 'A ROD - 727mm', code: 'ROD-727', status: 'ACTIVE', uomId: 'uom-1', specs: { availableUomIds: ['uom-1', 'uom-2'] }, category: { id: 'raw', code: 'RAW_MATERIAL', name: 'RAW MATERIAL' } },
      { id: 'mat-2', rawId: 'mat-2', name: 'Shipping Carton', code: 'BOX-01', status: 'DRAFT', uomId: 'uom-3', specs: { availableUomIds: ['uom-3'] }, category: { id: 'pack', code: 'PACKAGING', name: 'PACKAGING MATERIAL & CONSUMABLES' } },
      { id: 'mat-3', rawId: 'mat-3', name: 'Finished Widget', code: 'FG-01', status: 'ACTIVE', uomId: 'uom-1', specs: {}, category: { id: 'finished', code: 'FINISHED_GOODS', name: 'FINISHED GOODS' } },
    ],
  },
  products: { items: [] },
  vendors: {
    items: [
      { id: 'v-1', name: 'Yusuf Enterprises', code: 'V001' },
    ],
  },
  uoms: {
    items: [
      { id: 'uom-1', name: 'Pieces', symbol: 'PCS', code: 'PCS' },
      { id: 'uom-2', name: 'Boxes', symbol: 'BOX', code: 'BOX' },
      { id: 'uom-3', name: 'Cartons', symbol: 'CTN', code: 'CTN' },
    ],
  },
  departments: {
    items: [
      { id: 'dept-1', name: 'Main Dept' },
    ],
  },
  capabilities: { items: [] },
};

vi.mock('../../src/features/purchases/hooks', () => ({
  useProcurementSelectors: () => ({
    data: mockData,
    isLoading: false,
    error: null,
  }),
  useNextPoNumber: () => ({
    data: { nextNumber: 'PO-2026-010' },
    isLoading: false,
  }),
  useGeneratePO: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('../../src/features/vendors/api', () => ({
  vendorsApi: {
    getScoringReport: vi.fn().mockResolvedValue({ evaluations: [] }),
  },
}));

describe('PrCreationWorkspace Keyboard and Tab Navigation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderWorkspace = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PrCreationWorkspace />
      </QueryClientProvider>
    );
  };

  it('renders Order Line Items before Purchase Order Details in DOM order', async () => {
    renderWorkspace();

    const lineItemsHeading = await screen.findByText('Order Line Items & Materials');
    const poDetailsHeading = screen.getByText('Purchase Order Details');

    const lineItemsCard = lineItemsHeading.closest('div.rounded-xl')!;
    const poDetailsCard = poDetailsHeading.closest('div.rounded-xl')!;

    // DOM order check: compareDocumentPosition
    // DOCUMENT_POSITION_FOLLOWING (4) means poDetailsCard follows lineItemsCard in DOM
    const position = lineItemsCard.compareDocumentPosition(poDetailsCard);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows catalog categories and only the selected item UOMs', async () => {
    renderWorkspace();
    await screen.findByText('Order Line Items & Materials');

    fireEvent.click(screen.getByRole('button', { name: 'Search material...' }));
    expect(await screen.findByText('Shipping Carton')).toBeTruthy();
    expect(screen.getByText('PACKAGING MATERIAL & CONSUMABLES')).toBeTruthy();
    // Product and material categories share the purchasable item catalog.
    expect(screen.getByText('Finished Widget')).toBeTruthy();
    expect(screen.queryByText('ROD-727')).toBeNull();

    fireEvent.click(screen.getByText('A ROD - 727mm'));
    // UOM is a searchable selector, so verify the selected symbol and the
    // available options through its listbox rather than a native <select>.
    const uomButton = screen.getByRole('button', { name: 'PCS' });
    fireEvent.click(uomButton);
    const uomOptions = screen.getAllByRole('listitem').map((option) => option.textContent?.trim()?.slice(0, 3));
    expect(uomOptions).toEqual(['PCS', 'BOX']);
    fireEvent.click(screen.getAllByRole('listitem').find((option) => option.textContent?.includes('BOX'))!);
    expect(screen.getByRole('button', { name: /BOX/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /A ROD - 727mm/ }));
    fireEvent.click(screen.getByText('Shipping Carton'));
    fireEvent.click(screen.getByRole('button', { name: /CTN/ }));
    expect(screen.getAllByRole('listitem').map((option) => option.textContent?.trim()?.slice(0, 3))).toEqual(['CTN']);
  });

  it('ensures Trash button is excluded from Tab sequence with tabIndex=-1', async () => {
    renderWorkspace();

    await screen.findByText('Order Line Items & Materials');
    const trashButton = screen.getByTitle('Remove line');

    expect(trashButton.getAttribute('tabindex')).toBe('-1');
    expect(trashButton.hasAttribute('data-keyboard-skip')).toBe(true);
  });

  it('adds a new row on Enter keypress in Est. Rate input', async () => {
    renderWorkspace();

    await screen.findByText('Order Line Items & Materials');
    const initialLineRows = screen.getAllByRole('row').filter((r) => r.hasAttribute('data-line-row'));
    expect(initialLineRows.length).toBe(1);

    const inputs = screen.getAllByRole('spinbutton');
    // Spinbuttons: Qty and Est. Rate
    const rateInput = inputs[1];

    fireEvent.keyDown(rateInput, { key: 'Enter' });

    await waitFor(() => {
      const updatedLineRows = screen.getAllByRole('row').filter((r) => r.hasAttribute('data-line-row'));
      expect(updatedLineRows.length).toBe(2);
    });
  });

  it('traps Tab navigation within the form boundary', async () => {
    const { container } = renderWorkspace();

    await screen.findByText('Order Line Items & Materials');
    const form = container.querySelector('form')!;
    expect(form).toBeTruthy();

    const focusables = Array.from(
      form.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute('data-keyboard-skip'));

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // Focus last element (Create Purchase Order button)
    last.focus();
    expect(document.activeElement).toBe(last);

    // Press Tab on last element -> wraps to first
    fireEvent.keyDown(form, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Press Shift+Tab on first element -> wraps to last
    first.focus();
    fireEvent.keyDown(form, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('moves into sections via ArrowDown and ArrowUp', async () => {
    const { container } = renderWorkspace();

    await screen.findByText('Order Line Items & Materials');
    const form = container.querySelector('form')!;

    // Focus the item selector in row 1; specifications/notes are not part of
    // the purchase-order line editor.
    const itemSelector = screen.getByRole('button', { name: 'Search material...' });
    itemSelector.focus();
    expect(document.activeElement).toBe(itemSelector);

    // Because there is only 1 row, ArrowDown on row 1 moves DOWN into Purchase Order Details section
    fireEvent.keyDown(form, { key: 'ArrowDown' });
    const poNumberInput = screen.getByLabelText('Purchase order number');
    expect(document.activeElement).toBe(poNumberInput);

    // From PO Number, ArrowUp moves back UP into the Order Line Items section (last row)
    fireEvent.keyDown(form, { key: 'ArrowUp' });
    const lastRow = container.querySelector('tbody tr')!;
    const lastRowFocusable = lastRow.querySelector('button, input');
    expect(document.activeElement).toBe(lastRowFocusable);
  });

  it('navigates between action dock buttons using ArrowRight and ArrowLeft', async () => {
    const { container } = renderWorkspace();

    await screen.findByText('Order Line Items & Materials');
    const form = container.querySelector('form')!;

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    const createPoBtn = screen.getByRole('button', { name: /create purchase order/i });

    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    // ArrowRight moves to Create Purchase Order
    fireEvent.keyDown(form, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(createPoBtn);

    // ArrowRight wraps to Cancel
    fireEvent.keyDown(form, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cancelBtn);

    // ArrowLeft wraps to Create Purchase Order
    fireEvent.keyDown(form, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(createPoBtn);
  });
});
