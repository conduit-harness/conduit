import { mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function mockOllamaFetch(models: Array<{ name: string }> = []): void {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes("/api/tags")) {
      return new Response(JSON.stringify({ models }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as any;
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns succeeded with stdout, then cleans up the prompt file", async () => {
    const runner = new AiderRunner(makeConfig({ model: "gpt-4", command: `bash -c 'echo aider-ok' ${STUB_FLAGS}` }));
    const attempt = makeAttempt();
    const result = await runner.run(attempt, "hello aider");
    expect(result.status).toBe("succeeded");
    expect(result.output).toContain("aider-ok");
    expect(existsSync(path.join(attempt.workspacePath, ".conduit-aider-prompt.md"))).toBe(false);
  });

  it("returns failed on non-zero exit", async () => {
    const runner = new AiderRunner(makeConfig({ model: "gpt-4", command: "bash -c 'false # --model fake --message-file unused'" }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/aider_exit_/);
  });

  it("times out via turn_timeout_ms", async () => {
    const runner = new AiderRunner(makeConfig({ model: "gpt-4", command: `bash -c 'sleep 5' ${STUB_FLAGS}`, turn_timeout_ms: 100, stall_timeout_ms: 0 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(result.status).toBe("timed_out");
    expect(result.error).toBe("aider_turn_timeout");
  });

  it("preflight throws when the configured binary is not on PATH", () => {
    expect(() => new AiderRunner(makeConfig({ command: "no-such-binary-xyz123" }))).toThrow(/was not found on PATH/);
  });

  it("skips Ollama preflight for non-ollama_chat models", async () => {
    const runner = new AiderRunner(makeConfig({ model: "gpt-4", command: `bash -c 'echo ok' ${STUB_FLAGS}` }));
    const result = await runner.run(makeAttempt(), "test");
    expect(result.status).toBe("succeeded");
  });

  it("Ollama preflight throws when Ollama is unreachable", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 500 })) as any;
    const runner = new AiderRunner(makeConfig({ model: "ollama_chat/test:7b", ollama_endpoint: "http://localhost:9999", command: `bash -c 'echo ok' ${STUB_FLAGS}` }));
    await expect(() => runner.run(makeAttempt(), "test")).rejects.toThrow(/Ollama is not reachable/);
  });

  it("Ollama preflight throws when model is not pulled", async () => {
    mockOllamaFetch([{ name: "other:7b" }]);
    const runner = new AiderRunner(makeConfig({ model: "ollama_chat/missing:7b", command: `bash -c 'echo ok' ${STUB_FLAGS}` }));
    await expect(() => runner.run(makeAttempt(), "test")).rejects.toThrow(/is not pulled in Ollama/);
  });

  it("Ollama preflight succeeds when model is available", async () => {
    mockOllamaFetch([{ name: "qwen2.5-coder:14b" }]);
    const runner = new AiderRunner(makeConfig({ model: "ollama_chat/qwen2.5-coder:14b", command: `bash -c 'echo ok' ${STUB_FLAGS}` }));
    const result = await runner.run(makeAttempt(), "test");
    expect(result.status).toBe("succeeded");
  });

  it("Ollama preflight caches results across multiple runs", async () => {
    mockOllamaFetch([{ name: "qwen2.5-coder:14b" }]);
    const runner = new AiderRunner(makeConfig({ model: "ollama_chat/qwen2.5-coder:14b", command: `bash -c 'echo ok' ${STUB_FLAGS}` }));
    const attempt1 = makeAttempt();
    const attempt2 = makeAttempt();

    await runner.run(attempt1, "test 1");
    await runner.run(attempt2, "test 2");

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
