import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { config } from '../../config';

/**
 * Global Express Error Handling Middleware.
 * Standardizes API error responses and intercepts stack traces.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    // Known application error
    logger.warn(`AppError: ${err.message}`, {
      requestId,
      errorCode: err.errorCode,
      details: err.details
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      },
      requestId
    });
  }

  // Handle standard Prisma/Database errors if applicable
  // For safety, log the full error stack details locally
  logger.error(`Unhandled Error: ${err.message}`, {
    requestId,
    details: {
      stack: err.stack,
      name: err.name
    }
  });

  // Production vs. Development safe responses
  let message = 'An unexpected error occurred. Please try again.';
  const rawMessage = err.message || '';
  const prismaCode = (err as any).code;
  const prismaMetaCode = (err as any).meta?.code;

  // Formalize Prisma / Database validation and constraint errors
  if ((prismaCode === 'P2010' && (prismaMetaCode === '42P01' || /relation [^\n]+ does not exist/i.test(rawMessage))) || /relation [^\n]+ does not exist/i.test(rawMessage)) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_MIGRATION_REQUIRED',
        message: 'Sales order accounting setup is incomplete. The database is missing the pro forma invoice tables; apply the latest database migrations, then retry the order.',
      },
      requestId,
    });
  }

  if (err.name === 'PrismaClientValidationError') {
    const missingArg = rawMessage.match(/Argument `?(\w+)`? is missing/i);
    if (missingArg) {
      message = `Missing required field: ${missingArg[1]}.`;
    } else {
      const unknownArg = rawMessage.match(/Unknown argument `?(\w+)`?/i);
      if (unknownArg) {
        message = unknownArg[1].toLowerCase() === 'material'
          ? 'The API is using an outdated database client. Restart the API after generating the latest Prisma Client.'
          : `Unrecognized field: ${unknownArg[1]}.`;
      } else {
        const invalidArg = rawMessage.match(/(?:Invalid value for|Argument) `([^`]+)`/i);
        if (invalidArg && invalidArg[1] !== 'data') {
          message = `Invalid value for ${invalidArg[1]}. Check this field and try again.`;
        } else {
          message = 'The order data could not be saved. Check the required fields and try again.';
        }
      }
    }

    const fieldMatch = rawMessage.match(/(?:Argument `([^`]+)` is missing|Unknown argument `([^`]+)`|Invalid value for argument `([^`]+)`|Argument `([^`]+)`)/i);
    const field = fieldMatch?.slice(1).find(Boolean);
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
        ...(field ? { details: [{ field, message }] } : {}),
      },
      requestId,
    });
  } else if (prismaCode === 'P2002') {
    const target = (err as any).meta?.target;
    const field = Array.isArray(target) ? target.join(', ') : target || 'field';
    message = `A record with this ${field} already exists.`;
  } else if (prismaCode === 'P2003') {
    message = 'Referenced record does not exist or has conflicting associations.';
  } else if (prismaCode === 'P2025') {
    message = 'The requested record could not be found.';
  } else if (rawMessage.includes('Message:')) {
    const dbErrorMatch = rawMessage.match(/Message:\s*`?(?:ERROR:\s*)?([^\n`]+)`?/i);
    if (dbErrorMatch && dbErrorMatch[1]) {
      message = dbErrorMatch[1].trim();
    }
  } else if (rawMessage.length > 0 && !rawMessage.includes('at ') && config.env !== 'production') {
    const firstLine = rawMessage.split('\n').map(l => l.trim()).filter(Boolean)[0];
    if (firstLine) message = firstLine;
  } else if (rawMessage.length > 0 && rawMessage.length <= 160 && !rawMessage.includes('\n') && !rawMessage.includes('at ')) {
    message = rawMessage;
  }

  const details = config.env === 'development' ? { originalMessage: rawMessage, stack: err.stack } : undefined;

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      ...(details ? { details } : {})
    },
    requestId
  });
}
