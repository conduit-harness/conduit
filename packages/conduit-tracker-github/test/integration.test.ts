import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceConfig } from "@conduit-harness/conduit";
import GitHubTrackerClient from "../src/index.js";
import { startGithubMock, type GhMockHandle } from "./mock-server.js";

function makeConfig(overrides: { base_url: string; required_labels?: string[]; excluded_labels?: string[]; page_size?: number }): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: {
      kind: "github",
      activeStates: ["open"],
      terminalStates: ["closed"],
      requiredLabels: overrides.required_labels ?? ["ai"],
      excludedLabels: overrides.excluded_labels ?? ["blocked"],
      pageSize: overrides.page_size ?? 50,
      writes: { enabled: false, actions: {} },
      raw: { base_url: overrides.base_url, owner: "testorg", repo: "testrepo", api_key: "test-token" },
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/conduit-ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/conduit-state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "fake", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw: {} },
  };
}

describe("github tracker integration", () => {
  let mock: GhMockHandle;
  beforeAll(async () => { mock = await startGithubMock(); });
  afterAll(async () => { await mock.close(); });

  it("fetchCandidateIssues filters PRs, required and excluded labels", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl }));
    const issues = await tracker.fetchCandidateIssues();
    const ids = issues.map((i) => i.id).sort();
    expect(ids).toEqual(["1"]);
    expect(issues[0]!.identifier).toBe("#1");
    expect(issues[0]!.url).toBe("https://example/test/repo/issues/1");
    expect(issues[0]!.labels).toContain("ai");
  });

  it("fetchIssuesByStates returns open + closed when both requested", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl, required_labels: [], excluded_labels: [] }));
    const both = await tracker.fetchIssuesByStates(["open", "closed"]);
    const ids = both.map((i) => i.id).sort();
    expect(ids).toContain("1");
    expect(ids).toContain("5");
  });

  it("fetchIssueStatesByIds returns the current state for each id", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl }));
    const states = await tracker.fetchIssueStatesByIds(["1", "5"]);
    expect(states).toEqual({ "1": "open", "5": "closed" });
  });

  it("comment posts to /comments and includes a bearer token", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl }));
    await tracker.comment("1", "hello world");
    const req = mock.requests.find((r) => r.method === "POST" && r.path === "/repos/testorg/testrepo/issues/1/comments");
    expect(req).toBeDefined();
    expect(req!.auth.toLowerCase()).toBe("bearer test-token");
    expect((req!.body as { body: string }).body).toBe("hello world");
  });

  it("transition flips state to closed for terminal stateName", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl }));
    await tracker.transition("1", "closed");
    expect(mock.issues.get("1")!.state).toBe("closed");
    // and back to open for non-terminal
    await tracker.transition("1", "open");
    expect(mock.issues.get("1")!.state).toBe("open");
  });

  it("surfaces non-2xx as github_api_status error", async () => {
    const tracker = new GitHubTrackerClient(makeConfig({ base_url: mock.baseUrl }));
    await expect(tracker.fetchIssueStatesByIds(["999"])).rejects.toThrow(/github_api_status: 404/);
  });
});
