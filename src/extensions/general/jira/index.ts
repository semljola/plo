import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * jira extension — mirror ideas/specs into Jira issues. Uses JIRA_BASE_URL +
 * token. Event-bus consumer only.
 */
export const jiraExtension: Extension = {
  name: "jira",
  events: ["idea.created", "spec.approved"],
  async handle(event: CoreEvent) {
    logEvent("extension.jira", { type: event.type, workspace: event.workspace_id });
  },
};
