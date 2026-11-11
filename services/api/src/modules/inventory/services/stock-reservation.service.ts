import { StockReservation, StockOwnership } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@plinth/types';
import { prisma } from '../../../database';
import { StockReservationRepository } from '../repositories/stock-reservation.repository';
import { StockLedgerRepository } from '../repositories/stock-ledger.repository';
import { assertLocationScope, resolveRequiredLocation } from '../../../common/rbac/location-scope';
import { NotFoundError, ForbiddenError, InvalidStateTransitionError, ValidationError } from '../../../common/errors/AppError';

export class StockReservationService {
  constructor(
    private readonly repository: StockReservationRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  async create(
    data: {
      productId?: string;
      materialId?: string;
      uomId: string;
      locationId?: string;
      ownership?: StockOwnership;
      quantity: number;
      reason: string;
      sourceReference?: string;
    },
    actorId: string,
    requestId?: string
  ): Promise<StockReservation> {
    const canReserve = await this.permissionChecker.can(actorId, 'reserve', 'StockReservation');
    if (!canReserve) throw new ForbiddenError('Lacks permission to reserve stock.');

    if (Boolean(data.productId) === Boolean(data.materialId)) {
      throw new ValidationError('A reservation must reference exactly one of productId or materialId.');
    }
    if (data.quantity <= 0) throw new ValidationError('Quantity must be positive.');

    const locationId = await resolveRequiredLocation(actorId, data.locationId);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId });

    const ownership = data.ownership ?? 'OWNED';

    const created = await prisma.$transaction(async (tx) => {
      const txReservationRepository = new StockReservationRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      // Guards against holding more than is actually available (onHand - reserved) before the
      // reservation row is created, so a failed reserve never leaves an orphaned row behind.
      await txLedgerRepository.reserve(
        { productId: data.productId, materialId: data.materialId, uomId: data.uomId, locationId, ownership, quantity: data.quantity },
        tx
      );

      return txReservationRepository.create(
        {
          productId: data.productId,
          materialId: data.materialId,
          uomId: data.uomId,
          locationId,
          ownership,
          quantity: data.quantity,
          reason: data.reason,
          sourceReference: data.sourceReference,
          reservedByActorId: actorId
        },
        tx
      );
    });

    await this.auditWriter.record({
      actorId,
      action: 'inventory.reservation_create',
      entityType: 'StockReservation',
      entityId: created.id,
      after: created,
      requestId
    });

    return created;
  }

  async release(id: string, actorId: string, requestId?: string): Promise<StockReservation> {
    return this.transitionOut(id, 'RELEASED', actorId, requestId);
  }

  async consume(id: string, actorId: string, requestId?: string): Promise<StockReservation> {
    return this.transitionOut(id, 'CONSUMED', actorId, requestId);
  }

  async cancel(id: string, actorId: string, requestId?: string): Promise<StockReservation> {
    return this.transitionOut(id, 'CANCELLED', actorId, requestId);
  }

  /**
   * RELEASED/CONSUMED/CANCELLED all end a reservation's hold on availability the same way -
   * they differ only in what the ending *means* (given back unused, consumed by a real issue, or
   * abandoned). None of them move on-hand quantity or post a ledger entry; an actual physical
   * consumption is a separate, explicit StockIssue.
   */
  private async transitionOut(
    id: string,
    toStatus: 'RELEASED' | 'CONSUMED' | 'CANCELLED',
    actorId: string,
    requestId?: string
  ): Promise<StockReservation> {
    const canReserve = await this.permissionChecker.can(actorId, 'reserve', 'StockReservation');
    if (!canReserve) throw new ForbiddenError('Lacks permission to update this reservation.');

    const reservation = await this.repository.findById(id);
    if (!reservation) throw new NotFoundError(`StockReservation [${id}] not found.`);
    await assertLocationScope({ permissionChecker: this.permissionChecker, actorId, locationId: reservation.locationId });
    if (reservation.status !== 'ACTIVE') {
      throw new InvalidStateTransitionError(`Cannot update reservation in state [${reservation.status}]. Must be ACTIVE.`);
    }

    await prisma.$transaction(async (tx) => {
      const txReservationRepository = new StockReservationRepository(tx);
      const txLedgerRepository = new StockLedgerRepository(tx);

      const extra = toStatus === 'RELEASED' ? { releasedByActorId: actorId, releasedAt: new Date() } : toStatus === 'CONSUMED' ? { consumedAt: new Date() } : {};
      const count = await txReservationRepository.updateStatusConditional(id, ['ACTIVE'], toStatus, extra, tx);
      if (count === 0) {
        throw new InvalidStateTransitionError(`StockReservation [${id}] was modified concurrently; refetch and retry.`);
      }

      await txLedgerRepository.release(
        {
          productId: reservation.productId,
          materialId: reservation.materialId,
          uomId: reservation.uomId,
          locationId: reservation.locationId,
          ownership: reservation.ownership,
          quantity: reservation.quantity
        },
        tx
      );
    });

    const updated = await this.repository.findById(id);
    if (!updated) throw new NotFoundError(`StockReservation [${id}] not found after update.`);

    await this.auditWriter.record({
      actorId,
      action: `inventory.reservation_${toStatus.toLowerCase()}`,
      entityType: 'StockReservation',
      entityId: id,
      before: reservation,
      after: updated,
      requestId
    });

    return updated;
  }

  async getById(id: string): Promise<StockReservation> {
    const reservation = await this.repository.findById(id);
    if (!reservation) throw new NotFoundError(`StockReservation [${id}] not found.`);
    return reservation;
  }

  async list(params: { productId?: string; materialId?: string; locationId?: string; status?: string; skip?: number; take?: number }) {
    return this.repository.list(params);
  }
}
