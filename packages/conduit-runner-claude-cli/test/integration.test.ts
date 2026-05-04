import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunAttempt, ServiceConfig } from "@conduit-harness/conduit";
import ClaudeCliRunner from "../src/index.js";

function makeConfig(raw: Record<string, unknown>): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: { kind: "fake", activeStates: [], terminalStates: [], requiredLabels: [], excludedLabels: [], pageSize: 50, writes: { enabled: false, actions: {} }, raw: {} },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "claude-cli", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw },
  };
}

function makeAttempt(): RunAttempt {
  return {
    id: "a1",
    issueId: "1",
    issueIdentifier: "TEST-1",
    attempt: 1,
    workspacePath: mkdtempSync(path.join(os.tmpdir(), "claude-it-")),
    branchName: "conduit/test-1/1",
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

describe("claude-cli runner integration", () => {
  it("returns succeeded with stdout when the command exits 0", async () => {
    const runner = new ClaudeCliRunner(makeConfig({ command: "cat" }));
    const result = await runner.run(makeAttempt(), "hello world");
    expect(result.status).toBe("succeeded");
    expect(result.output).toContain("hello world");
    expect(result.exitCode).toBe(0);
  });

  it("returns failed with claude_exit_<code> when the command exits non-zero", async () => {
    const runner = new ClaudeCliRunner(makeConfig({ command: "bash -c 'cat >/dev/null; echo nope >&2; exit 7'" }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(7);
    expect(result.error).toBe("claude_exit_7");
    expect(result.output).toContain("nope");
  });

  it("times out when turn_timeout_ms elapses before completion", async () => {
    const runner = new ClaudeCliRunner(makeConfig({ command: "sleep 5", turn_timeout_ms: 100, stall_timeout_ms: 0 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("claude_turn_timeout");
  });

  it("times out via stall when no output flows", async () => {
    const runner = new ClaudeCliRunner(makeConfig({ command: "sleep 5", turn_timeout_ms: 60_000, stall_timeout_ms: 100 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("claude_stall_timeout");
  });
});
