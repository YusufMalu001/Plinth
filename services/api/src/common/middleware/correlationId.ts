/* eslint-disable @typescript-eslint/no-namespace */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UserRole } from '@synergy/types';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        id: string;
        email: string;
        role: UserRole;
        roleDefinitionId?: string | null;
        roleDefinitionKey?: string | null;
        organizationId?: string | null;
        locationId?: string | null;
        departmentId?: string | null;
      };
    }
  }
}

/**
 * Middleware that appends a unique request (correlation) ID to each incoming request.
 * Useful for end-to-end request tracing.
 */
export function correlationId(req: Request, res: Response, next: NextFunction) {
  const headerName = 'x-correlation-id';
  const id = (req.headers[headerName] as string) || crypto.randomUUID();
  
  req.id = id;
  res.setHeader(headerName, id);
  next();
}
