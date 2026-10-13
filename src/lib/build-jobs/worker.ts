import { withAdmin } from "@/lib/db";
import { claimNextBuildJob, completeBuildJob, failBuildJob, type BuildJob } from "./index";
import { defaultAgentRunner, type AgentRunner } from "./runner";

/**
 * Build worker — the out-of-band consumer of the build_jobs outbox.
 *
 * For each tick: claim a queued job (FOR UPDATE SKIP LOCKED), load the approved
 * spec body, run the agent runner, and:
 *   - on success: mark the job succeeded AND stage a `build.record` pending
 *     operation (git SHA + status) for a HUMAN to approve. The worker NEVER
 *     writes to `builds` directly; no auto-merge. The loop closes through the
 *     same approval gate it opened.
 *   - on failure: mark the job failed with the error.
 *
 * The worker runs as the trusted role (withAdmin) because it is a system actor
 * serving all workspaces, not a logged-in user. It only touches build_jobs and
 * stages pending_operations scoped to the job's own workspace_id.
 */

export interface ProcessResult {
  claimed: boolean;
  jobId?: string;
  outcome?: "succeeded" | "failed";
  gitSha?: string;
  buildRecordOpId?: string;
  error?: string;
}

/** Process exactly one queued job. Returns {claimed:false} when the queue is empty. */
export async function processNextBuildJob(
  runner: AgentRunner = defaultAgentRunner
): Promise<ProcessResult> {
  const job = await claimNextBuildJob();
  if (!job) return { claimed: false };

  // Load the approved spec body as the agent's brief (trusted read).
  const body = await loadSpecBody(job);
  if (!body) {
    await failBuildJob(job.id, "approved spec version not found");
    return { claimed: true, jobId: job.id, outcome: "failed", error: "spec version not found" };
  }

  const result = await runner.run({
    workspaceId: job.workspace_id,
    specId: job.spec_id,
    version: job.spec_version,
    body,
  });

  if (!result.ok || !result.gitSha) {
    const err = result.error ?? "agent runner returned no git sha";
    await failBuildJob(job.id, err);
    return { claimed: true, jobId: job.id, outcome: "failed", error: err };
  }

  await completeBuildJob(job.id, result.gitSha);

  // Report back: stage a build.record pending op for a human to approve.
  const opId = await stageBuildRecord(job, result.gitSha);

  return {
    claimed: true,
    jobId: job.id,
    outcome: "succeeded",
    gitSha: result.gitSha,
    buildRecordOpId: opId,
  };
}

/** Drain up to `max` queued jobs in one tick. */
export async function processBuildQueue(
  max = 10,
  runner: AgentRunner = defaultAgentRunner
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  for (let i = 0; i < max; i++) {
    const r = await processNextBuildJob(runner);
    if (!r.claimed) break;
    results.push(r);
  }
  return results;
}

async function loadSpecBody(job: BuildJob): Promise<Record<string, unknown> | null> {
  return withAdmin(async (tx) => {
    const { rows } = await tx.query<{ body: Record<string, unknown> }>(
      "select body from spec_versions where spec_id=$1 and version=$2 and workspace_id=$3",
      [job.spec_id, job.spec_version, job.workspace_id]
    );
    return rows[0]?.body ?? null;
  });
}

/**
 * Stage a build.record pending operation (status 'pending') so a human approves
 * the build before it is recorded in the loop. Risk tier 'medium': recording a
 * build is a real loop-state change a human should sign off.
 */
async function stageBuildRecord(job: BuildJob, gitSha: string): Promise<string> {
  return withAdmin(async (tx) => {
    const payload = {
      workspace_id: job.workspace_id,
      spec_id: job.spec_id,
      git_sha: gitSha,
      status: "shipped" as const,
    };
    const { rows } = await tx.query<{ id: string }>(
      `insert into pending_operations (workspace_id, kind, risk_tier, payload, status, proposed_by)
       values ($1,'build.record','medium',$2,'pending',null)
       returning id`,
      [job.workspace_id, payload]
    );
    return rows[0]!.id;
  });
}
