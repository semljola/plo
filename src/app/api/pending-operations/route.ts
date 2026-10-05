import { route, requireWorkspace } from "@/lib/api/route";
import { propose, list } from "@/lib/pending-operations";
import type { PendingOperation } from "@/lib/loop/types";

/** GET  /api/pending-operations?status=pending — list staged ops. */
export const GET = route(async (ctx, _body, req) => {
  const ws = requireWorkspace(ctx, undefined);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as PendingOperation["status"] | null;
  return list(ctx.userId, ws, status ?? undefined);
});

/** POST /api/pending-operations — agent stages an operation. */
export const POST = route(async (ctx, body) => {
  const ws = requireWorkspace(ctx, body);
  const b = body as { kind: PendingOperation["kind"]; risk_tier?: PendingOperation["risk_tier"]; payload: Record<string, unknown> };
  return propose(ctx.userId, {
    workspace_id: ws,
    kind: b.kind,
    risk_tier: b.risk_tier,
    // Ensure payload is workspace-scoped to the authenticated workspace.
    payload: { ...b.payload, workspace_id: ws },
  });
});
