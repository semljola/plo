import type { CoreEvent } from "./types";

/**
 * In-process event bus. Core emits; extensions subscribe. Handlers run
 * sequentially and errors are isolated (one bad extension never blocks the
 * loop or other extensions). For multi-instance deploys, back this with
 * Postgres LISTEN/NOTIFY or a queue — the surface stays the same.
 */
type Handler = (event: CoreEvent) => void | Promise<void>;
const handlers = new Set<Handler>();

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function emit(event: CoreEvent): Promise<void> {
  for (const h of handlers) {
    try {
      await h(event);
    } catch (err) {
      // Never let an extension failure break the core loop.
      console.error(`[event-bus] handler failed for ${event.type}:`, err);
    }
  }
}

/** Test/util: drop all subscribers. */
export function _resetHandlers(): void {
  handlers.clear();
}
