import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceConfig } from "@conduit-harness/conduit";
import GitLabTrackerClient from "../src/index.js";
import { startGitlabMock, type GlMockHandle } from "./mock-server.js";

function makeConfig(overrides: { gitlab_url: string; required_labels?: string[]; excluded_labels?: string[] }): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: {
      kind: "gitlab",
      activeStates: ["opened"],
      terminalStates: ["closed"],
      requiredLabels: overrides.required_labels ?? ["ai"],
      excludedLabels: overrides.excluded_labels ?? ["blocked"],
      pageSize: 50,
      writes: { enabled: false, actions: {} },
      raw: { gitlab_url: overrides.gitlab_url, project_id: "42", api_key: "test-token" },
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/conduit-ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/conduit-state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "fake", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw: {} },
  };
}

describe("gitlab tracker integration", () => {
  let mock: GlMockHandle;
  beforeAll(async () => { mock = await startGitlabMock(); });
  afterAll(async () => { await mock.close(); });

  it("fetchCandidateIssues filters by required and excluded labels", async () => {
    const tracker = new GitLabTrackerClient(makeConfig({ gitlab_url: mock.baseUrl }));
    const issues = await tracker.fetchCandidateIssues();
    const ids = issues.map((i) => i.id).sort();
    expect(ids).toEqual(["11"]);
    expect(issues[0]!.identifier).toBe("#11");
    expect(issues[0]!.url).toBe("https://gitlab/example/-/issues/11");
  });

  it("fetchIssuesByStates fetches both opened and closed when both are requested", async () => {
    const tracker = new GitLabTrackerClient(makeConfig({ gitlab_url: mock.baseUrl, required_labels: [], excluded_labels: [] }));
    const both = await tracker.fetchIssuesByStates(["opened", "closed"]);
    const ids = both.map((i) => i.id).sort();
    expect(ids).toContain("11");
    expect(ids).toContain("14");
  });

  it("fetchIssueStatesByIds queries by iids[]", async () => {
    const tracker = new GitLabTrackerClient(makeConfig({ gitlab_url: mock.baseUrl }));
    const states = await tracker.fetchIssueStatesByIds(["11", "14"]);
    expect(states).toEqual({ "11": "opened", "14": "closed" });
  });

  it("comment posts a note with private-token auth", async () => {
    const tracker = new GitLabTrackerClient(makeConfig({ gitlab_url: mock.baseUrl }));
    await tracker.comment("11", "hello");
    const req = mock.requests.find((r) => r.method === "POST" && r.path.endsWith("/notes"));
    expect(req).toBeDefined();
    expect(req!.token).toBe("test-token");
    expect((req!.body as { body: string }).body).toBe("hello");
  });

  it("transition emits close/reopen state_event for terminal vs active", async () => {
    const tracker = new GitLabTrackerClient(makeConfig({ gitlab_url: mock.baseUrl }));
    await tracker.transition("11", "closed");
    expect(mock.issues.get("11")!.state).toBe("closed");
    await tracker.transition("11", "opened");
    expect(mock.issues.get("11")!.state).toBe("opened");
  });
});
