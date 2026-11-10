import { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { ForbiddenError } from '../errors/AppError';

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (origin === config.webOrigin) return true;
  if (config.stagingWebOrigin && origin === config.stagingWebOrigin) return true;
  if (config.productionWebOrigin && origin === config.productionWebOrigin) return true;
  if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') return true;
  if (origin === 'http://localhost:4000' || origin === 'http://127.0.0.1:4000') return true;
  if (origin === 'http://localhost:2000' || origin === 'http://127.0.0.1:2000') return true;

  // Allow raw VPS IP origins on any deployed port (e.g. http://187.124.99.36:4000)
  if (/^https?:\/\/\d+\.\d+\.\d+\.\d+(:\d+)?$/i.test(origin)) {
    return true;
  }

  // In development/staging, permit tunnels (ngrok, localtunnel) and local network IP addresses
  if (config.env === 'development' || config.env === 'staging' || config.env === 'test') {
    // Allows *.ngrok-free.app, *.ngrok.io, *.ngrok-free.dev, and any port
    if (/^https?:\/\/([a-z0-9-]+\.)*ngrok(-free)?\.(app|io|dev)(:\d+)?$/i.test(origin)) {
      return true;
    }
    // Allows localhost or local network IPs (192.168.x.x, 10.x.x.x, etc.)
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin)) {
      return true;
    }
  }

  return false;
}

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return next(new ForbiddenError('Untrusted request origin'));
  }
  next();
}
