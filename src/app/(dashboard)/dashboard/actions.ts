"use server";

import { revalidatePath } from "next/cache";
import { createIdea, listIdeas } from "@/lib/ideas";
import { approve, reject } from "@/lib/pending-operations";
import { draftSpec, listSpecs } from "@/lib/specs";
import { defineMetric, recordSnapshot, listDefinitions } from "@/lib/metrics";
import { listExperiments } from "@/lib/experiments";

/**
 * Server action for the dashboard "New idea" form. Runs server-side under the
 * demo identity (PLO_DEMO_USER / PLO_DEMO_WORKSPACE), so no credentials ever
 * touch the client. In a real deployment this resolves the user/workspace from
 * the session instead of env.
 *
 * Returns a small result object the client form renders inline.
 */
export interface SubmitIdeaResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function demoIdentity(): { userId: string; workspaceId: string } | null {
  const userId = process.env.PLO_DEMO_USER;
  const workspaceId = process.env.PLO_DEMO_WORKSPACE;
  if (!userId || !workspaceId) return null;
  return { userId, workspaceId };
}

export async function submitIdea(_prev: SubmitIdeaResult, formData: FormData): Promise<SubmitIdeaResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured (PLO_DEMO_USER / PLO_DEMO_WORKSPACE)." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };

  try {
    const created = await createIdea(id.userId, {
      workspace_id: id.workspaceId,
      title,
      body: body || undefined,
    });
    // Refresh the dashboard so the new idea appears in the list.
    revalidatePath("/dashboard");
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create idea." };
  }
}

/** Read ideas for the demo workspace (server-side). */
export async function getIdeas() {
  const id = demoIdentity();
  if (!id) return [];
  return listIdeas(id.userId, id.workspaceId);
}

export interface DecisionResult {
  ok: boolean;
  error?: string;
}

/**
 * Approve a pending agent operation from the dashboard. Runs under the demo
 * identity (workspace owner), so the engine's owner/admin check passes. This
 * is the human half of the staged-agent-ops gate: low-risk ops auto-committed
 * at propose time; medium/high ones land here for a person to decide.
 */
export async function approveOperation(_prev: DecisionResult, formData: FormData): Promise<DecisionResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured." };
  const operationId = String(formData.get("operation_id") ?? "").trim();
  if (!operationId) return { ok: false, error: "Missing operation id." };
  try {
    await approve(id.userId, operationId);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approve failed." };
  }
}

/** Reject a pending agent operation (optionally with a reason). */
export async function rejectOperation(_prev: DecisionResult, formData: FormData): Promise<DecisionResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured." };
  const operationId = String(formData.get("operation_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!operationId) return { ok: false, error: "Missing operation id." };
  try {
    await reject(id.userId, operationId, reason || undefined);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Reject failed." };
  }
}

export interface DraftSpecResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Quick-draft a spec from the dashboard. Title is required; acceptance criteria
 * are entered one per line and stored as an executable body ({ acceptance: [] }).
 * A spec always starts as a DRAFT (version 1, unapproved) through the single
 * write path — approval happens later via the pending-ops gate.
 */
export async function draftSpecAction(_prev: DraftSpecResult, formData: FormData): Promise<DraftSpecResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };

  const ideaId = String(formData.get("idea_id") ?? "").trim();
  const acceptance = String(formData.get("acceptance") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  try {
    const created = await draftSpec(id.userId, {
      workspace_id: id.workspaceId,
      title,
      idea_id: ideaId || undefined,
      body: acceptance.length ? { acceptance } : {},
    });
    revalidatePath("/dashboard");
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to draft spec." };
  }
}

/** Read specs for the demo workspace (server-side). */
export async function getSpecs() {
  const id = demoIdentity();
  if (!id) return [];
  return listSpecs(id.userId, id.workspaceId);
}

export interface MetricResult {
  ok: boolean;
  error?: string;
}

/**
 * Define a metric from the dashboard. Key must be snake/dot case (validated by
 * the engine's schema). Idempotent — redefining updates description/unit.
 */
export async function defineMetricAction(_prev: MetricResult, formData: FormData): Promise<MetricResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured." };
  const key = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  if (!key) return { ok: false, error: "Key is required." };
  try {
    await defineMetric(id.userId, {
      workspace_id: id.workspaceId,
      key,
      description: description || undefined,
      unit: unit || undefined,
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Define failed." };
  }
}

/**
 * Record a snapshot for an EXISTING metric (never invent metrics — AGENTS.md
 * rule 3; the form only offers already-defined keys). Optionally link to an
 * experiment for provenance.
 */
export async function recordSnapshotAction(_prev: MetricResult, formData: FormData): Promise<MetricResult> {
  const id = demoIdentity();
  if (!id) return { ok: false, error: "Demo identity not configured." };
  const metricKey = String(formData.get("metric_key") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "").trim();
  const experimentId = String(formData.get("experiment_id") ?? "").trim();
  if (!metricKey) return { ok: false, error: "Pick a metric." };
  const value = Number(rawValue);
  if (!rawValue || Number.isNaN(value)) return { ok: false, error: "Value must be a number." };
  try {
    await recordSnapshot(id.userId, {
      workspace_id: id.workspaceId,
      metric_key: metricKey,
      value,
      experiment_id: experimentId || undefined,
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Snapshot failed." };
  }
}

/** Read metric definitions for the demo workspace (server-side). */
export async function getMetricDefinitions() {
  const id = demoIdentity();
  if (!id) return [];
  return listDefinitions(id.userId, id.workspaceId);
}

/** Read experiments for the demo workspace (server-side). */
export async function getExperiments() {
  const id = demoIdentity();
  if (!id) return [];
  return listExperiments(id.userId, id.workspaceId);
}
