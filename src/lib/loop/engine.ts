import type { Executor } from "@/lib/db";
import { emit } from "@/lib/events";
import { ImmutableError, NotFoundError, PloError, ValidationError } from "@/lib/errors";
import { payloadSchemas, type AnyPayload } from "./schemas";
import type { PendingOpKind } from "./types";

/**
 * PLO loop engine — the SINGLE write path for loop state.
 *
 * Every mutation to the loop graph (ideas → specs → versions → builds →
 * metrics → experiments → learnings → decisions) flows through commitOp().
 * Direct human actions and approved agent operations both land here, so there
 * is exactly one place where invariants (validation, immutability, event
 * emission, audit) are enforced.
 *
 * The caller supplies the Executor (a tx client). Whoever opens the
 * transaction decides the identity: withAdmin (trusted/service) or withUser
 * (RLS-enforced). The engine itself is identity-agnostic.
 */

export interface CommitContext {
  actorId: string | null;
}

export interface CommitResult {
  kind: PendingOpKind;
  id: string;
  [k: string]: unknown;
}

function parse<K extends PendingOpKind>(kind: K, payload: unknown): AnyPayload[K] {
  const schema = payloadSchemas[kind];
  const res = schema.safeParse(payload);
  if (!res.success) {
    throw new ValidationError(
      `invalid payload for ${kind}: ${res.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`
    );
  }
  return res.data as AnyPayload[K];
}

async function audit(
  tx: Executor,
  ctx: CommitContext,
  workspaceId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  await tx.query(
    "insert into audit_log (workspace_id, actor_id, action, payload) values ($1,$2,$3,$4)",
    [workspaceId, ctx.actorId, action, payload]
  );
}

/**
 * Commit a single loop operation. Validates, writes, audits, emits — atomic
 * within the caller's transaction.
 */
