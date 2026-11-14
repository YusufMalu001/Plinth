import dotenv from 'dotenv';
import path from 'path';
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
}

import app from './app';
import { config } from './config';
import { logger } from './common/utils/logger';
import { testDbConnection } from './database';
import { ensurePermissionCatalogue } from './modules/users/rbac';
import { incompleteScheduleNotifierService } from './modules/production/services/incomplete-schedule-notifier.service';
import { servicePrincipalService } from './modules/intelligence/services/service-principal.service';

async function startServer() {
  try {
    logger.info('🚀 Initializing Manufacturing ERP backend api...');

    // Run connection test to database
    const dbStatus = await testDbConnection();
    if (dbStatus.connected) {
      logger.info(`✅ Successfully connected to PostgreSQL database (latency: ${dbStatus.latencyMs}ms)`);
      try {
        await ensurePermissionCatalogue();
        logger.info('✅ Permission catalogue ready');
        if (config.intelligence.enabled) {
          await servicePrincipalService.reconcileConfiguredProfiles();
          logger.info('✅ Intelligence service principals ready');
        }
      } catch (error) {
        logger.warn('⚠️ Permission catalogue warm-up failed; it will retry on the first access request.', { details: (error as Error).message });
      }

      // Start background cron for incomplete production & assembly schedule notifications
      try {
        incompleteScheduleNotifierService.startBackgroundCron();
        logger.info('✅ Incomplete schedule notification cron initialized');
      } catch (cronErr) {
        logger.warn('⚠️ Incomplete schedule notification cron failed to start:', { details: (cronErr as Error).message });
      }
    } else {
      throw new Error('Database connection failed. API startup aborted; verify PostgreSQL is healthy and DATABASE_URL points to the reachable database.');
    }

    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(`🚀 Server running in [${config.env}] mode on port ${config.port} (0.0.0.0)`);
    });

    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}. Shutting down server gracefully...`);
      server.close(() => {
        logger.info('Graceful shutdown completed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal('❌ Fatal startup failure:', { details: (error as Error).message });
    process.exit(1);
  }
}

startServer();
