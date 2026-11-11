import { Request, Response, NextFunction } from 'express';
import { testDbConnection } from '../../database';
import { logger } from '../../common/utils/logger';
import { HealthCheckResponse } from '@plinth/types';

/**
 * Controller handling system health checking.
 */
export async function getHealth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dbStatus = await testDbConnection();
    const isHealthy = dbStatus.connected;
    
    const healthStatus: HealthCheckResponse = {
      success: true,
      service: 'plinth-api',
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus
    };

    logger.debug('System health check executed', {
      requestId: req.id,
      details: healthStatus
    });

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    next(error);
  }
}
