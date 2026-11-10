import { describe, it, expect } from 'vitest';
import { formatErrorMessage } from '../utils/error';

describe('formatErrorMessage utility', () => {
  it('returns fallback message for empty error', () => {
    expect(formatErrorMessage(null)).toBe('Unable to complete request. Please verify your details and try again.');
    expect(formatErrorMessage(undefined)).toBe('Unable to complete request. Please verify your details and try again.');
    expect(formatErrorMessage('')).toBe('Unable to complete request. Please verify your details and try again.');
  });

  it('formats missing argument from raw Prisma error into short formal message', () => {
    const rawPrisma = `Invalid \`txDb.salesOrder.create()\` invocation in /path/to/sales.service.ts:180:43
179 const txDb = tx as any;
180 const order = await txDb.salesOrder.create({ data: { orderNumber: "SO-2026-00001" } })
Argument \`channel\` is missing.`;

    const formatted = formatErrorMessage(rawPrisma);
    expect(formatted).toBe('Missing required field: channel.');
  });

  it('formats unique constraint error cleanly', () => {
    const rawError = 'Unique constraint failed on the fields: (orderNumber)';
    const formatted = formatErrorMessage(rawError);
    expect(formatted).toBe('A record with this orderNumber already exists.');
  });

  it('formats network connectivity errors cleanly', () => {
    const networkError = new Error('Failed to fetch from http://localhost:5000/api/v1/sales/orders');
    const formatted = formatErrorMessage(networkError);
    expect(formatted).toBe('Unable to connect to the server. Please check your network connection.');
  });

  it('preserves clean short human-readable error messages', () => {
    const humanError = 'Customer credit limit of ₹100,000 has been exceeded.';
    const formatted = formatErrorMessage(humanError);
    expect(formatted).toBe('Customer credit limit of ₹100,000 has been exceeded.');
  });
});
