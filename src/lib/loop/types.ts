import { z } from "zod";

/** Risk tiers govern whether an agent op may auto-commit. */
export const RiskTier = z.enum(["low", "medium", "high"]);
export type RiskTier = z.infer<typeof RiskTier>;

/**
 * Kinds of staged operations an agent can propose. Each maps to a handler in
 * the loop engine. Keep this list = the engine's switch.
 */
export const PendingOpKind = z.enum([
  "idea.create",
  "spec.draft",
  "spec.version.add",
  "spec.approve",
  "build.record",
  "metric.define",
  "metric.snapshot",
  "experiment.create",
  "learning.record",
  "decision.commit",
]);
export type PendingOpKind = z.infer<typeof PendingOpKind>;

export const PendingOpStatus = z.enum(["pending", "approved", "rejected"]);
export type PendingOpStatus = z.infer<typeof PendingOpStatus>;

/**
 * Auto-approval policy. Agents may auto-commit only low-risk ops; medium/high
 * require a human decision. This is the core "agents don't auto-merge
 * high-risk changes" rule, in one place.
 */
export function canAutoApprove(tier: RiskTier): boolean {
  return tier === "low";
}

export interface PendingOperation {
  id: string;
  workspace_id: string;
  kind: PendingOpKind;
  risk_tier: RiskTier;
  payload: Record<string, unknown>;
  status: PendingOpStatus;
  proposed_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}
