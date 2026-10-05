import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

export async function commitDecision(
  userId: string,
  input: { workspace_id: string; learning_id?: string; body: string }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "decision.commit", input);
    return { id: res.id };
  });
}

export async function listDecisions(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, learning_id, body, committed_at, created_at from decisions where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}
