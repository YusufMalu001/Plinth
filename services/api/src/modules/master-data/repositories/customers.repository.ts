import { PrismaClient, Prisma, Customer, LifecycleStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';

export class CustomersRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  async findByCode(code: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { code } });
  }

  async list(params?: {
    status?: LifecycleStatus;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: Customer[]; total: number }> {
    const where: Prisma.CustomerWhereInput = {};
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { contactEmail: { contains: params.search, mode: 'insensitive' } },
        { taxNumber: { contains: params.search, mode: 'insensitive' } }
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: params?.skip,
        take: params?.take,
        orderBy: { name: 'asc' }
      }),
      this.prisma.customer.count({ where })
    ]);
    return { items, total };
  }

  async create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  async update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async supersede(oldId: string, newCustomerData: Prisma.CustomerCreateInput): Promise<{ oldCustomer: Customer; newCustomer: Customer }> {
    return this.prisma.$transaction(async (tx) => {
      const newCustomer = await tx.customer.create({ data: newCustomerData });
      const oldCustomer = await tx.customer.update({
        where: { id: oldId },
        data: {
          status: 'SUPERSEDED',
          supersededById: newCustomer.id,
          deactivatedAt: new Date()
        }
      });
      return { oldCustomer, newCustomer };
    });
  }

  // Transactional module reference hook (for Module 15 Sales Orders)
  async countActiveTransactionalReferences(_customerId: string): Promise<number> {
    // STUB: Replace when Module 15 (Sales Orders) is connected
    return 0;
  }
}
