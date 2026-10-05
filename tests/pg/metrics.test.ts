import { describe, it, expect } from "vitest";
import { freshWorkspace } from "../helpers";
import { defineMetric, recordSnapshot, dashboard } from "@/lib/metrics";
import { createExperiment, getExperimentEvidence } from "@/lib/experiments";
import { recordLearning } from "@/lib/learnings";

/**
 * SUCCESS CRITERION 3 — "Metric snapshot can be recorded and linked to an
 * experiment/learning."
 */
describe("metrics ingest + experiment linkage", () => {
  it("defines a metric, records a snapshot, links it to an experiment", async () => {
    const { workspaceId, owner } = await freshWorkspace();

    const metric = await defineMetric(owner, {
      workspace_id: workspaceId,
      key: "activation_rate",
      description: "share of signups who reach aha",
      unit: "ratio",
    });
    expect(metric.key).toBe("activation_rate");

    const exp = await createExperiment(owner, {
      workspace_id: workspaceId,
      name: "Onboarding checklist A/B",
      status: "running",
    });

    // Record a snapshot linked to the experiment in one call.
    const snap = await recordSnapshot(owner, {
      workspace_id: workspaceId,
      metric_key: "activation_rate",
      value: 0.42,
      experiment_id: exp.id,
    });
    expect(snap.metric_id).toBe(metric.id);

    // Evidence is retrievable through the experiment.
    const evidence = await getExperimentEvidence(owner, workspaceId, exp.id);
    expect(evidence?.evidence).toHaveLength(1);
    expect(evidence?.evidence[0]).toMatchObject({ key: "activation_rate", value: 0.42 });
  });

  it("refuses to snapshot an undefined metric (never invent metrics)", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    await expect(
      recordSnapshot(owner, {
        workspace_id: workspaceId,
        metric_key: "does_not_exist",
        value: 1,
      })
    ).rejects.toThrow(/not found/i);
  });

  it("links a learning to the experiment that produced the evidence", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    await defineMetric(owner, { workspace_id: workspaceId, key: "retention_d7" });
    const exp = await createExperiment(owner, { workspace_id: workspaceId, name: "exp" });
    await recordSnapshot(owner, {
      workspace_id: workspaceId,
      metric_key: "retention_d7",
      value: 0.31,
      experiment_id: exp.id,
    });
    const learning = await recordLearning(owner, {
      workspace_id: workspaceId,
      experiment_id: exp.id,
      body: "Checklist improved D7 retention by 4pts.",
    });
    expect(learning.id).toBeTruthy();
  });

  it("dashboard returns latest value per metric", async () => {
    const { workspaceId, owner } = await freshWorkspace();
    await defineMetric(owner, { workspace_id: workspaceId, key: "nps", unit: "score" });
    await recordSnapshot(owner, { workspace_id: workspaceId, metric_key: "nps", value: 10, captured_at: "2026-01-01T00:00:00Z" });
    await recordSnapshot(owner, { workspace_id: workspaceId, metric_key: "nps", value: 42, captured_at: "2026-02-01T00:00:00Z" });
    const dash = await dashboard(owner, workspaceId);
    const nps = dash.find((d) => d.key === "nps");
    expect(Number(nps?.value)).toBe(42);
  });
});
