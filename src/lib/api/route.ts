import { authenticate, type AuthContext } from "@/lib/auth/request";
import { toHttpError, json } from "@/lib/api";
import { ForbiddenError } from "@/lib/errors";

/**
 * Wrap a route handler: authenticate, resolve the workspace, and translate
 * thrown domain errors into HTTP responses. Handlers receive the AuthContext
 * and the parsed JSON body.
 */
export function route(
  handler: (ctx: AuthContext, body: unknown, req: Request) => Promise<unknown>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const ctx = await authenticate(req);
      let body: unknown = undefined;
      if (req.method !== "GET" && req.method !== "DELETE") {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      }
      const result = await handler(ctx, body, req);
      return json(result ?? { ok: true });
    } catch (err) {
      const { status, body } = toHttpError(err);
      return json(body, status);
    }
  };
}

/** Resolve the effective workspace id (from key or x-plo-workspace / body). */
export function requireWorkspace(ctx: AuthContext, body: unknown): string {
  const fromBody = (body as { workspace_id?: string } | undefined)?.workspace_id;
  const ws = ctx.workspaceId ?? fromBody;
  if (!ws) throw new ForbiddenError("no workspace in context");
  // If a key is workspace-bound, body cannot override it.
  if (ctx.workspaceId && fromBody && fromBody !== ctx.workspaceId) {
    throw new ForbiddenError("workspace mismatch");
  }
  return ws;
}
