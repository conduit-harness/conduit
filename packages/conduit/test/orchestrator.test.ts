import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Issue, ServiceConfig, RunAttempt, PersistedState, Workspace } from "../src/domain/types.js";
import type { IssueTracker } from "../src/tracker/tracker.js";
import type { AgentRunner } from "../src/agent/runner.js";
import { Logger } from "../src/logging/logger.js";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";

// In-memory state store for testing
class InMemoryStateStore {
  private state: PersistedState = { version: 1, attempts: [], completedIssueIds: [], retryAttempts: {} };
  async load(): Promise<PersistedState> {
    return { ...this.state, attempts: [...this.state.attempts], completedIssueIds: [...this.state.completedIssueIds] };
  }
  async appendAttempt(attempt: RunAttempt): Promise<void> {
    this.state.attempts.push(attempt);
    if (attempt.status === "succeeded") {
      this.state.completedIssueIds.push(attempt.issueId);
    }
  }
}

// Fake IssueTracker implementation
class FakeIssueTracker implements IssueTracker {
  private candidateIssues: Issue[] = [];
  private writes: Array<{ event: string; issueId: string; body: string }> = [];
  private throwOnWrite = false;
  private config: ServiceConfig | null = null;

  setConfig(config: ServiceConfig): void { this.config = config; }
  setCandidateIssues(issues: Issue[]): void { this.candidateIssues = issues; }
  setThrowOnWrite(shouldThrow: boolean): void { this.throwOnWrite = shouldThrow; }
  getWrites(): Array<{ event: string; issueId: string; body: string }> { return this.writes; }

  async fetchCandidateIssues(): Promise<Issue[]> {
    if (!this.config) return this.candidateIssues;
    return this.candidateIssues.filter(issue => {
      const issueLabels = issue.labels.map(l => l.toLowerCase());
      const hasAllRequired = this.config!.tracker.requiredLabels.every(req => issueLabels.includes(req.toLowerCase()));
      if (!hasAllRequired) return false;
      const hasExcluded = this.config!.tracker.excludedLabels.some(excluded => issueLabels.includes(excluded.toLowerCase()));
      if (hasExcluded) return false;
      return true;
    });
  }

  async fetchIssuesByStates(_stateNames: string[]): Promise<Issue[]> { return []; }
  async fetchIssueStatesByIds(_issueIds: string[]): Promise<Record<string, string>> { return {}; }

  async comment(issueId: string, body: string): Promise<void> {
    this.writes.push({ event: "comment", issueId, body });
    if (this.throwOnWrite) throw new Error("Write failed");
  }

  async transition(issueId: string, stateName: string): Promise<void> {
    this.writes.push({ event: "transition", issueId, body: stateName });
    if (this.throwOnWrite) throw new Error("Write failed");
  }

  async applyWrite(event: string, issue: Issue, body: string): Promise<void> {
    this.writes.push({ event, issueId: issue.id, body });
    if (this.throwOnWrite) throw new Error("Write failed");
    if (!this.config || !this.config.tracker.writes.enabled) return;
    const action = this.config.tracker.writes.actions[event as keyof typeof this.config.tracker.writes.actions];
    if (!action) return;
    if (action.comment) await this.comment(issue.id, body);
    if (action.transitionTo && issue.state !== action.transitionTo) await this.transition(issue.id, action.transitionTo);
  }
}

// Fake workspace manager for testing
class FakeWorktreeManager {
  async prepare(issue: Issue, attempt: number): Promise<Workspace> {
    return { path: `/workspace/${issue.id}/${attempt}`, workspaceKey: issue.identifier.toLowerCase(), branchName: `conduit/${issue.identifier.toLowerCase()}/${attempt}`, createdNow: true };
  }
}

function createTestConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    repoPath: "/test/repo",
    workflowPath: "/test/workflow.md",
    tracker: {
      kind: "fake",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Closed", "Done"],
      requiredLabels: [],
      excludedLabels: [],
      pageSize: 50,
      writes: { enabled: true, actions: { on_start: { comment: true }, on_success: { comment: true, transitionTo: "Done" }, on_terminal_failure: { comment: true } } },
      raw: {},
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/workspaces", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/state" },
    logs: { root: "/logs" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 300000 },
    agent: { kind: "fake", maxConcurrentAgents: 10, maxAttempts: 0, maxRetryBackoffMs: 60000, maxConcurrentAgentsByState: {}, raw: {} },
    ...overrides,
  };
}

