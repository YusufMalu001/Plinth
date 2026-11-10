import { PrismaClient, Prisma, UnitOfMeasure, UomConversion, PackSize, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class UomRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // ==========================================
  // UnitOfMeasure Operations
  // ==========================================
  async findUomById(id: string): Promise<UnitOfMeasure | null> {
    return this.prisma.unitOfMeasure.findUnique({ where: { id } });
  }

  async findUomByCode(code: string): Promise<UnitOfMeasure | null> {
    return this.prisma.unitOfMeasure.findUnique({ where: { code } });
  }

  async listUoms(params?: {
    status?: LifecycleStatus;
    dimension?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: UnitOfMeasure[]; total: number }> {
    const where: Prisma.UnitOfMeasureWhereInput = {};
    if (params?.status) where.status = params.status;
    if (params?.dimension) where.dimension = params.dimension;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { symbol: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.unitOfMeasure.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { code: 'asc' }
      }),
      this.prisma.unitOfMeasure.count({ where })
    ]);
    return { items, total };
  }

  async createUom(data: Prisma.UnitOfMeasureCreateInput): Promise<UnitOfMeasure> {
    return this.prisma.unitOfMeasure.create({ data });
  }

  async updateUom(id: string, data: Prisma.UnitOfMeasureUpdateInput): Promise<UnitOfMeasure> {
    return this.prisma.unitOfMeasure.update({ where: { id }, data });
  }

  async countUomActiveReferences(uomId: string): Promise<{
    products: number;
    materials: number;
    conversions: number;
    packSizes: number;
  }> {
    const activeStatuses: LifecycleStatus[] = ['APPROVED', 'ACTIVE'];
    const [products, materials, conversionsFrom, conversionsTo, packSizes] = await Promise.all([
      this.prisma.product.count({ where: { uomId, status: { in: activeStatuses } } }),
      this.prisma.material.count({ where: { uomId, status: { in: activeStatuses } } }),
      this.prisma.uomConversion.count({ where: { fromUomId: uomId, status: { in: activeStatuses } } }),
      this.prisma.uomConversion.count({ where: { toUomId: uomId, status: { in: activeStatuses } } }),
      this.prisma.packSize.count({ where: { uomId, status: { in: activeStatuses } } })
    ]);
    return {
      products,
      materials,
      conversions: conversionsFrom + conversionsTo,
      packSizes
    };
  }

  // ==========================================
  // UomConversion Operations
  // ==========================================
  async findConversionById(id: string): Promise<UomConversion | null> {
    return this.prisma.uomConversion.findUnique({
      where: { id },
      include: { fromUom: true, toUom: true }
    });
  }

  async findActiveConversions(): Promise<UomConversion[]> {
    return this.prisma.uomConversion.findMany({
      where: { status: { in: ['APPROVED', 'ACTIVE'] } },
      include: { fromUom: true, toUom: true }
    });
  }

  /**
   * As-of-date resolution for a direct fromUom->toUom conversion. Includes SUPERSEDED rows (not
   * just APPROVED/ACTIVE) because supersession never mutates a row's own effectiveDate -
   * excluding them would make this resolver only answer "what's effective now," not "what was in
   * force on a past date," which BOM's historical reproducibility requirement depends on.
   * INACTIVE is deliberately excluded: a row deactivated outright (as opposed to superseded by a
   * replacement) may have been pulled for being wrong, not merely out of date.
   */
  async findEffectiveConversion(fromUomId: string, toUomId: string, date: Date): Promise<UomConversion | null> {
    return this.prisma.uomConversion.findFirst({
      where: {
        fromUomId,
        toUomId,
        status: { in: ['APPROVED', 'ACTIVE', 'SUPERSEDED'] },
        effectiveDate: { lte: date }
      },
      orderBy: { effectiveDate: 'desc' }
    });
  }

  async listConversions(params?: {
    fromUomId?: string;
    toUomId?: string;
    status?: LifecycleStatus;
    skip?: number;
    take?: number;
  }): Promise<{ items: UomConversion[]; total: number }> {
    const where: Prisma.UomConversionWhereInput = {};
    if (params?.fromUomId) where.fromUomId = params.fromUomId;
    if (params?.toUomId) where.toUomId = params.toUomId;
    if (params?.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.uomConversion.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { fromUom: true, toUom: true },
        orderBy: { effectiveDate: 'desc' }
      }),
      this.prisma.uomConversion.count({ where })
    ]);
    return { items, total };
  }

  async createConversion(data: Prisma.UomConversionCreateInput): Promise<UomConversion> {
    return this.prisma.uomConversion.create({ data, include: { fromUom: true, toUom: true } });
  }

  async updateConversion(id: string, data: Prisma.UomConversionUpdateInput): Promise<UomConversion> {
    return this.prisma.uomConversion.update({ where: { id }, data, include: { fromUom: true, toUom: true } });
  }

  async supersedeConversion(oldId: string, newConversionData: Prisma.UomConversionCreateInput): Promise<{ oldConversion: UomConversion; newConversion: UomConversion }> {
    return this.prisma.$transaction(async (tx) => {
      const newConversion = await tx.uomConversion.create({ data: newConversionData, include: { fromUom: true, toUom: true } });
      const oldConversion = await tx.uomConversion.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newConversion.id,
          deactivatedAt: new Date()
        },
        include: { fromUom: true, toUom: true }
      });
      return { oldConversion, newConversion };
    });
  }

  // ==========================================
  // PackSize Operations
  // ==========================================
  async findPackSizeById(id: string): Promise<PackSize | null> {
    return this.prisma.packSize.findUnique({
      where: { id },
      include: { material: true, uom: true }
    });
  }

  async listPackSizes(params?: {
    materialId?: string;
    status?: LifecycleStatus;
    skip?: number;
    take?: number;
  }): Promise<{ items: PackSize[]; total: number }> {
    const where: Prisma.PackSizeWhereInput = {};
    if (params?.materialId) where.materialId = params.materialId;
    if (params?.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.packSize.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { material: true, uom: true },
        orderBy: { effectiveDate: 'desc' }
      }),
      this.prisma.packSize.count({ where })
    ]);
    return { items, total };
  }

  async createPackSize(data: Prisma.PackSizeCreateInput): Promise<PackSize> {
    return this.prisma.packSize.create({ data, include: { material: true, uom: true } });
  }

  async updatePackSize(id: string, data: Prisma.PackSizeUpdateInput): Promise<PackSize> {
    return this.prisma.packSize.update({ where: { id }, data, include: { material: true, uom: true } });
  }

  async supersedePackSize(oldId: string, newPackSizeData: Prisma.PackSizeCreateInput): Promise<{ oldPackSize: PackSize; newPackSize: PackSize }> {
    return this.prisma.$transaction(async (tx) => {
      const newPackSize = await tx.packSize.create({ data: newPackSizeData, include: { material: true, uom: true } });
      const oldPackSize = await tx.packSize.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newPackSize.id,
          deactivatedAt: new Date()
        },
        include: { material: true, uom: true }
      });
      return { oldPackSize, newPackSize };
    });
  }
}
