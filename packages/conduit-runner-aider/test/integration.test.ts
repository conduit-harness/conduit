import { mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunAttempt, ServiceConfig } from "@conduit-harness/conduit";
import AiderRunner from "../src/index.js";

function makeConfig(raw: Record<string, unknown>): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: { kind: "fake", activeStates: [], terminalStates: [], requiredLabels: [], excludedLabels: [], pageSize: 50, writes: { enabled: false, actions: {} }, raw: {} },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "aider", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw },
  };
}

function makeAttempt(): RunAttempt {
  return {
    id: "a1",
    issueId: "1",
    issueIdentifier: "TEST-1",
    attempt: 1,
    workspacePath: mkdtempSync(path.join(os.tmpdir(), "aider-it-")),
    branchName: "conduit/test-1/1",
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

// The aider runner appends `--model` and `--message-file` flags unless they
// already appear in `command` (see runner-aider/src/index.ts:76-82). Tests
// include the substrings inside a comment so the runner won't append them.
const STUB_FLAGS = "# --model fake --message-file unused";

describe("aider runner integration", () => {
  it("returns succeeded with stdout, then cleans up the prompt file", async () => {
    const runner = new AiderRunner(makeConfig({ command: `bash -c 'echo aider-ok' ${STUB_FLAGS}` }));
    const attempt = makeAttempt();
    const result = await runner.run(attempt, "hello aider");
    expect(result.status).toBe("succeeded");
    expect(result.output).toContain("aider-ok");
    expect(existsSync(path.join(attempt.workspacePath, ".conduit-aider-prompt.md"))).toBe(false);
  });

  it("returns failed with aider_exit_<code> on non-zero exit", async () => {
    const runner = new AiderRunner(makeConfig({ command: `bash -c 'exit 5' ${STUB_FLAGS}` }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(5);
    expect(result.error).toBe("aider_exit_5");
  });

  it("times out via turn_timeout_ms", async () => {
    const runner = new AiderRunner(makeConfig({ command: `bash -c 'sleep 5' ${STUB_FLAGS}`, turn_timeout_ms: 100, stall_timeout_ms: 0 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("aider_turn_timeout");
  });

  it("preflight throws when the configured binary is not on PATH", () => {
    expect(() => new AiderRunner(makeConfig({ command: "no-such-binary-xyz123" }))).toThrow(/was not found on PATH/);
  });
});