export async function commitOp(
  tx: Executor,
  ctx: CommitContext,
  kind: PendingOpKind,
  rawPayload: unknown
): Promise<CommitResult> {
  const at = new Date().toISOString();

  switch (kind) {
    case "idea.create": {
      const p = parse("idea.create", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into ideas (workspace_id, title, body) values ($1,$2,$3) returning id",
        [p.workspace_id, p.title, p.body ?? null]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "idea.create", { id });
      await emit({ type: "idea.created", idea_id: id, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id };
    }

    case "spec.draft": {
      const p = parse("spec.draft", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into specs (workspace_id, idea_id, title, status) values ($1,$2,$3,'draft') returning id",
        [p.workspace_id, p.idea_id ?? null, p.title]
      );
      const specId = rows[0]!.id;
      // First version is created alongside the spec (draft, unapproved).
      await tx.query(
        "insert into spec_versions (workspace_id, spec_id, version, body) values ($1,$2,1,$3)",
        [p.workspace_id, specId, p.body]
      );
      await audit(tx, ctx, p.workspace_id, "spec.draft", { spec_id: specId });
      await emit({ type: "spec.drafted", spec_id: specId, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id: specId, version: 1 };
    }

    case "spec.version.add": {
      const p = parse("spec.version.add", rawPayload);
      // New version = correction. Compute next version atomically.
      const { rows } = await tx.query<{ next: number }>(
        "select coalesce(max(version),0)+1 as next from spec_versions where spec_id=$1 and workspace_id=$2",
        [p.spec_id, p.workspace_id]
      );
      if (rows.length === 0) throw new NotFoundError("spec");
      const version = Number(rows[0]!.next);
      const ins = await tx.query<{ id: string }>(
        "insert into spec_versions (workspace_id, spec_id, version, body) values ($1,$2,$3,$4) returning id",
        [p.workspace_id, p.spec_id, version, p.body]
      );
      await audit(tx, ctx, p.workspace_id, "spec.version.add", { spec_id: p.spec_id, version });
      await emit({ type: "spec.version.added", spec_id: p.spec_id, version, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id: ins.rows[0]!.id, spec_id: p.spec_id, version };
    }

    case "spec.approve": {
      const p = parse("spec.approve", rawPayload);
      // Stamp approved_at on the target version; the DB trigger forbids any
      // body edit in the same statement and forbids future UPDATEs. Approving
      // an already-approved version is a no-op error surfaced by the trigger.
      let res;
      try {
        res = await tx.query<{ id: string }>(
          "update spec_versions set approved_at = now() where spec_id=$1 and version=$2 and workspace_id=$3 and approved_at is null returning id",
          [p.spec_id, p.version, p.workspace_id]
        );
      } catch (err) {
        throw new ImmutableError((err as Error).message);
      }
      if (res.rows.length === 0) {
        // Either the version doesn't exist or it's already approved.
        const check = await tx.query(
          "select approved_at from spec_versions where spec_id=$1 and version=$2 and workspace_id=$3",
          [p.spec_id, p.version, p.workspace_id]
        );
        if (check.rows.length === 0) throw new NotFoundError("spec_version");
        throw new ImmutableError("spec version already approved");
      }
      await tx.query("update specs set status='approved' where id=$1 and workspace_id=$2", [p.spec_id, p.workspace_id]);
      await audit(tx, ctx, p.workspace_id, "spec.approve", { spec_id: p.spec_id, version: p.version });
      await emit({ type: "spec.approved", spec_id: p.spec_id, version: p.version, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id: p.spec_id, version: p.version };
    }

    case "build.record": {
      const p = parse("build.record", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into builds (workspace_id, spec_id, git_sha, status) values ($1,$2,$3,$4) returning id",
        [p.workspace_id, p.spec_id ?? null, p.git_sha ?? null, p.status]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "build.record", { id, git_sha: p.git_sha });
      await emit({ type: "build.recorded", build_id: id, git_sha: p.git_sha ?? null, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id };
    }

    case "metric.define": {
      const p = parse("metric.define", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into metric_definitions (workspace_id, key, description, unit) values ($1,$2,$3,$4) on conflict (workspace_id, key) do update set description=excluded.description, unit=excluded.unit returning id",
        [p.workspace_id, p.key, p.description ?? null, p.unit ?? null]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "metric.define", { id, key: p.key });
      await emit({ type: "metric.defined", metric_id: id, key: p.key, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id, key: p.key };
    }

    case "metric.snapshot": {
      const p = parse("metric.snapshot", rawPayload);
      // Resolve metric_id from key if needed — never invent a metric: it must
      // already be defined (AGENTS.md rule #3).
      let metricId = p.metric_id ?? null;
      if (!metricId) {
        const m = await tx.query<{ id: string }>(
          "select id from metric_definitions where workspace_id=$1 and key=$2",
          [p.workspace_id, p.metric_key]
        );
        if (m.rows.length === 0) throw new NotFoundError(`metric_definition '${p.metric_key}'`);
        metricId = m.rows[0]!.id;
      }
      const { rows } = await tx.query<{ id: string }>(
        "insert into metric_snapshots (workspace_id, metric_id, value, captured_at) values ($1,$2,$3,coalesce($4::timestamptz, now())) returning id",
        [p.workspace_id, metricId, p.value, p.captured_at ?? null]
      );
      const snapshotId = rows[0]!.id;
      // Optional provenance link to an experiment.
      if (p.experiment_id) {
        await tx.query(
          "insert into experiment_metric_links (workspace_id, experiment_id, snapshot_id) values ($1,$2,$3) on conflict do nothing",
          [p.workspace_id, p.experiment_id, snapshotId]
        );
      }
      await audit(tx, ctx, p.workspace_id, "metric.snapshot", { id: snapshotId, metric_id: metricId, value: p.value });
      await emit({ type: "metric.snapshot", metric_id: metricId, value: p.value, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id: snapshotId, metric_id: metricId };
    }

    case "experiment.create": {
      const p = parse("experiment.create", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into experiments (workspace_id, spec_id, name, status) values ($1,$2,$3,$4) returning id",
        [p.workspace_id, p.spec_id ?? null, p.name, p.status]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "experiment.create", { id });
      await emit({ type: "experiment.created", experiment_id: id, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id };
    }

    case "learning.record": {
      const p = parse("learning.record", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into learnings (workspace_id, experiment_id, body) values ($1,$2,$3) returning id",
        [p.workspace_id, p.experiment_id ?? null, p.body]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "learning.record", { id });
      await emit({ type: "learning.recorded", learning_id: id, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id };
    }

    case "decision.commit": {
      const p = parse("decision.commit", rawPayload);
      const { rows } = await tx.query<{ id: string }>(
        "insert into decisions (workspace_id, learning_id, body, committed_at) values ($1,$2,$3, now()) returning id",
        [p.workspace_id, p.learning_id ?? null, p.body]
      );
      const id = rows[0]!.id;
      await audit(tx, ctx, p.workspace_id, "decision.commit", { id });
      await emit({ type: "decision.committed", decision_id: id, workspace_id: p.workspace_id, at, actor_id: ctx.actorId });
      return { kind, id };
    }

    default: {
      const _exhaustive: never = kind;
      throw new PloError(`unknown op kind: ${String(_exhaustive)}`, "unknown_kind", 400);
    }
  }
}

/**
 * Legacy entry point kept for the folder-map contract. Prefer commitOp.
 */
export async function commitTransition(_input: unknown): Promise<void> {
  throw new PloError("use commitOp(tx, ctx, kind, payload)", "deprecated", 400);
}
