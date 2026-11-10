import { publishIntelligenceEvent } from '../../intelligence/intelligence.events';

/**
 * Move a released schedule into execution the first time shop-floor work starts.
 * The caller must pass its active Prisma transaction so the status and history
 * event are committed together with the operation that started the work.
 */
export async function markReleasedPlanInProgress(
  tx: any,
  productionPlanId: string,
  actorId: string,
  occurredAt = new Date()
): Promise<void> {
  const changed = await tx.productionPlan.updateMany({
    where: { id: productionPlanId, status: 'RELEASED' },
    data: { status: 'IN_PROGRESS', inProgressAt: occurredAt }
  });
  if (!changed.count) return;

  const plan = await tx.productionPlan.findUnique({
    where: { id: productionPlanId },
    select: { productId: true, quantity: true }
  });
  const event = await tx.productionPlanEvent.create({
    data: {
      productionPlanId,
      eventType: 'STARTED',
      fromStatus: 'RELEASED',
      toStatus: 'IN_PROGRESS',
      actorId
    }
  });
  await publishIntelligenceEvent(tx, {
    type: 'PRODUCTION_STARTED',
    entityType: 'ProductionPlan',
    entityId: productionPlanId,
    occurredAt,
    transitionId: event.id,
    metadata: {
      fromStatus: 'RELEASED',
      status: 'IN_PROGRESS',
      productId: plan?.productId ?? null,
      quantity: Number(plan?.quantity ?? 0)
    }
  });
}
