import { describe, it, expect } from "vitest";
import { freshWorkspace } from "../helpers";
import { draftSpec, approveSpec } from "@/lib/specs";
import { listBuildJobs } from "@/lib/build-jobs";
import { processNextBuildJob, processBuildQueue } from "@/lib/build-jobs/worker";
import { StubAgentRunner } from "@/lib/build-jobs/runner";
import { approve, list } from "@/lib/pending-operations";
import { listBuilds } from "@/lib/builds";
import { withAdmin } from "@/lib/db";

/**
 * Build worker + agent runner + report-back (PRD PR 2).
 * Proves the full chain: approve buildable spec -> job queued -> worker claims
 * and runs the stub runner -> job succeeded with a SHA -> a build.record pending
 * op is staged -> a human approves it -> the build is recorded. No auto-merge.
 */
describe("build worker", () => {
  async function seedApprovedBuildable(title = "Workable spec", body: Record<string, unknown> = { acceptance: ["x"] }) {
    const { workspaceId, owner } = await freshWorkspace();
    const { id: specId } = await draftSpec(owner, { workspace_id: workspaceId, title, body });
    await approveSpec(owner, { workspace_id: workspaceId, spec_id: specId, version: 1 });
    return { workspaceId, owner, specId };
  }

  it("claims a queued job, runs the stub, marks succeeded, stages build.record", async () => {
    const { workspaceId, owner, specId } = await seedApprovedBuildable();

    // Drain until we process THIS workspace's job (global dispatcher, shared DB).
    let processed = null;
    for (let i = 0; i < 50; i++) {
      const r = await processNextBuildJob();
      if (!r.claimed) break;
      if (r.jobId) {
        const jobs = await listBuildJobs(owner, workspaceId);
        if (jobs.some((j) => j.id === r.jobId)) { processed = r; break; }
      }
    }
    expect(processed).not.toBeNull();
    expect(processed!.outcome).toBe("succeeded");
    expect(processed!.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(processed!.buildRecordOpId).toBeTruthy();

    // Job row is succeeded with the SHA.
    const jobs = await listBuildJobs(owner, workspaceId);
    expect(jobs[0]!.status).toBe("succeeded");
    expect(jobs[0]!.git_sha).toBe(processed!.gitSha);

    // A build.record pending op was staged (report-back) — NOT auto-recorded.
    const pending = await list(owner, workspaceId, "pending");
    const rec = pending.find((p) => p.kind === "build.record");
    expect(rec).toBeTruthy();
    expect(rec!.risk_tier).toBe("medium");
    expect((rec!.payload as { git_sha: string }).git_sha).toBe(processed!.gitSha);

    // No build exists yet — the loop is NOT closed until a human approves.
    expect(await listBuilds(owner, workspaceId)).toHaveLength(0);

    // Human approves the build.record -> build is finally recorded.
    await approve(owner, rec!.id);
    const builds = await listBuilds(owner, workspaceId);
    expect(builds).toHaveLength(1);
    expect((builds[0] as { git_sha: string }).git_sha).toBe(processed!.gitSha);
  });

  it("marks a job failed when the runner fails, and stages no build.record", async () => {
    const { workspaceId, owner } = await seedApprovedBuildable("Failing spec", {
      acceptance: ["x"],
      build: { fail: true },
    });

    // Process until this workspace's job is handled.
    for (let i = 0; i < 50; i++) {
      const r = await processNextBuildJob();
      if (!r.claimed) break;
      const jobs = await listBuildJobs(owner, workspaceId);
      if (jobs.some((j) => j.id === r.jobId)) break;
    }

    const jobs = await listBuildJobs(owner, workspaceId);
    expect(jobs[0]!.status).toBe("failed");
    expect(jobs[0]!.error).toMatch(/forced failure/i);

    // No build.record staged on failure.
    const pending = await list(owner, workspaceId, "pending");
    expect(pending.some((p) => p.kind === "build.record")).toBe(false);
  });

  it("processBuildQueue returns {claimed:false} shape when queue is empty", async () => {
    // Drain everything first.
    await processBuildQueue(100);
    const r = await processNextBuildJob();
    expect(r.claimed).toBe(false);
  });

  it("a custom runner is honored (dependency injection)", async () => {
    const { workspaceId, owner } = await seedApprovedBuildable("Injected runner spec");
    const fixed = "abc1230000000000000000000000000000000000";
    const runner = new (class {
      async run() { return { ok: true, gitSha: fixed }; }
    })();

    let mine = null;
    for (let i = 0; i < 50; i++) {
      const r = await processNextBuildJob(runner);
      if (!r.claimed) break;
      const jobs = await listBuildJobs(owner, workspaceId);
      if (jobs.some((j) => j.id === r.jobId)) { mine = r; break; }
    }
    expect(mine!.gitSha).toBe(fixed);
  });

  it("StubAgentRunner is deterministic for the same spec/version", async () => {
    const runner = new StubAgentRunner();
    const input = { workspaceId: "w", specId: "s", version: 1, body: { acceptance: ["x"] } };
    const a = await runner.run(input);
    const b = await runner.run(input);
    expect(a.ok).toBe(true);
    expect(a.gitSha).toBe(b.gitSha);
    expect(a.gitSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
