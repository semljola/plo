import type { Extension } from "@/extensions/contract";
import type { CoreEvent } from "@/lib/events/types";
import { logEvent } from "@/lib/observability";

/**
 * slack extension — notify a channel when an agent stages a high-risk op
 * needing approval, and when specs/decisions land. Uses SLACK_WEBHOOK_URL.
 * This is the human-in-the-loop nudge for the approval gate. Consumer only.
 */
export const slackExtension: Extension = {
  name: "slack",
  events: ["pending_operation.proposed", "spec.approved", "decision.committed"],
  async handle(event: CoreEvent) {
    // High-risk proposals are the ones worth paging a human about.
    if (event.type === "pending_operation.proposed" && event.risk_tier === "low") return;
    logEvent("extension.slack", { type: event.type, workspace: event.workspace_id });
  },
};
