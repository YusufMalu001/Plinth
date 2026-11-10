import { prisma as defaultPrisma } from '../../../database';
import { notificationService } from '../../notifications/notification.service';
import { logger } from '../../../common/utils/logger';

export class IncompleteScheduleNotifierService {
  constructor(private readonly prisma: typeof defaultPrisma = defaultPrisma) {}

  /**
   * Evaluates all paused or incomplete production batches and assembly batches.
   * Dispatches:
   * 1. Same-day incomplete alerts to Admin when a worker stops/pauses and it is not resumed.
   * 2. Next-day resume reminders to Assigned Worker, Store Manager, and Admin.
   */
  async checkAndNotifyIncompleteSchedules(options?: { referenceDate?: Date }) {
    const now = options?.referenceDate || new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const results = {
      productionIncompleteNotified: 0,
      productionResumeNotified: 0,
      assemblyIncompleteNotified: 0,
      assemblyResumeNotified: 0,
    };

    try {
      // ──────────────────────────────────────────────────────────────────────────
      // 1. PRODUCTION EXECUTION BATCHES & SCHEDULES
      // ──────────────────────────────────────────────────────────────────────────
      const pausedProdBatches = await this.prisma.departmentExecutionBatch.findMany({
        where: {
          status: { in: ['PAUSED', 'IN_PROGRESS', 'PARTIAL'] },
          progressEvents: {
            some: {
              eventType: 'PAUSED'
            }
          }
        },
        include: {
          department: true,
          productionPlan: {
            include: {
              product: true
            }
          },
          workerAssignments: {
            include: {
              employee: true
            }
          },
          progressEvents: {
            orderBy: { timestamp: 'desc' },
            take: 5
          }
        }
      });

      for (const batch of pausedProdBatches) {
        const latestEvent = batch.progressEvents[0];
        const isCurrentlyPaused = batch.status === 'PAUSED' || latestEvent?.eventType === 'PAUSED';
        if (!isCurrentlyPaused) continue;

        const pauseDate = latestEvent?.timestamp || batch.updatedAt;
        const isPausedToday = pauseDate >= startOfToday && pauseDate <= endOfToday;
        const isPausedEarlier = pauseDate < startOfToday;

        const planNumber = batch.productionPlan?.planNumber || batch.batchNumber;
        const productName = batch.productionPlan?.product?.name || 'Production Batch';
        const deptName = batch.department?.name || 'Department';

        // Collect assigned worker user IDs
        const assignedEmployeeIds = batch.workerAssignments.map((w) => w.employeeId);
        const assignedUsers = await this.prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { employeeId: { in: assignedEmployeeIds } },
              { email: { in: batch.workerAssignments.map((w) => w.employee?.email).filter(Boolean) as string[] } }
            ]
          },
          select: { id: true }
        });
        const assignedUserIds = assignedUsers.map((u) => u.id);

        if (isPausedToday) {
          // Alert Admin and Store Manager that production schedule was stopped and not continued today
          const title = `Incomplete Production Schedule Alert: ${planNumber}`;
          const message = `Assigned worker paused/stopped production on batch ${batch.batchNumber} (${deptName} - ${productName}) and it has not resumed today.`;
          
          await notificationService.notifyRoles({
            roles: ['admin', 'super-admin', 'store-manager', 'manager', 'inventory-manager'],
            title,
            message,
            resource: 'ProductionSchedule',
            resourceId: batch.id,
            href: `/production/execution/${batch.id}`,
            metadata: { batchId: batch.id, planNumber, status: batch.status, isPausedToday: true }
          });
          results.productionIncompleteNotified++;
        } else if (isPausedEarlier) {
          // Next-day reminder to resume incomplete schedule
          const resumeTitle = `Action Required: Resume Incomplete Production Schedule ${planNumber}`;
          const resumeMessage = `Production schedule ${planNumber} (${batch.batchNumber} - ${deptName}) remains incomplete from previous shift. Please resume production floor execution today.`;

          // 1. Notify Assigned Workers
          if (assignedUserIds.length > 0) {
            await notificationService.notifyUsers({
              recipientIds: assignedUserIds,
              title: resumeTitle,
              message: resumeMessage,
              resource: 'ProductionSchedule',
              resourceId: batch.id,
              href: `/production/execution/${batch.id}`,
              metadata: { batchId: batch.id, planNumber, targetRole: 'WORKER' }
            });
          }

          // 2. Notify Store Managers & Admins
          await notificationService.notifyRoles({
            roles: ['store-manager', 'manager', 'inventory-manager', 'admin', 'super-admin'],
            title: resumeTitle,
            message: resumeMessage,
            resource: 'ProductionSchedule',
            resourceId: batch.id,
            href: `/production/execution/${batch.id}`,
            metadata: { batchId: batch.id, planNumber, targetRole: 'MANAGER_ADMIN' }
          });
          results.productionResumeNotified++;
        }
      }

      // ──────────────────────────────────────────────────────────────────────────
      // 2. ASSEMBLY BATCHES
      // ──────────────────────────────────────────────────────────────────────────
      const pausedAssemblyBatches = await this.prisma.assemblyBatch.findMany({
        where: {
          status: { in: ['IN_ASSEMBLY', 'PARTIAL', 'REWORK'] },
          progressEvents: {
            some: {
              eventType: 'PAUSED'
            }
          }
        },
        include: {
          product: true,
          workerAssignments: {
            include: {
              employee: true
            }
          },
          progressEvents: {
            orderBy: { timestamp: 'desc' },
            take: 5
          }
        }
      });

      for (const batch of pausedAssemblyBatches) {
        const latestEvent = batch.progressEvents[0];
        const isPaused = latestEvent?.eventType === 'PAUSED';
        if (!isPaused) continue;

        const pauseDate = latestEvent?.timestamp || batch.updatedAt;
        const isPausedToday = pauseDate >= startOfToday && pauseDate <= endOfToday;
        const isPausedEarlier = pauseDate < startOfToday;

        const batchNumber = batch.batchNumber;
        const productName = batch.product?.name || 'Finished Product';

        // Collect assigned worker user IDs
        const assignedEmployeeIds = batch.workerAssignments.map((w) => w.employeeId);
        const assignedUsers = await this.prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { employeeId: { in: assignedEmployeeIds } },
              { email: { in: batch.workerAssignments.map((w) => w.employee?.email).filter(Boolean) as string[] } }
            ]
          },
          select: { id: true }
        });
        const assignedUserIds = assignedUsers.map((u) => u.id);

        if (isPausedToday) {
          // Alert Admin and Store Manager that assembly run was stopped and not continued today
          const title = `Incomplete Assembly Batch Alert: ${batchNumber}`;
          const message = `Assigned worker paused assembly for ${productName} (${batchNumber}) and it has not resumed today.`;

          await notificationService.notifyRoles({
            roles: ['admin', 'super-admin', 'store-manager', 'manager', 'inventory-manager'],
            title,
            message,
            resource: 'AssemblyBatch',
            resourceId: batch.id,
            href: `/production/assembly/${batch.id}`,
            metadata: { batchId: batch.id, batchNumber, status: batch.status, isPausedToday: true }
          });
          results.assemblyIncompleteNotified++;
        } else if (isPausedEarlier) {
          // Next-day reminder to resume incomplete assembly
          const resumeTitle = `Action Required: Resume Incomplete Assembly Batch ${batchNumber}`;
          const resumeMessage = `Assembly batch ${batchNumber} (${productName}) was stopped and remains incomplete. Please resume workstation assembly today.`;

          // 1. Notify Assigned Workers
          if (assignedUserIds.length > 0) {
            await notificationService.notifyUsers({
              recipientIds: assignedUserIds,
              title: resumeTitle,
              message: resumeMessage,
              resource: 'AssemblyBatch',
              resourceId: batch.id,
              href: `/production/assembly/${batch.id}`,
              metadata: { batchId: batch.id, batchNumber, targetRole: 'WORKER' }
            });
          }

          // 2. Notify Store Managers & Admins
          await notificationService.notifyRoles({
            roles: ['store-manager', 'manager', 'inventory-manager', 'admin', 'super-admin'],
            title: resumeTitle,
            message: resumeMessage,
            resource: 'AssemblyBatch',
            resourceId: batch.id,
            href: `/production/assembly/${batch.id}`,
            metadata: { batchId: batch.id, batchNumber, targetRole: 'MANAGER_ADMIN' }
          });
          results.assemblyResumeNotified++;
        }
      }

      logger.info('Incomplete schedule & assembly notification evaluation completed', {
        details: results
      });
      return results;
    } catch (error) {
      logger.error('Error checking incomplete production schedules & assembly batches:', {
        details: (error as Error).message
      });
      return results;
    }
  }

  /**
   * Starts a background interval to periodically check and notify for incomplete production/assembly schedules.
   */
  startBackgroundCron(intervalMs: number = 30 * 60 * 1000) {
    // Initial evaluation after 10s warmup
    setTimeout(() => {
      this.checkAndNotifyIncompleteSchedules().catch((err) => {
        logger.warn('Initial incomplete schedule check failed:', { details: err.message });
      });
    }, 10000);

    const intervalId = setInterval(() => {
      this.checkAndNotifyIncompleteSchedules().catch((err) => {
        logger.warn('Periodic incomplete schedule check failed:', { details: err.message });
      });
    }, intervalMs);

    return intervalId;
  }
}

export const incompleteScheduleNotifierService = new IncompleteScheduleNotifierService();
