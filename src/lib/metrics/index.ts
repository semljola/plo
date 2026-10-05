import { withUser } from "@/lib/db";
import { commitOp } from "@/lib/loop/engine";

/**
 * Metrics: definitions + snapshots. Snapshots can only reference a metric that
 * is already defined (never invent metrics), and may be linked to an
 * experiment for provenance.
 */

export async function defineMetric(
  userId: string,
  input: { workspace_id: string; key: string; description?: string; unit?: string }
): Promise<{ id: string; key: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "metric.define", input);
    return { id: res.id, key: res.key as string };
  });
}

export async function recordSnapshot(
  userId: string,
  input: {
    workspace_id: string;
    metric_id?: string;
    metric_key?: string;
    value: number;
    captured_at?: string;
    experiment_id?: string;
  }
): Promise<{ id: string; metric_id: string }> {
  return withUser(userId, async (tx) => {
    const res = await commitOp(tx, { actorId: userId }, "metric.snapshot", input);
    return { id: res.id, metric_id: res.metric_id as string };
  });
}

export async function listDefinitions(userId: string, workspaceId: string) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      "select id, key, description, unit, created_at from metric_definitions where workspace_id=$1 order by key",
      [workspaceId]
    );
    return rows;
  });
}

export async function listSnapshots(
  userId: string,
  workspaceId: string,
  metricKey?: string
) {
  return withUser(userId, async (tx) => {
    const { rows } = metricKey
      ? await tx.query(
          `select s.id, d.key, s.value, s.captured_at
             from metric_snapshots s join metric_definitions d on d.id = s.metric_id
            where s.workspace_id=$1 and d.key=$2 order by s.captured_at desc`,
          [workspaceId, metricKey]
        )
      : await tx.query(
          `select s.id, d.key, s.value, s.captured_at
             from metric_snapshots s join metric_definitions d on d.id = s.metric_id
            where s.workspace_id=$1 order by s.captured_at desc limit 200`,
          [workspaceId]
        );
    return rows;
  });
}

export interface DashboardRow {
  key: string;
  unit: string | null;
  value: number | null;
  captured_at: string | null;
}

/** Latest value per metric — the dashboard's headline figures. */
export async function dashboard(userId: string, workspaceId: string): Promise<DashboardRow[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<DashboardRow>(
      `select distinct on (d.key) d.key, d.unit, s.value, s.captured_at
         from metric_definitions d
         left join metric_snapshots s on s.metric_id = d.id
        where d.workspace_id=$1
        order by d.key, s.captured_at desc nulls last`,
      [workspaceId]
    );
    return rows;
  });
}
