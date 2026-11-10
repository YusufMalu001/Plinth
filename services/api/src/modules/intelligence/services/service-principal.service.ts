/* eslint-disable @typescript-eslint/no-namespace */
import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { IntelligenceModule, PrismaClient, ServicePrincipalStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { UnauthorizedError } from '../../../common/errors/AppError';
import { logger } from '../../../common/utils/logger';
import { intelligenceProfiles } from '../intelligence.profiles';

declare global {
  namespace Express {
    interface Request {
      servicePrincipal?: {
        id: string;
        key: string;
        profileKey: string;
        module: IntelligenceModule;
        tools: string[];
      };
    }
  }
}

const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

function constantTimeHexEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class ServicePrincipalService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async reconcileConfiguredProfiles() {
    for (const profile of intelligenceProfiles()) {
      if (!profile.mcpToken) {
        logger.warn(`No MCP credential configured for intelligence profile '${profile.key}'; its internal tools remain unavailable.`);
        continue;
      }
      if (profile.mcpToken.length < 32 || !profile.mcpToken.startsWith(`${profile.key}.`)) {
        throw new Error(`The MCP credential for '${profile.key}' must start with '${profile.key}.' and be at least 32 characters.`);
      }
      await this.db.$transaction(async (tx) => {
        const principal = await tx.servicePrincipal.upsert({
          where: { profileKey: profile.key },
          create: {
            key: `runtime-${profile.key}`,
            name: profile.displayName,
            profileKey: profile.key,
            module: profile.module,
            secretHash: hashToken(profile.mcpToken),
            status: ServicePrincipalStatus.ACTIVE,
          },
          update: {
            name: profile.displayName,
            module: profile.module,
            secretHash: hashToken(profile.mcpToken),
            status: ServicePrincipalStatus.ACTIVE,
            expiresAt: null,
          },
        });
        await tx.servicePrincipalGrant.deleteMany({ where: { servicePrincipalId: principal.id } });
        await tx.servicePrincipalGrant.createMany({
          data: profile.tools.map((toolName) => ({ servicePrincipalId: principal.id, toolName })),
        });
      });
    }
  }

  async authenticate(token: string) {
    const separator = token.indexOf('.');
    if (separator <= 0) throw new UnauthorizedError('Invalid service credential.');
    const profileKey = token.slice(0, separator);
    const principal = await this.db.servicePrincipal.findUnique({
      where: { profileKey },
      include: { grants: { select: { toolName: true } } },
    });
    const now = new Date();
    if (!principal || principal.status !== ServicePrincipalStatus.ACTIVE || (principal.expiresAt && principal.expiresAt <= now)) {
      throw new UnauthorizedError('Service credential is inactive or expired.');
    }
    if (!constantTimeHexEqual(principal.secretHash, hashToken(token))) {
      throw new UnauthorizedError('Invalid service credential.');
    }
    await this.db.servicePrincipal.update({ where: { id: principal.id }, data: { lastUsedAt: now } });
    return {
      id: principal.id,
      key: principal.key,
      profileKey: principal.profileKey,
      module: principal.module,
      tools: principal.grants.map((grant) => grant.toolName),
    };
  }
}

export const servicePrincipalService = new ServicePrincipalService();

export async function authenticateServicePrincipal(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw new UnauthorizedError('Service credential required.');
    req.servicePrincipal = await servicePrincipalService.authenticate(token);
    next();
  } catch (error) {
    next(error);
  }
}
