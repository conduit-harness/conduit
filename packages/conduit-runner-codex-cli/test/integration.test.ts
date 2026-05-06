import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunAttempt, ServiceConfig } from "@conduit-harness/conduit";
import CodexCliRunner from "../src/index.js";

function makeConfig(raw: Record<string, unknown>): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: { kind: "fake", activeStates: [], terminalStates: [], requiredLabels: [], excludedLabels: [], pageSize: 50, writes: { enabled: false, actions: {} }, raw: {} },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "codex-cli", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw },
  };
}

function makeAttempt(): RunAttempt {
  return {
    id: "a1",
    issueId: "1",
    issueIdentifier: "TEST-1",
    attempt: 1,
    workspacePath: mkdtempSync(path.join(os.tmpdir(), "codex-it-")),
    branchName: "conduit/test-1/1",
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

describe("codex-cli runner integration", () => {
  it("returns succeeded with stdout when the command exits 0", async () => {
    // The runner appends --json to commands that don't already include it.
    // We use 'bash -c SCRIPT --json' so --json becomes $0 (ignored by bash)
    // and the script outputs a codex-style JSONL item that parseJsonlOutput can extract.
    const jsonLine = '{"type":"item.completed","item":{"type":"agent_message","text":"hello codex"}}';
    const runner = new CodexCliRunner(makeConfig({
      command: `bash -c 'cat >/dev/null; echo '"'"'${jsonLine}'"'"'' --json`,
    }));
    const result = await runner.run(makeAttempt(), "hello codex");
    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("hello codex");
    expect(result.exitCode).toBe(0);
  });

  it("returns failed with codex_exit_<code> when the command exits non-zero", async () => {
    const runner = new CodexCliRunner(makeConfig({ command: "bash -c 'cat >/dev/null; exit 9'" }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(9);
    expect(result.error).toBe("codex_exit_9");
  });

  it("times out via turn_timeout_ms", async () => {
    const runner = new CodexCliRunner(makeConfig({ command: "sleep 5", turn_timeout_ms: 100, stall_timeout_ms: 0 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("codex_turn_timeout");
  });

  it("times out via stall_timeout_ms when no output flows", async () => {
    const runner = new CodexCliRunner(makeConfig({ command: "sleep 5", turn_timeout_ms: 60_000, stall_timeout_ms: 100 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("codex_stall_timeout");
  });
});
