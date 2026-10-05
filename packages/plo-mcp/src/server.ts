#!/usr/bin/env node
/**
 * PLO MCP server.
 *
 * Exposes the product loop to agents as MCP tools. The server is a thin,
 * credential-bound client of the PLO REST API: it holds a workspace-scoped API
 * key (PLO_API_KEY) and base URL (PLO_API_URL), and every tool call is
 * authorized server-side by that key. The agent cannot widen its own scope.
 *
 * Design intent (mirrors Accounted's MCP surface, clean reimplementation):
 *   - Agents PROPOSE staged operations; they never auto-merge high-risk ones.
 *     The `plo_propose_operation` tool stages into pending_operations; low-risk
 *     ops auto-commit, medium/high wait for a human `plo_approve_operation`.
 *   - Read tools (list specs, pending ops, metrics) are safe and unscoped by risk.
 *
 * Transport: stdio (works with Claude Desktop / any MCP client). Build with
 * `npm run build` then register `node dist/server.js`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.PLO_API_URL ?? "http://localhost:3000";
const ENV = process.env;
const API_KEY = ENV["PLO_API_KEY"] ?? "";

if (!API_KEY) {
  console.error("[plo-mcp] PLO_API_KEY is required (workspace-scoped key).");
  process.exit(1);
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`PLO API ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const tools = [
  {
    name: "plo_propose_operation",
    description:
      "Stage a loop operation (idea.create, spec.draft, spec.version.add, spec.approve, build.record, metric.define, metric.snapshot, experiment.create, learning.record, decision.commit). Low-risk ops auto-commit; medium/high wait for human approval.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        risk_tier: { type: "string", enum: ["low", "medium", "high"], default: "low" },
        payload: { type: "object" },
      },
      required: ["kind", "payload"],
    },
  },
  {
    name: "plo_list_pending",
    description: "List pending operations awaiting human approval in the workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "plo_approve_operation",
    description: "Approve a pending operation by id (requires the key to have admin scope).",
    inputSchema: {
      type: "object",
      properties: { operation_id: { type: "string" } },
      required: ["operation_id"],
    },
  },
  {
    name: "plo_list_specs",
    description: "List specs in the workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "plo_list_metrics",
    description: "List defined metrics and their latest values.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

const server = new Server(
  { name: "plo-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result: unknown;
    switch (name) {
      case "plo_propose_operation":
        result = await api("/api/pending-operations", {
          method: "POST",
          body: JSON.stringify({
            kind: (args as Record<string, unknown>).kind,
            risk_tier: (args as Record<string, unknown>).risk_tier ?? "low",
            payload: (args as Record<string, unknown>).payload ?? {},
          }),
        });
        break;
      case "plo_list_pending":
        result = await api("/api/pending-operations?status=pending");
        break;
      case "plo_approve_operation":
        result = await api(
          `/api/pending-operations/${(args as Record<string, unknown>).operation_id}/approve`,
          { method: "POST" }
        );
        break;
      case "plo_list_specs":
        result = await api("/api/specs");
        break;
      case "plo_list_metrics":
        result = await api("/api/metrics");
        break;
      default:
        throw new Error(`unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: (err as Error).message }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[plo-mcp] ready on stdio");
