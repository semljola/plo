import { describe, it, expect } from "vitest";
import { freshWorkspace, addWorkspaceMember } from "../helpers";
import { propose, approve, reject, list } from "@/lib/pending-operations";
import { createIdea } from "@/lib/ideas";
import { draftSpec, addSpecVersion, approveSpec, getSpec } from "@/lib/specs";
import { withUser } from "@/lib/db";

/**
 * SUCCESS CRITERION 1 — "Human can approve a staged agent-drafted spec."
 * SUCCESS CRITERION 2 — "Approved spec body cannot be mutated in place."
 */
describe("staged agent ops + spec immutability", () => {
  it("auto-commits a low-risk agent idea proposal", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const res = await propose(owner, {
      workspace_id: workspaceId,
      kind: "idea.create",
      risk_tier: "low",
      payload: { workspace_id: workspaceId, title: "Low-risk idea" },
    });
    expect(res.operation.status).toBe("approved"); // auto
    expect(res.committed?.id).toBeTruthy();
  });

  it("holds a high-risk agent spec draft for human approval, then a human approves it", async () => {
    const { workspaceId, owner } = await freshWorkspace();

    // Agent stages a HIGH-risk spec draft — must NOT auto-commit.
    const staged = await propose(owner, {
      workspace_id: workspaceId,
      kind: "spec.draft",
      risk_tier: "high",
      payload: {
        workspace_id: workspaceId,
        title: "Agent-drafted spec",
        body: { acceptance: ["must do X"], tests: ["spec.x.test"] },
      },
    });
    expect(staged.operation.status).toBe("pending");
    expect(staged.committed).toBeUndefined();

    // It shows up in the pending queue.
    const pending = await list(owner, workspaceId, "pending");
    expect(pending.map((p) => p.id)).toContain(staged.operation.id);

    // Human (owner) approves → engine commits the spec.
    const approved = await approve(owner, staged.operation.id);
    expect(approved.operation.status).toBe("approved");
    const specId = approved.result.id as string;
    expect(specId).toBeTruthy();

    const spec = await getSpec(owner, workspaceId, specId);
    expect(spec?.title).toBe("Agent-drafted spec");
    expect(spec?.versions).toHaveLength(1);
  });

  it("forbids a non-admin member from approving", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const member = await addWorkspaceMember(owner, workspaceId, "member");

    const staged = await propose(member, {
      workspace_id: workspaceId,
      kind: "spec.draft",
      risk_tier: "medium",
      payload: { workspace_id: workspaceId, title: "needs approval", body: {} },
    });
    await expect(approve(member, staged.operation.id)).rejects.toThrow(/owner\/admin/);

    // Owner can.
    const ok = await approve(owner, staged.operation.id);
    expect(ok.operation.status).toBe("approved");
  });

  it("lets a human reject a staged op without writing to the loop graph", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const staged = await propose(owner, {
      workspace_id: workspaceId,
      kind: "idea.create",
      risk_tier: "high",
      payload: { workspace_id: workspaceId, title: "rejected idea" },
    });
    const rej = await reject(owner, staged.operation.id, "out of scope");
    expect(rej.status).toBe("rejected");
    expect(rej.error).toBe("out of scope");

    const ideas = await withUser(owner, async (tx) =>
      (await tx.query("select * from ideas where workspace_id=$1 and title='rejected idea'", [workspaceId])).rows
    );
    expect(ideas).toHaveLength(0);
  });

  it("CRITERION 2: approved spec body cannot be mutated in place", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Immutable spec",
      body: { v: 1, rule: "original" },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });

    // Direct UPDATE of the approved version body must be blocked by the trigger.
    await expect(
      withUser(owner, async (tx) =>
        tx.query("update spec_versions set body=$1 where spec_id=$2 and version=1", [
          { v: 1, rule: "TAMPERED" },
          specId,
        ])
      )
    ).rejects.toThrow(/immutable/i);

    // Re-approving / re-stamping is also blocked.
    await expect(
      withUser(owner, async (tx) =>
        tx.query("update spec_versions set approved_at=now() where spec_id=$1 and version=1", [specId])
      )
    ).rejects.toThrow(/immutable/i);

    // The correct path: a NEW version (correction) is allowed.
    const v2 = await addSpecVersion(owner, {
      workspace_id: workspaceId,
      spec_id: specId,
      body: { v: 2, rule: "corrected" },
    });
    expect(v2.version).toBe(2);

    const spec = await getSpec(owner, workspaceId, specId);
    expect(spec?.versions).toHaveLength(2);
    // Original approved body is intact.
    const v1 = spec?.versions.find((x) => x.version === 1);
    expect((v1?.body as { rule: string }).rule).toBe("original");
  });

  it("blocks approving while editing body in the same statement", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "sneaky",
      body: { rule: "orig" },
    });
    // Try to approve AND change body at once — trigger must reject.
    await expect(
      withUser(owner, async (tx) =>
        tx.query(
          "update spec_versions set approved_at=now(), body=$1 where spec_id=$2 and version=1",
          [{ rule: "sneaky-change" }, specId]
        )
      )
    ).rejects.toThrow(/cannot modify spec body while approving/i);
  });
});
