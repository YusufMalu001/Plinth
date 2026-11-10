import { StockBalance, StockOwnership } from '@prisma/client';
import { PermissionChecker, AuditWriter } from '@synergy/types';
import { StockBalanceRepository } from '../repositories/stock-balance.repository';
import { computeItemKey } from '../repositories/stock-ledger.repository';
import { ForbiddenError, NotFoundError } from '../../../common/errors/AppError';

const REORDER_WINDOW_DAYS = 30;

function extractConfiguredSafetyBuffer(product: unknown, material: unknown): number | null {
  const metadata = (product as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | undefined;
  const specs = (material as { specs?: unknown } | null)?.specs as Record<string, unknown> | undefined;
  const value = [metadata?.safetyStock, metadata?.minStockLevel, specs?.safetyStock, specs?.minStockLevel]
    .map(Number).find((numeric) => Number.isFinite(numeric) && numeric > 0);
  return value ?? null;
}

export interface ReorderSignal {
  balanceId: string;
  itemKey: string;
  productId: string | null;
  product?: { id: string; sku: string; name: string } | null;
  materialId: string | null;
  material?: { id: string; code: string; name: string } | null;
  locationId: string;
  onHandQuantity: number;
  availableQuantity: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
  configuredSafetyBuffer: number | null;
  belowSafetyBuffer: boolean | null;
}

export class StockBalanceService {
  constructor(
    private readonly repository: StockBalanceRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  private async assertCanView(actorId: string): Promise<void> {
    const allowed = await this.permissionChecker.can(actorId, 'view', 'StockBalance');
    if (!allowed) throw new ForbiddenError('Lacks permission to view stock balances.');
  }

  async list(
    actorId: string,
    params: { productId?: string; materialId?: string; locationId?: string; ownership?: StockOwnership; skip?: number; take?: number }
  ) {
    await this.assertCanView(actorId);
    return this.repository.list(params);
  }

  async getById(actorId: string, id: string): Promise<StockBalance> {
    await this.assertCanView(actorId);
    const balance = await this.repository.findById(id);
    if (!balance) throw new NotFoundError(`StockBalance [${id}] not found.`);
    return balance;
  }

  async getLedger(
    actorId: string,
    params: { productId?: string; materialId?: string; locationId?: string; entryType?: string; postedFrom?: Date; postedTo?: Date; skip?: number; take?: number }
  ) {
    await this.assertCanView(actorId);
    return this.repository.listLedger(params);
  }

  async getLedgerEntryById(actorId: string, id: string) {
    await this.assertCanView(actorId);
    const entry = await this.repository.getLedgerEntryById(id);
    if (!entry) throw new NotFoundError(`StockLedgerEntry [${id}] not found.`);
    return entry;
  }

  async getMovementHistory(actorId: string, params: { productId?: string; materialId?: string; locationId: string }) {
    await this.assertCanView(actorId);
    const [movements, lastMovementAt] = await Promise.all([
      this.repository.getMovementHistory(params),
      this.repository.getLastMovementAt(params)
    ]);
    const agingDays = lastMovementAt ? Math.floor((Date.now() - lastMovementAt.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return { movements, lastMovementAt, agingDays };
  }

  async getReorderSignals(actorId: string): Promise<ReorderSignal[]> {
    await this.assertCanView(actorId);

    const [balances, issuedSums] = await Promise.all([
      this.repository.listAll(),
      this.repository.sumIssuedQuantitySince(new Date(Date.now() - REORDER_WINDOW_DAYS * 24 * 60 * 60 * 1000))
    ]);

    const issuedByKey = new Map<string, number>();
    for (const row of issuedSums) {
      if (!row.productId && !row.materialId) continue;
      if (row.productId && row.materialId) continue;
      const itemKey = computeItemKey(row.productId, row.materialId);
      issuedByKey.set(`${itemKey}:${row.locationId}`, row.total);
    }

    return balances.map((balance): ReorderSignal => {
      const issuedTotal = issuedByKey.get(`${balance.itemKey}:${balance.locationId}`) ?? 0;
      const avgDailyConsumption = issuedTotal / REORDER_WINDOW_DAYS;
      const daysOfCover = avgDailyConsumption > 0 ? balance.onHandQuantity / avgDailyConsumption : null;
      const balanceWithRelations = balance as unknown as { product?: unknown; material?: unknown };
      const configuredSafetyBuffer = extractConfiguredSafetyBuffer(balanceWithRelations.product, balanceWithRelations.material);

      const product = balanceWithRelations.product as { id: string; sku: string; name: string } | undefined;
      const material = balanceWithRelations.material as { id: string; code: string; name: string } | undefined;

      return {
        balanceId: balance.id,
        itemKey: balance.itemKey,
        productId: balance.productId,
        product: product ? { id: product.id, sku: product.sku, name: product.name } : null,
        materialId: balance.materialId,
        material: material ? { id: material.id, code: material.code, name: material.name } : null,
        locationId: balance.locationId,
        onHandQuantity: balance.onHandQuantity,
        availableQuantity: balance.onHandQuantity - balance.reservedQuantity,
        avgDailyConsumption,
        daysOfCover,
        configuredSafetyBuffer,
        belowSafetyBuffer: configuredSafetyBuffer !== null ? balance.onHandQuantity - balance.reservedQuantity <= configuredSafetyBuffer : null
      };
    });
  }

  async createSnapshot(actorId: string, requestId?: string): Promise<{ asOfDate: Date; count: number }> {
    const allowed = await this.permissionChecker.can(actorId, 'export', 'StockBalance');
    if (!allowed) throw new ForbiddenError('Lacks permission to create an inventory snapshot.');

    const balances = await this.repository.listAll();
    const asOfDate = new Date();
    asOfDate.setUTCHours(0, 0, 0, 0);

    const count = await this.repository.createSnapshotRows(
      balances.map((b) => ({
        itemKey: b.itemKey,
        productId: b.productId,
        materialId: b.materialId,
        uomId: b.uomId,
        locationId: b.locationId,
        ownership: b.ownership,
        quantityOnHand: b.onHandQuantity,
        quantityReserved: b.reservedQuantity,
        asOfDate,
        createdByActorId: actorId
      }))
    );

    await this.auditWriter.record({
      actorId,
      action: 'inventory.snapshot_create',
      entityType: 'StockSnapshot',
      entityId: asOfDate.toISOString(),
      after: { count, asOfDate },
      requestId
    });

    return { asOfDate, count };
  }

  async listSnapshots(actorId: string, params: { asOfDate?: Date; locationId?: string; skip?: number; take?: number }) {
    await this.assertCanView(actorId);
    return this.repository.listSnapshots(params);
  }
}
