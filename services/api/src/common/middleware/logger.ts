import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware that logs request information including method, url, status, and processing duration.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl, id } = req;
    const { statusCode } = res;

    const message = `${method} ${originalUrl} - ${statusCode}`;

    if (statusCode >= 500) {
      logger.error(message, { requestId: id, duration });
    } else if (statusCode >= 400) {
      logger.warn(message, { requestId: id, duration });
    } else {
      logger.info(message, { requestId: id, duration });
    }
  });

  next();
}
