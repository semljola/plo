"use client";

import { useActionState } from "react";
import { runBuildWorker, type RunWorkerResult } from "./actions";

const initial: RunWorkerResult = { ok: true };

export interface BuildJobRow {
  id: string;
  spec_id: string;
  spec_version: number;
  status: "queued" | "running" | "succeeded" | "failed";
  git_sha: string | null;
  attempts: number;
  error: string | null;
}

const statusColor: Record<BuildJobRow["status"], string> = {
  queued: "#9ca3af",
  running: "#60a5fa",
  succeeded: "#34d399",
  failed: "#f87171",
};

/**
 * Builds section: a demo control to run the build worker on demand (instead of
 * waiting for the 5-minute cron), plus the list of build jobs with status. This
 * closes the browser-drivable loop: approve a spec -> Run worker -> job builds
 * -> a build.record appears in Pending ops to approve.
 */
export function BuildsSection({ jobs }: { jobs: BuildJobRow[] }) {
  const [state, action, running] = useActionState(runBuildWorker, initial);

  const queued = jobs.filter((j) => j.status === "queued").length;

  return (
    <div>
      <form action={action} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button
          type="submit"
          disabled={running}
          style={{
            background: running ? "#374151" : "#7c3aed",
            color: "white",
            border: 0,
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 14,
            cursor: running ? "default" : "pointer",
          }}
        >
          {running ? "Running worker…" : `Run build worker${queued ? ` (${queued} queued)` : ""}`}
        </button>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Claims queued jobs, runs the agent, stages a build.record to approve.
        </span>
        {state.ok && state.processed !== undefined && (
          <span style={{ color: "#34d399", fontSize: 13 }}>✓ Processed {state.processed}.</span>
        )}
        {!state.ok && state.error && <span style={{ color: "#f87171", fontSize: 13 }}>{state.error}</span>}
      </form>

      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        {jobs.map((jb) => (
          <li
            key={jb.id}
            style={{
              marginBottom: 6,
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: statusColor[jb.status], fontWeight: 600, minWidth: 80 }}>{jb.status}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              spec {jb.spec_id.slice(0, 8)} · v{jb.spec_version}
            </span>
            {jb.git_sha && (
              <code style={{ fontSize: 12, color: "#6b7280" }}>{jb.git_sha.slice(0, 10)}</code>
            )}
            {jb.error && <span style={{ fontSize: 12, color: "#f87171" }}>{jb.error}</span>}
          </li>
        ))}
        {jobs.length === 0 && (
          <li style={{ color: "#9ca3af" }}>
            No build jobs yet. Approve a spec with acceptance criteria to enqueue one.
          </li>
        )}
      </ul>
    </div>
  );
}
