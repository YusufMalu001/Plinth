import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WipTimingMetricsTab } from '../../src/features/wip/components/WipTimingMetricsTab';
import { WipGenealogyView } from '../../src/features/wip/components/WipGenealogyView';
import { WipReconciliationTab } from '../../src/features/wip/components/WipReconciliationTab';

// Mock the React Query hooks from features/wip/hooks
vi.mock('../../src/features/wip/hooks', () => ({
  useWipOverview: vi.fn(),
  useWipBatches: vi.fn(),
  useWipBatchDetail: vi.fn(),
  useWipBatchGenealogy: vi.fn(),
  useWipDepartmentQueue: vi.fn(),
  useWipTimingMetrics: vi.fn(),
  useWipExceptions: vi.fn(),
  useRunReconciliation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useInvestigateException: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useResolveException: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDismissException: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }))
}));

import {
  useWipTimingMetrics,
  useWipBatchGenealogy,
  useWipBatchDetail,
  useWipExceptions
} from '../../src/features/wip/hooks';

describe('Module 9 WIP Tracking UI Components', () => {
  describe('1. Honest Raw Duration Display vs Fabricated Bottleneck Labels', () => {
    it('renders factual raw durations plainly WITHOUT synthetic "bottleneck" or "delayed" labels', () => {
      // 15,600s = 4h 20m, 1,800s = 30m
      const mockTimingData = {
        items: [
          {
            batchId: 'batch-laser-001',
            batchNumber: 'BATCH-LASER-001',
            createdAt: '2026-09-10T08:00:00.000Z',
            startedAt: '2026-09-10T08:30:00.000Z',
            completedAt: null,
            queueDurationSeconds: 1800, // 30m
            activeExecutionDurationSeconds: 10800, // 3h
            pausedDurationSeconds: 3000, // 50m
            totalStageDurationSeconds: 15600 // 4h 20m
          }
        ],
        total: 1,
        page: 1,
        limit: 15
      };

      (useWipTimingMetrics as any).mockReturnValue({
        data: mockTimingData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        isFetching: false
      });

      render(<WipTimingMetricsTab departments={[{ id: 'd1', name: 'Laser Cutting', code: 'LASER' }]} />);

      // Verify the batch number is present
      expect(screen.getByText('BATCH-LASER-001')).toBeDefined();

      // Verify factual durations are rendered
      expect(screen.getByTestId('queue-duration-BATCH-LASER-001').textContent).toContain('30m');
      expect(screen.getByTestId('active-duration-BATCH-LASER-001').textContent).toContain('3h');
      expect(screen.getByTestId('paused-duration-BATCH-LASER-001').textContent).toContain('50m');
      expect(screen.getByTestId('total-duration-BATCH-LASER-001').textContent).toContain('4h 20m');

      // CRITICAL CHECK: Confirm NO synthetic "bottleneck", "delayed", or "over capacity" judgment badge is injected
      expect(screen.queryByText(/bottleneck/i)).toBeNull();
      expect(screen.queryByText(/delayed/i)).toBeNull();
      expect(screen.queryByText(/over capacity/i)).toBeNull();
    });
  });

  describe('2. Multi-Department Genealogy Timeline', () => {
    it('renders multi-department batch lineage, handovers, and rework indicators accurately', () => {
      const mockGenealogyTrace = {
        rootBatchId: 'b-stage1',
        currentBatchId: 'b-stage2',
        productionPlanId: 'PLAN-CS8-2026',
        productName: 'CS8 Stainless Frame',
        totalStages: 3,
        totalLeadTimeSeconds: 25200, // 7h
        isComplete: false,
        stages: [
          {
            batchId: 'b-stage1',
            batchNumber: 'BATCH-001',
            productionPlanId: 'PLAN-CS8-2026',
            departmentId: 'dept-laser',
            departmentName: 'Laser Cutting',
            stageSequenceNumber: 1,
            status: 'NEXT_STAGE_ACCEPTED',
            receivedQty: 100,
            completedQty: 95,
            rejectedQty: 5,
            scrapQty: 0,
            wastageQty: 0,
            pendingQty: 0,
            createdAt: '2026-09-10T08:00:00.000Z',
            completedAt: '2026-09-10T10:00:00.000Z',
            durationSeconds: 7200,
            incomingHandover: null,
            outgoingHandovers: [
              {
                handoverId: 'h-1-2',
                toBatchId: 'b-stage2',
                toBatchNumber: 'BATCH-002',
                toDepartmentId: 'dept-weld',
                toDepartmentName: 'Spot Welding',
                quantity: 95,
                status: 'ACCEPTED'
              }
            ]
          },
          {
            batchId: 'b-stage2',
            batchNumber: 'BATCH-002',
            productionPlanId: 'PLAN-CS8-2026',
            departmentId: 'dept-weld',
            departmentName: 'Spot Welding',
            stageSequenceNumber: 2,
            status: 'IN_PROGRESS',
            receivedQty: 95,
            completedQty: 60,
            rejectedQty: 0,
            scrapQty: 5,
            wastageQty: 0,
            pendingQty: 30,
            createdAt: '2026-09-10T10:00:00.000Z',
            completedAt: null,
            durationSeconds: 10800,
            incomingHandover: {
              handoverId: 'h-1-2',
              fromBatchId: 'b-stage1',
              fromBatchNumber: 'BATCH-001',
              fromDepartmentId: 'dept-laser',
              fromDepartmentName: 'Laser Cutting',
              quantity: 95,
              status: 'ACCEPTED'
            },
            outgoingHandovers: []
          },
          {
            batchId: 'b-stage3',
            batchNumber: 'BATCH-003',
            productionPlanId: 'PLAN-CS8-2026',
            departmentId: 'dept-pack',
            departmentName: 'Packaging',
            stageSequenceNumber: 3,
            status: 'AWAITING_RECEIPT',
            receivedQty: 0,
            completedQty: 0,
            rejectedQty: 0,
            scrapQty: 0,
            wastageQty: 0,
            pendingQty: 0,
            createdAt: '2026-09-10T13:00:00.000Z',
            completedAt: null,
            durationSeconds: 0,
            incomingHandover: null,
            outgoingHandovers: []
          }
        ]
      };

      const mockStage2Detail = {
        batch: {
          id: 'b-stage2',
          batchNumber: 'BATCH-002',
          stageSequenceNumber: 2,
          departmentName: 'Spot Welding',
          status: 'IN_PROGRESS',
          receivedQty: 95,
          completedQty: 60,
          rejectedQty: 0,
          scrapQty: 5,
          wastageQty: 0,
          pendingQty: 30,
          wipQuantity: 90
        },
        timings: {
          queueDurationSeconds: 1800,
          activeExecutionDurationSeconds: 7200,
          pausedDurationSeconds: 1800,
          totalStageDurationSeconds: 10800
        },
        assignedWorkers: [
          {
            id: 'w-1',
            employeeId: 'emp-1',
            employeeName: 'Shyam Yadav',
            subtaskDescription: 'Frame welding',
            assignedAt: '2026-09-10T10:15:00.000Z'
          }
        ],
        progressEvents: [
          {
            id: 'pe-1',
            eventType: 'STARTED',
            quantityDelta: 0,
            employeeName: 'Shyam Yadav',
            timestamp: '2026-09-10T10:30:00.000Z'
          }
        ],
        exceptionRecords: [
          {
            id: 'ex-1',
            type: 'SCRAP',
            quantity: 5,
            reason: 'Excess burn through',
            employeeName: 'Shyam Yadav',
            timestamp: '2026-09-10T11:30:00.000Z'
          }
        ],
        sourceHandover: {
          id: 'h-1-2',
          outgoingBatchNumber: 'BATCH-001',
          outgoingDepartmentName: 'Laser Cutting',
          quantity: 95,
          status: 'ACCEPTED'
        },
        outgoingHandovers: [],
        reworkCount: 1
      };

      (useWipBatchGenealogy as any).mockReturnValue({
        data: mockGenealogyTrace,
        isLoading: false,
        isError: false,
        refetch: vi.fn()
      });

      (useWipBatchDetail as any).mockReturnValue({
        data: mockStage2Detail,
        isLoading: false,
        isError: false
      });

      render(<WipGenealogyView batchId="b-stage2" />);

      // Verify all stages are rendered
      expect(screen.getByTestId('genealogy-stage-1')).toBeDefined();
      expect(screen.getByTestId('genealogy-stage-2')).toBeDefined();
      expect(screen.getByTestId('genealogy-stage-3')).toBeDefined();

      // Verify stage names and numbers
      expect(screen.getAllByText('Laser Cutting').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Spot Welding').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Packaging')).toBeDefined();

      // Verify handover transfer quantity is indicated
      expect(screen.getByText('95 units')).toBeDefined();

      // Verify assigned worker and exception in drilldown panel
      expect(screen.getByText('Shyam Yadav')).toBeDefined();
      expect(screen.getByText(/Excess burn through/)).toBeDefined();
    });
  });

  describe('3. Reconciliation Anomaly Engine & Exception Workflow', () => {
    it('displays detected anomalies and provides investigation and resolution actions', () => {
      const mockExceptions = {
        items: [
          {
            id: 'exc-double-presence',
            batchId: 'batch-001',
            batchNumber: 'BATCH-001',
            departmentName: 'Laser Cutting',
            exceptionType: 'DOUBLE_PRESENCE',
            severity: 'CRITICAL',
            status: 'OPEN',
            description: 'Double presence detected between Stage 1 and Stage 2',
            detectedAt: '2026-09-11T09:00:00.000Z'
          },
          {
            id: 'exc-mismatch',
            batchId: 'batch-002',
            batchNumber: 'BATCH-002',
            departmentName: 'Spot Welding',
            exceptionType: 'CONSERVATION_MISMATCH',
            severity: 'HIGH',
            status: 'INVESTIGATING',
            description: 'Conservation invariant violated: sum (70) != received (100)',
            detectedAt: '2026-09-11T09:15:00.000Z'
          }
        ],
        total: 2,
        page: 1,
        limit: 15
      };

      (useWipExceptions as any).mockReturnValue({
        data: mockExceptions,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        isFetching: false
      });

      render(<WipReconciliationTab />);

      // Verify exception rows
      expect(screen.getByTestId('exception-row-exc-double-presence')).toBeDefined();
      expect(screen.getByTestId('exception-row-exc-mismatch')).toBeDefined();

      // Verify action buttons
      expect(screen.getByTestId('btn-investigate-exc-double-presence')).toBeDefined();
      expect(screen.getByTestId('btn-resolve-exc-mismatch')).toBeDefined();
      expect(screen.getByTestId('btn-dismiss-exc-mismatch')).toBeDefined();

      // Click "Resolve" button to open modal
      fireEvent.click(screen.getByTestId('btn-resolve-exc-mismatch'));

      // Check modal rendered
      expect(screen.getByTestId('exception-action-modal')).toBeDefined();
      expect(screen.getByText('Resolve Exception')).toBeDefined();
    });
  });
});
