#!/usr/bin/env node
/**
 * Apply all PLO migrations to the database in DATABASE_URL (owner role),
 * optionally dropping everything first. Used by tests and local dev.
 *
 *   node scripts/db-reset.mjs          # apply migrations (idempotent-ish)
 *   node scripts/db-reset.mjs --fresh  # drop public schema, recreate, apply
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "55432";
const db = process.env.PGDATABASE ?? "plo";
const url = process.env.DATABASE_URL ?? ["postgresql://plo@", host, ":", port, "/", db].join("");

const fresh = process.argv.includes("--fresh");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  if (fresh) {
    console.log("↺ dropping public schema");
    await client.query("drop schema if exists public cascade; create schema public;");
    // Role is cluster-scoped; drop its ownerships are gone with the schema.
  }
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await readFile(join(MIGRATIONS, f), "utf8");
    process.stdout.write(`→ ${f} ... `);
    await client.query(sql);
    console.log("ok");
  }
  console.log(`✓ applied ${files.length} migration(s)`);
} catch (err) {
  console.error("✗ migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
