import { describe, it, expect } from '@jest/globals';
import { UomService } from '../services/uom.service';
import { CircularDependencyError } from '../../../common/errors/AppError';

describe('UomService - Circular Conversion Detection', () => {
  it('should reject converting a unit to itself (A -> A)', () => {
    expect(() => {
      UomService.detectCycle('uom-kg', 'uom-kg', []);
    }).toThrow(CircularDependencyError);
  });

  it('should reject a direct cycle: A -> B when B -> A already exists', () => {
    const existing = [
      { fromUomId: 'uom-box', toUomId: 'uom-pcs' }
    ];

    expect(() => {
      UomService.detectCycle('uom-pcs', 'uom-box', existing);
    }).toThrow(CircularDependencyError);
  });

  it('should reject a multi-hop cycle: A -> B -> C -> D when attempting to add D -> A', () => {
    const existing = [
      { fromUomId: 'uom-pallet', toUomId: 'uom-carton' },
      { fromUomId: 'uom-carton', toUomId: 'uom-box' },
      { fromUomId: 'uom-box', toUomId: 'uom-pcs' }
    ];

    expect(() => {
      UomService.detectCycle('uom-pcs', 'uom-pallet', existing);
    }).toThrow(CircularDependencyError);
  });

  it('should allow valid DAG conversions without cycles', () => {
    const existing = [
      { fromUomId: 'uom-m', toUomId: 'uom-cm' },
      { fromUomId: 'uom-cm', toUomId: 'uom-mm' }
    ];

    // Adding direct shortcut M -> MM is valid in DAG
    expect(() => {
      UomService.detectCycle('uom-m', 'uom-mm', existing);
    }).not.toThrow();

    // Adding unrelated branch KM -> M is valid
    expect(() => {
      UomService.detectCycle('uom-km', 'uom-m', existing);
    }).not.toThrow();
  });
});
