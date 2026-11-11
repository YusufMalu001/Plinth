import { describe, expect, it, jest } from '@jest/globals';
import { ConflictError } from '../../../common/errors/AppError';
import { RoutingRepository } from '../repositories/routing.repository';
import { OrgStructureRepository } from '../repositories/org-structure.repository';
import { RoutingService } from '../services/routing.service';
import { AllowAllPermissionChecker } from '@plinth/types';

const makeService = (repository: Partial<RoutingRepository>) => new RoutingService(
  repository as RoutingRepository,
  {} as OrgStructureRepository,
  new AllowAllPermissionChecker(),
  { record: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) }
);

describe('production route names', () => {
  it('rejects a new route with an existing name regardless of letter case', async () => {
    const repository = {
      findRouteByCode: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      findCurrentRouteByName: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'existing' }),
      createRoute: jest.fn(),
    };
    const service = makeService(repository as unknown as Partial<RoutingRepository>);

    await expect(service.createRoute({ code: 'ROUTE-2', name: '  STANDARD ROUTE  ', actorId: 'user-1' }))
      .rejects.toThrow(ConflictError);
    expect(repository.findCurrentRouteByName).toHaveBeenCalledWith('STANDARD ROUTE', undefined);
    expect(repository.createRoute).not.toHaveBeenCalled();
  });

  it('allows editing a route without rechecking its unchanged name', async () => {
    const repository = {
      findRouteById: jest.fn<() => Promise<any>>().mockResolvedValue({
        id: 'route-1', code: 'ROUTE-1', name: 'Standard Route', status: 'APPROVED', version: 1,
        productId: null, materialId: null, productVariantId: null, effectiveTo: null,
      }),
      findCurrentRouteByName: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      findRouteByCode: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      supersedeRoute: jest.fn<() => Promise<any>>().mockResolvedValue({ oldRoute: { id: 'route-1' }, newRoute: { id: 'route-2' } }),
    };
    const service = makeService(repository as unknown as Partial<RoutingRepository>);

    await service.updateRoute('route-1', { name: 'Standard Route', actorId: 'user-1' });
    expect(repository.findCurrentRouteByName).not.toHaveBeenCalled();
    expect(repository.supersedeRoute).toHaveBeenCalledWith(
      'route-1',
      expect.objectContaining({ name: 'Standard Route' }),
      { skipNameUniqueness: true }
    );
  });

  it('still rejects a changed route name that belongs to another route', async () => {
    const repository = {
      findRouteById: jest.fn<() => Promise<any>>().mockResolvedValue({
        id: 'route-1', code: 'ROUTE-1', name: 'Old Name', status: 'APPROVED', version: 1,
        productId: null, materialId: null, productVariantId: null, effectiveTo: null,
      }),
      findCurrentRouteByName: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'route-2' }),
    };
    const service = makeService(repository as unknown as Partial<RoutingRepository>);

    await expect(service.updateRoute('route-1', { name: 'Existing Name', actorId: 'user-1' }))
      .rejects.toThrow(ConflictError);
    expect(repository.findCurrentRouteByName).toHaveBeenCalledWith('Existing Name', 'route-1');
  });

  it('rejects renaming a draft route to another current route name', async () => {
    const repository = {
      findRouteById: jest.fn<() => Promise<any>>().mockResolvedValue({
        id: 'route-1', code: 'ROUTE-1', name: 'Old Name', status: 'DRAFT', version: 1,
        productId: null, materialId: null, productVariantId: null,
      }),
      findCurrentRouteByName: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'route-2' }),
      updateRoute: jest.fn(),
    };
    const service = makeService(repository as unknown as Partial<RoutingRepository>);

    await expect(service.updateRoute('route-1', { name: 'Existing Name', actorId: 'user-1' }))
      .rejects.toThrow(ConflictError);
    expect(repository.findCurrentRouteByName).toHaveBeenCalledWith('Existing Name', 'route-1');
    expect(repository.updateRoute).not.toHaveBeenCalled();
  });
});
