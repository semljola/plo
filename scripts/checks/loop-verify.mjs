#!/usr/bin/env node
/**
 * loop-verify — the gate CI runs before accepting an agent-authored PR.
 *
 * It enforces the PLO invariants that agents must respect:
 *   1. Core never imports extensions (src/lib, src/app must not import src/extensions).
 *   2. All loop writes go through the engine's commitOp (no ad-hoc INSERTs into
 *      loop tables outside src/lib/loop/engine.ts).
 *   3. The spec-immutability trigger is present in a migration.
 *   4. Typecheck passes.
 *   5. Tests pass (when a database is available / RUN_DB_TESTS=1).
 *
 * Exit non-zero on any violation so CI blocks the merge. This is the
 * machine-checkable half of AGENTS.md.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fail = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fail.push(m); };

async function walk(dir, acc = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "dist", ".git"].includes(e.name)) continue;
      await walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

console.log("loop-verify");

// --- 1. Core must not import extensions -------------------------------------
console.log("[1] core isolation");
{
  const coreFiles = [
    ...(await walk(join(root, "src", "lib"))),
    ...(await walk(join(root, "src", "app"))),
  ];
  let violations = 0;
  for (const f of coreFiles) {
    const src = await readFile(f, "utf8");
    if (/from ["'][^"']*extensions\//.test(src) || /import\(["'][^"']*extensions\//.test(src)) {
      bad(`core file imports an extension: ${relative(root, f)}`);
      violations++;
    }
  }
  if (!violations) ok("no core→extension imports");
}

// --- 2. Loop writes go through the engine -----------------------------------
console.log("[2] single write path");
{
  const loopTables = [
    "ideas", "specs", "spec_versions", "builds",
    "metric_definitions", "metric_snapshots", "experiments",
    "learnings", "decisions",
  ];
  // Only the engine may INSERT/UPDATE these staged loop artifacts. Services
  // call commitOp; read-only SELECTs are fine everywhere. (releases and
  // experiment_metric_links are append-only link tables, not staged ops.)
  const engineRel = join("src", "lib", "loop", "engine.ts");
  const files = await walk(join(root, "src"));
  let violations = 0;
  const writeRe = new RegExp(
    `(insert\\s+into|update)\\s+(${loopTables.join("|")})\\b`, "i"
  );
  for (const f of files) {
    const rel = relative(root, f);
    if (rel === engineRel) continue;
    const src = await readFile(f, "utf8");
    // strip single-line comments to avoid false positives in docs
    for (const line of src.split("\n")) {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      if (writeRe.test(line)) {
        bad(`loop-table write outside engine: ${rel} :: ${line.trim().slice(0, 80)}`);
        violations++;
      }
    }
  }
  if (!violations) ok("all loop-table writes confined to engine.ts");
}

// --- 3. Immutability trigger present ----------------------------------------
console.log("[3] spec immutability trigger");
{
  const migDir = join(root, "supabase", "migrations");
  const migs = (await readdir(migDir)).filter((f) => f.endsWith(".sql"));
  let found = false;
  for (const m of migs) {
    const sql = await readFile(join(migDir, m), "utf8");
    if (/trg_spec_versions_immutable|prevent_approved_spec_version_update/.test(sql)) found = true;
  }
  found ? ok("immutability trigger defined in migrations") : bad("no spec-immutability trigger found");
}

// --- 4. Typecheck -----------------------------------------------------------
console.log("[4] typecheck");
try {
  execSync("npx tsc --noEmit", { cwd: root, stdio: "pipe" });
  ok("tsc --noEmit clean");
} catch (e) {
  bad("typecheck failed:\n" + (e.stdout?.toString() || e.message));
}

// --- 5. Tests (optional, needs DB) ------------------------------------------
if (process.env.RUN_DB_TESTS === "1") {
  console.log("[5] tests");
  try {
    execSync("npx vitest run", { cwd: root, stdio: "pipe" });
    ok("vitest passed");
  } catch (e) {
    bad("tests failed:\n" + (e.stdout?.toString() || e.message));
  }
} else {
  console.log("[5] tests skipped (set RUN_DB_TESTS=1 with a database to include)");
}

console.log("");
if (fail.length) {
  console.error(`loop-verify FAILED — ${fail.length} violation(s). Agent PR blocked.`);
  process.exit(1);
}
console.log("loop-verify PASSED — safe for agent PR.");
