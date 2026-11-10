import { config } from './config';
import { prisma, testDbConnection } from './database';
import { logger } from './common/utils/logger';
import { ensurePermissionCatalogue } from './modules/users/rbac';
import { servicePrincipalService } from './modules/intelligence/services/service-principal.service';
import { intelligenceWorkerService } from './modules/intelligence/workers/intelligence-worker.service';

async function start() {
  const connection = await testDbConnection();
  if (!connection.connected) throw new Error('Database connection failed.');
  await ensurePermissionCatalogue();
  await servicePrincipalService.reconcileConfiguredProfiles();
  const activation = config.intelligence.enabled ? (config.intelligence.shadowMode ? 'shadow mode' : 'active review mode') : 'disabled';
  logger.info(`Intelligence worker started (${activation}; provider=${config.intelligence.providerEnabled ? 'enabled' : 'disabled'}; events=${config.intelligence.eventTriggersEnabled ? 'enabled' : 'disabled'}; schedules=${config.intelligence.schedulesEnabled ? 'enabled' : 'disabled'}).`);

  let stopping = false;
  let activeTick = false;
  const tick = async () => {
    if (stopping || activeTick) return;
    activeTick = true;
    try {
      await intelligenceWorkerService.tick();
    } catch (error) {
      logger.error('Intelligence worker tick failed.', { details: error instanceof Error ? error.message : 'Unknown worker failure.' });
    } finally {
      activeTick = false;
    }
  };
  await tick();
  const timer = setInterval(() => { void tick(); }, 5_000);

  const shutdown = async (signal: string) => {
    stopping = true;
    clearInterval(timer);
    logger.info(`Intelligence worker received ${signal}; waiting for the active claim to finish.`);
    const deadline = Date.now() + 30_000;
    while (activeTick && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

start().catch((error) => {
  logger.fatal('Intelligence worker failed to start.', { details: error instanceof Error ? error.message : 'Unknown startup failure.' });
  process.exit(1);
});
