import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { fetchApi } from '../api/client';
import { UomDialog } from './UomDialog';
import { getUomSpecificationId, getUomSpecificationOptions } from './uqc-specifications';

vi.mock('../api/client', () => ({ fetchApi: vi.fn() }));

test('edit UOM uses the specification dropdown and saves its symbol and dimension', async () => {
  const uom = { id: 'uom-1', code: 'TEST_BAG', name: 'Test bag', symbol: 'BAG', dimension: 'COUNT', status: 'ACTIVE' as const, createdAt: '', updatedAt: '' };
  vi.mocked(fetchApi).mockResolvedValue({ ...uom, symbol: 'CAN' });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><UomDialog mode="edit" uom={uom} open onClose={vi.fn()} /></QueryClientProvider>);

  expect(screen.queryByPlaceholderText('e.g. kg')).toBeNull();
  fireEvent.click(screen.getByText('BAGS'));
  fireEvent.click(screen.getByText('CANS'));
  fireEvent.click(screen.getByText('Save changes'));

  await waitFor(() => expect(fetchApi).toHaveBeenCalledWith('/uom/uom-1', {
    method: 'PUT',
    body: JSON.stringify({ name: 'Test bag', symbol: 'CAN', dimension: 'COUNT', allowFractional: true }),
  }));
});

test('an existing custom UOM remains selectable during edit', () => {
  const uom = { id: 'custom', symbol: 'custom', dimension: 'COUNT' };
  expect(getUomSpecificationId(uom)).toBe('current:custom');
  expect(getUomSpecificationOptions(uom)[0]).toMatchObject({ id: 'current:custom', symbol: 'custom' });
});
