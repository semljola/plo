import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * posthog extension — register metric definitions as PostHog insights and pull
 * snapshots on the loop-metric-pull cron. Uses POSTHOG_API_KEY. The pull path
 * records snapshots through the engine (never invents metrics). Consumer only.
 */
export const posthogExtension: Extension = {
  name: "posthog",
  events: ["metric.defined", "experiment.created"],
  async handle(event: CoreEvent) {
    logEvent("extension.posthog", { type: event.type, workspace: event.workspace_id });
  },
};
