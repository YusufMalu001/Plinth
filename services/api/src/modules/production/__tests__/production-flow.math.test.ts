import { availableGoodOutput, buildableKits, childWorkFromAcceptedOutput } from '../services/production-flow.math';

describe('parallel production quantity conservation', () => {
  it('lets a department send partial good output while retaining pending transfers', () => {
    const transfers = [
      { quantity: 3, status: 'ACCEPTED' },
      { quantity: 2, status: 'PROPOSED' },
    ];
    expect(availableGoodOutput(12, transfers)).toBe(7);
    expect(availableGoodOutput(12, [...transfers, { quantity: 4, status: 'REFUSED' }])).toBe(7);
    expect(availableGoodOutput(12, [...transfers, { quantity: 7, status: 'ACCEPTED' }])).toBe(0);
  });

  it('converts several accepted subroute deliveries using approved output ratios', () => {
    expect(childWorkFromAcceptedOutput(4, 2, 3)).toBe(6);
    expect(childWorkFromAcceptedOutput(2, 2, 3)).toBe(3);
    expect(() => childWorkFromAcceptedOutput(2, 0, 3)).toThrow();
  });

  it('only makes complete Assembly kits from every unallocated intake', () => {
    const intakes = [
      { acceptedQty: 9, allocatedQty: 3, requiredPerUnit: 2 },
      { acceptedQty: 7, allocatedQty: 1, requiredPerUnit: 3 },
      { acceptedQty: 20, allocatedQty: 0, requiredPerUnit: 4 },
    ];
    expect(buildableKits(intakes)).toBe(2);
    expect(buildableKits(intakes.map((item) => ({ ...item, allocatedQty: item.allocatedQty + item.requiredPerUnit * 2 })))).toBe(0);
    expect(buildableKits([{ acceptedQty: 10, allocatedQty: 0, requiredPerUnit: 0 }])).toBe(0);
  });
});
