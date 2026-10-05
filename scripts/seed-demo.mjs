#!/usr/bin/env node
/**
 * Seed a demo workspace with the full loop so the dashboard has data. Prints
 * the PLO_DEMO_USER / PLO_DEMO_WORKSPACE env lines to paste into .env.
 *
 *   node scripts/seed-demo.mjs
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "55432";
const db = process.env.PGDATABASE ?? "plo";
const url = process.env.DATABASE_URL ?? ["postgresql://plo@", host, ":", port, "/", db].join("");

const c = new pg.Client({ connectionString: url });
await c.connect();

const owner = randomUUID();
try {
  const ws = (await c.query("insert into workspaces (name) values ($1) returning id", ["Demo"])).rows[0].id;
  await c.query("insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'owner')", [ws, owner]);

  const idea = (await c.query("insert into ideas (workspace_id, title, body) values ($1,$2,$3) returning id", [ws, "Faster onboarding", "Reduce time-to-value"])).rows[0].id;
  const spec = (await c.query("insert into specs (workspace_id, idea_id, title, status) values ($1,$2,$3,'approved') returning id", [ws, idea, "Onboarding checklist"])).rows[0].id;
  await c.query("insert into spec_versions (workspace_id, spec_id, version, body, approved_at) values ($1,$2,1,$3, now())", [ws, spec, { acceptance: ["checklist renders", "completion tracked"] }]);

  for (const [key, unit, vals] of [
    ["activation_rate", "ratio", [0.31, 0.37, 0.42]],
    ["time_to_value_min", "minutes", [48, 36, 25]],
    ["nps", "score", [22, 31, 44]],
  ]) {
    const mid = (await c.query("insert into metric_definitions (workspace_id, key, unit) values ($1,$2,$3) returning id", [ws, key, unit])).rows[0].id;
    let day = 1;
    for (const v of vals) {
      await c.query("insert into metric_snapshots (workspace_id, metric_id, value, captured_at) values ($1,$2,$3,$4)", [ws, mid, v, `2026-0${day}-01T00:00:00Z`]);
      day++;
    }
  }

  // one pending high-risk agent op awaiting approval
  await c.query(
    "insert into pending_operations (workspace_id, kind, risk_tier, payload, status, proposed_by) values ($1,'spec.approve','high',$2,'pending',$3)",
    [ws, { workspace_id: ws, spec_id: spec, version: 1 }, randomUUID()]
  );

  console.log("✓ seeded demo workspace");
  console.log("\nPaste into .env:");
  console.log(`PLO_DEMO_USER=${owner}`);
  console.log(`PLO_DEMO_WORKSPACE=${ws}`);
} finally {
  await c.end();
}
