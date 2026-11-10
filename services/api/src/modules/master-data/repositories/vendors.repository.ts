import { PrismaClient, Prisma, Vendor, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class VendorsRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({ where: { id } });
  }

  async findByCode(code: string): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({ where: { code } });
  }

  async findByName(name: string): Promise<Pick<Vendor, 'id' | 'name'> | null> {
    return this.prisma.vendor.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true, name: true },
    });
  }

  async list(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
    activeOnly?: boolean;
  }): Promise<{ items: Vendor[]; total: number }> {
    const where: Prisma.VendorWhereInput = {};
    if (params?.activeOnly) where.status = { in: ['ACTIVE', 'APPROVED'] };
    else if (params?.status === 'ACTIVE') where.status = { in: ['ACTIVE', 'APPROVED'] };
    else if (params?.status === 'DRAFT') where.status = { in: ['DRAFT', 'PENDING_VALIDATION'] };
    else if (params?.status === 'INACTIVE') where.status = 'INACTIVE';
    else if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { contactEmail: { contains: params.search, mode: 'insensitive' } },
        { taxNumber: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.vendor.count({ where })
    ]);
    return { items, total };
  }

  async create(data: Prisma.VendorCreateInput): Promise<Vendor> {
    return this.prisma.vendor.create({ data });
  }

  async update(id: string, data: Prisma.VendorUpdateInput): Promise<Vendor> {
    return this.prisma.vendor.update({ where: { id }, data });
  }

  async supersede(oldId: string, newVendorData: Prisma.VendorCreateInput): Promise<{ oldVendor: Vendor; newVendor: Vendor }> {
    return this.prisma.$transaction(async (tx) => {
      const newVendor = await tx.vendor.create({ data: newVendorData });
      const oldVendor = await tx.vendor.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newVendor.id,
          deactivatedAt: new Date()
        }
      });
      return { oldVendor, newVendor };
    });
  }

  // Transactional module reference hook (for Module 2 Procurement)
  async countActiveTransactionalReferences(_vendorId: string): Promise<number> {
    // STUB: Replace when Module 2 (Purchase Orders / Procurement) is connected
    return 0;
  }
}
