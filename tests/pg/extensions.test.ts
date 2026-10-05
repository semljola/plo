import { describe, it, expect, afterEach } from "vitest";
import { freshWorkspace } from "../helpers";
import { _resetHandlers } from "@/lib/events/bus";
import { registerExtensions } from "@/extensions/register";
import { createIdea } from "@/lib/ideas";
import { draftSpec, approveSpec } from "@/lib/specs";

/**
 * Proves the event-bus / extension wiring: extensions registered at the
 * composition root receive committed events, and the core→extension boundary
 * holds (extensions only react, never block the loop).
 */
describe("extensions on the event bus", () => {
  afterEach(() => _resetHandlers());

  it("delivers committed events to a registered extension", async () => {
    const received: string[] = [];
    // Register a probe extension via the real bus subscribe path.
    const { register } = await import("@/extensions/contract");
    const dispose = register({
      name: "probe",
      events: ["idea.created", "spec.approved"],
      handle: (e) => { received.push(e.type); },
    });

    const { workspaceId, owner } = await freshWorkspace();
    await createIdea(owner, { workspace_id: workspaceId, title: "evented idea" });
    const spec = await draftSpec(owner, { workspace_id: workspaceId, title: "evented spec", body: {} });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: spec.id, version: 1 });

    expect(received).toContain("idea.created");
    expect(received).toContain("spec.approved");
    dispose();
  });

  it("a throwing extension never breaks the loop", async () => {
    const { register } = await import("@/extensions/contract");
    const dispose = register({
      name: "bad",
      events: ["idea.created"],
      handle: () => { throw new Error("boom"); },
    });
    const { workspaceId, owner } = await freshWorkspace();
    // Should still succeed despite the extension throwing.
    const idea = await createIdea(owner, { workspace_id: workspaceId, title: "resilient" });
    expect(idea.id).toBeTruthy();
    dispose();
  });

  it("registerExtensions wires all 8 bundled extensions", async () => {
    const dispose = registerExtensions();
    const { extensions } = await import("@/extensions/register");
    expect(extensions.map((e) => e.name)).toEqual(
      expect.arrayContaining(["github", "linear", "jira", "posthog", "vercel", "sentry", "slack", "mcp-server"])
    );
    dispose();
  });
});
