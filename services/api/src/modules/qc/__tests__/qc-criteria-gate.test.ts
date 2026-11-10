import { QcCheckpointResolver } from '../services/qc-checkpoint-resolver';
import { QcCriteriaUnresolvedError } from '../qc.types';
import { LifecycleStatus } from '@prisma/client';

describe('Module 10 — QC Criteria Gate (V-009 Invariant)', () => {
  let resolver: QcCheckpointResolver;

  beforeEach(() => {
    resolver = new QcCheckpointResolver();
  });

  describe('assertCriteriaApproved', () => {
    it('throws QcCriteriaUnresolvedError when no QC rule is linked', () => {
      expect(() => {
        resolver.assertCriteriaApproved('IN_PROCESS', null);
      }).toThrow(QcCriteriaUnresolvedError);

      try {
        resolver.assertCriteriaApproved('IN_PROCESS', null);
      } catch (err: any) {
        expect(err.message).toContain("QC_CRITERIA_UNRESOLVED: Checkpoint 'IN_PROCESS' has no linked QC criteria rule (V-009)");
        expect(err.errorCode).toBe('QC_CRITERIA_UNRESOLVED');
        expect(err.statusCode).toBe(422);
      }
    });

    it('throws QcCriteriaUnresolvedError when QC rule status is DRAFT (not APPROVED)', () => {
      const draftRule = {
        id: 'rule-draft-1',
        name: 'Tensile Strength QC Rule',
        status: LifecycleStatus.DRAFT,
        parameters: { minTension: 50 }
      };

      expect(() => {
        resolver.assertCriteriaApproved('ASSEMBLY', draftRule);
      }).toThrow(QcCriteriaUnresolvedError);

      try {
        resolver.assertCriteriaApproved('ASSEMBLY', draftRule);
      } catch (err: any) {
        expect(err.message).toContain("is in 'DRAFT' status. Only APPROVED criteria can be inspected against (V-009)");
      }
    });

    it('throws QcCriteriaUnresolvedError when QC rule status is PENDING_VALIDATION', () => {
      const pendingRule = {
        id: 'rule-pending-1',
        name: 'Surface Finish QC Rule',
        status: LifecycleStatus.PENDING_VALIDATION,
        parameters: { maxRoughnessRa: 0.8 }
      };

      expect(() => {
        resolver.assertCriteriaApproved('PRE_FG', pendingRule);
      }).toThrow(QcCriteriaUnresolvedError);
    });

    it('throws QcCriteriaUnresolvedError when QC rule has empty parameters object', () => {
      const emptyParamsRule = {
        id: 'rule-empty-1',
        name: 'Empty Rule',
        status: LifecycleStatus.APPROVED,
        parameters: {}
      };

      expect(() => {
        resolver.assertCriteriaApproved('FINAL_FG', emptyParamsRule);
      }).toThrow(QcCriteriaUnresolvedError);

      try {
        resolver.assertCriteriaApproved('FINAL_FG', emptyParamsRule);
      } catch (err: any) {
        expect(err.message).toContain('has empty criteria parameters (V-009)');
      }
    });

    it('successfully passes when QC rule is APPROVED with valid criteria parameters', () => {
      const validRule = {
        id: 'rule-approved-1',
        name: 'Approved Dimensional Tolerances',
        status: LifecycleStatus.APPROVED,
        parameters: {
          toleranceMm: 0.05,
          sampleSizeAql: 10,
          defectThreshold: 0
        }
      };

      expect(() => {
        resolver.assertCriteriaApproved('INCOMING_MATERIAL', validRule);
      }).not.toThrow();
    });
  });

  describe('resolveBatchCheckpoints', () => {
    it('marks hasApprovedCriteria as false with descriptive reason when batch has unconfigured criteria', () => {
      const mockBatch = {
        id: 'batch-1',
        batchNumber: 'BATCH-2026-001',
        departmentId: 'dept-1',
        department: { name: 'Machining Department' },
        routeStep: null,
        productionPlan: { product: { routes: [] } },
        inspectionResults: []
      };

      const resolved = resolver.resolveBatchCheckpoints(mockBatch);
      expect(resolved.length).toBeGreaterThan(0);
      for (const item of resolved) {
        expect(item.hasApprovedCriteria).toBe(false);
        expect(item.missingCriteriaReason).toContain('QC_CRITERIA_UNRESOLVED');
        expect(item.missingCriteriaReason).toContain('(V-009)');
      }
    });

    it('marks hasApprovedCriteria as true when routeStep has approved criteria', () => {
      const mockBatchWithApprovedStep = {
        id: 'batch-2',
        batchNumber: 'BATCH-2026-002',
        departmentId: 'dept-1',
        routeStep: {
          id: 'step-1',
          stepName: 'Final Assembly Inspection',
          sequenceNumber: 3,
          workCenterId: 'wc-1',
          departmentId: 'dept-1',
          qcRule: {
            id: 'rule-1',
            code: 'QC-RULE-FA',
            name: 'Final Assembly Standard',
            status: LifecycleStatus.APPROVED,
            parameters: { torqueNm: 25 }
          }
        },
        productionPlan: { product: { routes: [] } },
        inspectionResults: []
      };

      const resolved = resolver.resolveBatchCheckpoints(mockBatchWithApprovedStep);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].hasApprovedCriteria).toBe(true);
      expect(resolved[0].missingCriteriaReason).toBeNull();
      expect(resolved[0].qcRuleCode).toBe('QC-RULE-FA');
    });
  });
});
