import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QcQueueItemDto } from '@synergy/types';
import { BlockedCheckpointBanner } from '../../src/features/quality/components/BlockedCheckpointBanner';
import { InspectionModal } from '../../src/features/quality/components/InspectionModal';
import { OverrideModal } from '../../src/features/quality/components/OverrideModal';
import * as qualityApiModule from '../../src/features/quality/api';

// Mock qualityApi
vi.mock('../../src/features/quality/api', async (importOriginal) => {
  const actual = await importOriginal<typeof qualityApiModule>();
  return {
    ...actual,
    qualityApi: {
      ...actual.qualityApi,
      getEmployees: vi.fn().mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'EMP-001',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'QC Inspector'
        }
      ]),
      recordInspection: vi.fn().mockResolvedValue({
        id: 'insp-1',
        inspectionNumber: 'QC-2026-0001',
        status: 'PASS'
      }),
      recordOverride: vi.fn().mockResolvedValue({
        id: 'insp-2',
        inspectionNumber: 'QC-2026-0002',
        status: 'PASS'
      })
    }
  };
});

describe('Module 10 Quality UI Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TEST 1: Blocked Checkpoint State Rendering (V-009 gate)
  describe('BlockedCheckpointBanner Component (V-009 Gate)', () => {
    it('renders a prominent blocked state banner with explanation and configure action when criteria are missing', () => {
      const onConfigure = vi.fn();
      render(
        <BlockedCheckpointBanner
          checkpointName="Incoming Material"
          missingReason="Inspection criteria not yet defined for this checkpoint (V-009)"
          onConfigureClick={onConfigure}
        />
      );

      // Verify header and badge
      expect(screen.getByText('V-009 Gate')).toBeInTheDocument();
      expect(screen.getByText('Inspection Blocked: Missing QC Criteria')).toBeInTheDocument();

      // Verify explanation text is rendered
      expect(
        screen.getByText('Inspection criteria not yet defined for this checkpoint (V-009)')
      ).toBeInTheDocument();

      // Verify action button
      const configureBtn = screen.getByRole('button', { name: /Configure Criteria/i });
      expect(configureBtn).toBeInTheDocument();
      fireEvent.click(configureBtn);
      expect(onConfigure).toHaveBeenCalledTimes(1);
    });
  });

  // TEST 2: Required-reason enforcement on non-PASS in InspectionModal
  describe('InspectionModal Component - Required Reason Enforcement', () => {
    it('disables submission and shows validation error when status is FAIL/REJECT/REWORK and reason is empty', async () => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();

      const mockTargetItem: QcQueueItemDto = {
        targetType: 'BATCH',
        targetId: 'batch-123',
        referenceNumber: 'BATCH-2026-001',
        itemDescription: 'Steel Component A',
        checkpointType: 'IN_PROCESS',
        quantity: 50,
        unitOfMeasure: 'PCS',
        hasApprovedCriteria: true,
        requiresInspection: true,
        canInspect: true,
        createdAt: new Date().toISOString()
      };

      render(
        <InspectionModal
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
          targetItem={mockTargetItem}
          employees={[
            {
              id: 'emp-1',
              employeeCode: 'EMP-001',
              firstName: 'Jane',
              lastName: 'Doe',
              role: 'QC Inspector'
            }
          ]}
        />
      );

      // Verify inspector loaded
      expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();

      // Change status to FAIL
      const failBtn = screen.getByRole('button', { name: /FAIL/i });
      fireEvent.click(failBtn);

      // Reason mandatory warning should be shown
      expect(screen.getByText(/Reason is mandatory for FAIL/i)).toBeInTheDocument();

      // Submit button should be disabled when reason is empty
      const submitBtn = screen.getByRole('button', { name: /Record FAIL Result/i });
      expect(submitBtn).toBeDisabled();

      // Enter a valid reason
      const reasonInput = screen.getByPlaceholderText(/Provide detailed observation and cause for non-PASS result/i);
      fireEvent.change(reasonInput, { target: { value: 'Dimension tolerance exceeded by 0.5mm' } });

      // After entering reason, submit should now be enabled
      expect(submitBtn).not.toBeDisabled();
    });
  });

  // TEST 3: Override Action Multi-Step Extra Confirmation Enforcement
  describe('OverrideModal Component - Deliberately Harder Confirmation Step', () => {
    it('disables the override execution until BOTH a minimum 5-character reason is entered AND the mandatory acknowledgment checkbox is checked', async () => {
      const onClose = vi.fn();
      const onSuccess = vi.fn();

      const mockTargetItem: QcQueueItemDto = {
        targetType: 'BATCH',
        targetId: 'batch-123',
        referenceNumber: 'BATCH-2026-001',
        itemDescription: 'Steel Component A',
        checkpointType: 'FINAL_FG',
        quantity: 100,
        unitOfMeasure: 'PCS',
        hasApprovedCriteria: false,
        requiresInspection: true,
        canInspect: true,
        createdAt: new Date().toISOString()
      };

      render(
        <OverrideModal
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
          targetItem={mockTargetItem}
        />
      );

      const confirmBtn = screen.getByTestId('override-submit-button');

      // Initially disabled
      expect(confirmBtn).toBeDisabled();

      // 1. Enter short justification (< 5 chars)
      const justificationInput = screen.getByTestId('override-reason-input');
      fireEvent.change(justificationInput, { target: { value: 'Test' } });
      expect(confirmBtn).toBeDisabled();

      // 2. Enter valid justification (>= 5 chars), but checkbox still unchecked
      fireEvent.change(justificationInput, { target: { value: 'Management authorized urgent expedited release' } });
      expect(confirmBtn).toBeDisabled();

      // 3. Click the mandatory acknowledgment checkbox
      const ackCheckbox = screen.getByTestId('override-confirm-checkbox');
      fireEvent.click(ackCheckbox);

      // Now the button must be enabled
      expect(confirmBtn).not.toBeDisabled();

      // 4. Click execute override
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(qualityApiModule.qualityApi.recordOverride).toHaveBeenCalledWith(
          expect.objectContaining({
            targetType: 'BATCH',
            targetId: 'batch-123',
            checkpointType: 'FINAL_FG',
            overrideReason: 'Management authorized urgent expedited release'
          })
        );
      });
    });
  });
});
