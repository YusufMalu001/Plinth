export type QuantityValue = number | string | { toString(): string };

export function availableGoodOutput(good: QuantityValue, handovers: Array<{ quantity: QuantityValue; status: string }>): number {
  return Math.max(0, Number(good) - handovers.filter((row) => row.status !== 'REFUSED').reduce((sum, row) => sum + Number(row.quantity), 0));
}

export function buildableKits(intakes: Array<{ acceptedQty: QuantityValue; allocatedQty: QuantityValue; requiredPerUnit: QuantityValue }>): number {
  if (!intakes.length || intakes.some((row) => !(Number(row.requiredPerUnit) > 0))) return 0;
  return Math.max(0, Math.floor(Math.min(...intakes.map((row) => (Number(row.acceptedQty) - Number(row.allocatedQty)) / Number(row.requiredPerUnit)))));
}

export function childWorkFromAcceptedOutput(quantity: QuantityValue, parentOutputPerUnit: QuantityValue, childOutputPerUnit: QuantityValue): number {
  const parent = Number(parentOutputPerUnit);
  const child = Number(childOutputPerUnit);
  if (!(parent > 0) || !(child > 0)) throw new Error('Both route output ratios must be positive.');
  return Number(quantity) / parent * child;
}
