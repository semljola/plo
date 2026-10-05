import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

/**
 * Direct spec actions. Specs are drafted, extended with new versions
 * (corrections), and approved — approval is the point of immutability.
 */

export async function draftSpec(
  userId: string,
  input: { workspace_id: string; idea_id?: string; title: string; body?: Record<string, unknown> }
): Promise<{ id: string; version: number }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "spec.draft", {
      ...input,
      body: input.body ?? {},
    });
    return { id: res.id, version: res.version as number };
  });
}

export async function addSpecVersion(
  userId: string,
  input: { workspace_id: string; spec_id: string; body: Record<string, unknown> }
): Promise<{ id: string; version: number }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "spec.version.add", input);
    return { id: res.id, version: res.version as number };
  });
}

export async function approveSpec(
  userId: string,
  input: { workspace_id: string; spec_id: string; version: number }
): Promise<{ id: string; version: number }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "spec.approve", input);
    return { id: res.id, version: res.version as number };
  });
}

export interface SpecVersionRow {
  version: number;
  body: Record<string, unknown>;
  approved_at: string | null;
  created_at: string;
}
export interface SpecDetail {
  id: string;
  idea_id: string | null;
  title: string;
  status: string;
  created_at: string;
  versions: SpecVersionRow[];
}

export async function getSpec(userId: string, workspaceId: string, specId: string): Promise<SpecDetail | null> {
  return withUser(userId, async (tx) => {
    const spec = await tx.query<Omit<SpecDetail, "versions">>(
      "select id, idea_id, title, status, created_at from specs where id=$1 and workspace_id=$2",
      [specId, workspaceId]
    );
    if (spec.rows.length === 0) return null;
    const versions = await tx.query<SpecVersionRow>(
      "select version, body, approved_at, created_at from spec_versions where spec_id=$1 and workspace_id=$2 order by version",
      [specId, workspaceId]
    );
    return { ...spec.rows[0]!, versions: versions.rows };
  });
}

export async function listSpecs(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, idea_id, title, status, created_at from specs where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}
