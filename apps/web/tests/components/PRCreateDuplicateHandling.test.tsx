/**
 * PR creation duplicate rules.
 *
 * Product/material overlap is valid. Only an exact manually supplied PR
 * number is rejected by the API.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { Card } from '@synergy/ui';
import { ApiError } from '../../src/features/api/client';

vi.mock('../../src/features/api/client', () => ({
  fetchApi: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, message: string, data?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
}));

function DuplicateHandlerHarness({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const [hardDuplicate, setHardDuplicate] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setHardDuplicate(false);
    setPending(true);
    try {
      await onSubmit();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setHardDuplicate(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      {hardDuplicate && <Card data-testid="hard-duplicate-error">PR number already exists</Card>}
      <button onClick={submit} disabled={pending || hardDuplicate} data-testid="btn-submit-pr">Create Draft</button>
    </div>
  );
}

const mockSubmit = vi.fn<() => Promise<void>>();

describe('PR creation duplicate rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('still rejects an exact duplicate PR number', async () => {
    mockSubmit.mockRejectedValueOnce(new ApiError(409, 'PR number already exists'));
    render(<DuplicateHandlerHarness onSubmit={mockSubmit} />);

    await act(async () => { fireEvent.click(screen.getByTestId('btn-submit-pr')); });
    await waitFor(() => expect(screen.getByTestId('hard-duplicate-error')).toBeInTheDocument());
    expect(screen.getByTestId('btn-submit-pr')).toBeDisabled();
  });

  it('allows a new PR for the same product/material', async () => {
    mockSubmit.mockResolvedValueOnce();
    render(<DuplicateHandlerHarness onSubmit={mockSubmit} />);

    await act(async () => { fireEvent.click(screen.getByTestId('btn-submit-pr')); });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('hard-duplicate-error')).not.toBeInTheDocument();
  });
});
