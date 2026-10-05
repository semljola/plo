"use server";

import { revalidatePath } from "next/cache";
import { createIdea, listIdeas } from "@/lib/ideas";
import { approve, reject } from "@/lib/pending-operations";

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
