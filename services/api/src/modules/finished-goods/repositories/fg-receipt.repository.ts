import { PrismaClient, Prisma, FgPackagingStatus, FgReceiptStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { inventoryPostingService } from '../../inventory/services/inventory-posting.service';

export class FgReceiptRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  // 1. Ready Outputs
  async createReadyOutput(data: {
    outputNumber: string;
    assemblyBatchId?: string | null;
    productId: string;
    productVariantId?: string | null;
    quantity: number;
    uomId: string;
    qcInspectionResultId?: string | null;
    notes?: string | null;
  }) {
    return this.prisma.fgReadyOutput.create({
      data: {
        outputNumber: data.outputNumber,
        assemblyBatchId: data.assemblyBatchId,
        productId: data.productId,
        productVariantId: data.productVariantId,
        quantity: new Prisma.Decimal(data.quantity),
        uomId: data.uomId,
        qcInspectionResultId: data.qcInspectionResultId,
        notes: data.notes,
        packagingRecord: {
          create: {
            status: 'NOT_PACKED',
            updatedByActorId: 'system'
          }
        }
      },
      include: {
        product: { include: { uom: true } },
        uom: true,
        assemblyBatch: true,
        qcInspectionResult: true,
        packagingRecord: true,
        fgReceipt: true
      }
    });
  }

  async findReadyOutputById(id: string) {
    return this.prisma.fgReadyOutput.findUnique({
      where: { id },
      include: {
        product: { include: { uom: true } },
        uom: true,
        assemblyBatch: {
          include: {
            components: {
              include: {
                sourceBatch: { include: { department: true } },
                materialIssueLine: { include: { material: true } }
              }
            }
          }
        },
        qcInspectionResult: true,
        packagingRecord: {
          include: { stagedLocation: true }
        },
        fgReceipt: true
      }
    });
  }

  async listReadyOutputs(params: {
    productId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.FgReadyOutputWhereInput = {};
    if (params.productId) where.productId = params.productId;

    const [items, total] = await Promise.all([
      this.prisma.fgReadyOutput.findMany({
        where,
        skip: params.skip || 0,
        take: params.take || 50,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { include: { uom: true } },
          uom: true,
          assemblyBatch: true,
          qcInspectionResult: true,
          packagingRecord: true,
          fgReceipt: true
        }
      }),
      this.prisma.fgReadyOutput.count({ where })
    ]);

    return { items, total };
  }

  // 2. Packaging Records
  async updatePackagingRecord(outputId: string, actorId: string, data: {
    status: FgPackagingStatus;
    packNotes?: string | null;
    stagedLocationId?: string | null;
  }) {
    return this.prisma.fgPackagingRecord.upsert({
      where: { fgReadyOutputId: outputId },
      update: {
        status: data.status,
        packNotes: data.packNotes,
        stagedLocationId: data.stagedLocationId,
        updatedByActorId: actorId
      },
      create: {
        fgReadyOutputId: outputId,
        status: data.status,
        packNotes: data.packNotes,
        stagedLocationId: data.stagedLocationId,
        updatedByActorId: actorId
      },
      include: {
        stagedLocation: true,
        fgReadyOutput: true
      }
    });
  }

  // 3. FG Receipts
  async findReceiptById(id: string) {
    return this.prisma.fgReceipt.findUnique({
      where: { id },
      include: {
        product: { include: { uom: true } },
        location: true,
        uom: true,
        receivedByActor: true,
        heldByActor: true,
        releasedByActor: true,
        fgReadyOutput: {
          include: {
            assemblyBatch: {
              include: {
                components: {
                  include: {
                    sourceBatch: { include: { department: true } },
                    materialIssueLine: { include: { material: true } }
                  }
                }
              }
            },
            qcInspectionResult: true,
            packagingRecord: true
          }
        }
      }
    });
  }

  async findReceiptByReadyOutputId(fgReadyOutputId: string) {
    return this.prisma.fgReceipt.findUnique({
      where: { fgReadyOutputId }
    });
  }

  async listReceipts(params: {
    productId?: string;
    locationId?: string;
    status?: FgReceiptStatus;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.FgReceiptWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.locationId) where.locationId = params.locationId;
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.fgReceipt.findMany({
        where,
        skip: params.skip || 0,
        take: params.take || 50,
        orderBy: { receivedAt: 'desc' },
        include: {
          product: { include: { uom: true } },
          location: true,
          uom: true,
          receivedByActor: true,
          heldByActor: true,
          releasedByActor: true,
          fgReadyOutput: true
        }
      }),
      this.prisma.fgReceipt.count({ where })
    ]);

    return { items, total };
  }

  // 4. Atomic FG Receipt Transaction (Posts to StockLedgerEntry & StockBalance)
  async executeFgReceiptTransaction(data: {
    receiptNumber: string;
    fgReadyOutputId: string;
    productId: string;
    productVariantId?: string | null;
    locationId: string;
    quantity: number;
    uomId: string;
    actorId: string;
    notes?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // a. Check duplicate
      const existing = await tx.fgReceipt.findUnique({
        where: { fgReadyOutputId: data.fgReadyOutputId }
      });
      if (existing) {
        throw new Error(`FG Receipt already exists for ready output '${data.fgReadyOutputId}'`);
      }

      // b. Create FgReceipt
      const receipt = await tx.fgReceipt.create({
        data: {
          receiptNumber: data.receiptNumber,
          fgReadyOutputId: data.fgReadyOutputId,
          productId: data.productId,
          productVariantId: data.productVariantId,
          locationId: data.locationId,
          quantity: data.quantity,
          uomId: data.uomId,
          status: 'RECEIVED',
          receivedByActorId: data.actorId
        },
        include: {
          product: true,
          location: true,
          uom: true,
          receivedByActor: true,
          fgReadyOutput: true
        }
      });

      // c. Post StockLedgerEntry (Legacy)
      await tx.stockLedgerEntry.create({
        data: {
          productId: data.productId,
          locationId: data.locationId,
          uomId: data.uomId,
          quantity: data.quantity,
          direction: 'IN',
          entryType: 'GRN_RECEIPT',
          postedByActorId: data.actorId,
          note: data.notes || `FG Receipt [${data.receiptNumber}] from output [${data.fgReadyOutputId}]`
        }
      });

      // d. Post Modern Inventory Ledger & Balances
      try {
        await inventoryPostingService.post(tx, {
          itemType: 'PRODUCT',
          itemId: data.productId,
          uomId: data.uomId,
          locationId: data.locationId,
          movementType: 'RECEIPT',
          quantity: data.quantity,
          condition: 'AVAILABLE',
          ownership: 'COMPANY',
          sourceType: 'FG_RECEIPT',
          sourceId: receipt.id,
          idempotencyKey: `FG_RECEIPT_POST:${receipt.id}:${data.receiptNumber}`,
          actorId: data.actorId,
          correlationId: data.fgReadyOutputId
        });
      } catch (modernPostErr) {
        console.warn('[executeFgReceiptTransaction] Modern ledger post note:', modernPostErr);
      }

      // e. Upsert StockBalance atomically
      const itemKey = `PRODUCT:${data.productId}`;
      await tx.stockBalance.upsert({
        where: {
          itemKey_uomId_locationId_ownership: {
            itemKey,
            uomId: data.uomId,
            locationId: data.locationId,
            ownership: 'OWNED'
          }
        },
        update: {
          onHandQuantity: { increment: data.quantity }
        },
        create: {
          itemKey,
          productId: data.productId,
          uomId: data.uomId,
          locationId: data.locationId,
          ownership: 'OWNED',
          onHandQuantity: data.quantity,
          reservedQuantity: 0
        }
      });

      return receipt;
    });
  }

  async updateReceiptStatus(id: string, data: {
    status: FgReceiptStatus;
    holdReason?: string | null;
    heldAt?: Date | null;
    heldByActorId?: string | null;
    releasedAt?: Date | null;
    releasedByActorId?: string | null;
  }) {
    return this.prisma.fgReceipt.update({
      where: { id },
      data,
      include: {
        product: true,
        location: true,
        uom: true,
        receivedByActor: true,
        heldByActor: true,
        releasedByActor: true,
        fgReadyOutput: true
      }
    });
  }

  async countActiveReservationsForProduct(productId: string, locationId: string): Promise<number> {
    return this.prisma.stockReservation.count({
      where: {
        productId,
        locationId,
        status: 'ACTIVE'
      }
    });
  }
}
