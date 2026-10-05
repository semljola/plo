import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * mcp-server extension — companion to packages/plo-mcp. Surfaces committed loop
 * events to connected MCP clients (e.g. push notifications of newly approved
 * specs). The actual stdio tool server lives in packages/plo-mcp. Consumer only.
 */
export const mcpServerExtension: Extension = {
  name: "mcp-server",
  events: ["spec.approved", "pending_operation.proposed"],
  async handle(event: CoreEvent) {
    logEvent("extension.mcp-server", { type: event.type, workspace: event.workspace_id });
  },
};
