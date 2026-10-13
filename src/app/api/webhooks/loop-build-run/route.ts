import { json } from "@/lib/api";
import { processBuildQueue } from "@/lib/build-jobs/worker";

/**
 * Cron webhook — the build worker tick. Claims queued build jobs (FOR UPDATE
 * SKIP LOCKED), runs the agent runner against each approved spec, and stages a
 * build.record pending operation for a human to approve. No auto-merge.
 *
 * Schedule this in vercel.json alongside loop-metric-pull. Protected in
 * production by the Vercel cron header / a shared secret; v1 processes on call.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const results = await processBuildQueue();
  return json({
    ok: true,
    loop: "build-run",
    processed: results.length,
    results,
    ran_at: new Date().toISOString(),
  });
}

export async function POST() {
  return GET();
}
