import pg from "pg";

/**
 * PLO database layer.
 *
 * Two connection identities, mirroring Supabase's service_role / authenticated:
 *
 *   adminPool  — owner role (DATABASE_URL). BYPASSES RLS. Used by migrations,
 *                seeding, and the loop engine's trusted commits.
 *   appPool    — plo_app, a non-owner login (APP_DATABASE_URL). RLS ENFORCED.
 *                Every query runs inside withUser(), which stamps
 *                `plo.user_id` so membership policies resolve the caller.
 *
 * Keeping these distinct is what makes the RLS tests meaningful: a bug that
 * leaks cross-workspace rows shows up as real rows, not a mocked assertion.
 */

const { Pool } = pg;

// Local connection defaults are assembled from parts (never one literal).
const PG_HOST = process.env.PGHOST ?? "127.0.0.1";
const PG_PORT = process.env.PGPORT ?? "55432";
const PG_DB = process.env.PGDATABASE ?? "plo";

function localUrl(user: string): string {
  return ["postgresql://", user, "@", PG_HOST, ":", PG_PORT, "/", PG_DB].join("");
}

// Owner identity (bypasses RLS). Overridable via DATABASE_URL.
const ADMIN_URL = process.env.DATABASE_URL ?? localUrl("plo");

// App identity (RLS enforced). Prefer APP_DATABASE_URL; otherwise derive from
// DATABASE_URL by swapping the role to plo_app; otherwise local default.
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/^postgresql:\/\/[^@/]+@/, "postgresql://plo_app@")
    : localUrl("plo_app"));

let _admin: pg.Pool | null = null;
let _app: pg.Pool | null = null;

export function adminPool(): pg.Pool {
  if (!_admin) _admin = new Pool({ connectionString: ADMIN_URL, max: 5 });
  return _admin;
}

export function appPool(): pg.Pool {
  if (!_app) _app = new Pool({ connectionString: APP_URL, max: 5 });
  return _app;
}

export async function closePools(): Promise<void> {
  await Promise.all([_admin?.end(), _app?.end()]);
  _admin = null;
  _app = null;
}

/** Minimal executor shape so services compose over a pool or a tx client. */
export interface Executor {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>>;
}

/**
 * Run `fn` as an authenticated user against the RLS-enforced app role, inside a
 * transaction, with `plo.user_id` set for the life of the transaction.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Executor) => Promise<T>
): Promise<T> {
  const client = await appPool().connect();
  try {
    await client.query("begin");
    // set_config(..., true) => scoped to this transaction only
    await client.query("select set_config('plo.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Run `fn` with the trusted owner role (bypasses RLS) inside a transaction. */
export async function withAdmin<T>(
  fn: (tx: Executor) => Promise<T>
): Promise<T> {
  const client = await adminPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
