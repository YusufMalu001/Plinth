/**
 * Tests for ProcurementApprovalPanel
 *
 * Covers:
 * - Renders three action buttons when hasPermission=true and status=SUBMITTED
 * - Shows ForbiddenState card when hasPermission=false
 * - Reject and request-changes confirm buttons are disabled until reason is filled
 * - Each mutation fires against the correct endpoint URL
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcurementApprovalPanel } from '../../src/components/ProcurementApprovalPanel';

// Mock fetchApi
vi.mock('../../src/features/api/client', () => ({
  fetchApi: vi.fn().mockResolvedValue({ id: 'pr-1', status: 'APPROVED' }),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public message: string, public data?: unknown) {
      super(message);
    }
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const defaultProps = {
  entityId: 'pr-1',
  entityTypePath: 'purchases/requisitions',
  currentStatus: 'SUBMITTED',
  hasPermission: true,
  queryKey: ['purchases', 'requisitions', 'detail', 'pr-1'],
};

describe('ProcurementApprovalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when status is not reviewable', () => {
    render(
      // CANCELLED is not in PR_REVIEW_STATUSES or PO_REVIEW_STATUSES
      <ProcurementApprovalPanel {...defaultProps} currentStatus="CANCELLED" />,
      { wrapper }
    );
    expect(screen.queryByTestId('procurement-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-forbidden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-action-picker')).not.toBeInTheDocument();
  });

  it('renders forbidden card when hasPermission=false', () => {
    render(
      <ProcurementApprovalPanel {...defaultProps} hasPermission={false} />,
      { wrapper }
    );
    expect(screen.getByTestId('approval-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-action-picker')).not.toBeInTheDocument();
  });

  it('renders all three action buttons when hasPermission=true and status=SUBMITTED', () => {
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
    expect(screen.getByTestId('btn-reject')).toBeInTheDocument();
    expect(screen.getByTestId('btn-request-changes')).toBeInTheDocument();
  });

  it('shows approve panel with optional remarks on click', async () => {
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-approve'));
    expect(screen.getByTestId('approve-panel')).toBeInTheDocument();
    expect(screen.getByTestId('approve-remarks')).toBeInTheDocument();
    // Confirm button should be enabled even without remarks (remarks optional)
    expect(screen.getByTestId('confirm-approve')).not.toBeDisabled();
  });

  it('reject confirm is disabled until reason is provided', async () => {
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-reject'));
    const confirmBtn = screen.getByTestId('confirm-reject');
    // No reason entered — should be disabled
    expect(confirmBtn).toBeDisabled();
    // Enter a reason
    fireEvent.change(screen.getByTestId('reject-reason'), { target: { value: 'Wrong quantities' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('request-changes confirm is disabled until reason is provided', async () => {
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-request-changes'));
    const confirmBtn = screen.getByTestId('confirm-request-changes');
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId('request-changes-reason'), { target: { value: 'Update dates' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('approve mutation calls correct endpoint', async () => {
    const { fetchApi } = await import('../../src/features/api/client');
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-approve'));
    fireEvent.click(screen.getByTestId('confirm-approve'));
    await waitFor(() => {
      expect(fetchApi).toHaveBeenCalledWith(
        '/purchases/requisitions/pr-1/approve',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('reject mutation calls correct endpoint with reason', async () => {
    const { fetchApi } = await import('../../src/features/api/client');
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-reject'));
    fireEvent.change(screen.getByTestId('reject-reason'), { target: { value: 'Budget exceeded' } });
    fireEvent.click(screen.getByTestId('confirm-reject'));
    await waitFor(() => {
      expect(fetchApi).toHaveBeenCalledWith(
        '/purchases/requisitions/pr-1/reject',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('request-changes mutation calls correct endpoint', async () => {
    const { fetchApi } = await import('../../src/features/api/client');
    render(<ProcurementApprovalPanel {...defaultProps} />, { wrapper });
    fireEvent.click(screen.getByTestId('btn-request-changes'));
    fireEvent.change(screen.getByTestId('request-changes-reason'), { target: { value: 'Need different UOM' } });
    fireEvent.click(screen.getByTestId('confirm-request-changes'));
    await waitFor(() => {
      expect(fetchApi).toHaveBeenCalledWith(
        '/purchases/requisitions/pr-1/request-changes',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
