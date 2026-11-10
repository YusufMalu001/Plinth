import { PrismaClient, Prisma, Material, MaterialType, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class MaterialsRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string): Promise<Material | null> {
    return this.prisma.material.findUnique({
      where: { id },
      include: { category: true, uom: true, packSizes: true, wastageRules: true }
    });
  }

  async findByCode(code: string): Promise<Material | null> {
    return this.prisma.material.findUnique({ where: { code } });
  }

  async findInventoryNameConflict(
    name: string,
    current?: { entity: 'PRODUCT' | 'MATERIAL'; id: string }
  ): Promise<{ id: string; name: string } | null> {
    const [products, material] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          name: { equals: name, mode: 'insensitive' },
          status: { notIn: ['INACTIVE', 'SUPERSEDED'] },
          ...(current?.entity === 'PRODUCT' ? { id: { not: current.id } } : {}),
        },
        select: { id: true, name: true, metadata: true },
      }),
      this.prisma.material.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          status: { notIn: ['INACTIVE', 'SUPERSEDED'] },
          // Variant names are scoped to their parent material, not the global catalog.
          NOT: { specs: { path: ['isVariant'], equals: true } },
          ...(current?.entity === 'MATERIAL' ? { id: { not: current.id } } : {}),
        },
        select: { id: true, name: true },
      }),
    ]);
    const product = products.find((candidate) =>
      (candidate.metadata as any)?.isVariant !== true &&
      !(candidate.metadata as any)?.parentProductId
    ) || null;
    return product || material;
  }

  async list(params?: {
    materialType?: MaterialType;
    categoryId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Material[]; total: number }> {
    const where: Prisma.MaterialWhereInput = {};
    if (params?.materialType) where.materialType = params.materialType;
    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: { category: true, uom: true },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.material.count({ where })
    ]);
    return { items, total };
  }

  async create(data: Prisma.MaterialCreateInput): Promise<Material> {
    return this.prisma.material.create({ data });
  }

  async update(id: string, data: Prisma.MaterialUpdateInput): Promise<Material> {
    return this.prisma.material.update({ where: { id }, data });
  }

  async supersede(oldId: string, newMaterialData: Prisma.MaterialCreateInput): Promise<{ oldMaterial: Material; newMaterial: Material }> {
    return this.prisma.$transaction(async (tx) => {
      const newMaterial = await tx.material.create({ data: newMaterialData });
      const oldMaterial = await tx.material.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newMaterial.id,
          deactivatedAt: new Date()
        }
      });
      return { oldMaterial, newMaterial };
    });
  }

  async countActiveReferences(materialId: string): Promise<{
    packSizes: number;
    wastageRules: number;
  }> {
    const [packSizes, wastageRules] = await Promise.all([
      this.prisma.packSize.count({
        where: { materialId, status: { in: ['APPROVED', 'ACTIVE'] } }
      }),
      this.prisma.wastageRule.count({
        where: { materialId, status: { in: ['APPROVED', 'ACTIVE'] } }
      })
    ]);
    return { packSizes, wastageRules };
  }
}
