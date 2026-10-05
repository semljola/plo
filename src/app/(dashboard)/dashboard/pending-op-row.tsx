"use client";

import { useActionState } from "react";
import { approveOperation, rejectOperation, type DecisionResult } from "./actions";

const initial: DecisionResult = { ok: true };

export interface PendingOp {
  id: string;
  kind: string;
  risk_tier: string;
  created_at: string;
}

/**
 * Approve / Reject controls for a single pending agent operation. Two server
 * actions (owner/admin enforced server-side); the row refreshes on success.
 */
export function PendingOpRow({ op }: { op: PendingOp }) {
  const [aState, approveAction, approving] = useActionState(approveOperation, initial);
  const [rState, rejectAction, rejecting] = useActionState(rejectOperation, initial);
  const busy = approving || rejecting;
  const error = (!aState.ok && aState.error) || (!rState.ok && rState.error) || null;

  const btn = (bg: string): React.CSSProperties => ({
    background: busy ? "#374151" : bg,
    color: "white",
    border: 0,
    borderRadius: 6,
    padding: "4px 12px",
    fontSize: 13,
    cursor: busy ? "default" : "pointer",
  });

  return (
    <li
      style={{
        marginBottom: 8,
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: "1 1 auto" }}>
        <code>{op.kind}</code> · risk{" "}
        <strong style={{ color: op.risk_tier === "high" ? "#f87171" : op.risk_tier === "medium" ? "#fbbf24" : "#9ca3af" }}>
          {op.risk_tier}
        </strong>{" "}
        · <span style={{ fontSize: 12, color: "#6b7280" }}>{new Date(op.created_at).toLocaleString()}</span>
      </span>

      <form action={approveAction} style={{ display: "inline" }}>
        <input type="hidden" name="operation_id" value={op.id} />
        <button type="submit" disabled={busy} style={btn("#16a34a")}>
          {approving ? "Approving…" : "Approve"}
        </button>
      </form>

      <form action={rejectAction} style={{ display: "inline" }}>
        <input type="hidden" name="operation_id" value={op.id} />
        <button type="submit" disabled={busy} style={btn("#dc2626")}>
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
      </form>

      {error && <span style={{ color: "#f87171", fontSize: 12, flexBasis: "100%" }}>{error}</span>}
    </li>
  );
}
