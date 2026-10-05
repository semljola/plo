import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

/**
 * Direct (human) idea actions. Thin wrappers over the single write path so
 * ideas created by a person and by an approved agent op take the exact same
 * code route through the engine.
 */

export async function createIdea(
  userId: string,
  input: { workspace_id: string; title: string; body?: string }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "idea.create", input);
    return { id: res.id };
  });
}

export interface IdeaRow {
  id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
}

export async function listIdeas(userId: string, workspaceId: string): Promise<IdeaRow[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<IdeaRow>(
      "select id, title, body, status, created_at from ideas where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}
