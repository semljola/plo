import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * linear extension — mirror ideas as Linear issues and advance them when the
 * spec is approved. Uses LINEAR_API_KEY. Event-bus consumer only.
 */
export const linearExtension: Extension = {
  name: "linear",
  events: ["idea.created", "spec.approved"],
  async handle(event: CoreEvent) {
    logEvent("extension.linear", { type: event.type, workspace: event.workspace_id });
  },
};
