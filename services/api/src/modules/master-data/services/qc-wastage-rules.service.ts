import { QcRule, WastageRule, LifecycleStatus, Prisma } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { QcWastageRulesRepository } from '../repositories/qc-wastage-rules.repository';
import { MasterDataLifecycleService } from './master-data-lifecycle.service';
import { ConflictError, NotFoundError, ReferentialIntegrityError } from '../../../common/errors/AppError';

export class QcWastageRulesService {
  constructor(
    private readonly repository: QcWastageRulesRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  public static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  // ============================================================================
  // QC RULES
  // ============================================================================

  async createQcRule(params: {
    code: string;
    name: string;
    description?: string | null;
    targetType: string;
    targetId?: string | null;
    parameters?: Record<string, unknown>;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<QcRule> {
    const normalizedCode = QcWastageRulesService.normalizeCode(params.code);
    const existing = await this.repository.findQcRuleByCode(normalizedCode);
    if (existing) throw new ConflictError(`QcRule with code [${normalizedCode}] already exists.`);

    const created = await this.repository.createQcRule({
      code: normalizedCode,
      name: params.name.trim(),
      description: params.description,
      targetType: params.targetType.toUpperCase(),
      targetId: params.targetId,
      parameters: (params.parameters || {}) as Prisma.InputJsonValue,
      effectiveFrom: params.effectiveFrom || new Date(),
      effectiveTo: params.effectiveTo,
      version: 1,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'qc_rule.create',
      entityType: 'QcRule',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listQcRules(params?: {
    targetType?: string;
    targetId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: QcRule[]; total: number }> {
    return this.repository.listQcRules(params);
  }

  async getQcRuleById(id: string): Promise<QcRule> {
    const rule = await this.repository.findQcRuleById(id);
    if (!rule) throw new NotFoundError(`QcRule [${id}] not found.`);
    return rule;
  }

  async updateQcRule(id: string, params: {
    name?: string;
    description?: string | null;
    targetType?: string;
    targetId?: string | null;
    parameters?: Record<string, unknown>;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<QcRule> {
    const rule = await this.getQcRuleById(id);

    if (rule.status === 'DRAFT' || rule.status === 'PENDING_VALIDATION') {
      const updated = await this.repository.updateQcRule(id, {
        ...(params.name ? { name: params.name.trim() } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
        ...(params.targetType ? { targetType: params.targetType.toUpperCase() } : {}),
        ...(params.targetId !== undefined ? { targetId: params.targetId } : {}),
        ...(params.parameters ? { parameters: params.parameters as Prisma.InputJsonValue } : {}),
        ...(params.effectiveFrom ? { effectiveFrom: params.effectiveFrom } : {}),
        ...(params.effectiveTo !== undefined ? { effectiveTo: params.effectiveTo } : {})
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'qc_rule.update_draft',
        entityType: 'QcRule',
        entityId: updated.id,
        before: rule,
        after: updated,
        requestId: params.requestId
      });

      return updated;
    }

    if (rule.status === 'APPROVED' || rule.status === 'ACTIVE') {
      const nextVersion = rule.version + 1;
      const { oldRule, newRule } = await this.repository.supersedeQcRule(rule.id, {
        code: rule.code,
        name: params.name ? params.name.trim() : rule.name,
        description: params.description !== undefined ? params.description : rule.description,
        targetType: params.targetType ? params.targetType.toUpperCase() : rule.targetType,
        targetId: params.targetId !== undefined ? params.targetId : rule.targetId,
        parameters: (params.parameters || rule.parameters) as Prisma.InputJsonValue,
        effectiveFrom: params.effectiveFrom || new Date(),
        effectiveTo: params.effectiveTo !== undefined ? params.effectiveTo : rule.effectiveTo,
        status: 'DRAFT',
        version: nextVersion
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'qc_rule.supersede_version',
        entityType: 'QcRule',
        entityId: newRule.id,
        before: oldRule,
        after: newRule,
        metadata: { supersededId: oldRule.id, newVersion: nextVersion },
        requestId: params.requestId
      });

      return newRule;
    }

    throw new ConflictError(`Cannot edit QcRule [${rule.code}] with terminal status [${rule.status}].`);
  }

  async resolveEffectiveQcRule(targetType: string, targetId: string, date: Date = new Date()): Promise<QcRule | null> {
    return this.repository.findEffectiveQcRule(targetType.toUpperCase(), targetId, date);
  }

  async transitionQcRuleStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<QcRule> {
    const rule = await this.getQcRuleById(params.id);

    MasterDataLifecycleService.validateTransition(rule.status, params.targetStatus, 'QcRule');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'QcRule'
      });
    }

    if (params.targetStatus === 'INACTIVE') {
      const activeSteps = await this.repository.countQcRuleActiveReferences(params.id);
      if (activeSteps > 0) {
        throw new ReferentialIntegrityError(
          `Cannot deactivate QcRule [${rule.code}]. It is referenced by active RouteSteps (${activeSteps}).`,
          { activeSteps }
        );
      }
    }

    const updated = await this.repository.updateQcRule(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'qc_rule.status_change',
      entityType: 'QcRule',
      entityId: updated.id,
      before: { status: rule.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }

  // ============================================================================
  // WASTAGE RULES
  // ============================================================================

  async createWastageRule(params: {
    code: string;
    name: string;
    materialId?: string | null;
    workCenterId?: string | null;
    standardWastagePct: number;
    tolerancePct: number;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<WastageRule> {
    const normalizedCode = QcWastageRulesService.normalizeCode(params.code);
    const existing = await this.repository.findWastageRuleByCode(normalizedCode);
    if (existing) throw new ConflictError(`WastageRule with code [${normalizedCode}] already exists.`);

    const created = await this.repository.createWastageRule({
      code: normalizedCode,
      name: params.name.trim(),
      ...(params.materialId ? { material: { connect: { id: params.materialId } } } : {}),
      ...(params.workCenterId ? { workCenter: { connect: { id: params.workCenterId } } } : {}),
      standardWastagePct: params.standardWastagePct,
      tolerancePct: params.tolerancePct,
      effectiveFrom: params.effectiveFrom || new Date(),
      effectiveTo: params.effectiveTo,
      version: 1,
      status: 'DRAFT'
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'wastage_rule.create',
      entityType: 'WastageRule',
      entityId: created.id,
      after: created,
      requestId: params.requestId
    });

    return created;
  }

  async listWastageRules(params?: {
    materialId?: string;
    workCenterId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: WastageRule[]; total: number }> {
    return this.repository.listWastageRules(params);
  }

  async getWastageRuleById(id: string): Promise<WastageRule> {
    const rule = await this.repository.findWastageRuleById(id);
    if (!rule) throw new NotFoundError(`WastageRule [${id}] not found.`);
    return rule;
  }

  async updateWastageRule(id: string, params: {
    name?: string;
    materialId?: string | null;
    workCenterId?: string | null;
    standardWastagePct?: number;
    tolerancePct?: number;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    actorId: string;
    requestId?: string;
  }): Promise<WastageRule> {
    const rule = await this.getWastageRuleById(id);

    if (rule.status === 'DRAFT' || rule.status === 'PENDING_VALIDATION') {
      const updated = await this.repository.updateWastageRule(id, {
        ...(params.name ? { name: params.name.trim() } : {}),
        ...(params.materialId !== undefined
          ? params.materialId
            ? { material: { connect: { id: params.materialId } } }
            : { material: { disconnect: true } }
          : {}),
        ...(params.workCenterId !== undefined
          ? params.workCenterId
            ? { workCenter: { connect: { id: params.workCenterId } } }
            : { workCenter: { disconnect: true } }
          : {}),
        ...(params.standardWastagePct !== undefined ? { standardWastagePct: params.standardWastagePct } : {}),
        ...(params.tolerancePct !== undefined ? { tolerancePct: params.tolerancePct } : {}),
        ...(params.effectiveFrom ? { effectiveFrom: params.effectiveFrom } : {}),
        ...(params.effectiveTo !== undefined ? { effectiveTo: params.effectiveTo } : {})
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'wastage_rule.update_draft',
        entityType: 'WastageRule',
        entityId: updated.id,
        before: rule,
        after: updated,
        requestId: params.requestId
      });

      return updated;
    }

    if (rule.status === 'APPROVED' || rule.status === 'ACTIVE') {
      const nextVersion = rule.version + 1;
      const { oldRule, newRule } = await this.repository.supersedeWastageRule(rule.id, {
        code: rule.code,
        name: params.name ? params.name.trim() : rule.name,
        ...(params.materialId !== undefined
          ? params.materialId
            ? { material: { connect: { id: params.materialId } } }
            : {}
          : rule.materialId
          ? { material: { connect: { id: rule.materialId } } }
          : {}),
        ...(params.workCenterId !== undefined
          ? params.workCenterId
            ? { workCenter: { connect: { id: params.workCenterId } } }
            : {}
          : rule.workCenterId
          ? { workCenter: { connect: { id: rule.workCenterId } } }
          : {}),
        standardWastagePct: params.standardWastagePct !== undefined ? params.standardWastagePct : rule.standardWastagePct,
        tolerancePct: params.tolerancePct !== undefined ? params.tolerancePct : rule.tolerancePct,
        effectiveFrom: params.effectiveFrom || new Date(),
        effectiveTo: params.effectiveTo !== undefined ? params.effectiveTo : rule.effectiveTo,
        status: 'DRAFT',
        version: nextVersion
      });

      await this.auditWriter.record({
        actorId: params.actorId,
        action: 'wastage_rule.supersede_version',
        entityType: 'WastageRule',
        entityId: newRule.id,
        before: oldRule,
        after: newRule,
        metadata: { supersededId: oldRule.id, newVersion: nextVersion },
        requestId: params.requestId
      });

      return newRule;
    }

    throw new ConflictError(`Cannot edit WastageRule [${rule.code}] with terminal status [${rule.status}].`);
  }

  async resolveEffectiveWastageRule(materialId: string, workCenterId: string, date: Date = new Date()): Promise<WastageRule | null> {
    return this.repository.findEffectiveWastageRule(materialId, workCenterId, date);
  }

  async transitionWastageRuleStatus(params: {
    id: string;
    targetStatus: LifecycleStatus;
    actorId: string;
    requestId?: string;
  }): Promise<WastageRule> {
    const rule = await this.getWastageRuleById(params.id);

    MasterDataLifecycleService.validateTransition(rule.status, params.targetStatus, 'WastageRule');

    if (params.targetStatus === 'APPROVED') {
      await MasterDataLifecycleService.assertCanApprove({
        actorId: params.actorId,
        permissionChecker: this.permissionChecker,
        resource: 'WastageRule'
      });
    }

    const updated = await this.repository.updateWastageRule(params.id, {
      status: params.targetStatus,
      deactivatedAt: params.targetStatus === 'INACTIVE' ? new Date() : null
    });

    await this.auditWriter.record({
      actorId: params.actorId,
      action: 'wastage_rule.status_change',
      entityType: 'WastageRule',
      entityId: updated.id,
      before: { status: rule.status },
      after: { status: updated.status },
      requestId: params.requestId
    });

    return updated;
  }
}
