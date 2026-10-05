# loop-metric-pull

**When:** the hourly cron (`vercel.json` → `/api/webhooks/loop-metric-pull`)
fires, or an agent is asked to record metric snapshots.

**Rules:**

- **Never invent metrics.** A snapshot must reference a metric that already
  exists in `metric_definitions` (by `metric_id` or `metric_key`). The engine
  rejects snapshots for undefined metrics (`AGENTS.md` rule #3).
- To add a new measure, first `metric.define`, then `metric.snapshot`.
- Link snapshots to evidence where possible: pass `experiment_id` so the
  snapshot is recorded in `experiment_metric_links` and shows up as evidence on
  the experiment.
- Pull sources (PostHog, Vercel Analytics, Sentry) are **extensions** — the
  cron handler iterates workspaces with configured sources and records through
  the engine. Extensions never write loop tables directly.

**Snapshot op:**

```
POST /api/metrics
{ "action": "snapshot", "metric_key": "activation_rate",
  "value": 0.42, "experiment_id": "<uuid>" }
```

**Pitfall:** snapshot `value` is a float; store ratios as ratios (0.42), not
percentages (42), and set the metric `unit` accordingly so the dashboard reads
right.
