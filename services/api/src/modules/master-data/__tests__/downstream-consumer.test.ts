import { MasterDataLifecycleService } from '../services/master-data-lifecycle.service';
import { ValidationError } from '../../../common/errors/AppError';

describe('Simulated Downstream Consumer (Module 2+)', () => {
  it('provably blocks a pending master from being referenced', () => {
    const simulateDownstreamCheck = () => {
      MasterDataLifecycleService.assertIsReferenceable('SimulatedEntity', 'id-123', 'PENDING_VALIDATION');
    };
    expect(simulateDownstreamCheck).toThrow(ValidationError);
  });

  it('allows an approved master to be reusable by a downstream reference', () => {
    const simulateDownstreamCheck = () => {
      MasterDataLifecycleService.assertIsReferenceable('SimulatedEntity', 'id-123', 'APPROVED');
    };
    expect(simulateDownstreamCheck).not.toThrow();
  });
});
