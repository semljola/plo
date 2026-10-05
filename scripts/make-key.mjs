#!/usr/bin/env node
/**
 * Create a workspace-scoped API key for an existing workspace, enrolling the
 * key's pseudo-user as an admin member so it can approve ops. Prints the raw
 * key once. Usage: node scripts/make-key.mjs <workspace_id> [admin|member]
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const ws = process.argv[2];
const role = process.argv[3] ?? "admin";
if (!ws) { console.error("usage: make-key.mjs <workspace_id> [admin|member]"); process.exit(1); }

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "55432";
const db = process.env.PGDATABASE ?? "plo";
const url = process.env.DATABASE_URL ?? ["postgresql://plo@", host, ":", port, "/", db].join("");

const raw = `plo_${randomBytes(24).toString("hex")}`;
const hash = createHash("sha256").update(raw).digest("hex");

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const keyId = (await c.query(
    "insert into api_keys (workspace_id, name, key_hash, scopes) values ($1,$2,$3,$4) returning id",
    [ws, "live-test", hash, [role]]
  )).rows[0].id;
  // The key's pseudo-user (its id) must be a workspace member for RLS.
  await c.query(
    "insert into workspace_members (workspace_id, user_id, role) values ($1,$2,$3) on conflict do nothing",
    [ws, keyId, role]
  );
  console.log(raw);
} finally {
  await c.end();
}
