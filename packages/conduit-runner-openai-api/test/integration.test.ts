import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunAttempt, ServiceConfig } from "@conduit-harness/conduit";
// @ts-expect-error - .mjs file with no types
import { startMockLlm } from "../../../tools/mock-llm/server.mjs";
import OpenAIApiRunner from "../src/index.js";

type MockHandle = { url: string; close: () => Promise<void> };

function makeConfig(raw: Record<string, unknown>): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: { kind: "fake", activeStates: [], terminalStates: [], requiredLabels: [], excludedLabels: [], pageSize: 50, writes: { enabled: false, actions: {} }, raw: {} },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "openai-api", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw },
  };
}

function makeAttempt(): RunAttempt {
  return {
    id: "a1",
    issueId: "1",
    issueIdentifier: "TEST-1",
    attempt: 1,
    workspacePath: "/tmp/ws/test",
    branchName: "conduit/test-1/1",
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

describe("openai-api runner integration", () => {
  let mock: MockHandle;
  beforeAll(async () => { mock = await startMockLlm(); });
  afterAll(async () => { await mock.close(); });

  it("succeeds and returns the mock LLM's content", async () => {
    const runner = new OpenAIApiRunner(makeConfig({ endpoint: `${mock.url}/v1/chat/completions`, model: "mock", token: "t" }));
    const result = await runner.run(makeAttempt(), "say hi");
    expect(result.status).toBe("succeeded");
    expect(result.output).toContain("ok: mock-llm response");
  });

  it("returns failed when the endpoint returns non-2xx", async () => {
    const runner = new OpenAIApiRunner(makeConfig({ endpoint: `${mock.url}/v1/chat/completions?fail=500`, model: "mock", token: "t" }));
    const result = await runner.run(makeAttempt(), "say hi");
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/openai_api_status: 500/);
  });

  it("returns timed_out when turn_timeout_ms is exceeded", async () => {
    // Point at a port that's not accepting connections + tiny timeout.
    // localhost:1 will hang briefly then reject; an aborted fetch surfaces as
    // a DOMException AbortError.
    const runner = new OpenAIApiRunner(makeConfig({ endpoint: "http://127.0.0.1:1/v1/chat/completions", model: "mock", token: "t", turn_timeout_ms: 5 }));
    const result = await runner.run(makeAttempt(), "x");
    expect(["timed_out", "failed"]).toContain(result.status);
    if (result.status === "timed_out") expect(result.error).toBe("openai_turn_timeout");
  });
});
