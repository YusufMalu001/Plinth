import { LifecycleStatus } from '@prisma/client';
import { PermissionChecker, ScopeContext } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

export class MasterDataLifecycleService {
  /**
   * Valid transition matrix: from current status -> allowed target statuses.
   */
  private static readonly VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
    DRAFT: ['PENDING_VALIDATION', 'INACTIVE'],
    PENDING_VALIDATION: ['APPROVED', 'DRAFT', 'INACTIVE'],
    APPROVED: ['ACTIVE', 'SUPERSEDED', 'INACTIVE'],
    ACTIVE: ['INACTIVE', 'SUPERSEDED'],
    INACTIVE: ['ACTIVE', 'DRAFT'],
    SUPERSEDED: [] // Terminal status for a specific historical version
  };

  /**
   * Validates if a state transition is legal.
   */
  public static validateTransition(currentStatus: LifecycleStatus, targetStatus: LifecycleStatus, entityName: string = 'Master Entity'): void {
    if (currentStatus === targetStatus) {
      return; // No-op
    }

    const allowed = this.VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition ${entityName} from state [${currentStatus}] to [${targetStatus}]. Allowed target states: [${allowed.join(', ') || 'None (Terminal State)'}]`,
        { currentStatus, targetStatus, allowedTransitions: allowed }
      );
    }
  }

  /**
   * Enforces that an entity is in APPROVED or ACTIVE state before it can be referenced.
   */
  public static assertIsReferenceable(entityName: string, entityId: string, status: LifecycleStatus): void {
    if (status !== 'APPROVED' && status !== 'ACTIVE') {
      throw new ValidationError(
        `Cannot reference ${entityName} [${entityId}] because its status is [${status}]. Only APPROVED or ACTIVE masters may be referenced by downstream entities.`,
        { entityName, entityId, status }
      );
    }
  }

  /**
   * Verifies authorization to approve an entity and prevents silent self-approval.
   */
  public static async assertCanApprove(params: {
    actorId: string;
    createdById?: string;
    permissionChecker: PermissionChecker;
    resource: string;
    scope?: ScopeContext;
  }): Promise<void> {
    const hasApprovePerm = await params.permissionChecker.can(
      params.actorId,
      'approve',
      params.resource,
      params.scope
    );

    if (!hasApprovePerm) {
      throw new ForbiddenError(`Actor [${params.actorId}] lacks permission to approve [${params.resource}].`);
    }

    if (params.createdById && params.createdById === params.actorId) {
      const canSelfApprove = await params.permissionChecker.can(
        params.actorId,
        'self_approve',
        params.resource,
        params.scope
      );
      if (!canSelfApprove) {
        throw new ForbiddenError(
          `Actor [${params.actorId}] created this draft and cannot self-approve without explicit 'self_approve' authorization.`
        );
      }
    }
  }
}
