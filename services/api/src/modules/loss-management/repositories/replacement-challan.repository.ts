import {
  PrismaClient,
  Prisma
} from '@prisma/client';

export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface CreateReplacementChallanInput {
  challanNumber: string;
  lossEventId: string;
  materialId?: string | null;
  productId?: string | null;
  uomId: string;
  quantity: Prisma.Decimal | number;
  dispatchLocationId: string;
  targetDepartmentId?: string | null;
  targetVendorId?: string | null;
  notes?: string | null;
  issuedByActorId: string;
}

const REPLACEMENT_CHALLAN_INCLUDE = {
  material: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, sku: true, name: true } },
  uom: { select: { id: true, code: true, symbol: true } },
  dispatchLocation: { select: { id: true, code: true, name: true } },
  targetDepartment: { select: { id: true, code: true, name: true } },
  targetVendor: { select: { id: true, name: true } },
  issuedByActor: { select: { id: true, name: true, email: true } },
  acknowledgedByActor: { select: { id: true, name: true, email: true } },
  lossEvent: { select: { id: true, lossNumber: true, status: true, quantity: true } }
} satisfies Prisma.ReplacementChallanInclude;

export type ReplacementChallanWithRelations = Prisma.ReplacementChallanGetPayload<{
  include: typeof REPLACEMENT_CHALLAN_INCLUDE;
}>;

export class ReplacementChallanRepository {
  constructor(private readonly prisma: PrismaOrTx) {}

  async create(data: CreateReplacementChallanInput, client: PrismaOrTx = this.prisma): Promise<ReplacementChallanWithRelations> {
    return client.replacementChallan.create({
      data: {
        challanNumber: data.challanNumber,
        lossEventId: data.lossEventId,
        materialId: data.materialId ?? null,
        productId: data.productId ?? null,
        uomId: data.uomId,
        quantity: new Prisma.Decimal(data.quantity),
        dispatchLocationId: data.dispatchLocationId,
        targetDepartmentId: data.targetDepartmentId ?? null,
        targetVendorId: data.targetVendorId ?? null,
        notes: data.notes ?? null,
        issuedByActorId: data.issuedByActorId
      },
      include: REPLACEMENT_CHALLAN_INCLUDE
    });
  }

  async findById(id: string, client: PrismaOrTx = this.prisma): Promise<ReplacementChallanWithRelations | null> {
    return client.replacementChallan.findUnique({
      where: { id },
      include: REPLACEMENT_CHALLAN_INCLUDE
    });
  }

  async findByLossEventId(lossEventId: string, client: PrismaOrTx = this.prisma): Promise<ReplacementChallanWithRelations | null> {
    return client.replacementChallan.findUnique({
      where: { lossEventId },
      include: REPLACEMENT_CHALLAN_INCLUDE
    });
  }

  async findByChallanNumber(challanNumber: string, client: PrismaOrTx = this.prisma): Promise<ReplacementChallanWithRelations | null> {
    return client.replacementChallan.findUnique({
      where: { challanNumber },
      include: REPLACEMENT_CHALLAN_INCLUDE
    });
  }

  async existsByNumber(challanNumber: string, client: PrismaOrTx = this.prisma): Promise<boolean> {
    const count = await client.replacementChallan.count({ where: { challanNumber } });
    return count > 0;
  }

  async countByNumberPrefix(prefix: string, client: PrismaOrTx = this.prisma): Promise<number> {
    return client.replacementChallan.count({
      where: {
        challanNumber: {
          startsWith: prefix
        }
      }
    });
  }

  async acknowledge(
    id: string,
    actorId: string,
    acknowledgedAt: Date = new Date(),
    client: PrismaOrTx = this.prisma
  ): Promise<ReplacementChallanWithRelations> {
    return client.replacementChallan.update({
      where: { id },
      data: {
        acknowledgedByActorId: actorId,
        acknowledgedAt
      },
      include: REPLACEMENT_CHALLAN_INCLUDE
    });
  }
}
