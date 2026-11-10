import { IntelligenceWorkerService } from '../workers/intelligence-worker.service';
import { IntelligenceOrchestratorService } from '../services/intelligence-orchestrator.service';

describe('daily insight scheduling', () => {
  it('queues one scheduled executive brief at 08:00 India time alongside existing department schedules', async () => {
    const orchestrator = { enqueue: jest.fn().mockResolvedValue({}), enqueueQuestion: jest.fn().mockResolvedValue({}) };
    const worker = new IntelligenceWorkerService({} as any, orchestrator as any);

    await worker.enqueueSchedules(new Date('2026-10-02T01:59:00.000Z'));
    expect(orchestrator.enqueueQuestion).not.toHaveBeenCalled();

    await worker.enqueueSchedules(new Date('2026-10-02T02:30:00.000Z'));
    expect(orchestrator.enqueueQuestion).toHaveBeenCalledWith(
      expect.stringContaining('2026-10-02'),
      'EXECUTIVE', 'system', 'schedule:daily-insight:2026-10-02', undefined, '2026-10-02', 'SCHEDULE',
    );
    expect(orchestrator.enqueue).toHaveBeenCalledWith(expect.objectContaining({ module: 'SALES', trigger: 'DAILY' }));
    orchestrator.enqueueQuestion.mockClear();
    await worker.enqueueSchedules(new Date('2026-10-03T02:30:00.000Z'), false);
    expect(orchestrator.enqueueQuestion).not.toHaveBeenCalled();
  });
});

describe('daily insight request idempotency', () => {
  it('reuses the first run when the schedule and a user request target the same business day', async () => {
    let job: any;
    let run: any;
    const db: any = {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
      intelligenceJob: {
        upsert: jest.fn(async ({ create }: any) => {
          job ??= { id: 'daily-job', ...create };
          return job;
        }),
      },
      intelligenceRun: {
        findFirst: jest.fn(async () => run ?? null),
        create: jest.fn(async ({ data }: any) => {
          run = { id: 'daily-run', createdAt: new Date(), ...data };
          return run;
        }),
      },
    };
    const orchestrator = new IntelligenceOrchestratorService(db);
    const scheduled = await orchestrator.enqueueQuestion('Daily brief', 'EXECUTIVE', 'system', 'schedule-1', undefined, '2026-10-02', 'SCHEDULE');
    const manual = await orchestrator.enqueueQuestion('Daily brief', 'EXECUTIVE', 'user-1', 'request-1', undefined, '2026-10-02');
    expect(manual.run.id).toBe(scheduled.run.id);
    expect(db.intelligenceRun.create).toHaveBeenCalledTimes(1);
    expect(db.intelligenceJob.upsert).toHaveBeenCalledTimes(2);
  });
});
