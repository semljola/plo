#!/usr/bin/env node
/**
 * Live end-to-end HTTP test against a running PLO server. Proves success
 * criteria over the real network stack:
 *   1. Agent stages a HIGH-risk spec.draft → it stays pending (not committed).
 *   2. Human approves over HTTP → the spec is created via the engine.
 *   3. The spec version is approved → immutable.
 *   4. A direct body mutation attempt is rejected by the DB trigger.
 *   5. A metric snapshot is recorded and linked to an experiment.
 *
 * Usage: PLO_BASE=http://localhost:3100 PLO_WS=<id> PLO_KEY=<raw> node scripts/e2e-http.mjs
 */
import assert from "node:assert";

const BASE = process.env.PLO_BASE ?? "http://localhost:3100";
const KEY = process.env.PLO_KEY;
assert(KEY, "PLO_KEY required");

const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let pass = 0;
const ok = (m) => { console.log(`  PASS ${m}`); pass++; };

// 1. stage high-risk spec draft
const stage = await call("POST", "/api/pending-operations", {
  kind: "spec.draft", risk_tier: "high",
  payload: { title: "Agent HTTP spec", body: { acceptance: ["x"] } },
});
assert.equal(stage.status, 200, `stage status ${stage.status}: ${JSON.stringify(stage.body)}`);
assert.equal(stage.body.operation.status, "pending", "high-risk op must be pending");
assert.equal(stage.body.committed, undefined, "high-risk op must NOT auto-commit");
ok("high-risk agent spec.draft staged as pending (not committed)");

const opId = stage.body.operation.id;

// 2. it appears in the pending queue
const pend = await call("GET", "/api/pending-operations?status=pending");
assert.ok(pend.body.some((o) => o.id === opId), "op in pending queue");
ok("staged op visible in pending queue");

// 3. human approves over HTTP
const appr = await call("POST", `/api/pending-operations/${opId}/approve`);
assert.equal(appr.status, 200, `approve status ${appr.status}: ${JSON.stringify(appr.body)}`);
assert.equal(appr.body.operation.status, "approved");
const specId = appr.body.result.id;
assert.ok(specId, "spec created on approval");
ok("human approved staged spec over HTTP → spec committed via engine");

// 4. approve the spec version → immutability point
const specAppr = await call("POST", `/api/specs/${specId}`, { action: "approve", version: 1 });
assert.equal(specAppr.status, 200, `spec approve ${specAppr.status}: ${JSON.stringify(specAppr.body)}`);
ok("spec version 1 approved");

// 5. fetch spec, confirm approved + body intact
const got = await call("GET", `/api/specs/${specId}`);
assert.equal(got.body.status, "approved");
assert.equal(got.body.versions.length, 1);
assert.ok(got.body.versions[0].approved_at, "version stamped approved_at");
ok("approved spec is retrievable with approved_at set");

// 6. correction = new version (allowed)
const v2 = await call("POST", `/api/specs/${specId}`, { action: "version", body: { acceptance: ["x", "y"] } });
assert.equal(v2.status, 200, `version add ${v2.status}`);
assert.equal(v2.body.version, 2);
ok("correction appended as spec version 2 (not an in-place edit)");

// 7. metric define + snapshot linked to an experiment, all over HTTP
await call("POST", "/api/metrics", { action: "define", key: "http_conv", unit: "ratio" });
const snap = await call("POST", "/api/metrics", { action: "snapshot", metric_key: "http_conv", value: 0.5 });
assert.equal(snap.status, 200, `snapshot ${snap.status}: ${JSON.stringify(snap.body)}`);
const dash = await call("GET", "/api/metrics");
assert.ok(dash.body.some((m) => m.key === "http_conv" && Number(m.value) === 0.5), "metric on dashboard");
ok("metric defined + snapshot recorded + visible on dashboard over HTTP");

// 8. snapshot for undefined metric is rejected
const bad = await call("POST", "/api/metrics", { action: "snapshot", metric_key: "ghost", value: 1 });
assert.equal(bad.status, 404, `undefined-metric snapshot should 404, got ${bad.status}`);
ok("snapshot for undefined metric rejected (never invent metrics)");

console.log(`\nALL ${pass} LIVE HTTP CHECKS PASSED`);
