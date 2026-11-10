import { PrismaClient } from '@prisma/client';
import { logger } from '../common/utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Reuse connection client in development environment to avoid pool saturation on hot reload
const logDatabaseQueries = process.env.LOG_DB_QUERIES === 'true';
export const prisma =
  globalThis.prismaGlobal ||
  new PrismaClient({
    log: [
      ...(logDatabaseQueries ? [{ emit: 'event' as const, level: 'query' as const }] : []),
      { emit: 'event', level: 'error' },
      { emit: 'stdout', level: 'info' },
      { emit: 'stdout', level: 'warn' }
    ]
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

// Log queries in development
if (process.env.NODE_ENV === 'development' && logDatabaseQueries) {
  (prisma as PrismaClient & { $on: (event: string, callback: (e: unknown) => void) => void }).$on('query', (e: unknown) => {
    const queryEvent = e as { query: string; params: string; duration: number };
    logger.debug(`Prisma Query: ${queryEvent.query} | Params: ${queryEvent.params} | Duration: ${queryEvent.duration}ms`);
  });

}

(prisma as PrismaClient & { $on: (event: string, callback: (e: unknown) => void) => void }).$on('error', (e: unknown) => {
  const errorEvent = e as { message: string };
  logger.error(`Prisma DB Error: ${errorEvent.message}`);
});

/**
 * Validates the database connection.
 * Returns true if connected, false otherwise.
 */
export async function testDbConnection(): Promise<{ connected: boolean; latencyMs?: number }> {
  const start = Date.now();
  try {
    // Run a fast raw select query to test availability
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return { connected: true, latencyMs };
  } catch (error) {
    logger.error('Database connection validation failed', { details: (error as Error).message });
    return { connected: false };
  }
}
