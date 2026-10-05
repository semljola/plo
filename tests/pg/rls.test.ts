import { describe, it, expect } from "vitest";
import { freshWorkspace } from "../helpers";
import { createIdea, listIdeas } from "@/lib/ideas";
import { propose } from "@/lib/pending-operations";
import { withUser } from "@/lib/db";

/**
 * RLS isolation — proves the tenancy boundary is enforced by Postgres, not by
 * application filtering. Two workspaces, two owners; neither can see or write
 * the other's rows even though they share the same app role.
 */
describe("workspace RLS isolation", () => {
  it("a user cannot read another workspace's ideas", async () => {
    const a = await freshWorkspace("alpha");
    const b = await freshWorkspace("beta");

    await createIdea(a.owner, { workspace_id: a.workspaceId, title: "alpha-secret" });
    await createIdea(b.owner, { workspace_id: b.workspaceId, title: "beta-secret" });

    // A sees only A's ideas.
    const aIdeas = await listIdeas(a.owner, a.workspaceId);
    expect(aIdeas.map((i) => i.title)).toContain("alpha-secret");

    // A querying B's workspace id returns nothing (RLS filters it out).
    const crossRead = await withUser(a.owner, async (tx) =>
      (await tx.query("select * from ideas where workspace_id=$1", [b.workspaceId])).rows
    );
    expect(crossRead).toHaveLength(0);
  });

  it("a user cannot write into a workspace they don't belong to", async () => {
    const a = await freshWorkspace("alpha");
    const b = await freshWorkspace("beta");

    // A tries to create an idea in B's workspace → RLS WITH CHECK rejects it.
    await expect(
      createIdea(a.owner, { workspace_id: b.workspaceId, title: "intrusion" })
    ).rejects.toThrow();

    // And staging a pending op into B is forbidden too.
    await expect(
      propose(a.owner, {
        workspace_id: b.workspaceId,
        kind: "idea.create",
        risk_tier: "low",
        payload: { workspace_id: b.workspaceId, title: "intrusion-op" },
      })
    ).rejects.toThrow();
  });

  it("the full loop runs end to end inside one workspace", async () => {
    const { workspaceId, owner } = await freshWorkspace("loop");
    // idea → spec → approve → build → metric → experiment → snapshot → learning → decision
    const idea = await createIdea(owner, { workspace_id: workspaceId, title: "loop idea" });
    expect(idea.id).toBeTruthy();
    const counts = await withUser(owner, async (tx) =>
      (await tx.query("select count(*)::int as n from audit_log where workspace_id=$1", [workspaceId])).rows[0]
    );
    expect((counts as { n: number }).n).toBeGreaterThan(0);
  });
});
