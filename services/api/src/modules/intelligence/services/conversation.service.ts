import { IntelligenceModule, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../common/errors/AppError';
import { prisma as defaultPrisma } from '../../../database';

export class IntelligenceConversationService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async create(ownerId: string, module: IntelligenceModule, title?: string) {
    return (this.db as any).conversation.create({ data: { ownerId, module, title: title?.trim() || null } });
  }

  async list(ownerId: string, page: number, limit: number) {
    const where = { ownerId };
    const [items, total] = await Promise.all([
      (this.db as any).conversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } }),
      (this.db as any).conversation.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async get(ownerId: string, id: string, page = 1, limit = 50) {
    const db = this.db as any;
    const conversation = await db.conversation.findFirst({ where: { id, ownerId }, select: { id: true, ownerId: true, module: true, title: true, status: true, createdAt: true, updatedAt: true } });
    if (!conversation) throw new NotFoundError('Conversation not found.');
    const [messages, total] = await Promise.all([
      db.conversationMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, skip: (page - 1) * limit, take: limit, select: { id: true, role: true, content: true, runId: true, modelProvider: true, modelId: true, evidenceRefs: true, correlationId: true, createdAt: true } }),
      db.conversationMessage.count({ where: { conversationId: id } }),
    ]);
    return { ...conversation, messages: { items: messages, total, page, limit } };
  }

  async send(ownerId: string, id: string, content: string, correlationId: string) {
    const db = this.db as any;
    const conversation = await db.conversation.findFirst({ where: { id, ownerId } });
    if (!conversation) throw new NotFoundError('Conversation not found.');
    const message = content.trim();
    if (!message) throw new ValidationError('Message must not be empty.');
    await db.conversationMessage.create({ data: { conversationId: id, role: 'USER', content: message, correlationId } });
    await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return { module: conversation.module, message };
  }
}

export const intelligenceConversationService = new IntelligenceConversationService();
