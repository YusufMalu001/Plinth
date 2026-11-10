import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../database';
import { NotificationPayload, notificationWsServer } from '../../common/websocket/notification-ws.server';
import { NotFoundError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/utils/logger';

export class NotificationService {
  /**
   * Persists a notification to the database and dispatches via WebSocket if the user is online.
   */
  async createAndDispatch(data: {
    recipientId: string;
    type?: NotificationType;
    title: string;
    message: string;
    resource?: string;
    resourceId?: string;
    href?: string;
    metadata?: Record<string, unknown>;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    expiresAt?: Date;
    dedupeKey?: string;
  }): Promise<NotificationPayload> {
    const notificationData = {
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      resource: data.resource || null,
      resourceId: data.resourceId || null,
      href: data.href || null,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      priority: data.priority ?? 'NORMAL',
      expiresAt: data.expiresAt,
      dedupeKey: data.dedupeKey,
    };
    let saved;
    try {
      saved = await prisma.notification.create({ data: notificationData });
    } catch (error) {
      if (data.dedupeKey && (error as { code?: string }).code === 'P2002') {
        const existing = await prisma.notification.findUnique({ where: { dedupeKey: data.dedupeKey } });
        if (existing) {
          return { ...existing, metadata: (existing.metadata as Record<string, unknown> | null) ?? undefined };
        }
      }
      throw error;
    }

    const payload: NotificationPayload = {
      id: saved.id,
      recipientId: saved.recipientId,
      type: saved.type,
      title: saved.title,
      message: saved.message,
      resource: saved.resource,
      resourceId: saved.resourceId,
      href: saved.href,
      readAt: saved.readAt,
      createdAt: saved.createdAt,
      metadata: (saved.metadata as Record<string, unknown> | null | undefined) ?? data.metadata,
    };

    // Dispatch real-time websocket event
    notificationWsServer.sendToUser(saved.recipientId, payload);

    return payload;
  }

  /**
   * Bulk dispatches notifications to multiple user IDs.
   */
  async notifyUsers(data: {
    recipientIds: string[];
    type?: NotificationType;
    title: string;
    message: string;
    resource?: string;
    resourceId?: string;
    href?: string;
    metadata?: Record<string, unknown>;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    expiresAt?: Date;
    dedupeKeyPrefix?: string;
  }): Promise<NotificationPayload[]> {
    const recipients = [...new Set(data.recipientIds.filter(Boolean))];
    if (!recipients.length) return [];

    const results = await Promise.all(
      recipients.map((recipientId) =>
        this.createAndDispatch({
          recipientId,
          type: data.type,
          title: data.title,
          message: data.message,
          resource: data.resource,
          resourceId: data.resourceId,
          href: data.href,
          metadata: data.metadata,
          priority: data.priority,
          expiresAt: data.expiresAt,
          dedupeKey: data.dedupeKeyPrefix ? `${data.dedupeKeyPrefix}:${recipientId}` : undefined,
        }).catch((err) => {
          logger.error(`Failed to dispatch notification to user ${recipientId}:`, { details: (err as Error).message });
          return null;
        })
      )
    );

    return results.filter((r): r is NotificationPayload => r !== null);
  }

  /**
   * Finds all active users matching given roles and dispatches notifications to them.
   */
  async notifyRoles(data: {
    // Dynamic RBAC roles are stored as configurable keys, so notification
    // recipient resolution must not be limited to the legacy role union.
    roles: string[];
    type?: NotificationType;
    title: string;
    message: string;
    resource?: string;
    resourceId?: string;
    href?: string;
    metadata?: Record<string, unknown>;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    excludeUserIds?: string[];
    dedupeKeyPrefix?: string;
  }): Promise<NotificationPayload[]> {
    const aliases = new Set<string>();
    for (const r of data.roles) {
      const norm = r.trim().toLowerCase();
      aliases.add(norm);
      aliases.add(norm.replaceAll('-', '_'));
      aliases.add(norm.replaceAll('-', ' '));
      aliases.add(norm.replaceAll('_', '-'));
      aliases.add(norm.replaceAll('_', ' '));
      // Add Title Case
      const titleCase = norm
        .split(/[-_\s]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      aliases.add(titleCase);
    }

    const roleConditions: Prisma.UserWhereInput[] = [];
    if (data.roles.some(r => /admin/i.test(r))) {
      roleConditions.push({ role: 'admin' });
    }
    if (data.roles.some(r => /manager|store/i.test(r))) {
      roleConditions.push({ role: 'manager' });
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          ...roleConditions,
          { userRoles: { some: { role: { name: { in: [...aliases] } } } } },
          { userRoles: { some: { role: { name: { contains: 'manager' } } } } },
          { userRoles: { some: { role: { name: { contains: 'store' } } } } },
        ],
      },
      select: { id: true },
    });

    const excludeSet = new Set(data.excludeUserIds || []);
    const recipientIds = [...new Set(users.map((u) => u.id).filter((id) => !excludeSet.has(id)))];

    return this.notifyUsers({
      recipientIds,
      type: data.type,
      title: data.title,
      message: data.message,
      resource: data.resource,
      resourceId: data.resourceId,
      href: data.href,
          metadata: data.metadata,
          priority: data.priority,
      dedupeKeyPrefix: data.dedupeKeyPrefix,
    });
  }

  /**
   * Finds all active users assigned to a specific department (by ID, code, name, employee email, or department head role) and dispatches notifications to them.
   */
  async notifyDepartment(data: {
    departmentId: string;
    type?: NotificationType;
    title: string;
    message: string;
    resource?: string;
    resourceId?: string;
    href?: string;
    metadata?: Record<string, unknown>;
    dedupeKeyPrefix?: string;
  }): Promise<NotificationPayload[]> {
    try {
      if (!data.departmentId) return [];

      const dept = await prisma.department.findFirst({
        where: {
          OR: [
            { id: data.departmentId },
            { code: { equals: data.departmentId, mode: Prisma.QueryMode.insensitive } },
            { name: { equals: data.departmentId, mode: Prisma.QueryMode.insensitive } }
          ]
        },
        select: { id: true, code: true, name: true }
      });

      const deptEmployees = (prisma as any).employee?.findMany
        ? await (prisma as any).employee.findMany({
            where: {
              OR: [
                { departmentId: data.departmentId },
                ...(dept ? [{ departmentId: dept.id }] : [])
              ],
              status: 'ACTIVE'
            },
            select: { email: true }
          })
        : [];
      const employeeEmails = deptEmployees.map((e: any) => e.email).filter(Boolean);

      const orConditions: Prisma.UserWhereInput[] = [
        { assignedDepartmentId: data.departmentId },
        { employeeRef: { departmentId: data.departmentId } },
        { department: { contains: data.departmentId, mode: Prisma.QueryMode.insensitive } }
      ];
      if (dept?.id) {
        orConditions.push({ assignedDepartmentId: dept.id });
        orConditions.push({ employeeRef: { departmentId: dept.id } });
        orConditions.push({ department: { contains: dept.id, mode: Prisma.QueryMode.insensitive } });
      }
      if (dept?.code) {
        orConditions.push({ department: { contains: dept.code, mode: Prisma.QueryMode.insensitive } });
        const shortCode = dept.code.replace(/^DEPT-/i, '').toLowerCase();
        orConditions.push({ email: { startsWith: `${shortCode}.` } });
      }
      if (dept?.name) {
        orConditions.push({ department: { contains: dept.name, mode: Prisma.QueryMode.insensitive } });
      }
      if (employeeEmails.length > 0) {
        orConditions.push({ email: { in: employeeEmails } });
      }
      const deptUsers = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: orConditions
        },
        select: { id: true }
      });

      let recipientIds = [...new Set(deptUsers.map((u) => u.id))];

      // If no direct department user is found, fallback to notifying production managers/admins
      if (!recipientIds.length) {
        const managers = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { role: 'admin' },
              { role: 'manager' },
              { userRoles: { some: { role: { name: { in: ['department_incharge', 'dept_head', 'production_manager', 'store-manager', 'admin'] } } } } }
            ]
          },
          select: { id: true }
        });
        recipientIds = [...new Set(managers.map((m) => m.id))];
      }

      if (!recipientIds.length) return [];

      return this.notifyUsers({
        recipientIds,
        type: data.type,
        title: data.title,
        message: data.message,
        resource: data.resource,
        resourceId: data.resourceId,
        href: data.href,
        metadata: data.metadata,
        dedupeKeyPrefix: data.dedupeKeyPrefix,
      });
    } catch (err) {
      logger.error(`Failed to notify department ${data.departmentId}:`, { details: (err as Error).message });
      return [];
    }
  }

  /**
   * Dispatches adjustment lifecycle events according to Module 4 rules.
   */
  async handleAdjustmentEvent(event: {
    type: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';
    adjustmentId: string;
    adjustmentNumber: string;
    proposedByActorId: string;
    locationId: string;
    materialType?: string;
    overrideActorId?: string;
  }): Promise<void> {
    const href = `/stock/adjustments`;

    switch (event.type) {
      case 'PROPOSED':
        // Notify every user with adjustment_approve permission in the relevant scope (Store Manager, Admin)
        await notificationWsServer.broadcastToRoleScope({
          action: 'approve',
          resource: 'StockAdjustment',
          locationId: event.locationId,
          materialType: event.materialType,
          notificationFactory: () => ({
            id: '',
            type: 'INFO',
            title: `New Adjustment Proposed (${event.adjustmentNumber})`,
            message: `Stock adjustment ${event.adjustmentNumber} has been proposed and is awaiting approval.`,
            resource: 'StockAdjustment',
            resourceId: event.adjustmentId,
            href,
            createdAt: new Date()
          })
        });
        break;

      case 'APPROVED':
        // Notify original proposer
        await this.createAndDispatch({
          recipientId: event.proposedByActorId,
          type: 'APPROVED',
          title: `Stock Adjustment Approved (${event.adjustmentNumber})`,
          message: `Your proposed stock adjustment ${event.adjustmentNumber} has been approved.`,
          resource: 'StockAdjustment',
          resourceId: event.adjustmentId,
          href
        });
        break;

      case 'REJECTED':
        // Notify original proposer
        await this.createAndDispatch({
          recipientId: event.proposedByActorId,
          type: 'CHANGES_REQUESTED',
          title: `Stock Adjustment Rejected (${event.adjustmentNumber})`,
          message: `Your proposed stock adjustment ${event.adjustmentNumber} was rejected.`,
          resource: 'StockAdjustment',
          resourceId: event.adjustmentId,
          href
        });
        break;

      case 'OVERRIDDEN':
        // Notify BOTH Store Manager(s) who would normally approve AND the proposer (if different)
        // Store Managers / Admins
        await notificationWsServer.broadcastToRoleScope({
          action: 'approve',
          resource: 'StockAdjustment',
          locationId: event.locationId,
          materialType: event.materialType,
          notificationFactory: () => ({
            id: '',
            type: 'WORKFLOW',
            title: `Stock Adjustment Overridden by Admin (${event.adjustmentNumber})`,
            message: `Admin override was executed for adjustment ${event.adjustmentNumber}.`,
            resource: 'StockAdjustment',
            resourceId: event.adjustmentId,
            href,
            metadata: { isOverride: true, actorId: event.overrideActorId },
            createdAt: new Date()
          })
        });

        // Ensure proposer also explicitly gets the override notification
        if (event.proposedByActorId !== event.overrideActorId) {
          await this.createAndDispatch({
            recipientId: event.proposedByActorId,
            type: 'WORKFLOW',
            title: `Stock Adjustment Overridden by Admin (${event.adjustmentNumber})`,
            message: `Your proposed stock adjustment ${event.adjustmentNumber} was approved via Admin override.`,
            resource: 'StockAdjustment',
            resourceId: event.adjustmentId,
            href,
            metadata: { isOverride: true, actorId: event.overrideActorId }
          });
        }
        break;
    }
  }

  /**
   * Dispatches transfer lifecycle events.
   */
  async handleTransferEvent(event: {
    type: 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'PARTIALLY_RECEIVED';
    transferId: string;
    transferNumber: string;
    requestedByActorId: string;
    fromLocationId: string;
    toLocationId: string;
    shortfall?: number;
  }): Promise<void> {
    const href = `/stock/transfers`;

    switch (event.type) {
      case 'REQUESTED':
        // Notify users with transfer_approve permission
        await notificationWsServer.broadcastToRoleScope({
          action: 'transfer',
          resource: 'StockTransfer',
          locationId: event.fromLocationId,
          notificationFactory: () => ({
            id: '',
            type: 'INFO',
            title: `Stock Transfer Requested (${event.transferNumber})`,
            message: `Transfer ${event.transferNumber} has been requested and requires dispatch/issuing.`,
            resource: 'StockTransfer',
            resourceId: event.transferId,
            href,
            createdAt: new Date()
          })
        });
        break;

      case 'APPROVED':
      case 'IN_TRANSIT':
        await this.createAndDispatch({
          recipientId: event.requestedByActorId,
          type: 'INFO',
          title: `Stock Transfer Dispatched (${event.transferNumber})`,
          message: `Transfer ${event.transferNumber} has been issued and is in transit.`,
          resource: 'StockTransfer',
          resourceId: event.transferId,
          href
        });
        break;

      case 'RECEIVED':
        await this.createAndDispatch({
          recipientId: event.requestedByActorId,
          type: 'APPROVED',
          title: `Stock Transfer Received (${event.transferNumber})`,
          message: `Transfer ${event.transferNumber} has been fully received at destination.`,
          resource: 'StockTransfer',
          resourceId: event.transferId,
          href
        });
        break;

      case 'PARTIALLY_RECEIVED':
        await this.createAndDispatch({
          recipientId: event.requestedByActorId,
          type: 'CHANGES_REQUESTED',
          title: `Stock Transfer Partial Receipt (${event.transferNumber})`,
          message: `Transfer ${event.transferNumber} was partially received with a shortfall of ${event.shortfall ?? 0} units.`,
          resource: 'StockTransfer',
          resourceId: event.transferId,
          href,
          metadata: { shortfall: event.shortfall }
        });
        break;
    }
  }

  /**
   * Dispatches reorder threshold alerts.
   */
  async handleReorderCrossedEvent(event: {
    itemKey: string;
    itemCodeOrSku: string;
    itemName: string;
    materialType?: string;
    locationId: string;
    onHand: number;
    reorderPoint: number;
  }): Promise<void> {
    await notificationWsServer.broadcastToRoleScope({
      action: 'view',
      resource: 'StockBalance',
      locationId: event.locationId,
      materialType: event.materialType,
      notificationFactory: () => ({
        id: '',
        type: 'WORKFLOW',
        title: `Reorder Threshold Alert: ${event.itemCodeOrSku}`,
        message: `${event.itemName} (${event.itemCodeOrSku}) on-hand stock (${event.onHand}) has fallen below reorder point (${event.reorderPoint}).`,
        resource: 'StockBalance',
        href: '/stock/reorder',
        createdAt: new Date(),
        metadata: { itemKey: event.itemKey, onHand: event.onHand, reorderPoint: event.reorderPoint }
      })
    });
  }

  // ─── Query / Read Operations ───────────────────────────────────────────────────

  async listUserNotifications(userId: string, params: { unreadOnly?: boolean; skip?: number; take?: number }) {
    const where = {
      recipientId: userId,
      ...(params.unreadOnly ? { readAt: null } : {})
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take ?? 50
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { recipientId: userId, readAt: null } })
    ]);

    return { items, total, unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif) throw new NotFoundError(`Notification [${notificationId}] not found.`);
    if (notif.recipientId !== userId) {
      throw new ForbiddenError('Cannot mark another user notification as read.');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() }
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() }
    });
  }
}

export const notificationService = new NotificationService();
