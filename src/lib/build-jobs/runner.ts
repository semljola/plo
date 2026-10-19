/**
 * AgentRunner — the interface between a claimed build job and whatever actually
 * builds. The worker hands it the approved spec version (the brief); the runner
 * builds against it and returns a git SHA (or an error).
 *
 * Keeping this behind an interface means the whole pipeline — enqueue, claim,
 * run, report-back — is real and tested before a live coding agent is wired.
 * Swap StubAgentRunner for a Claude Code / subagent implementation later; the
 * worker does not change.
 */
import { CommandAgentRunner } from "./command-runner";

export interface AgentRunInput {
  workspaceId: string;
  specId: string;
  version: number;
  /** The approved spec body: executable intent (acceptance criteria, tests). */
  body: Record<string, unknown>;
}

export interface AgentRunResult {
  ok: boolean;
  gitSha?: string;
  error?: string;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

/**
 * Deterministic stub: "builds" by producing a synthetic but stable git SHA
 * derived from the spec id + version, so the report-back path is exercised
 * end to end without a real agent or repo. A spec body carrying
 * `build.fail = true` makes the stub report failure (for testing the failure
 * path).
 */
export class StubAgentRunner implements AgentRunner {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const b = input.body as { build?: { fail?: boolean } } | Record<string, unknown>;
    const buildCfg = (b as { build?: unknown }).build;
    if (buildCfg && typeof buildCfg === "object" && (buildCfg as { fail?: boolean }).fail) {
      return { ok: false, error: "stub runner: forced failure (build.fail=true)" };
    }
    // Stable fake SHA so the same spec/version always "builds" to the same ref.
    const seed = `${input.specId}@${input.version}`;
    const gitSha = syntheticSha(seed);
    return { ok: true, gitSha };
  }
}

/** 40-hex-char synthetic SHA from a seed (not cryptographic; demo only). */
function syntheticSha(seed: string): string {
  let h = 0x811c9dc5;
  let out = "";
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
}

/**
 * The runner the worker uses. Resolved from env:
 *   - PLO_AGENT_CMD set  -> CommandAgentRunner (LIVE: real git repo + real agent
 *     command). This is how you go live — no code change, one env var.
 *   - otherwise          -> StubAgentRunner (deterministic, for demos/tests).
 *
 * Lazily constructed so tests and the stub path never import the command runner
 * machinery unless a live command is actually configured.
 */
export function resolveAgentRunner(): AgentRunner {
  const cmd = process.env.PLO_AGENT_CMD;
  if (cmd && cmd.trim()) {
    return new CommandAgentRunner({
      agentCmd: cmd,
      repoDir: process.env.PLO_AGENT_REPO || undefined,
      timeoutMs: process.env.PLO_AGENT_TIMEOUT_MS ? Number(process.env.PLO_AGENT_TIMEOUT_MS) : undefined,
    });
  }
  return new StubAgentRunner();
}

/** The default runner, resolved once from env at import time. */
export const defaultAgentRunner: AgentRunner = resolveAgentRunner();

