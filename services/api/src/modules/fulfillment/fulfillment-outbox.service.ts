import { Prisma, PrismaClient } from '@prisma/client';
import { FulfillmentAdapterRegistry } from './fulfillment.adapters';

interface OutboxRow {
  id: string;
  aggregateId: string;
  eventType: string;
  adapterKey: string | null;
  payload: unknown;
  attempts: number;
  idempotencyKey: string;
}

/**
 * Claims jobs with SKIP LOCKED so multiple workers can safely run together.
 * Provider adapters can be registered by deployment configuration without
 * changing the fulfillment domain or persisted outbox contract.
 */
export class FulfillmentOutboxService {
  constructor(private readonly prisma: PrismaClient, private readonly adapters: FulfillmentAdapterRegistry) {}

  async processDue(limit = 25) {
    const jobs = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>(Prisma.sql`
        SELECT "id", "aggregateId", "eventType", "adapterKey", "payload", "attempts", "idempotencyKey"
        FROM "sales_integration_outbox"
        WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= CURRENT_TIMESTAMP
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length) await (tx as any).salesIntegrationOutbox.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: 'PROCESSING' } });
      return rows;
    });

    let processed = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const adapter = job.adapterKey ? this.adapters.channel(job.adapterKey) : undefined;
        if (!adapter) throw new Error(`No channel adapter is configured for '${job.adapterKey || 'unknown'}'.`);
        await adapter.pushFulfillmentStatus({ eventType: job.eventType, aggregateId: job.aggregateId, payload: job.payload, idempotencyKey: job.idempotencyKey });
        await (this.prisma as any).salesIntegrationOutbox.update({ where: { id: job.id }, data: { status: 'COMPLETED', attempts: { increment: 1 }, processedAt: new Date(), lastError: null } });
        processed += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        const delayMinutes = Math.min(360, 2 ** Math.min(attempts, 8));
        await (this.prisma as any).salesIntegrationOutbox.update({ where: { id: job.id }, data: { status: 'FAILED', attempts, lastError: error instanceof Error ? error.message : 'Adapter execution failed.', nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000) } });
        failed += 1;
      }
    }
    return { claimed: jobs.length, processed, failed };
  }
}
