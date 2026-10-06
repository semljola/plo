"use client";

import { useActionState } from "react";
import {
  defineMetricAction,
  recordSnapshotAction,
  type MetricResult,
} from "./actions";

const initial: MetricResult = { ok: false };

export interface MetricOption {
  key: string;
  unit: string | null;
}
export interface ExperimentOption {
  id: string;
  name: string;
}

const field: React.CSSProperties = {
  background: "#0b1020",
  border: "1px solid #374151",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#e5e7eb",
  fontSize: 14,
};
const card: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: 10,
  padding: 16,
  display: "grid",
  gap: 8,
};
const button = (pending: boolean): React.CSSProperties => ({
  background: pending ? "#374151" : "#2563eb",
  color: "white",
  border: 0,
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  cursor: pending ? "default" : "pointer",
});

/**
 * Measure-stage panel: define a metric, and record a snapshot for an existing
 * metric (optionally linked to an experiment). Snapshots can only target
 * already-defined metrics — the dropdown enforces "never invent metrics".
 */
export function MetricsPanel({
  metrics,
  experiments,
}: {
  metrics: MetricOption[];
  experiments: ExperimentOption[];
}) {
  const [dState, defineAction, defining] = useActionState(defineMetricAction, initial);
  const [sState, snapshotAction, snapping] = useActionState(recordSnapshotAction, initial);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginBottom: 16 }}>
      <form action={defineAction} style={card}>
        <strong style={{ fontSize: 14 }}>Define a metric</strong>
        <input name="key" placeholder="metric_key (snake.or.dot case)" required style={field} />
        <input name="description" placeholder="Description (optional)" style={field} />
        <input name="unit" placeholder="Unit — ratio, minutes, score… (optional)" style={field} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" disabled={defining} style={button(defining)}>
            {defining ? "Defining…" : "Define metric"}
          </button>
          {dState.ok && <span style={{ color: "#34d399", fontSize: 13 }}>✓ Defined.</span>}
          {!dState.ok && dState.error && <span style={{ color: "#f87171", fontSize: 13 }}>{dState.error}</span>}
        </div>
      </form>

      <form action={snapshotAction} style={card}>
        <strong style={{ fontSize: 14 }}>Record a snapshot</strong>
        <select name="metric_key" defaultValue="" required style={field}>
          <option value="" disabled>
            Pick a metric…
          </option>
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.key}
              {m.unit ? ` (${m.unit})` : ""}
            </option>
          ))}
        </select>
        <input name="value" type="number" step="any" placeholder="Value" required style={field} />
        <select name="experiment_id" defaultValue="" style={field}>
          <option value="">Link an experiment (optional)</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" disabled={snapping} style={button(snapping)}>
            {snapping ? "Recording…" : "Record snapshot"}
          </button>
          {sState.ok && <span style={{ color: "#34d399", fontSize: 13 }}>✓ Snapshot recorded.</span>}
          {!sState.ok && sState.error && <span style={{ color: "#f87171", fontSize: 13 }}>{sState.error}</span>}
        </div>
        {metrics.length === 0 && (
          <span style={{ fontSize: 12, color: "#6b7280" }}>Define a metric first — snapshots can only target existing metrics.</span>
        )}
      </form>
    </div>
  );
}
