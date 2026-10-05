/**
 * Core domain events. The engine emits these after each committed transition;
 * extensions subscribe (core never imports extensions). Payloads are
 * workspace-scoped and carry the affected entity id.
 */
export interface EventBase {
  workspace_id: string;
  at: string; // ISO timestamp
  actor_id: string | null;
}

export type CoreEvent =
  | ({ type: "idea.created"; idea_id: string } & EventBase)
  | ({ type: "spec.drafted"; spec_id: string } & EventBase)
  | ({ type: "spec.version.added"; spec_id: string; version: number } & EventBase)
  | ({ type: "spec.approved"; spec_id: string; version: number } & EventBase)
  | ({ type: "build.recorded"; build_id: string; git_sha: string | null } & EventBase)
  | ({ type: "metric.defined"; metric_id: string; key: string } & EventBase)
  | ({ type: "metric.snapshot"; metric_id: string; value: number } & EventBase)
  | ({ type: "experiment.created"; experiment_id: string } & EventBase)
  | ({ type: "learning.recorded"; learning_id: string } & EventBase)
  | ({ type: "decision.committed"; decision_id: string } & EventBase)
  | ({ type: "pending_operation.proposed"; operation_id: string; risk_tier: string } & EventBase)
  | ({ type: "pending_operation.approved"; operation_id: string } & EventBase)
  | ({ type: "pending_operation.rejected"; operation_id: string } & EventBase);

export type CoreEventType = CoreEvent["type"];
