"use client";

import { useActionState } from "react";
import { draftSpecAction, type DraftSpecResult } from "./actions";

const initial: DraftSpecResult = { ok: false };

export interface IdeaOption {
  id: string;
  title: string;
}

/**
 * Quick-draft a spec from the dashboard. Title + optional acceptance criteria
 * (one per line) + optional link to an existing idea. Uses a server action, so
 * no credentials reach the client. The spec starts as a draft; approval happens
 * through the pending-ops gate.
 */
export function DraftSpecForm({ ideas }: { ideas: IdeaOption[] }) {
  const [state, formAction, pending] = useActionState(draftSpecAction, initial);

  const field: React.CSSProperties = {
    background: "#0b1020",
    border: "1px solid #374151",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#e5e7eb",
    fontSize: 14,
  };

  return (
    <form
      action={formAction}
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
        display: "grid",
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 14 }}>Draft a spec</strong>
      <input name="title" placeholder="Spec title" required maxLength={200} style={field} />
      <textarea
        name="acceptance"
        placeholder="Acceptance criteria — one per line (stored as executable intent)"
        rows={3}
        style={{ ...field, resize: "vertical" }}
      />
      <select name="idea_id" defaultValue="" style={field}>
        <option value="">Link an idea (optional)</option>
        {ideas.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            background: pending ? "#374151" : "#2563eb",
            color: "white",
            border: 0,
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 14,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Drafting…" : "Draft spec"}
        </button>
        {state.ok && <span style={{ color: "#34d399", fontSize: 13 }}>✓ Spec drafted (v1, awaiting approval).</span>}
        {!state.ok && state.error && <span style={{ color: "#f87171", fontSize: 13 }}>{state.error}</span>}
      </div>
    </form>
  );
}
