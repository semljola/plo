import { route, requireWorkspace } from "@/lib/api/route";
import { approveSpec, addSpecVersion, getSpec } from "@/lib/specs";

export const GET = route(async (ctx, _body, req) => {
  const ws = requireWorkspace(ctx, undefined);
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  return getSpec(ctx.userId, ws, id);
});

/** POST /api/specs/:id  { action: "approve", version } | { action: "version", body } */
export const POST = route(async (ctx, body, req) => {
  const ws = requireWorkspace(ctx, body);
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  const b = body as { action: "approve" | "version"; version?: number; body?: Record<string, unknown> };
  if (b.action === "approve") {
    return approveSpec(ctx.userId, { workspace_id: ws, spec_id: id, version: b.version! });
  }
  return addSpecVersion(ctx.userId, { workspace_id: ws, spec_id: id, body: b.body! });
});
