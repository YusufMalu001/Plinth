export function calculateTierPrice(price: number, discountPercentage: number): number {
  const base = Number.isFinite(price) ? Math.max(0, price) : 0;
  const discount = Number.isFinite(discountPercentage)
    ? Math.max(0, Math.min(100, discountPercentage))
    : 0;
  return Math.round(base * (1 - discount / 100) * 100) / 100;
}

export function effectiveTierPrice(tier: {
  masterPrice?: number | string | null;
  discountPercentage?: number | string | null;
  isCustomPrice?: boolean;
  customPrice?: number | string | null;
  calculatedPrice?: number | string | null;
}): number {
  if (tier.isCustomPrice && tier.customPrice != null && tier.customPrice !== '') {
    const custom = Number(tier.customPrice);
    if (Number.isFinite(custom)) return Math.max(0, custom);
  }
  const masterPrice = Number(tier.masterPrice);
  if (tier.masterPrice != null && Number.isFinite(masterPrice)) {
    return calculateTierPrice(masterPrice, Number(tier.discountPercentage));
  }
  const legacyPrice = Number(tier.calculatedPrice);
  return Number.isFinite(legacyPrice) ? Math.max(0, legacyPrice) : 0;
}

export function handleNumberInputWheel(
  e: React.WheelEvent<HTMLInputElement>,
  currentVal: any,
  onChange: (val: string) => void,
  options?: { min?: number; max?: number; step?: number }
) {
  e.preventDefault();
  // Throttle rapid wheel events
  const target = e.currentTarget as any;
  const now = Date.now();
  if (target._lastWheelTime && now - target._lastWheelTime < 60) {
    return;
  }
  target._lastWheelTime = now;

  const min = options?.min ?? 0;
  const max = options?.max;
  const step = options?.step ?? 1;

  const num = Math.round(Number(currentVal) || 0);
  const direction = e.deltaY < 0 ? 1 : -1;
  let next = num + direction * step;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  onChange(String(next));
}

export function handleNumberInputKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  currentVal: any,
  onChange: (val: string) => void,
  options?: { min?: number; max?: number; step?: number }
) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const min = options?.min ?? 0;
    const max = options?.max;
    const step = options?.step ?? 1;

    const num = Math.round(Number(currentVal) || 0);
    const direction = e.key === 'ArrowUp' ? 1 : -1;
    let next = num + direction * step;
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    onChange(String(next));
  }
}
