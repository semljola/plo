import { randomUUID } from "node:crypto";
import { beforeAll, afterAll } from "vitest";
import { withAdmin, closePools } from "@/lib/db";
import { createWorkspace, addMember } from "@/lib/auth";

/**
 * Shared test harness. Tests run against the real Postgres in DATABASE_URL
 * (spun up by the CI service / local docker). We never mock the DB: the
 * immutability trigger and RLS policies only mean anything against real
 * Postgres.
 */

export { withAdmin };

/** Make a throwaway user id (we don't run real auth in these tests). */
export function newUser(): string {
  return randomUUID();
}

export interface TestWorkspace {
  workspaceId: string;
  owner: string;
}

/** Create an isolated workspace with an owner member. */
export async function freshWorkspace(name = "test-ws"): Promise<TestWorkspace> {
  const owner = newUser();
  const ws = await createWorkspace(owner, `${name}-${Date.now()}`);
  return { workspaceId: ws.id, owner };
}

export async function addWorkspaceMember(
  actor: string,
  workspaceId: string,
  role: "admin" | "member" = "member"
): Promise<string> {
  const user = newUser();
  await addMember(actor, workspaceId, user, role);
  return user;
}

// Close pools once at the end of the whole run.
afterAll(async () => {
  await closePools();
});

beforeAll(() => {
  // Fail loud if someone points tests at a non-local DB by accident.
  const url = process.env.DATABASE_URL ?? "";
  if (url && !/localhost|127\.0\.0\.1|plo-test-db|@db:|postgres:/.test(url)) {
    throw new Error(`Refusing to run destructive tests against ${url}`);
  }
});
