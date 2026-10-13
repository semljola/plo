import { withUser, withAdmin, type Executor } from "@/lib/db";

/**
 * build_jobs — the transactional outbox between "spec approved" and "agent
 * builds". The engine enqueues a job in the approval transaction; a worker
 * claims it out of band and runs the agent runner.
 *
 * Reads run under RLS (withUser). The worker claims with the trusted role
 * (withAdmin) so a single dispatcher can serve all workspaces, but it only ever
 * touches build_jobs — never crosses tenant data — and the claimed row carries
 * its own workspace_id for everything downstream.
 */

export interface BuildJob {
  id: string;
  workspace_id: string;
  spec_id: string;
  spec_version: number;
  status: "queued" | "running" | "succeeded" | "failed";
  git_sha: string | null;
  attempts: number;
  error: string | null;
  claimed_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function rowToJob(r: Record<string, unknown>): BuildJob {
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    spec_id: r.spec_id as string,
    spec_version: Number(r.spec_version),
    status: r.status as BuildJob["status"],
    git_sha: (r.git_sha ?? null) as string | null,
    attempts: Number(r.attempts),
    error: (r.error ?? null) as string | null,
    claimed_at: (r.claimed_at ?? null) as string | null,
    finished_at: (r.finished_at ?? null) as string | null,
    created_at: r.created_at as string,
  };
}

/** List build jobs for a workspace (RLS-scoped). */
export async function listBuildJobs(userId: string, workspaceId: string): Promise<BuildJob[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select * from build_jobs where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows.map(rowToJob);
  });
}

/**
 * Claim the oldest queued job and mark it running, atomically. FOR UPDATE SKIP
 * LOCKED lets multiple workers run concurrently without double-claiming the
 * same job. Returns null when the queue is empty. Runs as the trusted role.
 */
export async function claimNextBuildJob(): Promise<BuildJob | null> {
  return withAdmin(async (tx) => {
    const { rows } = await tx.query(
      `update build_jobs
          set status='running', claimed_at=now(), attempts=attempts+1
        where id = (
          select id from build_jobs
           where status='queued'
           order by created_at
           for update skip locked
           limit 1
        )
        returning *`
    );
    return rows.length ? rowToJob(rows[0]!) : null;
  });
}

/** Mark a claimed job succeeded with the resulting git SHA. */
export async function completeBuildJob(jobId: string, gitSha: string): Promise<void> {
  await withAdmin(async (tx) => {
    await tx.query(
      "update build_jobs set status='succeeded', git_sha=$2, finished_at=now() where id=$1",
      [jobId, gitSha]
    );
  });
}

/** Mark a claimed job failed with an error message. */
export async function failBuildJob(jobId: string, error: string): Promise<void> {
  await withAdmin(async (tx) => {
    await tx.query(
      "update build_jobs set status='failed', error=$2, finished_at=now() where id=$1",
      [jobId, error]
    );
  });
}

export { rowToJob };
export type { Executor };
