import { PermissionChecker, AuditWriter } from '@plinth/types';
import { UomService } from '../../master-data/services/uom.service';
import { BomVersionRepository, BomSimulationRepository } from '../repositories';
import { BomCalculatorService, ResolveFactorFn } from './bom-calculator.service';
import { NotFoundError, ForbiddenError } from '../../../common/errors/AppError';

export class BomSimulationService {
  constructor(
    private readonly bomVersionRepository: BomVersionRepository,
    private readonly simulationRepository: BomSimulationRepository,
    private readonly calculator: BomCalculatorService,
    private readonly uomService: UomService,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditWriter: AuditWriter
  ) {}

  private resolveFactor: ResolveFactorFn = async (fromUomId, toUomId, date) => {
    const factor = await this.uomService.resolveConversionFactor(fromUomId, toUomId, date);
    return factor.toNumber();
  };

  /**
   * Runs on ANY status - this is the pre-approval dry-run tool the entire validate/golden-example
   * workflow depends on (you must be able to test a draft before it can ever be approved). Every
   * run is persisted with `isAuthoritative` set from the version's status at run time, so a UI or
   * downstream consumer can never mistake a draft simulation for an authoritative calculation.
   */
  async simulate(
    bomVersionId: string,
    data: { requestedQuantity: number; requestedUomId: string },
    actorId: string,
    requestId?: string
  ) {
    const canSimulate = await this.permissionChecker.can(actorId, 'simulate', 'BomVersion');
    if (!canSimulate) throw new ForbiddenError('Lacks permission to simulate a BOM version.');

    const version = await this.bomVersionRepository.findById(bomVersionId);
    if (!version) throw new NotFoundError(`BomVersion [${bomVersionId}] not found.`);

    const date = new Date();
    const requirements = await this.calculator.computeRequirements(
      version,
      data.requestedQuantity,
      data.requestedUomId,
      date,
      this.resolveFactor
    );

    const created = await this.simulationRepository.create({
      bomVersionId,
      bomVersionNumber: version.version,
      requestedQuantity: data.requestedQuantity,
      requestedUomId: data.requestedUomId,
      isAuthoritative: version.status === 'APPROVED',
      resultBreakdown: requirements,
      runByActorId: actorId
    });

    await this.auditWriter.record({
      actorId,
      action: 'bom.simulate',
      entityType: 'BomVersion',
      entityId: bomVersionId,
      after: created,
      metadata: { requestedQuantity: data.requestedQuantity, requestedUomId: data.requestedUomId },
      requestId
    });

    return { simulation: created, requirements };
  }

  async listByVersion(bomVersionId: string) {
    return this.simulationRepository.listByVersion(bomVersionId);
  }
}
