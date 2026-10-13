import { describe, it, expect } from "vitest";
import { freshWorkspace } from "../helpers";
import { draftSpec, addSpecVersion, approveSpec } from "@/lib/specs";
import { listBuildJobs, claimNextBuildJob } from "@/lib/build-jobs";
import { isBuildable } from "@/lib/loop/engine";
import { withUser } from "@/lib/db";

/**
 * build_jobs transactional outbox (PRD: agent build execution).
 * Proves: approving a buildable spec enqueues exactly one job atomically;
 * idempotency; non-buildable specs enqueue nothing; the worker claims jobs.
 */
describe("build_jobs outbox", () => {
  it("isBuildable: non-empty acceptance, respects build:false", () => {
    expect(isBuildable({ acceptance: ["x"] })).toBe(true);
    expect(isBuildable({ acceptance: [] })).toBe(false);
    expect(isBuildable({})).toBe(false);
    expect(isBuildable({ acceptance: ["x"], build: false })).toBe(false);
    expect(isBuildable(null)).toBe(false);
    expect(isBuildable("nope")).toBe(false);
  });

  it("approving a buildable spec enqueues exactly one queued job", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Buildable spec",
      body: { acceptance: ["renders", "tracked"] },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });

    const jobs = await listBuildJobs(owner, workspaceId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ spec_id: specId, spec_version: 1, status: "queued" });
  });

  it("a non-buildable spec (no acceptance) enqueues nothing", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Prose-only spec",
      body: { note: "just prose, no acceptance criteria" },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });
    expect(await listBuildJobs(owner, workspaceId)).toHaveLength(0);
  });

  it("the outbox insert is atomic with approval (same spec/version = one job)", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Atomic spec",
      body: { acceptance: ["x"] },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });

    // The unique(spec_id, spec_version) + on-conflict-do-nothing means a second
    // approve attempt (already approved -> ImmutableError) never double-enqueues.
    await expect(
      approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 })
    ).rejects.toThrow(/immutable|already approved/i);

    expect(await listBuildJobs(owner, workspaceId)).toHaveLength(1);
  });

  it("each approved version gets its own build job (correction = new build)", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Versioned spec",
      body: { acceptance: ["v1"] },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });
    await addSpecVersion(owner, { workspace_id: workspaceId, spec_id: specId, body: { acceptance: ["v2 corrected"] } });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 2 });

    const jobs = await listBuildJobs(owner, workspaceId);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.spec_version).sort()).toEqual([1, 2]);
  });

  it("the worker claims a queued job with SKIP LOCKED and marks it running", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, {
      workspace_id: workspaceId,
      title: "Claimable spec",
      body: { acceptance: ["x"] },
    });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });

    // claimNextBuildJob is a GLOBAL dispatcher (serves all workspaces), and
    // tests share one DB, so drain the queue until THIS workspace's job is
    // claimed. Each claim must return a running job with a bumped attempt.
    let mine = null;
    for (let i = 0; i < 50; i++) {
      const claimed = await claimNextBuildJob();
      if (!claimed) break;
      expect(claimed.status).toBe("running");
      expect(claimed.attempts).toBe(1);
      if (claimed.spec_id === specId) {
        mine = claimed;
        break;
      }
    }
    expect(mine).not.toBeNull();
    expect(mine!.workspace_id).toBe(workspaceId);

    // This workspace's job is now running, not queued.
    const jobs = await listBuildJobs(owner, workspaceId);
    expect(jobs[0]!.status).toBe("running");
  });

  it("build_jobs respects RLS: a non-member cannot see another workspace's jobs", async () => {
    const a = await freshWorkspace("alpha");
    const b = await freshWorkspace("beta");
    const { id: specId } = await draftSpec(a.owner, {
      workspace_id: a.workspaceId,
      title: "A's buildable",
      body: { acceptance: ["x"] },
    });
    await approveSpec(a.owner, { workspace_id: a.workspaceId, spec_id: specId, version: 1 });

    // B's owner cannot see A's build jobs (RLS filters by membership).
    const crossRead = await withUser(b.owner, async (tx) =>
      (await tx.query("select * from build_jobs where workspace_id=$1", [a.workspaceId])).rows
    );
    expect(crossRead).toHaveLength(0);
  });
});
