import { withUser, withAdmin, type Executor } from "@/lib/db";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, PloError } from "@/lib/errors";
import { commitOp } from "@/lib/loop/engine";
import { canAutoApprove, type PendingOperation } from "@/lib/loop/types";
import { ProposeOperation, payloadSchemas } from "@/lib/loop/schemas";

/**
 * Staged agent operations.
 *
 *   propose() — agent (or human) stages an op. Low-risk ops auto-commit through
 *               the engine immediately; medium/high stay pending for a human.
 *   approve() — a human (admin/owner) commits a pending op via the engine.
 *   reject()  — a human declines; nothing is written to the loop graph.
 *
 * All three run as the acting user under RLS, so an agent cannot stage into a
 * workspace it isn't a member of, and only members can decide.
 */

function rowToOp(r: Record<string, unknown>): PendingOperation {
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    kind: r.kind as PendingOperation["kind"],
    risk_tier: r.risk_tier as PendingOperation["risk_tier"],
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status as PendingOperation["status"],
    proposed_by: (r.proposed_by ?? null) as string | null,
    decided_by: (r.decided_by ?? null) as string | null,
    decided_at: (r.decided_at ?? null) as string | null,
    result: (r.result ?? null) as Record<string, unknown> | null,
    error: (r.error ?? null) as string | null,
    created_at: r.created_at as string,
  };
}

export interface ProposeInput {
  workspace_id: string;
  kind: PendingOperation["kind"];
  risk_tier?: PendingOperation["risk_tier"];
  payload: Record<string, unknown>;
}

export interface ProposeResult {
  operation: PendingOperation;
  /** When auto-approved, the engine's commit result. */
  committed?: Record<string, unknown>;
}

export async function propose(userId: string, input: ProposeInput): Promise<ProposeResult> {
  const parsed = ProposeOperation.safeParse(input);
  if (!parsed.success) {
    throw new PloError(
      `invalid proposal: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      "validation",
      422
    );
  }
  const { workspace_id, kind, risk_tier, payload } = parsed.data;

  // Validate the payload against its kind schema up front so we never stage an
  // operation that could never commit.
  const schema = payloadSchemas[kind];
  const payloadCheck = schema.safeParse(payload);
  if (!payloadCheck.success) {
    throw new PloError(
      `invalid payload for ${kind}: ${payloadCheck.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      "validation",
      422
    );
  }

  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "insert into pending_operations (workspace_id, kind, risk_tier, payload, status, proposed_by) values ($1,$2,$3,$4,'pending',$5) returning *",
      [workspace_id, kind, risk_tier, payload, userId]
    );
    if (rows.length === 0) {
      // RLS blocked the insert → caller isn't a member.
      throw new ForbiddenError("not a member of this workspace");
    }
    let op = rowToOp(rows[0]!);

    await emit({
      type: "pending_operation.proposed",
      operation_id: op.id,
      risk_tier: op.risk_tier,
      workspace_id,
      at: new Date().toISOString(),
      actor_id: userId,
    });

    // Low-risk → auto-commit in the same transaction.
    if (canAutoApprove(risk_tier)) {
      const committed = await commitInEngine(tx, userId, op);
      op = committed.op;
      return { operation: op, committed: committed.result };
    }

    return { operation: op };
  });
}

async function commitInEngine(
  tx: Executor,
  userId: string,
  op: PendingOperation
): Promise<{ op: PendingOperation; result: Record<string, unknown> }> {
  const result = await commitOp(tx, { actorId: userId }, op.kind, op.payload);
  const { rows } = await tx.query(
    "update pending_operations set status='approved', decided_by=$2, decided_at=now(), result=$3 where id=$1 returning *",
    [op.id, userId, result]
  );
  await emit({
    type: "pending_operation.approved",
    operation_id: op.id,
    workspace_id: op.workspace_id,
    at: new Date().toISOString(),
    actor_id: userId,
  });
  return { op: rowToOp(rows[0]!), result: result as Record<string, unknown> };
}

export async function approve(
  userId: string,
  operationId: string
): Promise<{ operation: PendingOperation; result: Record<string, unknown> }> {
  return withUser(userId, async (tx) => {
    // Lock the row; only members can see it (RLS) and only admins/owners decide.
    const { rows } = await tx.query(
      "select * from pending_operations where id=$1 for update",
      [operationId]
    );
    if (rows.length === 0) throw new NotFoundError("pending_operation");
    const op = rowToOp(rows[0]!);
    if (op.status !== "pending") {
      throw new PloError(`operation already ${op.status}`, "conflict", 409);
    }

    // Enforce human-approval authority: must be admin/owner in the workspace.
    const auth = await tx.query<{ ok: boolean }>(
      "select plo_has_role($1, array['owner','admin']) as ok",
      [op.workspace_id]
    );
    if (!auth.rows[0]?.ok) {
      throw new ForbiddenError("approving requires owner/admin role");
    }

    const committed = await commitInEngine(tx, userId, op);
    return { operation: committed.op, result: committed.result };
  });
}

export async function reject(
  userId: string,
  operationId: string,
  reason?: string
): Promise<PendingOperation> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select * from pending_operations where id=$1 for update",
      [operationId]
    );
    if (rows.length === 0) throw new NotFoundError("pending_operation");
    const op = rowToOp(rows[0]!);
    if (op.status !== "pending") {
      throw new PloError(`operation already ${op.status}`, "conflict", 409);
    }
    const auth = await tx.query<{ ok: boolean }>(
      "select plo_has_role($1, array['owner','admin']) as ok",
      [op.workspace_id]
    );
    if (!auth.rows[0]?.ok) {
      throw new ForbiddenError("rejecting requires owner/admin role");
    }
    const upd = await tx.query(
      "update pending_operations set status='rejected', decided_by=$2, decided_at=now(), error=$3 where id=$1 returning *",
      [operationId, userId, reason ?? null]
    );
    await emit({
      type: "pending_operation.rejected",
      operation_id: operationId,
      workspace_id: op.workspace_id,
      at: new Date().toISOString(),
      actor_id: userId,
    });
    return rowToOp(upd.rows[0]!);
  });
}

export async function list(
  userId: string,
  workspaceId: string,
  status?: PendingOperation["status"]
): Promise<PendingOperation[]> {
  return withUser(userId, async (tx) => {
    const { rows } = status
      ? await tx.query("select * from pending_operations where workspace_id=$1 and status=$2 order by created_at desc", [workspaceId, status])
      : await tx.query("select * from pending_operations where workspace_id=$1 order by created_at desc", [workspaceId]);
    return rows.map(rowToOp);
  });
}

export { withAdmin };
