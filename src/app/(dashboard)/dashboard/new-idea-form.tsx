"use client";

import { useActionState } from "react";
import { submitIdea, type SubmitIdeaResult } from "./actions";

const initial: SubmitIdeaResult = { ok: false };

/**
 * Client form for filing a new idea from the dashboard. Uses a server action
 * (no API keys in the browser). On success the dashboard revalidates and the
 * idea appears in the list below.
 */
export function NewIdeaForm() {
  const [state, formAction, pending] = useActionState(submitIdea, initial);

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
      <strong style={{ fontSize: 14 }}>New idea</strong>
      <input
        name="title"
        placeholder="Idea title"
        required
        maxLength={200}
        style={{
          background: "#0b1020",
          border: "1px solid #374151",
          borderRadius: 6,
          padding: "8px 10px",
          color: "#e5e7eb",
          fontSize: 14,
        }}
      />
      <textarea
        name="body"
        placeholder="Optional detail — opportunity, hypothesis, supporting links"
        rows={2}
        style={{
          background: "#0b1020",
          border: "1px solid #374151",
          borderRadius: 6,
          padding: "8px 10px",
          color: "#e5e7eb",
          fontSize: 14,
          resize: "vertical",
        }}
      />
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
          {pending ? "Submitting…" : "Submit idea"}
        </button>
        {state.ok && <span style={{ color: "#34d399", fontSize: 13 }}>✓ Idea filed.</span>}
        {!state.ok && state.error && <span style={{ color: "#f87171", fontSize: 13 }}>{state.error}</span>}
      </div>
    </form>
  );
}
