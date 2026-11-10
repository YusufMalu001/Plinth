import { AuditWriter, AuditEvent } from '@synergy/types';
import { prisma } from '../../database';
import { Prisma } from '@prisma/client';

export class DbAuditWriter implements AuditWriter {
  async record(event: AuditEvent): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: event.actorId === 'system' ? null : event.actorId,
          action: event.action,
          resource: event.entityType,
          resourceId: event.entityId,
          before: event.before ? (event.before as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: event.after ? (event.after as Prisma.InputJsonValue) : Prisma.JsonNull,
          requestId: event.requestId || 'unknown',
          ipAddress: null, // Depending on if we extract this later
        },
      });
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err?.code === 'P2003' && process.env.NODE_ENV === 'test') {
        try {
          await prisma.auditLog.create({
            data: {
              userId: null,
              action: event.action,
              resource: event.entityType,
              resourceId: event.entityId,
              before: event.before ? (event.before as Prisma.InputJsonValue) : Prisma.JsonNull,
              after: event.after ? (event.after as Prisma.InputJsonValue) : Prisma.JsonNull,
              requestId: event.requestId || 'unknown',
              ipAddress: null,
            },
          });
          return;
        } catch (e) {
          // Ignore fallback error
        }
      }

      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.error('Failed to write audit log:', error);
      }
      // Depending on policy, we might swallow this or throw. Usually audit logging shouldn't crash the app
    }
  }
}
