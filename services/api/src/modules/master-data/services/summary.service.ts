import { prisma } from '../../../database';
import { LifecycleStatus } from '@synergy/types';

export interface EntitySummary {
  entityType: string;
  statusCounts: Record<LifecycleStatus, number>;
  total: number;
}

export class SummaryService {
  async getOverviewSummary(): Promise<EntitySummary[]> {
    // Array of queries to run in parallel
    const entities = [
      // Product & Materials
      { type: 'Product', table: prisma.product },
      { type: 'Material', table: prisma.material },
      { type: 'Category', table: prisma.category },
      { type: 'ProductFamily', table: prisma.productFamily },
      
      // Suppliers & Customers
      { type: 'Vendor', table: prisma.vendor },
      { type: 'Customer', table: prisma.customer },
      
      // Operations & Org
      { type: 'Factory', table: prisma.factory },
      { type: 'WarehouseLocation', table: prisma.warehouseLocation },
      
      // Quality & Routing
      { type: 'QcRule', table: prisma.qcRule },
      { type: 'ProductRoute', table: prisma.productRoute }
    ];

    const results = await Promise.all(
      entities.map(async (entity) => {
        // Use groupBy on the status field
        // @ts-expect-error: Prisma dynamic model access is tricky to type strictly here
        const grouped = await entity.table.groupBy({
          by: ['status'],
          _count: { status: true }
        });

        const statusCounts: Record<LifecycleStatus, number> = {
          DRAFT: 0,
          PENDING_VALIDATION: 0,
          APPROVED: 0,
          ACTIVE: 0,
          INACTIVE: 0,
          SUPERSEDED: 0
        };

        let total = 0;
        for (const group of grouped) {
          const count = group._count.status;
          statusCounts[group.status as LifecycleStatus] = count;
          total += count;
        }

        return {
          entityType: entity.type,
          statusCounts,
          total
        };
      })
    );

    return results;
  }
}
