import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * vercel extension — correlate builds/releases with Vercel deployments by git
 * SHA. Uses VERCEL_TOKEN. Event-bus consumer only.
 */
export const vercelExtension: Extension = {
  name: "vercel",
  events: ["build.recorded"],
  async handle(event: CoreEvent) {
    logEvent("extension.vercel", { type: event.type, workspace: event.workspace_id });
  },
};
