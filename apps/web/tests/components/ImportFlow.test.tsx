import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuplicateResolver, ImportFlow } from '../../src/features/import/ImportFlow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

describe('DuplicateResolver', () => {
  it('renders select with SKIP by default', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DuplicateResolver batchId="b1" rowId="r1" onResolved={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('combobox')).toHaveValue('SKIP');
    expect(screen.getByRole('button', { name: /resolve/i })).not.toBeDisabled();
  });

  it('shows input field when CREATE_NEW is selected', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DuplicateResolver batchId="b1" rowId="r1" onResolved={vi.fn()} />
      </QueryClientProvider>
    );
    
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CREATE_NEW' } });
    expect(screen.getByPlaceholderText('New Code Override')).toBeInTheDocument();
    
    // Resolve should be disabled because newCode is empty
    expect(screen.getByRole('button', { name: /resolve/i })).toBeDisabled();
    
    fireEvent.change(screen.getByPlaceholderText('New Code Override'), { target: { value: 'TEST-CODE' } });
    expect(screen.getByRole('button', { name: /resolve/i })).not.toBeDisabled();
  });
});

describe('ImportFlow', () => {
  it('renders upload button disabled initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ImportFlow entityType="products" />
      </QueryClientProvider>
    );
    
    expect(screen.getByText('Import products Data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload & preview/i })).toBeDisabled();
  });
});
