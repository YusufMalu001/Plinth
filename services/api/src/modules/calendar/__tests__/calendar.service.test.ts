import { CalendarService } from '../calendar.service';

jest.mock('../../../database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'system',
        name: 'System User',
        assignedLocationId: null
      })
    },
    productionPlan: {
      findMany: jest.fn().mockResolvedValue([])
    },
    salesOrder: {
      findMany: jest.fn().mockResolvedValue([])
    },
    customer: {
      findMany: jest.fn().mockResolvedValue([])
    },
    purchaseOrder: {
      findMany: jest.fn().mockResolvedValue([])
    },
    goodsReceiptNote: {
      findMany: jest.fn().mockResolvedValue([])
    },
    expectedReceipt: {
      findMany: jest.fn().mockResolvedValue([])
    },
    productionMaterialIssue: {
      findMany: jest.fn().mockResolvedValue([])
    },
    inventoryLedgerEntry: {
      findMany: jest.fn().mockResolvedValue([])
    },
    departmentExecution: {
      findMany: jest.fn().mockResolvedValue([])
    },
    assemblyBatch: {
      findMany: jest.fn().mockResolvedValue([])
    },
    lossEvent: {
      findMany: jest.fn().mockResolvedValue([])
    },
    debitNote: {
      findMany: jest.fn().mockResolvedValue([])
    },
    workCenter: {
      count: jest.fn().mockResolvedValue(6)
    }
  }
}));

jest.mock('../../../common/rbac/permission-cache', () => ({
  getActorCapabilities: jest.fn().mockResolvedValue({
    allLocations: true,
    allDepartments: true,
    permissions: []
  })
}));

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(() => {
    service = new CalendarService();
  });

  it('should instantiate correctly', () => {
    expect(service).toBeDefined();
    expect(typeof service.getDaySummary).toBe('function');
    expect(typeof service.getMonthOverview).toBe('function');
  });

  it('should parse and format date bounds properly', async () => {
    const summary = await service.getDaySummary('system', '2026-09-09');
    expect(summary).toBeDefined();
    expect(summary.dateStr).toBe('2026-09-09');
  });

  it('should return month overview structure properly', async () => {
    const month = await service.getMonthOverview('system', 2026, 9);
    expect(month).toBeDefined();
    expect(month.month).toBe(9);
    expect(month.year).toBe(2026);
  });
});

