import { PloError } from "@/lib/errors";

/** Map a thrown error to an HTTP status + JSON body for API/MCP responses. */
export function toHttpError(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof PloError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  const message = err instanceof Error ? err.message : "internal error";
  // RLS / constraint violations surface as generic DB errors — treat as 403/409.
  if (/row-level security|violates|permission denied/i.test(message)) {
    return { status: 403, body: { error: "forbidden", code: "rls" } };
  }
  return { status: 500, body: { error: message, code: "internal" } };
}

/** JSON Response helper for App Router route handlers. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
