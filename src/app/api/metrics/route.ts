import { route, requireWorkspace } from "@/lib/api/route";
import { defineMetric, recordSnapshot, dashboard } from "@/lib/metrics";

/** GET /api/metrics — dashboard: latest value per metric. */
export const GET = route(async (ctx) => {
  const ws = requireWorkspace(ctx, undefined);
  return dashboard(ctx.userId, ws);
});

/** POST /api/metrics  { action: "define" | "snapshot", ... } */
export const POST = route(async (ctx, body) => {
  const ws = requireWorkspace(ctx, body);
  const b = body as Record<string, unknown>;
  if (b.action === "define") {
    return defineMetric(ctx.userId, {
      workspace_id: ws,
      key: b.key as string,
      description: b.description as string | undefined,
      unit: b.unit as string | undefined,
    });
  }
  return recordSnapshot(ctx.userId, {
    workspace_id: ws,
    metric_id: b.metric_id as string | undefined,
    metric_key: b.metric_key as string | undefined,
    value: b.value as number,
    captured_at: b.captured_at as string | undefined,
    experiment_id: b.experiment_id as string | undefined,
  });
});
