import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

export async function recordBuild(
  userId: string,
  input: { workspace_id: string; spec_id?: string; git_sha?: string; status?: "pending" | "shipped" | "failed" }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "build.record", input);
    return { id: res.id };
  });
}

export async function listBuilds(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, spec_id, git_sha, status, created_at from builds where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}
