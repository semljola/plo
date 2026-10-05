import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

export async function recordLearning(
  userId: string,
  input: { workspace_id: string; experiment_id?: string; body: string }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "learning.record", input);
    return { id: res.id };
  });
}

export async function listLearnings(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, experiment_id, body, created_at from learnings where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}
