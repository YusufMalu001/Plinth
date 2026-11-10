import { PrismaClient, Prisma, BomVersion, BomStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export const BOM_VERSION_INCLUDE = {
  product: true,
  material: true,
  productVariant: true,
  lines: {
    include: { material: true, componentProduct: true, uom: true, department: true },
    orderBy: { sequence: 'asc' as const }
  },
  goldenExamples: { orderBy: { createdAt: 'asc' as const } },
  supersedes: true,
  supersededBy: true
} satisfies Prisma.BomVersionInclude;

export type BomVersionWithLines = Prisma.BomVersionGetPayload<{ include: typeof BOM_VERSION_INCLUDE }>;

/** "" is the sentinel used when productVariantId is null - see the schema comment on
 *  BomVersion.variantScopeKey for why a plain nullable-column unique constraint can't
 *  enforce "one version N per product/variant" (Postgres treats every NULL as distinct). */
export function computeVariantScopeKey(productVariantId?: string | null): string {
  return productVariantId ?? '';
}

export class BomVersionRepository {
  constructor(private readonly prisma: PrismaOrTx = defaultPrisma) {}

  async findById(id: string): Promise<BomVersionWithLines | null> {
    return this.prisma.bomVersion.findUnique({ where: { id }, include: BOM_VERSION_INCLUDE });
  }

  async countByNumberPrefix(prefix: string): Promise<number> {
    return this.prisma.bomVersion.count({ where: { bomNumber: { startsWith: prefix } } });
  }

  async existsByBomNumber(bomNumber: string, excludeId?: string): Promise<boolean> {
    return Boolean(await this.prisma.bomVersion.findFirst({
      where: {
        bomNumber: { equals: bomNumber.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    }));
  }

  async existsByBomNumberForParent(
    bomNumber: string,
    parent: { productId?: string; materialId?: string },
    productVariantId?: string | null,
    excludeId?: string
  ): Promise<boolean> {
    return Boolean(await this.prisma.bomVersion.findFirst({
      where: {
        bomNumber,
        ...parent,
        ...(productVariantId !== undefined ? { variantScopeKey: computeVariantScopeKey(productVariantId) } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    }));
  }

  async findMaxVersion(parent: { productId?: string; materialId?: string }, productVariantId: string | null): Promise<number> {
    const latest = await this.prisma.bomVersion.findFirst({
      where: { ...parent, variantScopeKey: computeVariantScopeKey(productVariantId) },
      orderBy: { version: 'desc' }
    });
    return latest?.version ?? 0;
  }

  async findCurrentApproved(parent: { productId?: string; materialId?: string }, productVariantId: string | null, excludeId?: string): Promise<BomVersion | null> {
    return this.prisma.bomVersion.findFirst({
      where: {
        ...parent,
        variantScopeKey: computeVariantScopeKey(productVariantId),
        status: 'APPROVED',
        detachedFromItemAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {})
      } as any
    });
  }

  /**
   * As-of-date resolver, historically inclusive: includes APPROVED, SUPERSEDED, and RETIRED
   * (excludes only DRAFT/VALIDATION_PENDING, which never took effect). Supersession never
   * mutates a row's own effectiveDate, so this correctly reconstructs "what was in force on
   * date X" even after several later supersessions - see UomRepository.findEffectiveConversion
   * for the same fix applied to the analogous Module 1 resolver.
   */
  async findEffectiveVersion(productId: string, productVariantId: string | null, date: Date): Promise<BomVersionWithLines | null> {
    return this.prisma.bomVersion.findFirst({
      where: {
        productId,
        variantScopeKey: computeVariantScopeKey(productVariantId),
        status: { in: ['APPROVED', 'SUPERSEDED', 'RETIRED'] },
        OR: [{ detachedFromItemAt: null }, { detachedFromItemAt: { gt: date } }],
        effectiveDate: { lte: date }
      } as any,
      orderBy: { effectiveDate: 'desc' },
      include: BOM_VERSION_INCLUDE
    });
  }

  /**
   * The narrow resolver backing the authoritative calculateRequirements() path: APPROVED only,
   * never historical - this is the enforcement point for "prevent unapproved calculation."
   */
  async findLiveApprovedVersion(productId: string, productVariantId: string | null, date: Date): Promise<BomVersionWithLines | null> {
    return this.prisma.bomVersion.findFirst({
      where: {
        productId,
        variantScopeKey: computeVariantScopeKey(productVariantId),
        status: 'APPROVED',
        detachedFromItemAt: null,
        effectiveDate: { lte: date }
      } as any,
      orderBy: { effectiveDate: 'desc' },
      include: BOM_VERSION_INCLUDE
    });
  }

  async create(
    data: {
      bomNumber: string;
      productId?: string;
      materialId?: string;
      productVariantId?: string | null;
      version: number;
      note?: string;
      createdByActorId: string;
      lines: Array<{
        lineType: 'COMPONENT' | 'PACKAGING';
        materialId?: string | null;
        componentProductId?: string | null;
        uomId: string;
        quantityMode: 'FIXED' | 'SCALED';
        quantity: number;
        unitCost?: number | null;
        roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
        roundingPrecision?: number | null;
        departmentId?: string | null;
        sequence?: number;
        note?: string | null;
      }>;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<BomVersionWithLines> {
    return client.bomVersion.create({
      data: {
        bomNumber: data.bomNumber,
        ...(data.productId ? { product: { connect: { id: data.productId } } } : {}),
        ...(data.materialId ? { material: { connect: { id: data.materialId } } } : {}),
        ...(data.productVariantId ? { productVariant: { connect: { id: data.productVariantId } } } : {}),
        variantScopeKey: computeVariantScopeKey(data.productVariantId),
        version: data.version,
        note: data.note,
        createdBy: { connect: { id: data.createdByActorId } },
        status: 'APPROVED',
        approvedBy: { connect: { id: data.createdByActorId } },
        approvedAt: new Date(),
        effectiveDate: new Date(),
        lines: {
          create: data.lines.map((line, index) => ({
            lineType: line.lineType,
            ...(line.materialId ? { material: { connect: { id: line.materialId } } } : {}),
            ...(line.componentProductId ? { componentProduct: { connect: { id: line.componentProductId } } } : {}),
            uom: { connect: { id: line.uomId } },
            quantityMode: line.quantityMode,
            quantity: line.quantity,
            unitCost: line.unitCost != null ? new Prisma.Decimal(line.unitCost) : null,
            roundingRule: line.roundingRule ?? 'NONE',
            roundingPrecision: line.roundingPrecision ?? null,
            ...(line.departmentId ? { department: { connect: { id: line.departmentId } } } : {}),
            sequence: line.sequence ?? index,
            note: line.note ?? null
          }))
        }
      },
      include: BOM_VERSION_INCLUDE
    });
  }

  async updateHeader(
    id: string,
    data: {
      bomNumber?: string;
      note?: string | null;
      effectiveDate?: Date | null;
      status?: BomStatus;
      approvedByActorId?: string | null;
      approvedAt?: Date | null;
      supersededById?: string | null;
      validatedByActorId?: string | null;
      validatedAt?: Date | null;
    },
    client: PrismaOrTx = this.prisma
  ): Promise<BomVersion> {
    return client.bomVersion.update({ where: { id }, data });
  }

  async detachFromItem(id: string, detachedAt: Date = new Date(), client: PrismaOrTx = this.prisma): Promise<BomVersion> {
    return client.bomVersion.update({ where: { id }, data: { detachedFromItemAt: detachedAt } as any });
  }

  /**
   * Replaces a draft's entire line set transactionally. Only ever called while status === DRAFT
   * (enforced by the service layer) - an approved/pending/superseded/retired version's lines are
   * immutable, per the "prevent retrospective mutation" requirement.
   */
  async replaceLines(
    bomVersionId: string,
    lines: Array<{
      lineType: 'COMPONENT' | 'PACKAGING';
      materialId?: string | null;
      componentProductId?: string | null;
      uomId: string;
      quantityMode: 'FIXED' | 'SCALED';
      quantity: number;
      unitCost?: number | null;
      roundingRule?: 'NONE' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_NEAREST';
      roundingPrecision?: number | null;
      departmentId?: string | null;
      sequence?: number;
      note?: string | null;
    }>,
    client: PrismaOrTx = this.prisma
  ): Promise<void> {
    await client.bomLine.deleteMany({ where: { bomVersionId } });
    if (lines.length > 0) {
      await client.bomLine.createMany({
        data: lines.map((line, index) => ({
          bomVersionId,
          lineType: line.lineType,
          materialId: line.materialId ?? null,
          componentProductId: line.componentProductId ?? null,
          uomId: line.uomId,
          quantityMode: line.quantityMode,
          quantity: line.quantity,
          unitCost: line.unitCost != null ? new Prisma.Decimal(line.unitCost) : null,
          roundingRule: line.roundingRule ?? 'NONE',
          roundingPrecision: line.roundingPrecision ?? null,
          departmentId: line.departmentId ?? null,
          sequence: line.sequence ?? index,
          note: line.note ?? null
        }))
      });
    }
  }

  /**
   * Conditional status flip used as the optimistic-concurrency guard on every transition -
   * exact shape of GoodsReceiptRepository.updateStatusConditional. Only succeeds if the row is
   * currently in one of `fromStatuses`; the caller must check `count === 0` and refuse to proceed.
   */
  async updateStatusConditional(
    id: string,
    fromStatuses: BomStatus[],
    toStatus: BomStatus,
    extra?: Prisma.BomVersionUncheckedUpdateInput,
    client: PrismaOrTx = this.prisma
  ): Promise<number> {
    const { count } = await client.bomVersion.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extra }
    });
    return count;
  }

  async deleteDraft(id: string, client: PrismaOrTx = this.prisma): Promise<void> {
    // Simulation runs use RESTRICT because they are audit evidence. They are
    // safe to remove only with the draft that owns them; production plans and
    // material issues intentionally remain protected by the database.
    const version = await client.bomVersion.findUnique({
      where: { id },
      select: { productId: true, materialId: true }
    });
    if (!version) return;

    await client.bomSimulationRun.deleteMany({ where: { bomVersionId: id } });
    // Remove historical supersession pointers before deleting the version so
    // the self-relation does not leave the product BOM stuck on a stale chain.
    await client.bomVersion.updateMany({ where: { supersededById: id }, data: { supersededById: null } });
    await client.bomVersion.update({ where: { id }, data: { supersededById: null } });
    await client.bomVersion.delete({ where: { id } });

    if (version.productId) {
      const remainingVersions = await client.bomVersion.count({ where: { productId: version.productId } });
      if (remainingVersions === 0) {
        const product = await client.product.findUnique({ where: { id: version.productId }, select: { metadata: true } });
        if (product?.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)) {
          const metadata = { ...(product.metadata as Record<string, unknown>) };
          delete metadata.bomEnabled;
          delete metadata.bomLines;
          delete metadata.bomFormula;
          await client.product.update({ where: { id: version.productId }, data: { metadata: metadata as Prisma.InputJsonObject } });
        }
      }
    }
  }

  async list(params: {
    productId?: string;
    materialId?: string;
    productVariantId?: string;
    status?: BomStatus;
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<{ items: BomVersionWithLines[]; total: number }> {
    const where: any = {};
    if (params.productId && params.productId.trim() !== '' && params.productId !== 'all') {
      where.productId = params.productId.trim();
      where.detachedFromItemAt = null;
    }
    if (params.materialId && params.materialId.trim() !== '' && params.materialId !== 'all') {
      where.materialId = params.materialId.trim();
      where.detachedFromItemAt = null;
    }
    if (params.productVariantId && params.productVariantId.trim() !== '' && params.productVariantId !== 'all') {
      where.productVariantId = params.productVariantId.trim();
    }
    if (params.status && Object.values(BomStatus).includes(params.status)) {
      where.status = params.status;
    }
    if (params.search?.trim()) {
      where.OR = [
        { bomNumber: { contains: params.search.trim(), mode: 'insensitive' } },
        { note: { contains: params.search.trim(), mode: 'insensitive' } },
        { product: { is: { name: { contains: params.search.trim(), mode: 'insensitive' } } } },
        { product: { is: { sku: { contains: params.search.trim(), mode: 'insensitive' } } } },
        { material: { is: { name: { contains: params.search.trim(), mode: 'insensitive' } } } },
        { material: { is: { code: { contains: params.search.trim(), mode: 'insensitive' } } } }
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.bomVersion.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: BOM_VERSION_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
      }),
      this.prisma.bomVersion.count({ where })
    ]);
    return { items, total };
  }

  /**
   * Every APPROVED bom-line component-product edge in the system, used to build the
   * cycle-detection graph. Only APPROVED versions count as "live" - a DRAFT sub-assembly's
   * hypothetical cycle isn't real yet and could still change before it's ever approved.
   */
  async findApprovedComponentEdges(): Promise<Array<{ productId: string; componentProductId: string }>> {
    const rows = await this.prisma.bomLine.findMany({
      where: { componentProductId: { not: null }, bomVersion: { status: 'APPROVED', detachedFromItemAt: null } } as any,
      select: { componentProductId: true, bomVersion: { select: { productId: true } } }
    });
    return rows.filter((row) => row.bomVersion.productId).map((row) => ({ productId: row.bomVersion.productId!, componentProductId: row.componentProductId as string }));
  }

  async findApprovedMaterialEdges(): Promise<Array<{ materialId: string; componentMaterialId: string }>> {
    const rows = await this.prisma.bomLine.findMany({
      where: {
        materialId: { not: null },
        bomVersion: { status: 'APPROVED', materialId: { not: null }, detachedFromItemAt: null },
      } as any,
      select: { materialId: true, bomVersion: { select: { materialId: true } } },
    });
    return rows
      .filter((row) => row.bomVersion.materialId)
      .map((row) => ({ materialId: row.bomVersion.materialId!, componentMaterialId: row.materialId! }));
  }
}
