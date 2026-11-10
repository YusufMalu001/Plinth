import { describe, it, expect } from 'vitest';
import type { DepartmentExecutionBatch } from '../types';
import { isProductionExecutionDepartment } from '../types';

describe('Production Execution Sorting, Department Filtering & Pagination', () => {
  const mockBatches: DepartmentExecutionBatch[] = ([
    {
      id: 'batch-1',
      batchNumber: 'BATCH-2026-0001',
      productionPlanId: 'plan-1',
      departmentId: 'dept-cut',
      status: 'AWAITING_RECEIPT',
      stageSequenceNumber: 1,
      received_qty: '100',
      completed_qty: '0',
      scrap_qty: '0',
      rejected_qty: '0',
      wastage_qty: '0',
      pending_qty: '100',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      department: { id: 'dept-cut', code: 'CUTTING', name: 'Cutting & Prep' },
      productionPlan: {
        id: 'plan-1',
        planNumber: 'PLAN-001',
        product: { id: 'prod-1', sku: 'SKU-CS12', name: 'Cloth Stand CS12', uom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs' } }
      }
    },
    {
      id: 'batch-2',
      batchNumber: 'BATCH-2026-0002',
      productionPlanId: 'plan-2',
      departmentId: 'dept-fab',
      status: 'IN_PROGRESS',
      stageSequenceNumber: 2,
      received_qty: '100',
      completed_qty: '50',
      scrap_qty: '2',
      rejected_qty: '0',
      wastage_qty: '0',
      pending_qty: '48',
      createdAt: '2026-03-02T10:00:00.000Z',
      updatedAt: '2026-03-02T12:00:00.000Z',
      department: { id: 'dept-fab', code: 'FABRICATION', name: 'Fabrication Line' },
      productionPlan: {
        id: 'plan-2',
        planNumber: 'PLAN-002',
        product: { id: 'prod-2', sku: 'SKU-CS10', name: 'Cloth Stand CS10', uom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs' } }
      }
    },
    {
      id: 'batch-3',
      batchNumber: 'BATCH-2026-0003',
      productionPlanId: 'plan-3',
      departmentId: 'dept-cut',
      status: 'COMPLETE',
      stageSequenceNumber: 1,
      received_qty: '50',
      completed_qty: '50',
      scrap_qty: '0',
      rejected_qty: '0',
      wastage_qty: '0',
      pending_qty: '0',
      createdAt: '2026-03-03T08:00:00.000Z',
      updatedAt: '2026-03-03T14:00:00.000Z',
      department: { id: 'dept-cut', code: 'CUTTING', name: 'Cutting & Prep' },
      productionPlan: {
        id: 'plan-3',
        planNumber: 'PLAN-003',
        product: { id: 'prod-1', sku: 'SKU-CS12', name: 'Cloth Stand CS12', uom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs' } }
      }
    },
    {
      id: 'batch-4',
      batchNumber: 'BATCH-2026-0004',
      productionPlanId: 'plan-4',
      departmentId: 'dept-qa',
      status: 'ASSIGNED',
      stageSequenceNumber: 3,
      received_qty: '80',
      completed_qty: '20',
      scrap_qty: '0',
      rejected_qty: '0',
      wastage_qty: '0',
      pending_qty: '60',
      createdAt: '2026-03-04T09:00:00.000Z',
      updatedAt: '2026-03-04T11:00:00.000Z',
      department: { id: 'dept-qa', code: 'QA', name: 'Quality Assurance' },
      productionPlan: {
        id: 'plan-4',
        planNumber: 'PLAN-004',
        product: { id: 'prod-3', sku: 'SKU-CS8', name: 'Cloth Stand CS8', uom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs' } }
      }
    }
  ] as unknown) as DepartmentExecutionBatch[];

  function filterAndSort(
    batches: DepartmentExecutionBatch[],
    opts: {
      queueTab?: 'all' | 'awaiting' | 'active' | 'handover';
      statusFilter?: string;
      deptFilter?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      sortBy?: string;
    }
  ) {
    let result = [...batches];

    if (opts.queueTab === 'awaiting') {
      result = result.filter((b) => b.status === 'AWAITING_RECEIPT');
    } else if (opts.queueTab === 'active') {
      result = result.filter((b) =>
        ['RECEIVED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'PARTIAL', 'REWORK'].includes(b.status)
      );
    } else if (opts.queueTab === 'handover') {
      result = result.filter((b) =>
        ['COMPLETE', 'HANDOVER_PENDING', 'NEXT_STAGE_ACCEPTED'].includes(b.status)
      );
    }

    if (opts.statusFilter) {
      result = result.filter((b) => b.status === opts.statusFilter);
    }

    if (opts.deptFilter && opts.deptFilter !== 'all') {
      result = result.filter(
        (b) => b.departmentId === opts.deptFilter || b.department?.id === opts.deptFilter
      );
    }

    if (opts.startDate) {
      const startMs = new Date(`${opts.startDate}T00:00:00.000`).getTime();
      result = result.filter((b) => new Date(b.createdAt || b.updatedAt || 0).getTime() >= startMs);
    }

    if (opts.endDate) {
      const endMs = new Date(`${opts.endDate}T23:59:59.999`).getTime();
      result = result.filter((b) => new Date(b.createdAt || b.updatedAt || 0).getTime() <= endMs);
    }

    if (opts.search && opts.search.trim()) {
      const q = opts.search.toLowerCase().trim();
      result = result.filter((b) => {
        return (
          b.batchNumber.toLowerCase().includes(q) ||
          (b.productionPlan?.product?.name || '').toLowerCase().includes(q) ||
          (b.productionPlan?.product?.sku || '').toLowerCase().includes(q)
        );
      });
    }

    result.sort((a, b) => {
      switch (opts.sortBy) {
        case 'created_desc':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case 'created_asc':
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case 'batch_asc':
          return a.batchNumber.localeCompare(b.batchNumber, undefined, { numeric: true });
        case 'batch_desc':
          return b.batchNumber.localeCompare(a.batchNumber, undefined, { numeric: true });
        case 'progress_desc': {
          const pA = Number(a.received_qty) > 0 ? Number(a.completed_qty) / Number(a.received_qty) : 0;
          const pB = Number(b.received_qty) > 0 ? Number(b.completed_qty) / Number(b.received_qty) : 0;
          return pB - pA;
        }
        case 'dept_asc':
          return (a.department?.name || '').localeCompare(b.department?.name || '');
        default:
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      }
    });

    return result;
  }

  it('filters batches by department correctly', () => {
    const cutBatches = filterAndSort(mockBatches, { deptFilter: 'dept-cut' });
    expect(cutBatches).toHaveLength(2);
    expect(cutBatches.every((b) => b.departmentId === 'dept-cut')).toBe(true);

    const fabBatches = filterAndSort(mockBatches, { deptFilter: 'dept-fab' });
    expect(fabBatches).toHaveLength(1);
    expect(fabBatches[0].batchNumber).toBe('BATCH-2026-0002');
  });

  it('filters batches by queue status and tab', () => {
    const awaiting = filterAndSort(mockBatches, { queueTab: 'awaiting' });
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].status).toBe('AWAITING_RECEIPT');

    const active = filterAndSort(mockBatches, { queueTab: 'active' });
    expect(active).toHaveLength(2);
    expect(active.map((b) => b.batchNumber)).toEqual(['BATCH-2026-0004', 'BATCH-2026-0002']);
  });

  it('sorts batches by progress, date and batch number', () => {
    const sortedByProgress = filterAndSort(mockBatches, { sortBy: 'progress_desc' });
    expect(sortedByProgress[0].batchNumber).toBe('BATCH-2026-0003'); // 100% progress
    expect(sortedByProgress[1].batchNumber).toBe('BATCH-2026-0002'); // 50% progress

    const sortedByBatchDesc = filterAndSort(mockBatches, { sortBy: 'batch_desc' });
    expect(sortedByBatchDesc[0].batchNumber).toBe('BATCH-2026-0004');
    expect(sortedByBatchDesc[3].batchNumber).toBe('BATCH-2026-0001');
  });

  it('paginates batches accurately with page slicing', () => {
    const pageSize = 2;
    const page1 = mockBatches.slice(0, pageSize);
    const page2 = mockBatches.slice(pageSize, pageSize * 2);

    expect(page1).toHaveLength(2);
    expect(page1[0].batchNumber).toBe('BATCH-2026-0001');
    expect(page1[1].batchNumber).toBe('BATCH-2026-0002');

    expect(page2).toHaveLength(2);
    expect(page2[0].batchNumber).toBe('BATCH-2026-0003');
    expect(page2[1].batchNumber).toBe('BATCH-2026-0004');
  });

  it('filters production execution departments correctly', () => {
    const sampleDepartments = [
      { id: '1', code: 'DEPT-BUFF', name: 'Buffing & Finishing' },
      { id: '2', code: 'DEPT-LASER', name: 'Laser Cutting' },
      { id: '3', code: 'DEPT-PIPE', name: 'Pipe Cutting' },
      { id: '4', code: 'DEPT-PROD', name: 'Production & Assembly' },
      { id: '5', code: 'DEPT-STORE', name: 'Store & Raw Materials' },
      { id: '6', code: 'DEPT-TUBE', name: 'Tube Bending' },
      { id: '7', code: 'MOULDING', name: 'Moulding Department' },
      { id: '11', code: 'SHOP-WELDING-K1A2B3', name: 'Welding' },
      { id: '8', code: 'WALL-MOUNT-CS3-CS6', name: 'WALL MOUNT CS3-CS6' },
      { id: '9', code: 'LUXURY-ACCESSORIES', name: 'LUXURY ACCESSORIES' },
      { id: '10', code: 'ACCESSORIES-IRONING-MAT', name: 'ACCESSORIES + IRONING MAT' },
    ];

    const executionDepts = sampleDepartments.filter(isProductionExecutionDepartment);
    expect(executionDepts.map((d) => d.code)).toEqual([
      'DEPT-BUFF',
      'DEPT-LASER',
      'DEPT-PIPE',
      'DEPT-PROD',
      'DEPT-STORE',
      'DEPT-TUBE',
      'MOULDING',
      'SHOP-WELDING-K1A2B3'
    ]);

    const nonExecutionDepts = sampleDepartments.filter((d) => !isProductionExecutionDepartment(d));
    expect(nonExecutionDepts.map((d) => d.code)).toEqual([
      'WALL-MOUNT-CS3-CS6',
      'LUXURY-ACCESSORIES',
      'ACCESSORIES-IRONING-MAT'
    ]);
  });
  it('filters batches by custom date range correctly', () => {
    // mockBatches dates:
    // batch-1: 2026-03-01T10:00:00.000Z
    // batch-2: 2026-03-02T10:00:00.000Z
    // batch-3: 2026-03-03T08:00:00.000Z
    // batch-4: 2026-03-04T09:00:00.000Z

    const filteredSingleDay = filterAndSort(mockBatches, {
      startDate: '2026-03-02',
      endDate: '2026-03-02'
    });
    expect(filteredSingleDay).toHaveLength(1);
    expect(filteredSingleDay[0].batchNumber).toBe('BATCH-2026-0002');

    const filteredRange = filterAndSort(mockBatches, {
      startDate: '2026-03-02',
      endDate: '2026-03-03'
    });
    expect(filteredRange).toHaveLength(2);
    expect(filteredRange.map((b) => b.batchNumber)).toEqual(['BATCH-2026-0003', 'BATCH-2026-0002']);

    const filteredFromStart = filterAndSort(mockBatches, {
      startDate: '2026-03-03'
    });
    expect(filteredFromStart).toHaveLength(2);
    expect(filteredFromStart.map((b) => b.batchNumber)).toEqual(['BATCH-2026-0004', 'BATCH-2026-0003']);
  });

  it('partitions executions cleanly into completed and incomplete sections', () => {
    const completedStatuses = ['COMPLETE', 'HANDOVER_PENDING', 'NEXT_STAGE_ACCEPTED'];

    const completedBatches = mockBatches.filter((b) => completedStatuses.includes(b.status));
    const incompleteBatches = mockBatches.filter((b) => !completedStatuses.includes(b.status));

    expect(completedBatches).toHaveLength(1);
    expect(completedBatches[0].batchNumber).toBe('BATCH-2026-0003');
    expect(completedBatches[0].status).toBe('COMPLETE');

    expect(incompleteBatches).toHaveLength(3);
    expect(incompleteBatches.map((b) => b.batchNumber)).toEqual([
      'BATCH-2026-0001',
      'BATCH-2026-0002',
      'BATCH-2026-0004'
    ]);
    expect(incompleteBatches.every((b) => !completedStatuses.includes(b.status))).toBe(true);
  });
});
