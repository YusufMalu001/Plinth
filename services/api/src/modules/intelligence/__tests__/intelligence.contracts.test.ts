import { askBusinessSchema, mcpToolCallArgumentsSchema } from '../intelligence.contracts';

describe('Ask Business module contract', () => {
  it('accepts each module with a dedicated advisor profile', () => {
    for (const module of ['EXECUTIVE', 'SALES', 'INVENTORY', 'PROCUREMENT', 'PRODUCTION', 'FULFILLMENT']) {
      expect(askBusinessSchema.parse({ question: 'Summarize current certified risks.', module }).module).toBe(module);
    }
  });

  it('rejects modules without a dedicated advisor instead of queueing a guaranteed failure', () => {
    for (const module of ['QUALITY', 'FINANCE', 'SYSTEM']) {
      expect(askBusinessSchema.safeParse({ question: 'Summarize current certified risks.', module }).success).toBe(false);
    }
  });
});

describe('MCP evidence tool arguments', () => {
  it('accepts certified metric keys and versions for definition lookups', () => {
    expect(mcpToolCallArgumentsSchema.parse({
      metricKey: 'inventory.replenishment_risk_count',
      metricVersion: '2026-09-25.1',
    })).toEqual({
      metricKey: 'inventory.replenishment_risk_count',
      metricVersion: '2026-09-25.1',
    });
  });

  it('continues to reject arguments outside the declared MCP contract', () => {
    expect(mcpToolCallArgumentsSchema.safeParse({ unexpected: true }).success).toBe(false);
  });
});
