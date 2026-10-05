import { createHash, randomBytes } from "node:crypto";
import { adminPool } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";

/**
 * Request authentication for API routes.
 *
 * Two mechanisms:
 *   1. API key (Authorization: Bearer plo_...) — for agents/MCP/CI. The key is
 *      hashed (sha256) and matched against api_keys; it resolves to a workspace
 *      and a synthetic actor id, plus scopes.
 *   2. Dev header (x-plo-user) — only honored when PLO_DEV_AUTH=1, for local
 *      development and demos without a full auth provider.
 *
 * Returns the acting user id used to drive RLS. For API keys we map to a stable
 * per-key pseudo-user (the key id) that must be enrolled as a workspace member.
 */

export interface AuthContext {
  userId: string;
  workspaceId: string | null;
  scopes: string[];
  via: "api_key" | "dev";
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a new API key (returns the raw key once; store only the hash). */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = `plo_${randomBytes(24).toString("hex")}`;
  return { raw, hash: hashKey(raw) };
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const raw = authz.slice(7).trim();
    const hash = hashKey(raw);
    const { rows } = await adminPool().query(
      "select id, workspace_id, scopes from api_keys where key_hash=$1",
      [hash]
    );
    if (rows.length === 0) throw new ForbiddenError("invalid API key");
    const k = rows[0] as { id: string; workspace_id: string; scopes: string[] };
    return { userId: k.id, workspaceId: k.workspace_id, scopes: k.scopes ?? [], via: "api_key" };
  }

  if (process.env.PLO_DEV_AUTH === "1") {
    const user = req.headers.get("x-plo-user");
    const ws = req.headers.get("x-plo-workspace");
    if (user) {
      return { userId: user, workspaceId: ws, scopes: ["admin"], via: "dev" };
    }
  }

  throw new ForbiddenError("authentication required");
}
