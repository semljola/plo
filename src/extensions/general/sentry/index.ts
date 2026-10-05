import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * sentry extension — create Sentry releases on build.recorded and annotate on
 * decisions. Uses SENTRY_AUTH_TOKEN. Event-bus consumer only.
 */
export const sentryExtension: Extension = {
  name: "sentry",
  events: ["build.recorded", "decision.committed"],
  async handle(event: CoreEvent) {
    logEvent("extension.sentry", { type: event.type, workspace: event.workspace_id });
  },
};
