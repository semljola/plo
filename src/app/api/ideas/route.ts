import { route, requireWorkspace } from "@/lib/api/route";
import { createIdea, listIdeas } from "@/lib/ideas";

export const GET = route(async (ctx) => {
  const ws = requireWorkspace(ctx, undefined);
  return listIdeas(ctx.userId, ws);
});

export const POST = route(async (ctx, body) => {
  const ws = requireWorkspace(ctx, body);
  const b = body as { title: string; body?: string };
  return createIdea(ctx.userId, { workspace_id: ws, title: b.title, body: b.body });
});
