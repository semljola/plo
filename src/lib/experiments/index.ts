import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

export async function createExperiment(
  userId: string,
  input: { workspace_id: string; spec_id?: string; name: string; status?: "planned" | "running" | "concluded" }
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "experiment.create", input);
    return { id: res.id };
  });
}

export async function listExperiments(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, spec_id, name, status, created_at from experiments where workspace_id=$1 order by created_at desc",
      [workspaceId]
    );
    return rows;
  });
}

/** An experiment with its linked metric snapshots (evidence). */
export async function getExperimentEvidence(userId: string, workspaceId: string, experimentId: string) {
  return withUser(userId, async (tx) => {
    const exp = await tx.query(
      "select id, spec_id, name, status, created_at from experiments where id=$1 and workspace_id=$2",
      [experimentId, workspaceId]
    );
    if (exp.rows.length === 0) return null;
    const links = await tx.query(
      `select l.snapshot_id, d.key, s.value, s.captured_at
         from experiment_metric_links l
         join metric_snapshots s on s.id = l.snapshot_id
         join metric_definitions d on d.id = s.metric_id
        where l.experiment_id=$1 and l.workspace_id=$2
        order by s.captured_at`,
      [experimentId, workspaceId]
    );
    return { ...exp.rows[0]!, evidence: links.rows };
  });
}
