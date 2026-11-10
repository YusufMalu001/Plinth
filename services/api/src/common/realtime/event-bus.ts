import { Response } from 'express';

type Event = { id: string; type: string; resource?: string; resourceId?: string; version?: number };
const subscribers = new Map<string, Set<Response>>();

export function subscribe(actorId: string, response: Response) {
  const set = subscribers.get(actorId) ?? new Set<Response>(); subscribers.set(actorId, set); set.add(response);
  return () => { set.delete(response); if (!set.size) subscribers.delete(actorId); };
}

export function publish(actorIds: string[], event: Event) {
  for (const actorId of actorIds) for (const response of subscribers.get(actorId) ?? []) response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({ resource: event.resource, resourceId: event.resourceId, version: event.version })}\n\n`);
}
