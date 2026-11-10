import { Request } from 'express';

export function getIdempotencyKey(req: Request): string | undefined {
  const header = req.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
}
