/**
 * Generates a sequential, human-readable document number (e.g. "ISS-2026-001"), following the
 * exact loop GoodsReceiptService.generateGrnNumber already used for GRN numbers - extracted here
 * so Module 4's StockIssue/StockTransfer/StockAdjustment don't each duplicate it.
 */
export async function generateSequentialNumber(params: {
  prefix: string;
  countByPrefix: (prefix: string) => Promise<number>;
  existsByNumber: (candidate: string) => Promise<boolean>;
  padLength?: number;
}): Promise<string> {
  const { prefix, countByPrefix, existsByNumber, padLength = 3 } = params;
  let attempt = await countByPrefix(prefix);
  let candidate = '';
  let isUnique = false;
  while (!isUnique) {
    attempt++;
    candidate = `${prefix}${String(attempt).padStart(padLength, '0')}`;
    const exists = await existsByNumber(candidate);
    if (!exists) isUnique = true;
  }
  return candidate;
}
