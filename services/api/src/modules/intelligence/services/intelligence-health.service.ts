import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../database';
import { config } from '../../../config';
import { agentRuntimeClient } from '../integrations/agent-runtime.client';
import { intelligenceProfiles } from '../intelligence.profiles';
import { intelligenceControlsService } from './intelligence-controls.service';
import { modelVerificationService } from './model-verification.service';

export class IntelligenceHealthService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async read() {
    const controls = await intelligenceControlsService.effective();
    const [state, queued, snapshots, failures, modelChecks, runtimes] = await Promise.all([
      this.db.intelligenceControlState.findUnique({ where: { id: 'default' }, select: { workerHeartbeatAt: true, workerId: true } }),
      this.db.intelligenceJob.findFirst({ where: { status: { in: ['PENDING', 'FAILED'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.db.businessSnapshot.count(),
      this.db.providerAttempt.count({ where: { requestedModel: { in: [...new Set([config.intelligence.executiveModel, config.intelligence.moduleModel])] }, status: { in: ['FAILED', 'UNAVAILABLE'] }, startedAt: { gte: new Date(Date.now() - 3600_000) } } }),
      modelVerificationService.latest(),
      Promise.all(intelligenceProfiles().map(async (profile) => {
        if (controls.pausedProfiles.includes(profile.key)) return { profile: profile.key, status: 'Disabled' };
        try {
          const result = await agentRuntimeClient.health(profile.module);
          const healthy = result && typeof result === 'object' && (result.status === 'ok' || result.status === 'healthy');
          return { profile: profile.key, status: healthy ? 'Healthy' : 'Runtime Error' };
        } catch { return { profile: profile.key, status: 'Runtime Error' }; }
      })),
    ]);
    const workerFresh = Boolean(state?.workerHeartbeatAt && Date.now() - state.workerHeartbeatAt.getTime() < 30_000);
    const configuredModels = [config.intelligence.executiveModel, config.intelligence.moduleModel].map((model) => modelChecks.find((item) => item.model === model));
    const modelReady = configuredModels.every((item) => item?.status === 'AVAILABLE' && item.capabilities.structured === 'AVAILABLE' && item.capabilities.toolCalling === 'AVAILABLE');
    const authStep = modelChecks.find((item) => item.model === config.intelligence.executiveModel)?.steps[0];
    const providerAuthentication = authStep?.status === 'AVAILABLE' ? 'Healthy' : authStep?.status === 'UNAVAILABLE' ? 'Provider Error' : 'No Data';
    let status = 'Healthy';
    if (!controls.enabled || !controls.providerEnabled) status = 'Disabled';
    else if (!workerFresh) status = 'Unavailable';
    else if (runtimes.some((runtime) => runtime.status === 'Runtime Error')) status = 'Runtime Error';
    else if (configuredModels.some((check) => check?.status === 'UNAVAILABLE') || providerAuthentication === 'Provider Error') status = 'Provider Error';
    else if (!modelReady || failures > 0) status = 'Degraded';
    else if (!snapshots) status = 'No Data';
    else if (controls.shadowMode) status = 'Shadow Mode';
    return {
      status, generatedAt: new Date().toISOString(), controls,
      configuredModels: { executive: config.intelligence.executiveModel, specialist: config.intelligence.moduleModel },
      modelProvider: { authentication: providerAuthentication, connection: providerAuthentication },
      worker: { status: workerFresh ? 'Healthy' : 'Unavailable', lastHeartbeatAt: state?.workerHeartbeatAt ?? null, workerId: state?.workerId ?? null },
      queue: { oldestPendingAt: queued?.createdAt ?? null, ageSeconds: queued ? Math.round((Date.now() - queued.createdAt.getTime()) / 1000) : 0 },
      runtimes, models: modelChecks, recentProviderFailures: failures, snapshotCount: snapshots,
      providerBoundary: 'Advisor request metadata is NOT VERIFIED unless the runtime returns provider identifiers.',
    };
  }
}

export const intelligenceHealthService = new IntelligenceHealthService();
