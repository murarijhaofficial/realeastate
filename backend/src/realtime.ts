import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

export const inventoryEvents = new EventEmitter();
inventoryEvents.setMaxListeners(0);

export function publishInventoryEvent(projectId, event, data) {
  inventoryEvents.emit(`project:${projectId}`, {
    event_id: crypto.randomUUID(),
    event,
    timestamp: new Date().toISOString(),
    data,
  });
}
