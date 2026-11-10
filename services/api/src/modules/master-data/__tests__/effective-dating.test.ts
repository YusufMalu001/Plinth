import { describe, it, expect, jest } from '@jest/globals';
import { QcWastageRulesService } from '../services/qc-wastage-rules.service';
import { QcWastageRulesRepository } from '../repositories/qc-wastage-rules.repository';
import { AllowAllPermissionChecker, ConsoleAuditWriter } from '@synergy/types';

describe('QcWastageRulesService - Effective-Dated Version Resolution', () => {
  const permissionChecker = new AllowAllPermissionChecker();
  const auditWriter = new ConsoleAuditWriter();

  it('should resolve exactly one applicable version for a valid target date', async () => {
    const activeRule = {
      id: 'qc-rule-v2',
      code: 'QC-CU-002',
      targetType: 'MATERIAL',
      targetId: 'mat-cu-rod',
      version: 2,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null,
      status: 'ACTIVE'
    };

    const mockRepo = {
      findEffectiveQcRule: jest.fn<any>().mockResolvedValue(activeRule)
    } as unknown as QcWastageRulesRepository;

    const service = new QcWastageRulesService(mockRepo, permissionChecker, auditWriter);

    const queryDate = new Date('2026-08-26T00:00:00Z');
    const result = await service.resolveEffectiveQcRule('MATERIAL', 'mat-cu-rod', queryDate);

    expect(result).toBeDefined();
    expect(result?.id).toBe('qc-rule-v2');
    expect(mockRepo.findEffectiveQcRule).toHaveBeenCalledWith('MATERIAL', 'mat-cu-rod', queryDate);
  });

  it('should return null when no rule was effective at the queried timestamp', async () => {
    const mockRepo = {
      findEffectiveQcRule: jest.fn<any>().mockResolvedValue(null)
    } as unknown as QcWastageRulesRepository;

    const service = new QcWastageRulesService(mockRepo, permissionChecker, auditWriter);

    const historicalDate = new Date('2020-01-01T00:00:00Z');
    const result = await service.resolveEffectiveQcRule('MATERIAL', 'mat-cu-rod', historicalDate);

    expect(result).toBeNull();
  });
});
