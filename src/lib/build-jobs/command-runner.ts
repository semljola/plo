import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRunner, AgentRunInput, AgentRunResult } from "./runner";

const pexec = promisify(execFile);

/**
 * CommandAgentRunner — a LIVE runner that operates on a real git repository.
 *
 * It builds against the approved spec by:
 *   1. writing the spec body (the brief) to a file in a fresh work tree,
 *   2. invoking a configurable coding-agent command (PLO_AGENT_CMD) with the
 *      brief available as $PLO_BRIEF / $PLO_BRIEF_FILE and the spec coordinates
 *      as env, cwd = the repo,
 *   3. committing whatever the agent changed,
 *   4. returning the REAL resulting git SHA.
 *
 * The git mechanics are genuinely live and tested. The "agent" is whatever
 * PLO_AGENT_CMD runs — a stub script in tests, and a real coding agent in
 * production (e.g. `claude -p "$PLO_BRIEF" --allowedTools Read,Edit,Write
 * --max-turns 20`). No code change is needed to go from scripted to real: it is
 * one env var.
 *
 * Config (env):
 *   PLO_AGENT_CMD    required to use this runner. Shell command run in the repo.
 *   PLO_AGENT_REPO   path to the git repo to build in. Default: a throwaway temp
 *                    repo (so the pipeline is exercisable with no real repo).
 *   PLO_AGENT_TIMEOUT_MS  per-run timeout (default 120000).
 */
export interface CommandRunnerConfig {
  agentCmd: string;
  repoDir?: string;
  timeoutMs?: number;
}

export class CommandAgentRunner implements AgentRunner {
  constructor(private readonly cfg: CommandRunnerConfig) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const timeoutMs = this.cfg.timeoutMs ?? 120000;
    let repoDir = this.cfg.repoDir ?? null;
    let ephemeral = false;

    try {
      // If no repo is configured, create a throwaway git repo so the full
      // mechanics (write brief -> run agent -> commit -> real SHA) still run.
      if (!repoDir) {
        repoDir = await mkdtemp(join(tmpdir(), "plo-build-"));
        ephemeral = true;
        await git(repoDir, ["init", "-q"]);
        await git(repoDir, ["config", "user.email", "agent@plo.local"]);
        await git(repoDir, ["config", "user.name", "PLO Agent"]);
        await git(repoDir, ["commit", "-q", "--allow-empty", "-m", "init"]);
      }

      // Write the brief (approved spec body) for the agent to consume.
      const brief = JSON.stringify(
        { specId: input.specId, version: input.version, body: input.body },
        null,
        2
      );
      const briefFile = join(repoDir, ".plo-brief.json");
      await writeFile(briefFile, brief, "utf8");

      // Invoke the configurable agent command. The agent does the actual work;
      // we just provide the brief and capture the result.
      await pexec("/bin/bash", ["-lc", this.cfg.agentCmd], {
        cwd: repoDir,
        timeout: timeoutMs,
        env: {
          ...process.env,
          PLO_BRIEF: brief,
          PLO_BRIEF_FILE: briefFile,
          PLO_SPEC_ID: input.specId,
          PLO_SPEC_VERSION: String(input.version),
          PLO_WORKSPACE_ID: input.workspaceId,
        },
      });

      // Stage and commit whatever the agent produced. --allow-empty so a run
      // that made no file changes still yields a real, attributable commit.
      await git(repoDir, ["add", "-A"]);
      await git(repoDir, [
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        `build: spec ${input.specId} v${input.version}`,
      ]);
      const { stdout } = await git(repoDir, ["rev-parse", "HEAD"]);
      const gitSha = stdout.trim();

      if (!/^[0-9a-f]{40}$/.test(gitSha)) {
        return { ok: false, error: `unexpected git sha: ${gitSha}` };
      }
      return { ok: true, gitSha };
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { ok: false, error: (e.stderr || e.message || "command runner failed").slice(0, 2000) };
    } finally {
      if (ephemeral && repoDir) {
        await rm(repoDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return pexec("git", args, { cwd });
}
