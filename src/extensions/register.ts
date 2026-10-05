import { register } from "@/extensions/contract";
import { githubExtension } from "@/extensions/general/github";
import { linearExtension } from "@/extensions/general/linear";
import { jiraExtension } from "@/extensions/general/jira";
import { posthogExtension } from "@/extensions/general/posthog";
import { vercelExtension } from "@/extensions/general/vercel";
import { sentryExtension } from "@/extensions/general/sentry";
import { slackExtension } from "@/extensions/general/slack";
import { mcpServerExtension } from "@/extensions/general/mcp-server";
import type { Extension } from "@/extensions/contract";

/**
 * Extension composition root — the ONLY place extensions are wired in. Core
 * never imports this; the app's bootstrap calls registerExtensions() once.
 * Each extension opts in here, keeping the core ↔ extension boundary a
 * one-directional dependency (extensions → core).
 */
const ALL: Extension[] = [
  githubExtension,
  linearExtension,
  jiraExtension,
  posthogExtension,
  vercelExtension,
  sentryExtension,
  slackExtension,
  mcpServerExtension,
];

/** Returns a disposer that unsubscribes every extension. */
export function registerExtensions(enabled?: string[]): () => void {
  const active = enabled ? ALL.filter((e) => enabled.includes(e.name)) : ALL;
  const disposers = active.map(register);
  return () => disposers.forEach((d) => d());
}

export { ALL as extensions };
