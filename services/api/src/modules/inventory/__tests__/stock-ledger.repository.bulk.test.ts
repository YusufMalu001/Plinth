import { describe, it, expect } from '@jest/globals';
import { StockLedgerRepository } from '../repositories/stock-ledger.repository';

/**
 * A minimal, stateful in-memory stand-in for the two tables StockLedgerRepository touches -
 * enough to prove the increment/decrement arithmetic stays correct across a large batch of
 * postings, without needing a live Postgres. This is a correctness-under-volume check, not a
 * real load-test harness (same honest scoping Module 3 used for its own "performance" claims).
 */
function makeInMemoryClient() {
  const balances = new Map<string, { onHandQuantity: number; reservedQuantity: number }>();
  let ledgerCount = 0;

  function keyOf(where: { itemKey: string; uomId: string; locationId: string; ownership: string }) {
    return `${where.itemKey}:${where.uomId}:${where.locationId}:${where.ownership}`;
  }

  return {
    stockBalance: {
      upsert: async (args: { where: { itemKey_uomId_locationId_ownership: { itemKey: string; uomId: string; locationId: string; ownership: string } }; create: { onHandQuantity: number }; update: { onHandQuantity: { increment: number } } }) => {
        const { where, create, update } = args;
        const key = keyOf(where.itemKey_uomId_locationId_ownership);
        const existing = balances.get(key);
        if (existing) {
          existing.onHandQuantity += update.onHandQuantity.increment;
        } else {
          balances.set(key, { onHandQuantity: create.onHandQuantity, reservedQuantity: 0 });
        }
        return balances.get(key);
      },
      updateMany: async (args: { where: { itemKey: string; uomId: string; locationId: string; ownership: string; onHandQuantity: { gte: number } }; data: { onHandQuantity: { decrement: number } } }) => {
        const { where, data } = args;
        const key = keyOf(where);
        const existing = balances.get(key);
        if (!existing || existing.onHandQuantity < where.onHandQuantity.gte) {
          return { count: 0 };
        }
        existing.onHandQuantity -= data.onHandQuantity.decrement;
        return { count: 1 };
      }
    },
    stockLedgerEntry: {
      create: async () => {
        ledgerCount += 1;
        return { id: `entry-${ledgerCount}` };
      }
    },
    getBalance: (itemKey: string, uomId: string, locationId: string, ownership: string) => balances.get(`${itemKey}:${uomId}:${locationId}:${ownership}`),
    getLedgerCount: () => ledgerCount
  };
}

describe('StockLedgerRepository - bulk correctness', () => {
  it('keeps the running on-hand balance exactly equal to the algebraic sum of 500 alternating IN/OUT postings', async () => {
    const client = makeInMemoryClient();
    const repository = new StockLedgerRepository(client as never);

    const postings = 500;
    let expectedBalance = 0;

    for (let i = 0; i < postings; i++) {
      const isIn = i % 3 !== 0; // ~2/3 receipts, ~1/3 issues - net positive so OUT postings never go negative
      const quantity = 1 + (i % 5);
      if (isIn) {
        await repository.postEntry({
          productId: 'p-bulk',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          direction: 'IN',
          quantity,
          entryType: 'GRN_RECEIPT',
          postedByActorId: 'actor-1'
        });
        expectedBalance += quantity;
      } else {
        const capped = Math.min(quantity, expectedBalance);
        if (capped <= 0) continue;
        await repository.postEntry({
          productId: 'p-bulk',
          uomId: 'uom-1',
          locationId: 'loc-1',
          ownership: 'OWNED',
          direction: 'OUT',
          quantity: capped,
          entryType: 'ISSUE',
          postedByActorId: 'actor-1'
        });
        expectedBalance -= capped;
      }
    }

    const finalBalance = client.getBalance('PRODUCT:p-bulk', 'uom-1', 'loc-1', 'OWNED');
    expect(finalBalance?.onHandQuantity).toBe(expectedBalance);
    expect(client.getLedgerCount()).toBeGreaterThan(300);
  });
});
