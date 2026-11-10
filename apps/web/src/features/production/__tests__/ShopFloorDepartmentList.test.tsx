import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { ShopFloorDepartmentList } from '../components/ShopFloorDepartmentList';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDepartments = [
  {
    id: 'dept-1',
    code: 'DEPT-LASER',
    name: 'Laser Cutting',
    departmentHead: 'Rajesh Kumar',
    description: 'Sheet metal laser cutting operations',
    status: 'ACTIVE' as const,
  },
  {
    id: 'dept-2',
    code: 'DEPT-BUFF',
    name: 'Buffing & Polishing',
    departmentHead: 'Sunil Verma',
    description: 'Surface finishing and buffing',
    status: 'ACTIVE' as const,
  },
  {
    id: 'dept-3',
    code: 'ACCOUNTS-FIN',
    name: 'Finance & Accounts',
    departmentHead: 'Pooja Mehta',
    description: 'Corporate accounting',
    status: 'ACTIVE' as const,
  },
  {
    id: 'dept-4',
    code: 'SHOP-WELDING-K1A2B3',
    name: 'Welding',
    departmentHead: 'Amit Kumar',
    description: 'Welding operations',
    status: 'ACTIVE' as const,
  },
  {
    id: 'dept-5',
    code: 'DEPT-ASSEMBLY-DEPART-W225',
    name: 'Assembly Department',
    departmentHead: 'Assembly Incharge',
    description: 'Final assembly line',
    status: 'ACTIVE' as const,
    isAssembly: true,
  },
];

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const { mockFetchApi } = vi.hoisted(() => ({ mockFetchApi: vi.fn() }));

vi.mock('@/features/api/client', () => ({ fetchApi: mockFetchApi }));
vi.mock('@/features/auth/hooks', () => ({
  useCurrentUser: () => ({ data: { role: 'admin', assignedDepartmentId: null }, isLoading: false }),
}));

vi.mock('@/hooks/useMasterData', () => ({
  useDepartments: () => ({
    data: { items: mockDepartments, total: mockDepartments.length },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useCreateDepartment: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateDepartment: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

describe('ShopFloorDepartmentList Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ShopFloorDepartmentList />
      </QueryClientProvider>
    );

  test('renders Shop Floor Departments section with filtered list', () => {
    renderComponent();

    // Section title
    expect(screen.getByText('Shop Floor Departments')).toBeTruthy();
    // Shop floor departments include configured codes and departments created from this page.
    expect(screen.getByText(/4\s*Records/i)).toBeTruthy();

    // Listed shop floor departments
    expect(screen.getByText('Laser Cutting')).toBeTruthy();
    expect(screen.getByText('Buffing & Polishing')).toBeTruthy();
    expect(screen.getByText('Welding')).toBeTruthy();
    expect(screen.getByText('Assembly Department')).toBeTruthy();
    expect(screen.getByText('Assembly Station')).toBeTruthy();
    // Non-shop-floor department should NOT be in the default shop-floor view
    expect(screen.queryByText('Finance & Accounts')).toBeNull();
  });

  test('keeps non-shop-floor departments out of this dedicated subtab', () => {
    renderComponent();

    expect(screen.queryByRole('button', { name: /all departments/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /shop floor \(\d+\)/i })).toBeNull();
    expect(screen.queryByText('Finance & Accounts')).toBeNull();
  });

  test('searching departments filters the table', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText('Search departments...');
    fireEvent.change(searchInput, { target: { value: 'Laser' } });

    expect(screen.getByText('Laser Cutting')).toBeTruthy();
    expect(screen.queryByText('Buffing & Polishing')).toBeNull();
  });

  test('shows department workers and opens worker creation modal directly', async () => {
    mockFetchApi.mockResolvedValueOnce([]);
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'View workers in Laser Cutting' }));
    expect(await screen.findByText('No workers are registered in this department yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add worker/i })).toBeTruthy();
  });
  test('clicking Edit opens DepartmentDialog pre-filled with department details and submits', async () => {
    mockUpdateMutateAsync.mockResolvedValueOnce({
      id: 'dept-1',
      name: 'Laser Cutting Pro',
      code: 'DEPT-LASER',
      departmentHead: 'Rajesh Kumar',
      description: 'Updated laser scope',
      status: 'ACTIVE',
    });

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Laser Cutting' }));

    // Modal title
    expect(screen.getByText('Edit Department')).toBeTruthy();

    const nameInput = screen.getByPlaceholderText('e.g. Laser Cutting / CNC Shop') as HTMLInputElement;
    const headInput = screen.getByPlaceholderText('Head’s full name') as HTMLInputElement;
    const descInput = screen.getByPlaceholderText('Brief scope, operation notes, or machinery details...') as HTMLTextAreaElement;

    // Check pre-filled values
    expect(nameInput.value).toBe('Laser Cutting');
    expect(headInput.value).toBe('Rajesh Kumar');
    expect(descInput.value).toBe('Sheet metal laser cutting operations');

    // Change name
    fireEvent.change(nameInput, { target: { value: 'Laser Cutting Pro' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'dept-1',
        name: 'Laser Cutting Pro',
        departmentHead: 'Rajesh Kumar',
        description: 'Sheet metal laser cutting operations',
        isAssembly: false,
      });
    });
  });
});
