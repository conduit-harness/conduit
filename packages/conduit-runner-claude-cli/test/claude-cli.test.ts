import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ServiceConfig, RunAttempt } from "@conduit-harness/conduit";
import ClaudeCliRunner from "../src/index.js";

describe("ClaudeCliRunner", () => {
  let server: { close(): Promise<void> } | null = null;

  afterEach(async () => {
    if (server) await server.close();
    vi.clearAllMocks();
  });

  function mockConfig(overrides?: Partial<ServiceConfig["agent"]>): ServiceConfig {
    return {
      repoPath: "/tmp/repo",
      workflowPath: "/tmp/workflow.md",
      tracker: { kind: "fake", activeStates: [], terminalStates: [], requiredLabels: [], excludedLabels: [], pageSize: 10, writes: { enabled: false, actions: {} }, raw: {} },
      polling: { intervalMs: 5000 },
      workspace: { root: ".conduit", strategy: "git-worktree", baseRef: "main" },
      state: { root: ".conduit/state" },
      hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 300000 },
      agent: { kind: "claude-cli", maxConcurrentAgents: 1, maxRetryBackoffMs: 30000, maxConcurrentAgentsByState: {}, raw: { ...overrides?.raw } },
    };
  }

  function mockAttempt(): RunAttempt {
    return {
      id: "test-1",
      issueId: "issue-1",
      issueIdentifier: "ISSUE-1",
      attempt: 1,
      workspacePath: "/tmp/workspace",
      branchName: "conduit/issue-1/1",
      startedAt: new Date().toISOString(),
      status: "running",
    };
  }

  describe("Ollama backend", () => {
    it("sends prompt to Ollama and returns response", async () => {
      const responses = new Map<string, unknown>();
      responses.set("http://localhost:11434/api/generate", { response: "Test response from Ollama", done: true });

      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const response = responses.get(String(url));
        return Promise.resolve(new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }));
      });

      const config = mockConfig({
        raw: { ollama_backend_url: "http://localhost:11434", ollama_model: "qwen2.5-coder", turn_timeout_ms: 5000 },
      });
      const runner = new ClaudeCliRunner(config);
      const result = await runner.run(mockAttempt(), "Test prompt");

      expect(result.status).toBe("succeeded");
      expect(result.output).toBe("Test response from Ollama");
    });

    it("handles Ollama connection failure gracefully", async () => {
      vi.spyOn(global, "fetch").mockImplementation(() => Promise.reject(new Error("Connection refused")));

      const config = mockConfig({
        raw: { ollama_backend_url: "http://localhost:11434", ollama_model: "qwen2.5-coder", turn_timeout_ms: 5000 },
      });
      const runner = new ClaudeCliRunner(config);
      const result = await runner.run(mockAttempt(), "Test prompt");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("ollama_error");
    });

    it("returns error if ollama_backend_url is set but ollama_model is missing", async () => {
      const config = mockConfig({
        raw: { ollama_backend_url: "http://localhost:11434", ollama_model: "", turn_timeout_ms: 5000 },
      });
      const runner = new ClaudeCliRunner(config);
      const result = await runner.run(mockAttempt(), "Test prompt");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("ollama_backend_url or ollama_model not configured");
    });
  });

  describe("Claude CLI fallback", () => {
    it("does not use Ollama when ollama_backend_url is not configured", () => {
      const config = mockConfig({
        raw: { command: "claude", turn_timeout_ms: 5000 },
      });
      const runner = new ClaudeCliRunner(config);

      // Verify that the runner is created without errors
      expect(runner).toBeDefined();
    });
  });
});
