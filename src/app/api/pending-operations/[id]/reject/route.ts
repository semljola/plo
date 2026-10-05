import { route } from "@/lib/api/route";
import { reject } from "@/lib/pending-operations";

/** POST /api/pending-operations/:id/reject — human rejects a staged op. */
export const POST = route(async (ctx, body, req) => {
  const id = new URL(req.url).pathname.split("/").at(-2)!;
  const reason = (body as { reason?: string } | undefined)?.reason;
  return reject(ctx.userId, id, reason);
});
