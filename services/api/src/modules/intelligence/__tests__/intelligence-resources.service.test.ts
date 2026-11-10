import { IntelligenceCaseService } from '../services/intelligence-case.service';
import { ImpactScenarioService } from '../services/impact-scenario.service';
import { IntelligenceConversationService } from '../services/conversation.service';

describe('Phase 3–5 intelligence resource safeguards', () => {
  it('records actor, time, and reason when a case is acknowledged and rejects invalid transitions', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'case-1', status: 'ACKNOWLEDGED' });
    const observationCreate = jest.fn();
    const tx = { intelligenceCase: { update }, caseObservation: { create: observationCreate } };
    const db = { intelligenceCase: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1', status: 'OPEN', snapshotId: 'snapshot-1', detectorVersion: 'v1' }) }, $transaction: jest.fn(async (work: (client: any) => unknown) => work(tx)) } as any;
    const service = new IntelligenceCaseService(db);
    await service.transition('case-1', ['INVENTORY'] as any, 'user-1', 'ACKNOWLEDGED', 'Reviewed source evidence');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ acknowledgedById: 'user-1', acknowledgmentReason: 'Reviewed source evidence' }) }));
    expect(observationCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result: 'ACKNOWLEDGED', snapshotId: 'snapshot-1' }) }));
    db.intelligenceCase.findFirst.mockResolvedValueOnce({ id: 'case-1', status: 'RESOLVED' });
    await expect(service.transition('case-1', null, 'user-1', 'ACKNOWLEDGED', 'Repeat')).rejects.toThrow(/Cannot transition/);
  });

  it('keeps copied opportunity ranges explicitly estimated with an unavailable baseline', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'scenario-1' });
    const db = {
      impactScenario: { findUnique: jest.fn().mockResolvedValue(null), create },
      intelligenceCase: { findUnique: jest.fn().mockResolvedValue({ id: 'case-1', snapshotId: 'snapshot-1', evidence: { expectedImpact: { low: 1, base: 2, high: 3, unit: 'INR', currency: 'INR' } } }) },
    } as any;
    await new ImpactScenarioService(db).create({ caseId: 'case-1', actorId: 'user-1', correlationId: 'request-1', idempotencyKey: 'scenario-key-1' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provenance: 'ESTIMATED', baseline: expect.objectContaining({ status: 'NOT_COMPUTED' }), missingInputs: expect.anything() }) }));
  });

  it('does not create a conversation message for a conversation owned by another user', async () => {
    const create = jest.fn();
    const db = { conversation: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() }, conversationMessage: { create } } as any;
    await expect(new IntelligenceConversationService(db).send('user-1', 'conversation-2', 'synthetic only', 'request-1')).rejects.toThrow('Conversation not found.');
    expect(create).not.toHaveBeenCalled();
  });
});
