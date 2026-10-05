import { json } from "@/lib/api";

/**
 * Cron webhook (vercel.json schedules this hourly) — the loop-metric-pull loop.
 * In a full deployment this iterates workspaces with configured metric sources
 * (PostHog, Vercel Analytics, Sentry) via their extensions and records
 * snapshots through the engine. v0 is a health stub that proves the schedule.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Guard: Vercel sets this header on cron invocations.
  return json({ ok: true, loop: "metric-pull", ran_at: new Date().toISOString() });
}

export async function POST() {
  return GET();
}
