import { withUser } from "@/lib/db";

/** Releases link a build to an environment. */
export async function recordRelease(
  userId: string,
  input: { workspace_id: string; build_id?: string; environment: string }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "insert into releases (workspace_id, build_id, environment) values ($1,$2,$3) returning id",
      [input.workspace_id, input.build_id ?? null, input.environment]
    );
    return { id: rows[0]!.id };
  });
}

export async function listReleases(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, build_id, environment, released_at from releases where workspace_id=$1 order by released_at desc",
      [workspaceId]
    );
    return rows;
  });
}
