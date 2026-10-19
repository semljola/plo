import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandAgentRunner } from "@/lib/build-jobs/command-runner";
import { resolveAgentRunner, StubAgentRunner } from "@/lib/build-jobs/runner";

const pexec = promisify(execFile);

/**
 * CommandAgentRunner — the LIVE runner. These tests use real git repos and a
 * scripted "agent" command (a shell one-liner) in place of a real coding agent.
 * The git mechanics are genuinely exercised: a real commit is made and a real
 * 40-hex SHA is returned that actually resolves in the repo.
 */
describe("CommandAgentRunner (live git mechanics)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => {})));
  });

  async function freshRepo(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "plo-runner-test-"));
    dirs.push(d);
    await pexec("git", ["init", "-q"], { cwd: d });
    await pexec("git", ["config", "user.email", "t@t.local"], { cwd: d });
    await pexec("git", ["config", "user.name", "t"], { cwd: d });
    await pexec("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: d });
    return d;
  }

  it("runs the agent command in the repo, commits, and returns a real SHA", async () => {
    const repo = await freshRepo();
    // The "agent": writes a file derived from the brief env var.
    const runner = new CommandAgentRunner({
      agentCmd: 'echo "built from $PLO_SPEC_ID" > result.txt',
      repoDir: repo,
    });

    const res = await runner.run({
      workspaceId: "w1",
      specId: "spec-abc",
      version: 1,
      body: { acceptance: ["x"] },
    });

    expect(res.ok).toBe(true);
    expect(res.gitSha).toMatch(/^[0-9a-f]{40}$/);

    // The SHA actually resolves in the repo (real commit).
    const { stdout: head } = await pexec("git", ["rev-parse", "HEAD"], { cwd: repo });
    expect(head.trim()).toBe(res.gitSha);

    // The agent's file was committed and reflects the brief env.
    const { stdout: show } = await pexec("git", ["show", "--stat", "HEAD"], { cwd: repo });
    expect(show).toMatch(/result\.txt/);
    const content = await readFile(join(repo, "result.txt"), "utf8");
    expect(content).toContain("spec-abc");
  });

  it("makes the brief available as a file the agent can read", async () => {
    const repo = await freshRepo();
    const runner = new CommandAgentRunner({
      agentCmd: 'cp "$PLO_BRIEF_FILE" captured-brief.json',
      repoDir: repo,
    });
    const res = await runner.run({ workspaceId: "w", specId: "s1", version: 2, body: { acceptance: ["do X"] } });
    expect(res.ok).toBe(true);
    const brief = JSON.parse(await readFile(join(repo, "captured-brief.json"), "utf8"));
    expect(brief).toMatchObject({ specId: "s1", version: 2, body: { acceptance: ["do X"] } });
  });

  it("reports failure (not a crash) when the agent command exits non-zero", async () => {
    const repo = await freshRepo();
    const runner = new CommandAgentRunner({ agentCmd: "echo nope >&2; exit 3", repoDir: repo });
    const res = await runner.run({ workspaceId: "w", specId: "s", version: 1, body: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("works with an ephemeral repo when none is configured", async () => {
    // No repoDir: the runner creates and cleans up its own throwaway repo.
    const runner = new CommandAgentRunner({ agentCmd: 'echo hi > f.txt' });
    const res = await runner.run({ workspaceId: "w", specId: "s", version: 1, body: { acceptance: ["x"] } });
    expect(res.ok).toBe(true);
    expect(res.gitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("resolveAgentRunner: stub by default, CommandAgentRunner when PLO_AGENT_CMD set", () => {
    const prev = process.env.PLO_AGENT_CMD;
    try {
      delete process.env.PLO_AGENT_CMD;
      expect(resolveAgentRunner()).toBeInstanceOf(StubAgentRunner);
      process.env.PLO_AGENT_CMD = "true";
      expect(resolveAgentRunner()).toBeInstanceOf(CommandAgentRunner);
    } finally {
      if (prev === undefined) delete process.env.PLO_AGENT_CMD;
      else process.env.PLO_AGENT_CMD = prev;
    }
  });
});
