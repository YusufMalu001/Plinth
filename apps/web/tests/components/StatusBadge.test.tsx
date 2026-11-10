import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../src/components/StatusBadge';
import { describe, it, expect } from 'vitest';

describe('StatusBadge', () => {
  it('renders correctly with DRAFT status', () => {
    render(<StatusBadge status="DRAFT" />);
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('renders correctly with PENDING_VALIDATION status', () => {
    render(<StatusBadge status="PENDING_VALIDATION" />);
    expect(screen.getByText('PENDING VALIDATION')).toBeInTheDocument();
  });

  it('renders correctly with APPROVED status', () => {
    render(<StatusBadge status="APPROVED" />);
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });
});
