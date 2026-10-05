import { route } from "@/lib/api/route";
import { approve } from "@/lib/pending-operations";

/** POST /api/pending-operations/:id/approve — human approves a staged op. */
export const POST = route(async (ctx, _body, req) => {
  const id = new URL(req.url).pathname.split("/").at(-2)!;
  return approve(ctx.userId, id);
});
