/**
 * Landing — the loop at a glance. Server component; no client JS needed.
 */
const STAGES = [
  ["Ideas", "opportunities / hypotheses"],
  ["Specs", "executable intent; immutable when approved"],
  ["Builds", "linked to git SHA / env"],
  ["Metrics", "definitions + snapshots"],
  ["Experiments", "linked to specs + metrics"],
  ["Learnings", "outcomes tied to evidence"],
  ["Decisions", "committed, evidence-backed"],
];

export default function Home() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 34, marginBottom: 4 }}>Product Loop Optimization</h1>
      <p style={{ color: "#9ca3af", marginTop: 0 }}>
        idea → spec → build → measure → learn → decide. One system of record for
        humans and agents.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "28px 0" }}>
        {STAGES.map(([name, desc], i) => (
          <div
            key={name}
            style={{
              flex: "1 1 180px",
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{desc}</div>
          </div>
        ))}
      </div>

      <section style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Agents propose, humans decide</h2>
        <p style={{ color: "#9ca3af", fontSize: 14 }}>
          Agents stage operations into <code>pending_operations</code> with a risk
          tier. Low-risk ops auto-commit through the single write path; medium and
          high-risk ops wait for a human to approve. Approved specs are immutable —
          a correction is a new version, never an in-place edit.
        </p>
        <p style={{ fontSize: 14 }}>
          <a href="/dashboard" style={{ color: "#60a5fa" }}>Open the metrics dashboard →</a>
        </p>
      </section>
    </main>
  );
}
