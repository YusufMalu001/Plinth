import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssignWorkerModal } from '../components/AssignWorkerModal';

// Mock execution-hooks
const mockAssignWorker = vi.fn().mockResolvedValue({});
vi.mock('@/features/production/execution-hooks', () => ({
  useAssignWorker: () => ({
    mutateAsync: mockAssignWorker,
    isPending: false,
  }),
}));

// Mock api client
const mockFetchApi = vi.fn();
vi.mock('@/features/api/client', () => ({
  fetchApi: (...args: any[]) => mockFetchApi(...args),
}));

// Mock toast store
vi.mock('@/components/toast-store', () => ({
  showToast: vi.fn(),
}));

describe('AssignWorkerModal Component', () => {
  let queryClient: QueryClient;

  const mockDepartmentEmployees = [
    {
      id: 'emp-1',
      firstName: 'Ramesh',
      lastName: 'Kumar',
      employeeCode: 'EMP-001',
      designation: 'Moulding Operator',
      role: 'shop_floor_operator',
    },
    {
      id: 'emp-2',
      firstName: 'Suresh',
      lastName: 'Patel',
      employeeCode: 'EMP-002',
      designation: 'Tooling Specialist',
      role: 'shop_floor_operator',
    },
    {
      id: 'emp-head',
      firstName: 'Moulding',
      lastName: 'Head',
      employeeCode: 'EMP-019',
      designation: 'Department Head',
      role: 'department_incharge',
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof AssignWorkerModal>> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AssignWorkerModal
          open={true}
          onClose={vi.fn()}
          batchId="batch-123"
          batchNumber="BATCH-001"
          departmentId="dept-moulding"
          departmentName="Moulding Department"
          departmentEmployees={mockDepartmentEmployees}
          onAssigned={vi.fn()}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('renders department operators in the existing workers tab and excludes department head', () => {
    renderModal();

    expect(screen.getByText('Assign Department Operators')).toBeInTheDocument();
    expect(screen.getByText('Moulding Department')).toBeInTheDocument();
    expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument();
    expect(screen.getByText('Suresh Patel')).toBeInTheDocument();
    // Head should be excluded!
    expect(screen.queryByText('Moulding Head')).not.toBeInTheDocument();
  });

  it('allows multi-selecting operators and assigns all selected', async () => {
    const onAssigned = vi.fn();
    const onClose = vi.fn();

    renderModal({ onAssigned, onClose });

    // Select first and second worker
    fireEvent.click(screen.getByText('Ramesh Kumar'));
    fireEvent.click(screen.getByText('Suresh Patel'));

    // Fill in subtask
    const subtaskInput = screen.getByPlaceholderText(/Primary cutting/i);
    fireEvent.change(subtaskInput, { target: { value: 'Press Machine #2' } });

    // Click assign
    const assignBtn = screen.getByRole('button', { name: /Assign 2 Operators/i });
    fireEvent.click(assignBtn);

    await waitFor(() => {
      expect(mockAssignWorker).toHaveBeenCalledWith({
        batchId: 'batch-123',
        employeeId: 'emp-1',
        subtaskDescription: 'Press Machine #2',
      });
      expect(mockAssignWorker).toHaveBeenCalledWith({
        batchId: 'batch-123',
        employeeId: 'emp-2',
        subtaskDescription: 'Press Machine #2',
      });
      expect(onAssigned).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('marks already assigned operators as disabled and unselectable', () => {
    renderModal({ assignedEmployeeIds: ['emp-1'] });

    expect(screen.getByText('Already Assigned')).toBeInTheDocument();
    // Clicking already assigned worker should not select them
    fireEvent.click(screen.getByText('Ramesh Kumar'));
    // Button should still say Assign Operator and be disabled because 0 are selected
    expect(screen.getByRole('button', { name: /Assign Operator/i })).toBeDisabled();
  });

  it('switches to add new operator tab and creates + assigns worker', async () => {
    mockFetchApi.mockResolvedValueOnce({
      employee: {
        id: 'emp-new-99',
        firstName: 'Amit',
        lastName: 'Verma',
      },
      user: { id: 'user-new-99', email: 'amit.verma@example.com' },
    });

    const onAssigned = vi.fn();
    const onClose = vi.fn();

    renderModal({ onAssigned, onClose });

    // Switch to new operator tab
    fireEvent.click(screen.getByText('+ Add New Operator'));

    expect(screen.getByText(/Add a new worker directly to/i)).toBeInTheDocument();

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('e.g. Suresh'), { target: { value: 'Amit' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Patil'), { target: { value: 'Verma' } });

    // Submit form
    const createBtn = screen.getByRole('button', { name: /Create & Assign/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/employees/invite', expect.objectContaining({
        method: 'POST',
      }));
      expect(mockAssignWorker).toHaveBeenCalledWith({
        batchId: 'batch-123',
        employeeId: 'emp-new-99',
        subtaskDescription: undefined,
      });
      expect(onAssigned).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
