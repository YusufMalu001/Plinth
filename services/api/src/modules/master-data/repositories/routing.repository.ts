import { PrismaClient, Prisma, ProductRoute, RouteStep, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { ConflictError } from '../../../common/errors/AppError';

export class RoutingRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private async assertNameAvailableForWrite(
    tx: Prisma.TransactionClient,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
    const existing = await tx.productRoute.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'SUPERSEDED' },
        ...(excludeId ? { id: { not: excludeId } } : {})
      }
    });
    if (existing) throw new ConflictError(`A production route named "${name}" already exists. Choose a different name.`);
  }

  // ==========================================
  // ProductRoute Operations
  // ==========================================
  async findRouteById(id: string): Promise<(ProductRoute & { steps: (RouteStep & { workCenter: unknown; department: unknown; nextDepartment: unknown; qcRule: unknown })[] }) | null> {
    return this.prisma.productRoute.findUnique({
      where: { id },
      include: {
        steps: {
          include: { workCenter: true, department: true, nextDepartment: true, qcRule: true },
          orderBy: [{ branchKey: 'asc' }, { stepOrder: 'asc' }, { sequenceNumber: 'asc' }]
        },
        materialAllocations: true,
        assemblyDepartment: true,
        bomVersion: { include: { lines: { include: { material: true, componentProduct: true, uom: true } } } },
        product: true,
        material: true,
        productVariant: true
      }
    });
  }

  async findRouteByCode(code: string): Promise<ProductRoute | null> {
    return this.prisma.productRoute.findUnique({ where: { code } });
  }

  async findCurrentRouteByName(name: string, excludeId?: string): Promise<ProductRoute | null> {
    return this.prisma.productRoute.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'SUPERSEDED' },
        ...(excludeId ? { id: { not: excludeId } } : {})
      }
    });
  }

  async listRoutes(params?: {
    productId?: string;
    materialId?: string;
    productVariantId?: string;
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: ProductRoute[]; total: number }> {
    const where: Prisma.ProductRouteWhereInput = {};
    const filters: Prisma.ProductRouteWhereInput[] = [];
    // A route without a product is an intentional generic route and may be
    // selected for any product in Production Planning.
    if (params?.productId) filters.push({ OR: [{ productId: params.productId }, { productId: null }] });
    if (params?.materialId) filters.push({ AND: [{ OR: [{ materialId: params.materialId }, { materialId: null }] }, { productId: null }] });
    if (params?.productVariantId) where.productVariantId = params.productVariantId;
    if (params?.status) where.status = params.status;
    if (params?.search) {
      filters.push({ OR: [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } }
      ] });
    }
    if (filters.length) where.AND = filters;
    const [items, total] = await Promise.all([
      this.prisma.productRoute.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        include: {
          steps: {
            include: { workCenter: true, department: true },
            orderBy: [{ branchKey: 'asc' }, { stepOrder: 'asc' }, { sequenceNumber: 'asc' }],
          },
          materialAllocations: true,
          assemblyDepartment: true,
          product: true,
          material: true,
          productVariant: true
        },
        orderBy: { effectiveFrom: 'desc' }
      }),
      this.prisma.productRoute.count({ where })
    ]);
    return { items, total };
  }

  async createRoute(data: Prisma.ProductRouteCreateInput): Promise<ProductRoute> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameAvailableForWrite(tx, data.name);
      return tx.productRoute.create({ data });
    });
  }

  async updateRoute(id: string, data: Prisma.ProductRouteUpdateInput): Promise<ProductRoute> {
    if (typeof data.name !== 'string') return this.prisma.productRoute.update({ where: { id }, data });
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameAvailableForWrite(tx, data.name as string, id);
      return tx.productRoute.update({ where: { id }, data });
    });
  }

  async supersedeRoute(
    oldId: string,
    newRouteData: Prisma.ProductRouteCreateInput,
    options: { skipNameUniqueness?: boolean } = {}
  ): Promise<{ oldRoute: ProductRoute; newRoute: ProductRoute }> {
    return this.prisma.$transaction(async (tx) => {
      if (!options.skipNameUniqueness) {
        await this.assertNameAvailableForWrite(tx, newRouteData.name, oldId);
      }
      const newRoute = await tx.productRoute.create({ data: newRouteData });
      const oldRoute = await tx.productRoute.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newRoute.id,
          deactivatedAt: new Date()
        }
      });
      return { oldRoute, newRoute };
    });
  }

  async findEffectiveRoute(productId: string, date: Date, variantId?: string): Promise<ProductRoute | null> {
    return this.prisma.productRoute.findFirst({
      where: {
        productId,
        ...(variantId ? { productVariantId: variantId } : {}),
        status: { in: ['APPROVED', 'ACTIVE'] },
        effectiveFrom: { lte: date },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: date } }
        ]
      },
      include: {
        steps: { orderBy: { sequenceNumber: 'asc' } }
      },
      orderBy: { effectiveFrom: 'desc' }
    });
  }

  // ==========================================
  // RouteStep Operations
  // ==========================================
  async addRouteStep(data: Prisma.RouteStepCreateInput): Promise<RouteStep> {
    return this.prisma.routeStep.create({ data });
  }

  async updateRouteStep(id: string, data: Prisma.RouteStepUpdateInput): Promise<RouteStep> {
    return this.prisma.routeStep.update({ where: { id }, data });
  }

  async deleteRouteStep(id: string): Promise<RouteStep> {
    return this.prisma.routeStep.delete({ where: { id } });
  }

  async listStepsByRoute(routeId: string): Promise<RouteStep[]> {
    return this.prisma.routeStep.findMany({
      where: { routeId },
      orderBy: { sequenceNumber: 'asc' }
    });
  }
}
