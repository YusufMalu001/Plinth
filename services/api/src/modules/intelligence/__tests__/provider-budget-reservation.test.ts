import { config } from '../../../config';
import { ProviderTelemetryService } from '../services/provider-telemetry.service';

describe('advisor budget reservation', () => {
  const originalBudget = config.intelligence.monthlyBudgetUsd;
  afterEach(() => { config.intelligence.monthlyBudgetUsd = originalBudget; });

  it('reserves a slot in the same locked transaction and rejects an over-budget attempt', async () => {
    config.intelligence.monthlyBudgetUsd = 5;
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      providerAttempt: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 4.99 } }),
        create: jest.fn(),
      },
    };
    const db: any = { $transaction: jest.fn((work) => work(tx)) };
    const service = new ProviderTelemetryService(db);

    await expect(service.start({ operation: 'ADVISOR_RUN', requestedModel: 'paid/test', reserveCostUsd: 0.02 }))
      .rejects.toThrow('budget cannot cover another run');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.providerAttempt.create).not.toHaveBeenCalled();
  });

  it('records the reserved charge before the runtime starts', async () => {
    config.intelligence.monthlyBudgetUsd = 5;
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      providerAttempt: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 4.5 } }),
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      },
    };
    const db: any = { $transaction: jest.fn((work) => work(tx)) };
    const service = new ProviderTelemetryService(db);

    await service.start({ operation: 'ADVISOR_RUN', requestedModel: 'paid/test', reserveCostUsd: 0.02 });
    expect(tx.providerAttempt.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'STARTED', requestedModel: 'paid/test', costUsd: expect.objectContaining({}),
    }) });
  });
});
