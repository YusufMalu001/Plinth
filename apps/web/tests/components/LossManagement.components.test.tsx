import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToleranceBasisBadge } from '../../src/features/loss-management/components/ToleranceBasisBadge';
import { LossDispositionPanel } from '../../src/features/loss-management/components/LossDispositionPanel';
import { LossEventDto, SafeUser } from '@plinth/types';

describe('Module 11 UI Components: Tolerance Basis & Separation of Duties', () => {
  describe('ToleranceBasisBadge — Sourced Basis Verification', () => {
    it('always renders the sourced WastageRule code, version, and variance percentage rather than a bare label', () => {
      render(
        <ToleranceBasisBadge
          classification="WITHIN_TOLERANCE"
          appliedWastageRuleCode="RULE-FABRIC-001"
          appliedWastageRuleVersion={2}
          varianceFromExpected={1.25}
          showDetails={true}
        />
      );

      // Verify classification label
      expect(screen.getByTestId('tolerance-label')).toHaveTextContent('Within Tolerance');

      // Verify variance percentage is explicitly rendered
      expect(screen.getByTestId('tolerance-variance')).toHaveTextContent('Variance: +1.25%');

      // Verify approved rule code and version are explicitly rendered
      expect(screen.getByTestId('tolerance-rule-source')).toHaveTextContent('Sourced via WastageRule: RULE-FABRIC-001 (v2)');
    });

    it('renders abnormal variance with complete rule and version traceability', () => {
      render(
        <ToleranceBasisBadge
          classification="ABNORMAL"
          appliedWastageRuleCode="RULE-CHEM-99"
          appliedWastageRuleVersion={3}
          varianceFromExpected={8.5}
          showDetails={true}
        />
      );

      expect(screen.getByTestId('tolerance-label')).toHaveTextContent('Abnormal Variance');
      expect(screen.getByTestId('tolerance-variance')).toHaveTextContent('Variance: +8.50%');
      expect(screen.getByTestId('tolerance-rule-source')).toHaveTextContent('Sourced via WastageRule: RULE-CHEM-99 (v3)');
    });

    it('displays unclassified fallback when classification has not yet occurred', () => {
      render(<ToleranceBasisBadge classification={null} />);
      expect(screen.getByTestId('tolerance-unclassified')).toHaveTextContent('Pending Classification (Rule Check Required)');
    });
  });

  describe('LossDispositionPanel — Separation of Duties & Reporter Guard', () => {
    const mockReporterUser: SafeUser = {
      id: 'user-reporter-123',
      email: 'reporter@plinth.example',
      firstName: 'Alice',
      lastName: 'Reporter',
      role: 'store_manager',
      isActive: true,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const mockOtherUser: SafeUser = {
      id: 'user-manager-456',
      email: 'manager@plinth.example',
      firstName: 'Bob',
      lastName: 'Manager',
      role: 'store_manager',
      isActive: true,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const baseEvent: LossEventDto = {
      id: 'loss-111',
      lossNumber: 'LOSS-2026-00001',
      sourceType: 'MANUAL_REPORT',
      materialId: 'mat-1',
      materialName: 'Cotton Fabric 60s',
      uomId: 'uom-1',
      uomCode: 'MTR',
      quantity: 25,
      reason: 'Water leak damaged fabric roll',
      reportedByActorId: 'user-reporter-123',
      reportedByActorName: 'Alice Reporter',
      reportedAt: new Date().toISOString(),
      appliedWastageRuleCode: 'RULE-FABRIC-001',
      appliedWastageRuleVersion: 1,
      varianceFromExpected: 0.5,
      classification: 'WITHIN_TOLERANCE',
      status: 'REVIEWED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('disables/hides approve action and displays Separation of Duties warning banner when current user is the reporting actor', () => {
      render(
        <LossDispositionPanel
          event={baseEvent}
          currentUser={mockReporterUser}
          onClassify={vi.fn()}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onInvestigate={vi.fn()}
          onPostStock={vi.fn()}
          onOpenReplacementModal={vi.fn()}
        />
      );

      // Warning banner must be present
      expect(screen.getByTestId('separation-of-duties-banner')).toBeInTheDocument();
      expect(screen.getByTestId('separation-of-duties-banner')).toHaveTextContent('Separation of Duties Enforced');

      // Approve button must not be accessible to the reporter
      expect(screen.queryByTestId('action-approve-btn')).not.toBeInTheDocument();
    });

    it('enables approve action when current user is an independent authorized actor', () => {
      render(
        <LossDispositionPanel
          event={baseEvent}
          currentUser={mockOtherUser}
          onClassify={vi.fn()}
          onReview={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onInvestigate={vi.fn()}
          onPostStock={vi.fn()}
          onOpenReplacementModal={vi.fn()}
        />
      );

      // Warning banner must NOT be shown for independent user
      expect(screen.queryByTestId('separation-of-duties-banner')).not.toBeInTheDocument();

      // Approve button must be rendered
      expect(screen.getByTestId('action-approve-btn')).toBeInTheDocument();
    });
  });
});
