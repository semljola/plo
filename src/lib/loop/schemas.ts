import { z } from "zod";
import { PendingOpKind, RiskTier } from "./types";

/**
 * Executable-intent payload schemas, one per loop operation kind. These are the
 * contract shared by the HTTP API, the MCP tools, and pending-operation
 * approval — validation happens once, here, before the engine writes anything.
 */

const uuid = z.string().uuid();

export const IdeaCreate = z.object({
  workspace_id: uuid,
  title: z.string().min(1).max(200),
  body: z.string().max(10000).optional(),
});

export const SpecDraft = z.object({
  workspace_id: uuid,
  idea_id: uuid.optional(),
  title: z.string().min(1).max(200),
  // Executable spec body: acceptance criteria, schema refs, test ids.
  body: z.record(z.unknown()).default({}),
});

export const SpecVersionAdd = z.object({
  workspace_id: uuid,
  spec_id: uuid,
  body: z.record(z.unknown()),
});

export const SpecApprove = z.object({
  workspace_id: uuid,
  spec_id: uuid,
  version: z.number().int().positive(),
});

export const BuildRecord = z.object({
  workspace_id: uuid,
  spec_id: uuid.optional(),
  git_sha: z.string().min(7).max(64).optional(),
  status: z.enum(["pending", "shipped", "failed"]).default("shipped"),
});

export const MetricDefine = z.object({
  workspace_id: uuid,
  key: z.string().min(1).max(100).regex(/^[a-z0-9_.]+$/, "snake/dot case only"),
  description: z.string().max(1000).optional(),
  unit: z.string().max(40).optional(),
});

export const MetricSnapshot = z.object({
  workspace_id: uuid,
  metric_id: uuid.optional(),
  metric_key: z.string().optional(),
  value: z.number(),
  captured_at: z.string().datetime().optional(),
  // Optional provenance links — a snapshot can be tied to an experiment/learning.
  experiment_id: uuid.optional(),
}).refine((v) => v.metric_id || v.metric_key, {
  message: "metric_id or metric_key required",
});

export const ExperimentCreate = z.object({
  workspace_id: uuid,
  spec_id: uuid.optional(),
  name: z.string().min(1).max(200),
  status: z.enum(["planned", "running", "concluded"]).default("planned"),
});

export const LearningRecord = z.object({
  workspace_id: uuid,
  experiment_id: uuid.optional(),
  body: z.string().min(1).max(10000),
});

export const DecisionCommit = z.object({
  workspace_id: uuid,
  learning_id: uuid.optional(),
  body: z.string().min(1).max(10000),
});

/** Map op kind -> payload schema, for pending-operation validation. */
export const payloadSchemas = {
  "idea.create": IdeaCreate,
  "spec.draft": SpecDraft,
  "spec.version.add": SpecVersionAdd,
  "spec.approve": SpecApprove,
  "build.record": BuildRecord,
  "metric.define": MetricDefine,
  "metric.snapshot": MetricSnapshot,
  "experiment.create": ExperimentCreate,
  "learning.record": LearningRecord,
  "decision.commit": DecisionCommit,
} as const;

export const ProposeOperation = z.object({
  workspace_id: uuid,
  kind: PendingOpKind,
  risk_tier: RiskTier.default("low"),
  payload: z.record(z.unknown()),
});

export type AnyPayload = { [K in keyof typeof payloadSchemas]: z.infer<(typeof payloadSchemas)[K]> };
