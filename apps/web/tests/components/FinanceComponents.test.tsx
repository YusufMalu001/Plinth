import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BlockedSourceState } from '../../src/features/finance/components/BlockedSourceState';
import { StatusBadge } from '../../src/components/StatusBadge';

describe('Module 18 Finance Component Tests', () => {
  describe('BlockedSourceState Component', () => {
    it('renders explicit NOT YET SUPPORTED blocked state with explanation and dependency info', () => {
      render(
        <BlockedSourceState
          sourceType="DEBIT_NOTE"
          displayName="Debit Notes"
          blockedReason="Debit Note export is not yet available. Blocked pending Module 14/accounting-treatment confirmation (V-008)."
          dependentModules={['Module 14 (Job Work)', 'Module 3 (GRN)']}
          validationItems={['V-008']}
        />
      );

      // Verify NOT YET SUPPORTED badge is prominently visible
      expect(screen.getByText('NOT YET SUPPORTED')).toBeInTheDocument();
      expect(screen.getByText('Debit Notes Integration is Unavailable')).toBeInTheDocument();

      // Verify exact reason is rendered
      expect(
        screen.getByText(/Debit Note export is not yet available\. Blocked pending Module 14\/accounting-treatment confirmation \(V-008\)\./)
      ).toBeInTheDocument();

      // Verify dependencies and validation tags are displayed
      expect(screen.getByText('Module 14 (Job Work)')).toBeInTheDocument();
      expect(screen.getByText('V-008')).toBeInTheDocument();
    });
  });

  describe('StatusBadge Module 18 Additions', () => {
    it('renders new finance integration states properly', () => {
      const { rerender } = render(<StatusBadge status="ELIGIBLE" />);
      expect(screen.getByText('ELIGIBLE')).toBeInTheDocument();

      rerender(<StatusBadge status="ACKNOWLEDGED" />);
      expect(screen.getByText('ACKNOWLEDGED')).toBeInTheDocument();

      rerender(<StatusBadge status="RECONCILED" />);
      expect(screen.getByText('RECONCILED')).toBeInTheDocument();

      rerender(<StatusBadge status="INTERNALLY_CONSISTENT" />);
      expect(screen.getByText('INTERNALLY CONSISTENT')).toBeInTheDocument();

      rerender(<StatusBadge status="VARIANCE_FLAGGED" />);
      expect(screen.getByText('VARIANCE FLAGGED')).toBeInTheDocument();
    });
  });
});
