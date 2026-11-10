import express from 'express';
import request from 'supertest';

const eventRow = {
  eventType: 'VENDOR_CHANGED',
  payload: { eventVersion: 1, entityType: 'Vendor', entityId: 'vendor-test', occurredAt: '2026-09-30T12:00:00.000Z', metadata: { status: 'ACTIVE' } },
  status: 'DEAD_LETTER',
};
const mockPrisma = { domainEventOutbox: { findUnique: jest.fn() } };
const mockReplay = jest.fn();

jest.mock('../../../database', () => ({ prisma: mockPrisma }));
jest.mock('../services/domain-event-outbox.service', () => ({ domainEventOutboxService: { replay: mockReplay } }));

import intelligenceRouter from '../intelligence.routes';
import { signAccessToken } from '../../../modules/auth/auth.tokens';
import { DbPermissionChecker } from '../../../common/rbac/db-permission-checker';
import { errorHandler } from '../../../common/middleware/error';

describe('domain event replay RBAC integration', () => {
  const app = express();
  const permission = jest.spyOn(DbPermissionChecker.prototype, 'can');

  beforeAll(() => {
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).id = req.get('x-correlation-id') || 'replay-rbac-request'; next(); });
    app.use('/api/v1/intelligence', intelligenceRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    mockPrisma.domainEventOutbox.findUnique.mockResolvedValue(eventRow);
    mockReplay.mockResolvedValue({ kind: 'REPLAYED', eventId: '550e8400-e29b-41d4-a716-446655440000', correlationId: 'source-correlation' });
    permission.mockResolvedValue(false);
  });

  afterAll(() => permission.mockRestore());

  it('allows an authorized Admin, delegates replay, and returns the idempotent result', async () => {
    const token = signAccessToken({ id: 'admin-test', email: 'admin@example.invalid', role: 'admin' });
    const response = await request(app)
      .post('/api/v1/intelligence/events/550e8400-e29b-41d4-a716-446655440000/replay')
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'replay-request-1');

    expect(response.status).toBe(202);
    expect(response.body.data).toMatchObject({ status: 'PENDING', idempotentDownstream: true });
    expect(mockReplay).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'admin-test', 'replay-request-1');
  });

  it('rejects an authenticated user without manage:IntelligencePolicy permission', async () => {
    const token = signAccessToken({ id: 'viewer-test', email: 'viewer@example.invalid', role: 'staff' });
    const response = await request(app)
      .post('/api/v1/intelligence/events/550e8400-e29b-41d4-a716-446655440000/replay')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(mockReplay).not.toHaveBeenCalled();
    expect(permission).toHaveBeenCalledWith('viewer-test', 'manage', 'IntelligencePolicy', expect.any(Object));
  });
});
