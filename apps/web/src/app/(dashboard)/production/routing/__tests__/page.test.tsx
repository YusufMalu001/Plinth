import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import ProductionRoutesPage from '../page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/production/routing',
}));

const mockDepartments = [
  { id: '1', code: 'DEPT-LASER', name: 'Laser Cutting', departmentHead: 'Ashraf Ansari', description: 'Laser cutting', status: 'ACTIVE' },
  { id: '2', code: 'DEPT-BUFF', name: 'Buffing & Polishing', departmentHead: 'Wasim Baig', description: 'Buffing shop', status: 'ACTIVE' },
];
const mockCreateDepartment = vi.fn();

vi.mock('@/hooks/useMasterData', () => ({
  useDepartments: () => ({
    data: { items: mockDepartments, total: 2 },
    isLoading: false,
  }),
  useCreateDepartment: () => ({ mutateAsync: mockCreateDepartment, isPending: false }),
  useUpdateDepartment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/api/client', () => ({
  fetchApi: vi.fn().mockResolvedValue({
    items: [
      { id: 'r-1', code: 'ROUTE-01', name: 'Standard Route 1', status: 'APPROVED' },
    ],
    total: 1,
  }),
}));

describe('ProductionRoutesPage Section Switching', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockCreateDepartment.mockReset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ProductionRoutesPage />
      </QueryClientProvider>
    );

  test('default view shows Production Routes table only, NOT the departments table', async () => {
    renderPage();

    // Default section: Production Routes table is present
    expect(await screen.findByPlaceholderText(/search production routes/i)).toBeTruthy();

    // The department list table should NOT be rendered on the default page
    expect(screen.queryByText('Laser Cutting')).toBeNull();
    expect(screen.queryByText('Buffing & Polishing')).toBeNull();
  });

  test('opening the Shop Floor Departments section shows departments table only, NOT the routes table', () => {
    renderPage();

    // Click the Shop Floor Departments switcher
    const deptBtn = screen.getByTestId('section-departments');
    fireEvent.click(deptBtn);

    // Now Shop Floor Departments is rendered
    expect(screen.getAllByRole('heading', { name: 'Shop Floor Departments' })[0]).toBeTruthy();
    expect(screen.getByText('Laser Cutting')).toBeTruthy();
    expect(screen.getByText('DEPT-LASER')).toBeTruthy();
    expect(screen.getByText('Ashraf Ansari')).toBeTruthy();

    // The Production Routes table is NOT rendered simultaneously
    expect(screen.queryByPlaceholderText(/search production routes/i)).toBeNull();
  });

  test('can switch back to Production Routes from the departments section', async () => {
    renderPage();

    // Switch to departments
    fireEvent.click(screen.getByTestId('section-departments'));
    expect(screen.getByText('Laser Cutting')).toBeTruthy();

    // Switch back to routes
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByPlaceholderText(/search production routes/i)).toBeTruthy();
    expect(screen.queryByText('Laser Cutting')).toBeNull();
  });

  test('the header Add Department button opens the DepartmentDialog', () => {
    renderPage();

    // Switch to departments view
    fireEvent.click(screen.getByTestId('section-departments'));

    fireEvent.click(screen.getByRole('button', { name: /add department/i }));

    // Modal dialog opens with department fields
    expect(screen.getByText('Create New Department')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Laser Cutting / CNC Shop')).toBeTruthy();
    expect(screen.getByPlaceholderText('Head’s full name')).toBeTruthy();
  });

  test('creates a department with department head details', async () => {
    mockCreateDepartment.mockResolvedValueOnce({ id: 'dept-new', name: 'CNC Milling' });
    renderPage();
    fireEvent.click(screen.getByTestId('section-departments'));
    fireEvent.click(screen.getByRole('button', { name: /add department/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Laser Cutting / CNC Shop'), { target: { value: 'CNC Milling' } });
    fireEvent.change(screen.getByPlaceholderText('Head’s full name'), { target: { value: 'Rajesh Sharma' } });
    fireEvent.change(screen.getByPlaceholderText('Login email'), { target: { value: 'rajesh@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Temporary password (8+ characters)'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: /create department/i }));

    await waitFor(() =>
      expect(mockCreateDepartment).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'CNC Milling' })
      )
    );
  });
});
