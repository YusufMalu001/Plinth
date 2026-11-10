import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../database';
import { ConflictError, NotFoundError } from '../../../common/errors/AppError';

export const DEFAULT_OBJECTIVE_WEIGHTS = Object.freeze({
  contributionMargin: 0.35,
  orderRevenueGrowth: 0.20,
  serviceLevel: 0.15,
  workingCapital: 0.15,
  operationalRisk: 0.15,
});

export class ObjectivePolicyService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async getActive(at = new Date()) {
    const policy = await this.db.businessObjectivePolicy.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!policy) throw new NotFoundError('No active business objective policy is configured.');
    return policy;
  }

  async list() {
    return this.db.businessObjectivePolicy.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 50 });
  }

  async replace(input: { weights: Record<string, number>; guardrails: Record<string, unknown>; effectiveFrom: string }, actorId: string) {
    const effectiveFrom = new Date(input.effectiveFrom);
    if (effectiveFrom.getTime() < Date.now() - 60_000) {
      throw new ConflictError('A new objective policy cannot take effect in the past.');
    }
    const version = `profitable-growth-${effectiveFrom.toISOString()}`;
    return this.db.$transaction(async (tx) => {
      await tx.businessObjectivePolicy.updateMany({
        where: { isActive: true, effectiveTo: null },
        // Keep the prior policy enabled until its effectiveTo boundary. This
        // permits a future policy to be approved without creating a policy gap.
        data: { effectiveTo: effectiveFrom },
      });
      return tx.businessObjectivePolicy.create({
        data: {
          version,
          effectiveFrom,
          isActive: true,
          weights: input.weights as Prisma.InputJsonValue,
          guardrails: input.guardrails as Prisma.InputJsonValue,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });
    });
  }
}

export const objectivePolicyService = new ObjectivePolicyService();
