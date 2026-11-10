import { NotificationType } from '@prisma/client';
import { prisma } from '../../../database';
import { publish } from '../../../common/realtime/event-bus';

export interface GoodsReceiptNotification {
  action: string;
  resource: string;
  type: NotificationType;
  title: string;
  message: string;
  grnId: string;
  locationId?: string | null;
  excludeActorId?: string;
}

/**
 * Resolves recipients from live RBAC grants instead of hard-coded job titles.
 * Location-bound users only receive work for their assigned store; admins and
 * roles carrying allLocations receive cross-store operational notifications.
 */
export class GoodsReceiptNotificationService {
  async notifyAccountsGrn(input: Omit<GoodsReceiptNotification, 'action' | 'resource' | 'locationId'>): Promise<void> {
    const userClient = (prisma as typeof prisma & { user?: typeof prisma.user }).user;
    const notificationClient = (prisma as typeof prisma & { notification?: typeof prisma.notification }).notification;
    if (!userClient?.findMany || !notificationClient?.createMany) return;

    const recipients = await userClient.findMany({
      where: {
        isActive: true,
        ...(input.excludeActorId ? { id: { not: input.excludeActorId } } : {}),
        OR: [
          { role: 'admin' },
          { userRoles: { some: { role: { name: { in: [
            'accounts_preparer', 'accounts-preparer', 'Accounts Preparer',
            'accounts_reviewer', 'accounts-reviewer', 'Accounts Reviewer',
            'finance_manager', 'finance-manager', 'Finance Manager'
          ] } } } } }
        ]
      },
      select: { id: true }
    });
    if (!recipients.length) return;

    await notificationClient.createMany({
      data: recipients.map(({ id: recipientId }) => ({
        recipientId,
        type: input.type,
        title: input.title,
        message: input.message,
        resource: 'GoodsReceiptNote',
        resourceId: input.grnId,
        href: '/accounts/purchase-payables'
      }))
    });
    publish(recipients.map(({ id }) => id), { id: `${Date.now()}`, type: 'notification.created', resource: 'GoodsReceiptNote', resourceId: input.grnId });
  }

  async notifyPermission(input: GoodsReceiptNotification): Promise<void> {
    const userClient = (prisma as typeof prisma & { user?: typeof prisma.user }).user;
    const notificationClient = (prisma as typeof prisma & { notification?: typeof prisma.notification }).notification;
    if (!userClient?.findMany || !notificationClient?.createMany) return;
    const recipients = await userClient.findMany({
      where: {
        isActive: true,
        ...(input.excludeActorId ? { id: { not: input.excludeActorId } } : {}),
        OR: [
          { role: 'admin' },
          {
            userRoles: {
              some: {
                role: {
                  permissions: {
                    some: { permission: { action: input.action, resource: input.resource } }
                  }
                }
              }
            }
          }
        ],
        ...(input.locationId
          ? {
              AND: [{
                OR: [
                  { role: 'admin' },
                  { assignedLocationId: input.locationId },
                  { userRoles: { some: { role: { allLocations: true } } } }
                ]
              }]
            }
          : {})
      },
      select: { id: true }
    });

    if (!recipients.length) return;
    await notificationClient.createMany({
      data: recipients.map(({ id: recipientId }) => ({
        recipientId,
        type: input.type,
        title: input.title,
        message: input.message,
        resource: 'GoodsReceiptNote',
        resourceId: input.grnId,
        href: `/receiving/goods-receipts/${input.grnId}`
      }))
    });
    publish(recipients.map(({ id }) => id), { id: `${Date.now()}`, type: 'notification.created', resource: 'GoodsReceiptNote', resourceId: input.grnId });
  }

  async notifyUsers(userIds: Array<string | null | undefined>, input: Omit<GoodsReceiptNotification, 'action' | 'resource'>): Promise<void> {
    const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id && id !== input.excludeActorId)))];
    const notificationClient = (prisma as typeof prisma & { notification?: typeof prisma.notification }).notification;
    if (!recipients.length || !notificationClient?.createMany) return;
    await notificationClient.createMany({
      data: recipients.map(recipientId => ({
        recipientId,
        type: input.type,
        title: input.title,
        message: input.message,
        resource: 'GoodsReceiptNote',
        resourceId: input.grnId,
        href: `/receiving/goods-receipts/${input.grnId}`
      }))
    });
    publish(recipients, { id: `${Date.now()}`, type: 'notification.created', resource: 'GoodsReceiptNote', resourceId: input.grnId });
  }
}
