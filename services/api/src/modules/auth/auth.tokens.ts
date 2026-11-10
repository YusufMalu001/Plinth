import crypto from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { UserRole } from '@synergy/types';
import { config } from '../../config';
import { UnauthorizedError } from '../../common/errors/AppError';

interface TokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  roleDefinitionId?: string | null;
  roleDefinitionKey?: string | null;
  type: 'access' | 'refresh';
  jti?: string;
}

export function signAccessToken(user: { id: string; email: string; role: UserRole; roleDefinitionId?: string | null; roleDefinitionKey?: string | null; userRoles?: Array<{ role: { id: string; name: string } }> }) {
  const dynamicRole = user.userRoles?.[0]?.role;
  const roleDefinitionKey = user.roleDefinitionKey ?? (user as { roleDefinition?: { key: string } | null }).roleDefinition?.key ?? dynamicRole?.name;
  const roleDefinitionId = user.roleDefinitionId ?? dynamicRole?.id;
  return jwt.sign(
    { email: user.email, role: user.role, roleDefinitionId, roleDefinitionKey, type: 'access' },
    config.jwtSecret,
    { subject: user.id, expiresIn: `${config.accessTokenTtlMinutes}m` as SignOptions['expiresIn'] }
  );
}

export function signRefreshToken(
  user: { id: string; email: string; role: UserRole; roleDefinitionId?: string | null; roleDefinitionKey?: string | null; userRoles?: Array<{ role: { id: string; name: string } }> },
  sessionId: string
) {
  const dynamicRole = user.userRoles?.[0]?.role;
  const roleDefinitionKey = user.roleDefinitionKey ?? (user as { roleDefinition?: { key: string } | null }).roleDefinition?.key ?? dynamicRole?.name;
  const roleDefinitionId = user.roleDefinitionId ?? dynamicRole?.id;
  return jwt.sign(
    { email: user.email, role: user.role, roleDefinitionId, roleDefinitionKey, type: 'refresh' },
    config.jwtRefreshSecret,
    {
      subject: user.id,
      jwtid: sessionId,
      expiresIn: `${config.refreshTokenTtlDays}d` as SignOptions['expiresIn']
    }
  );
}

function verify(token: string, secret: string, expectedType: TokenPayload['type']): TokenPayload {
  try {
    const payload = jwt.verify(token, secret) as TokenPayload;
    if (!payload.sub || payload.type !== expectedType) throw new Error('Invalid token type');
    return payload;
  } catch {
    throw new UnauthorizedError('Authentication required');
  }
}

export const verifyAccessToken = (token: string) => verify(token, config.jwtSecret, 'access');
export const verifyRefreshToken = (token: string) => verify(token, config.jwtRefreshSecret, 'refresh');

export function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function tokenHashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
