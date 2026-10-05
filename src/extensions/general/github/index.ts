import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * github extension — open/update a tracking PR or issue when a spec is approved;
 * attach the git SHA from build.recorded. Reads GITHUB_TOKEN + repo from
 * workspace config.
 *
 * Event-bus consumer only: it never calls core write paths directly, it reacts
 * to committed events. Enable via src/extensions/register.ts.
 */
export const githubExtension: Extension = {
  name: "github",
  events: ["spec.approved", "build.recorded"],
  async handle(event: CoreEvent) {
    // Integration point — wire the real GitHub API call here.
    logEvent("extension.github", { type: event.type, workspace: event.workspace_id });
  },
};
