import { route, requireWorkspace } from "@/lib/api/route";
import { draftSpec, listSpecs } from "@/lib/specs";

export const GET = route(async (ctx) => {
  const ws = requireWorkspace(ctx, undefined);
  return listSpecs(ctx.userId, ws);
});

export const POST = route(async (ctx, body) => {
  const ws = requireWorkspace(ctx, body);
  const b = body as { title: string; idea_id?: string; body?: Record<string, unknown> };
  return draftSpec(ctx.userId, { workspace_id: ws, title: b.title, idea_id: b.idea_id, body: b.body });
});
