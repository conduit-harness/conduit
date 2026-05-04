import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceConfig } from "@conduit-harness/conduit";
import LinearTrackerClient from "../src/index.js";
import { startLinearMock, type LinearMockHandle } from "./mock-server.js";

function makeConfig(overrides: { endpoint: string; required_labels?: string[]; team_key?: string; project_slug?: string }): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: {
      kind: "linear",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
      requiredLabels: overrides.required_labels ?? ["ai"],
      excludedLabels: [],
      pageSize: 50,
      writes: { enabled: false, actions: {} },
      raw: { endpoint: overrides.endpoint, api_key: "test-token", team_key: overrides.team_key ?? "ENG", project_slug: overrides.project_slug ?? undefined },
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/conduit-ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/conduit-state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "fake", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw: {} },
  };
}

describe("linear tracker integration", () => {
  let mock: LinearMockHandle;
  beforeAll(async () => { mock = await startLinearMock(); });
  afterAll(async () => { await mock.close(); });

  it("fetchCandidateIssues calls the team-keyed query when team_key is set", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    const issues = await tracker.fetchCandidateIssues();
    expect(issues.map((i) => i.identifier)).toEqual(["ENG-1"]);
    expect(issues[0]!.url).toBe("https://linear/test/ENG-1");
    const op = mock.requests[0]!;
    expect(op.operationName).toBe("ConduitCandidateIssuesByTeam");
    expect(op.variables.teamKey).toBe("ENG");
  });

  it("fetchCandidateIssues calls the project-keyed query when project_slug is set", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl, project_slug: "proj-x" }));
    const before = mock.requests.length;
    await tracker.fetchCandidateIssues();
    const op = mock.requests[before]!;
    expect(op.operationName).toBe("ConduitCandidateIssuesByProject");
    expect(op.variables.projectSlug).toBe("proj-x");
  });

  it("fetchIssueStatesByIds returns the current state names", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    const states = await tracker.fetchIssueStatesByIds(["L1", "L3"]);
    expect(states).toEqual({ L1: "Todo", L3: "Done" });
  });

  it("comment sends a commentCreate mutation with the right body", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    await tracker.comment("L1", "hello");
    const op = mock.requests.find((r) => r.operationName === "ConduitComment");
    expect(op).toBeDefined();
    expect(op!.variables).toMatchObject({ issueId: "L1", body: "hello" });
  });

  it("transition resolves stateId via team states and updates the issue", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    await tracker.transition("L1", "Done");
    expect(mock.state.issues.find((i) => i.id === "L1")!.state.name).toBe("Done");
  });

  it("transition is a no-op when issue is already in the target state", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    const before = mock.requests.length;
    await tracker.transition("L3", "Done");
    const after = mock.requests.slice(before).map((r) => r.operationName);
    expect(after).toContain("ConduitIssueTeam");
    expect(after).not.toContain("ConduitTransition");
  });

  it("throws linear_state_not_found when state does not exist", async () => {
    const tracker = new LinearTrackerClient(makeConfig({ endpoint: mock.endpointUrl }));
    await expect(tracker.transition("L1", "NoSuchState")).rejects.toThrow(/linear_state_not_found/);
  });
});