function createTestIssue(overrides: Partial<Issue> = {}): Issue {
  return { id: "issue-1", identifier: "TEST-1", title: "Test issue", description: null, priority: null, state: "Todo", branchName: null, url: null, labels: [], blockedBy: [], createdAt: new Date().toISOString(), updatedAt: null, ...overrides };
}

function makeOrchestrator(config: ServiceConfig, tracker: FakeIssueTracker, runner: AgentRunner) {
  const stateStore = new InMemoryStateStore();
  const orch = new (Orchestrator as any)(config, { path: "test.md", config: {}, promptTemplate: "Test {{issue.identifier}}" }, tracker, runner, new Logger("error"));
  orch["workspaces"] = new FakeWorktreeManager();
  orch["state"] = stateStore;
  return { orch: orch as Orchestrator, stateStore };
}

describe("given an issue with a required label", () => {
  describe("when a tick runs", () => {
    it("then the agent is dispatched", async () => {
      const config = createTestConfig({ tracker: { ...createTestConfig().tracker, requiredLabels: ["agentic"] } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue({ labels: ["agentic"] })]);
      let called = false;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { called = true; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(called).toBe(true);
    });
  });
});

describe("given an issue without a required label", () => {
  describe("when a tick runs", () => {
    it("then nothing happens", async () => {
      const config = createTestConfig({ tracker: { ...createTestConfig().tracker, requiredLabels: ["agentic"] } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue({ labels: ["other-label"] })]);
      let called = false;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { called = true; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(called).toBe(false);
    });
  });
});

describe("given an excluded label", () => {
  describe("when a tick runs", () => {
    it("then the issue is skipped", async () => {
      const config = createTestConfig({ tracker: { ...createTestConfig().tracker, excludedLabels: ["blocked"] } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue({ labels: ["blocked"] })]);
      let called = false;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { called = true; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(called).toBe(false);
    });
  });
});

describe("given a successful agent run with writes.enabled: true", () => {
  describe("when the run completes", () => {
    it("then on_success write fires with the configured comment + transition", async () => {
      const config = createTestConfig({ tracker: { ...createTestConfig().tracker, writes: { enabled: true, actions: { on_success: { comment: true, transitionTo: "Done" } } } } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      const { orch } = makeOrchestrator(config, tracker, { run: async () => ({ status: "succeeded", output: "completed" }) });
      await orch.tick();
      const writes = tracker.getWrites();
      expect(writes.some(w => w.event === "on_success")).toBe(true);
      expect(writes.some(w => w.event === "transition" && w.body === "Done")).toBe(true);
    });
  });
});

describe("given a failed run", () => {
  describe("when it completes", () => {
    it("then on_terminal_failure fires", async () => {
      const config = createTestConfig({ tracker: { ...createTestConfig().tracker, writes: { enabled: true, actions: { on_terminal_failure: { comment: true } } } } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      const { orch } = makeOrchestrator(config, tracker, { run: async () => ({ status: "failed", output: "error", error: "Test failure" }) });
      await orch.tick();
      expect(tracker.getWrites().some(w => w.event === "on_terminal_failure")).toBe(true);
    });
  });
});

describe("given a tracker write that throws", () => {
  describe("when the run succeeds", () => {
    it("then the attempt status remains succeeded (writes are non-fatal)", async () => {
      const config = createTestConfig();
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setThrowOnWrite(true);
      tracker.setCandidateIssues([createTestIssue()]);
      const { orch, stateStore } = makeOrchestrator(config, tracker, { run: async () => ({ status: "succeeded", output: "completed" }) });
      await orch.tick();
      const state = await stateStore.load();
      const attempt = state.attempts.find((a: RunAttempt) => a.issueId === "issue-1");
      expect(attempt?.status).toBe("succeeded");
    });
  });
});

describe("given max_concurrent_agents: 1 and 3 candidate issues", () => {
  describe("when a tick runs", () => {
    it("then only 1 dispatch happens", async () => {
      const config = createTestConfig({ agent: { ...createTestConfig().agent, maxConcurrentAgents: 1 } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([
        createTestIssue({ id: "issue-1", identifier: "TEST-1", priority: 1 }),
        createTestIssue({ id: "issue-2", identifier: "TEST-2", priority: 2 }),
        createTestIssue({ id: "issue-3", identifier: "TEST-3", priority: 3 }),
      ]);
      let callCount = 0;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { callCount++; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(callCount).toBe(1);
    });
  });
});

describe("given --dry-run", () => {
  describe("when a tick runs", () => {
    it("then candidates are logged but no agent is invoked", async () => {
      const config = createTestConfig();
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      let called = false;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { called = true; return { status: "succeeded", output: "done" }; } });
      await orch.tick({ dryRun: true });
      expect(called).toBe(false);
    });
  });
});

describe("given a succeeded issue the tracker still shows as open", () => {
  describe("when a second tick runs", () => {
    it("then the issue is re-dispatched (PR rejection / re-open scenario)", async () => {
      const config = createTestConfig();
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      let callCount = 0;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { callCount++; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(callCount).toBe(1);
      // Tracker still returns the issue — simulates PR rejection + issue re-opened
      await orch.tick();
      expect(callCount).toBe(2);
    });
  });
});

describe("given a succeeded issue whose tracker closes it", () => {
  describe("when a second tick runs", () => {
    it("then the issue is not re-dispatched", async () => {
      const config = createTestConfig();
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      let callCount = 0;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { callCount++; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(callCount).toBe(1);
      tracker.setCandidateIssues([]);
      await orch.tick();
      expect(callCount).toBe(1);
    });
  });
});

describe("given max_attempts: 3 and a persistently failing agent", () => {
  describe("when 4 ticks run", () => {
    it("then the agent is called exactly 3 times", async () => {
      const config = createTestConfig({ agent: { ...createTestConfig().agent, maxAttempts: 3 } });
      const tracker = new FakeIssueTracker();
      tracker.setConfig(config);
      tracker.setCandidateIssues([createTestIssue()]);
      let callCount = 0;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { callCount++; return { status: "failed", output: "err", error: "boom" }; } });
      await orch.tick();
      await orch.tick();
      await orch.tick();
      expect(callCount).toBe(3);
      await orch.tick();
      expect(callCount).toBe(3);
    });
  });
});

describe("given workflow.md is updated between ticks", () => {
  describe("when a second tick runs", () => {
    it("then the updated config takes effect on the next poll", async () => {
      const tmpFile = join(tmpdir(), `conduit-workflow-test-${Date.now()}.md`);
      await writeFile(tmpFile, `---\nagent:\n  kind: fake\n  max_concurrent_agents: 1\n---\nTest prompt\n`);

      const config = createTestConfig({ workflowPath: tmpFile, agent: { ...createTestConfig().agent, maxConcurrentAgents: 1 } });
      const tracker = new FakeIssueTracker();
      tracker.setCandidateIssues([
        createTestIssue({ id: "issue-1", identifier: "TEST-1", priority: 1 }),
        createTestIssue({ id: "issue-2", identifier: "TEST-2", priority: 2 }),
      ]);
      let callCount = 0;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { callCount++; return { status: "succeeded", output: "done" }; } });

      await orch.tick();
      expect(callCount).toBe(1);

      await writeFile(tmpFile, `---\nagent:\n  kind: fake\n  max_concurrent_agents: 2\n---\nTest prompt\n`);

      await orch.tick();
      expect(callCount).toBe(3); // 1 from tick 1 + 2 from tick 2 (both issues dispatched)
    });
  });
});

describe("given workflow.md cannot be read during a tick", () => {
  describe("when a tick runs", () => {
    it("then the last known-good config is used and the tick completes", async () => {
      const config = createTestConfig({ workflowPath: "/nonexistent/path/workflow.md" });
      const tracker = new FakeIssueTracker();
      tracker.setCandidateIssues([createTestIssue()]);
      let called = false;
      const { orch } = makeOrchestrator(config, tracker, { run: async () => { called = true; return { status: "succeeded", output: "done" }; } });
      await orch.tick();
      expect(called).toBe(true);
    });
  });
});
