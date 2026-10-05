import type { CoreEvent } from "@/lib/events/types";
import { subscribe } from "@/lib/events/bus";

/**
 * Extension contract. Core defines this interface and the registry; core NEVER
 * imports a concrete extension. Extensions import core, register themselves on
 * the event bus, and are wired in exactly one composition-root file
 * (src/extensions/register.ts) that lives on the extension side of the boundary.
 */
export interface Extension {
  name: string;
  /** Event types this extension reacts to (for documentation/filtering). */
  events: CoreEvent["type"][];
  handle: (event: CoreEvent) => void | Promise<void>;
}

/** Register an extension's handler on the core event bus. */
export function register(ext: Extension): () => void {
  return subscribe(async (event) => {
    if (ext.events.includes(event.type)) {
      await ext.handle(event);
    }
  });
}
