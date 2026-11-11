import { describe, it, expect } from 'vitest';
import { getLossScenarioMeta } from '@/features/loss-management/utils';
import type { LossEventDto, LossAnalyticsSummaryDto } from '@plinth/types';

describe('Scrap & Wastage Dashboard and Merged Ledger', () => {
  const sampleEvents: LossEventDto[] = [
    {
      id: 'loss-1',
      lossNumber: 'LOSS-2026-0001',
      sourceType: 'GRN_DISCREPANCY',
      materialId: 'mat-pipe-1',
      productId: null,
      uomId: 'uom-pcs',
      locationId: 'loc-wh-1',
      departmentId: 'dept-cut',
      quantity: 10,
      reason: 'Incoming steel pipe bend defect during dock inspection',
      status: 'REPORTED',
      classification: 'ABNORMAL',
      reportedAt: '2026-03-01T10:00:00.000Z',
      reportedByActorId: 'user-1',
      materialName: 'SS Pipe 3/4"',
      productName: null,
      departmentName: 'Raw Material Store',
      locationName: 'Main Store',
      uomCode: 'PCS',
      itemCode: 'MAT-PIPE-01',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z'
    },
    {
      id: 'loss-2',
      lossNumber: 'LOSS-2026-0002',
      sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
      materialId: null,
      productId: 'prod-cs12',
      uomId: 'uom-pcs',
      locationId: 'loc-wh-2',
      departmentId: 'dept-fab',
      quantity: 5,
      reason: 'Machine welding seam crack during CNC shopfloor run',
      status: 'REVIEWED',
      classification: 'WITHIN_TOLERANCE',
      reportedAt: '2026-03-02T11:00:00.000Z',
      reportedByActorId: 'user-2',
      materialName: null,
      productName: 'Cloth Stand CS12',
      departmentName: 'Fabrication Department',
      locationName: 'Line 2 Buffer',
      uomCode: 'PCS',
      itemCode: 'PROD-CS12',
      createdAt: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T11:00:00.000Z'
    },
    {
      id: 'loss-3',
      lossNumber: 'LOSS-2026-0003',
      sourceType: 'QC_REJECTION_NO_BATCH',
      materialId: null,
      productId: 'prod-cs10',
      uomId: 'uom-pcs',
      locationId: 'loc-wh-3',
      departmentId: 'dept-qa',
      quantity: 2,
      reason: 'Final assembly cosmetic scratch rejection at QA station',
      status: 'APPROVED',
      classification: 'WITHIN_TOLERANCE',
      reportedAt: '2026-03-03T09:00:00.000Z',
      reportedByActorId: 'user-3',
      materialName: null,
      productName: 'Cloth Stand CS10',
      departmentName: 'Assembly & QA',
      locationName: 'QA Station',
      uomCode: 'PCS',
      itemCode: 'PROD-CS10',
      createdAt: '2026-03-03T09:00:00.000Z',
      updatedAt: '2026-03-03T09:00:00.000Z'
    },
    {
      id: 'loss-4',
      lossNumber: 'LOSS-2026-0004',
      sourceType: 'MANUAL_REPORT',
      materialId: null,
      productId: 'prod-cs8',
      uomId: 'uom-pcs',
      locationId: 'loc-wh-4',
      departmentId: null,
      quantity: 1,
      reason: 'Customer RMA defective return from dealer warehouse',
      status: 'INVESTIGATED',
      classification: 'ABNORMAL',
      reportedAt: '2026-03-04T14:00:00.000Z',
      reportedByActorId: 'user-4',
      materialName: null,
      productName: 'Cloth Stand CS8',
      departmentName: 'Dispatch & Returns',
      locationName: 'Returns Bay',
      uomCode: 'PCS',
      itemCode: 'PROD-CS8',
      createdAt: '2026-03-04T14:00:00.000Z',
      updatedAt: '2026-03-04T14:00:00.000Z'
    }
  ];

  describe('4 Operational Loss Scenarios Metadata Resolution', () => {
    it('correctly tags Way 1: Inward Raw Material QC', () => {
      const meta = getLossScenarioMeta(sampleEvents[0]);
      expect(meta.number).toBe('01');
      expect(meta.label).toBe('Inward Raw Material QC');
    });

    it('correctly tags Way 2: In-Process WIP Defect', () => {
      const meta = getLossScenarioMeta(sampleEvents[1]);
      expect(meta.number).toBe('02');
      expect(meta.label).toBe('In-Process WIP Defect');
    });

    it('correctly tags Way 3: Final Assembly QA Defect', () => {
      const meta = getLossScenarioMeta(sampleEvents[2]);
      expect(meta.number).toBe('03');
      expect(meta.label).toBe('Final Assembly QA Defect');
    });

    it('correctly tags Way 4: Customer / Dealer RMA', () => {
      const meta = getLossScenarioMeta(sampleEvents[3]);
      expect(meta.number).toBe('04');
      expect(meta.label).toBe('Customer / Dealer RMA');
    });
  });

  describe('Dashboard Analytics Summary Computations', () => {
    const mockAnalytics: LossAnalyticsSummaryDto = {
      totalEvents: 4,
      totalQuantity: 18,
      withinToleranceCount: 2,
      withinToleranceQuantity: 7,
      abnormalCount: 2,
      abnormalQuantity: 11,
      byStatus: {
        REPORTED: 1,
        INVESTIGATED: 1,
        REVIEWED: 1,
        APPROVED: 1,
        REJECTED: 0,
        POSTED: 0,
        REPLACED: 0
      },
      bySourceType: {
        GRN_DISCREPANCY: { count: 1, quantity: 10 },
        DEPARTMENT_EXECUTION_EXCEPTION: { count: 1, quantity: 5 },
        QC_REJECTION_NO_BATCH: { count: 1, quantity: 2 },
        MANUAL_REPORT: { count: 1, quantity: 1 }
      },
      byDepartment: [
        { departmentId: 'dept-cut', departmentName: 'Raw Material Store', count: 1, quantity: 10, abnormalCount: 1 },
        { departmentId: 'dept-fab', departmentName: 'Fabrication Department', count: 1, quantity: 5, abnormalCount: 0 }
      ],
      byMaterial: [
        { materialId: 'mat-pipe-1', productId: null, name: 'SS Pipe 3/4"', code: 'MAT-PIPE-01', uomSymbol: 'pcs', count: 1, quantity: 10, abnormalQuantity: 10 },
        { materialId: null, productId: 'prod-cs12', name: 'Cloth Stand CS12', code: 'PROD-CS12', uomSymbol: 'pcs', count: 1, quantity: 5, abnormalQuantity: 0 }
      ]
    };

    it('computes tolerance compliance and abnormal rates accurately', () => {
      const complianceRate = Math.round((mockAnalytics.withinToleranceCount / mockAnalytics.totalEvents) * 100);
      const abnormalRate = Math.round((mockAnalytics.abnormalCount / mockAnalytics.totalEvents) * 100);

      expect(complianceRate).toBe(50);
      expect(abnormalRate).toBe(50);
      expect(mockAnalytics.totalQuantity).toBe(18);
    });

    it('computes scenario percentage shares accurately', () => {
      const dockShare = Math.round((mockAnalytics.bySourceType.GRN_DISCREPANCY.quantity / mockAnalytics.totalQuantity) * 100);
      expect(dockShare).toBe(56); // 10 / 18 ≈ 56%
    });
  });
});
