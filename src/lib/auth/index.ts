import { withAdmin, withUser } from "@/lib/db";

/**
 * Workspace + membership management. Creating a workspace is a bootstrap action
 * (service role) that also enrolls the creator as owner; everything else runs
 * under RLS.
 */

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export async function createWorkspace(ownerUserId: string, name: string): Promise<Workspace> {
  // Bootstrap: the creator isn't a member yet, so RLS would block them.
  // Use the trusted role to create the workspace + initial owner membership
  // atomically, then all further access is RLS-governed.
  return withAdmin(async (tx) => {
    const ws = await tx.query<Workspace>(
      "insert into workspaces (name) values ($1) returning *",
      [name]
    );
    const workspace = ws.rows[0]!;
    await tx.query(
      "insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'owner')",
      [workspace.id, ownerUserId]
    );
    return workspace;
  });
}

export async function addMember(
  actorUserId: string,
  workspaceId: string,
  userId: string,
  role: "admin" | "member" = "member"
): Promise<void> {
  // RLS + the wm_admin_write policy ensure only owners/admins can enroll.
  await withUser(actorUserId, async (tx) => {
    const res = await tx.query(
      "insert into workspace_members (workspace_id, user_id, role) values ($1,$2,$3) on conflict (workspace_id, user_id) do update set role=excluded.role returning id",
      [workspaceId, userId, role]
    );
    if (res.rows.length === 0) {
      throw new Error("not authorized to add members");
    }
  });
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<Workspace>("select * from workspaces order by created_at desc");
    return rows;
  });
}
