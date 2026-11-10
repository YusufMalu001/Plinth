import { describe, it, expect } from '@jest/globals';
import { MasterDataLifecycleService } from '../services/master-data-lifecycle.service';
import { AllowAllPermissionChecker, PermissionChecker, ScopeContext } from '@synergy/types';
import { ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

describe('MasterDataLifecycleService', () => {
  describe('validateTransition', () => {
    it('should allow valid forward transitions: DRAFT -> PENDING_VALIDATION -> APPROVED -> ACTIVE -> INACTIVE', () => {
      expect(() => MasterDataLifecycleService.validateTransition('DRAFT', 'PENDING_VALIDATION')).not.toThrow();
      expect(() => MasterDataLifecycleService.validateTransition('PENDING_VALIDATION', 'APPROVED')).not.toThrow();
      expect(() => MasterDataLifecycleService.validateTransition('APPROVED', 'ACTIVE')).not.toThrow();
      expect(() => MasterDataLifecycleService.validateTransition('ACTIVE', 'INACTIVE')).not.toThrow();
      expect(() => MasterDataLifecycleService.validateTransition('INACTIVE', 'ACTIVE')).not.toThrow();
    });

    it('should allow returning PENDING_VALIDATION to DRAFT for changes', () => {
      expect(() => MasterDataLifecycleService.validateTransition('PENDING_VALIDATION', 'DRAFT')).not.toThrow();
    });

    it('should allow superseding an APPROVED or ACTIVE master', () => {
      expect(() => MasterDataLifecycleService.validateTransition('APPROVED', 'SUPERSEDED')).not.toThrow();
      expect(() => MasterDataLifecycleService.validateTransition('ACTIVE', 'SUPERSEDED')).not.toThrow();
    });

    it('should reject illegal backwards transitions like APPROVED -> DRAFT directly', () => {
      expect(() => MasterDataLifecycleService.validateTransition('APPROVED', 'DRAFT')).toThrow(InvalidStateTransitionError);
    });

    it('should reject transitions out of terminal SUPERSEDED state', () => {
      expect(() => MasterDataLifecycleService.validateTransition('SUPERSEDED', 'ACTIVE')).toThrow(InvalidStateTransitionError);
      expect(() => MasterDataLifecycleService.validateTransition('SUPERSEDED', 'DRAFT')).toThrow(InvalidStateTransitionError);
    });

    it('should reject illegal transitions like INACTIVE -> PENDING_VALIDATION directly', () => {
      expect(() => MasterDataLifecycleService.validateTransition('INACTIVE', 'PENDING_VALIDATION')).toThrow(InvalidStateTransitionError);
    });
  });

  describe('assertIsReferenceable', () => {
    it('should pass for APPROVED or ACTIVE entities', () => {
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'APPROVED')).not.toThrow();
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'ACTIVE')).not.toThrow();
    });

    it('should throw ValidationError for DRAFT, PENDING_VALIDATION, INACTIVE, or SUPERSEDED', () => {
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'DRAFT')).toThrow(ValidationError);
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'PENDING_VALIDATION')).toThrow(ValidationError);
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'INACTIVE')).toThrow(ValidationError);
      expect(() => MasterDataLifecycleService.assertIsReferenceable('Product', 'prod-1', 'SUPERSEDED')).toThrow(ValidationError);
    });
  });

  describe('assertCanApprove', () => {
    it('should allow approval when permissionChecker grants approve permission to non-creator', async () => {
      const checker = new AllowAllPermissionChecker();
      await expect(
        MasterDataLifecycleService.assertCanApprove({
          actorId: 'user-manager',
          createdById: 'user-creator',
          permissionChecker: checker,
          resource: 'Product'
        })
      ).resolves.not.toThrow();
    });

    it('should reject approval when actor lacks approve permission', async () => {
      const denyChecker: PermissionChecker = {
        async can(_actorId: string, _action: string, _resource: string, _scope?: ScopeContext): Promise<boolean> {
          return false;
        }
      };

      await expect(
        MasterDataLifecycleService.assertCanApprove({
          actorId: 'user-employee',
          permissionChecker: denyChecker,
          resource: 'Product'
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it('should reject creator self-approval when self_approve permission is denied', async () => {
      const checker: PermissionChecker = {
        async can(_actorId: string, action: string, _resource: string, _scope?: ScopeContext): Promise<boolean> {
          if (action === 'approve') return true;
          if (action === 'self_approve') return false;
          return false;
        }
      };

      await expect(
        MasterDataLifecycleService.assertCanApprove({
          actorId: 'user-creator',
          createdById: 'user-creator',
          permissionChecker: checker,
          resource: 'Product'
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
