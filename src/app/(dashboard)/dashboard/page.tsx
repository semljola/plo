import { dashboard } from "@/lib/metrics";
import { list } from "@/lib/pending-operations";
import { NewIdeaForm } from "./new-idea-form";
import { DraftSpecForm } from "./draft-spec-form";
import { PendingOpRow } from "./pending-op-row";
import { getIdeas, getSpecs } from "./actions";

/**
 * Minimal metrics dashboard. Server component — reads directly through the
 * service layer under the demo workspace/user supplied via env (set by the
 * seed script). In a real deployment this resolves from the session.
 */
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const userId = process.env.PLO_DEMO_USER;
  const workspaceId = process.env.PLO_DEMO_WORKSPACE;

  if (!userId || !workspaceId) {
    return (
      <main style={{ maxWidth: 880, margin: "0 auto", padding: 48 }}>
        <h1>Dashboard</h1>
        <p style={{ color: "#9ca3af" }}>
          Set <code>PLO_DEMO_USER</code> and <code>PLO_DEMO_WORKSPACE</code> (see
          <code> scripts/seed-demo.mjs</code>) to view live metrics.
        </p>
      </main>
    );
  }

  const [metrics, pending, ideas, specs] = await Promise.all([
    dashboard(userId, workspaceId),
    list(userId, workspaceId, "pending"),
    getIdeas(),
    getSpecs(),
  ]);

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28 }}>Metrics</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
        {metrics.length === 0 && <p style={{ color: "#9ca3af" }}>No metrics defined yet.</p>}
        {metrics.map((m) => (
          <div key={m.key} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{m.key}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {m.value ?? "—"}
              {m.unit ? <span style={{ fontSize: 13, color: "#6b7280" }}> {m.unit}</span> : null}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              {m.captured_at ? new Date(m.captured_at).toLocaleString() : "no snapshot"}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 20, marginTop: 36 }}>Pending agent operations ({pending.length})</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        {pending.map((op) => (
          <PendingOpRow
            key={op.id}
            op={{ id: op.id, kind: op.kind, risk_tier: op.risk_tier, created_at: op.created_at }}
          />
        ))}
        {pending.length === 0 && <li style={{ color: "#9ca3af" }}>Nothing awaiting approval.</li>}
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 36 }}>Specs ({specs.length})</h2>
      <DraftSpecForm ideas={ideas.map((i) => ({ id: i.id, title: i.title }))} />
      <ul style={{ paddingLeft: 18 }}>
        {specs.map((s) => (
          <li key={s.id} style={{ marginBottom: 8 }}>
            <strong>{s.title}</strong>{" "}
            <span
              style={{
                fontSize: 12,
                color: s.status === "approved" ? "#34d399" : "#fbbf24",
              }}
            >
              [{s.status}]
            </span>
          </li>
        ))}
        {specs.length === 0 && <li style={{ color: "#9ca3af", listStyle: "none" }}>No specs yet — draft the first one above.</li>}
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 36 }}>Ideas ({ideas.length})</h2>
      <NewIdeaForm />
      <ul style={{ paddingLeft: 18 }}>
        {ideas.map((i) => (
          <li key={i.id} style={{ marginBottom: 8 }}>
            <strong>{i.title}</strong>{" "}
            <span style={{ fontSize: 12, color: "#6b7280" }}>[{i.status}]</span>
            {i.body ? <div style={{ fontSize: 13, color: "#9ca3af" }}>{i.body}</div> : null}
          </li>
        ))}
        {ideas.length === 0 && <li style={{ color: "#9ca3af", listStyle: "none" }}>No ideas yet — file the first one above.</li>}
      </ul>
    </main>
  );
}
