import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceConfig } from "@conduit-harness/conduit";
import JiraTrackerClient from "../src/index.js";
import { startJiraMock, type JiraMockHandle } from "./mock-server.js";

const FAKE_DOMAIN = "test.example.atlassian.net";

function makeConfig(overrides: { required_labels?: string[]; excluded_labels?: string[]; active_states?: string[] } = {}): ServiceConfig {
  return {
    repoPath: process.cwd(),
    workflowPath: "WORKFLOW.md",
    tracker: {
      kind: "jira",
      activeStates: overrides.active_states ?? ["Todo"],
      terminalStates: ["Done"],
      requiredLabels: overrides.required_labels ?? ["ai"],
      excludedLabels: overrides.excluded_labels ?? [],
      pageSize: 50,
      writes: { enabled: false, actions: {} },
      raw: { domain: FAKE_DOMAIN, project_key: "TEST", email: "user@example.com", api_key: "test-token" },
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/conduit-ws", strategy: "git-worktree", baseRef: "main" },
    state: { root: "/tmp/conduit-state" },
    hooks: { afterCreate: undefined, beforeRun: undefined, afterRun: undefined, beforeRemove: undefined, timeoutMs: 60000 },
    agent: { kind: "fake", maxConcurrentAgents: 1, maxRetryBackoffMs: 0, maxConcurrentAgentsByState: {}, raw: {} },
  };
}

// Jira tracker hardcodes `https://${domain}` in its base URL (jira/src/index.ts:20),
// so tests redirect those requests to the local mock by wrapping fetch.
function makeRedirectedFetch(mockBaseUrl: string): typeof fetch {
  return ((input, init) => {
    const original = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const rewritten = original.replace(`https://${FAKE_DOMAIN}`, mockBaseUrl);
    return fetch(rewritten, init);
  }) as typeof fetch;
}

describe("jira tracker integration", () => {
  let mock: JiraMockHandle;
  beforeAll(async () => { mock = await startJiraMock(); });
  afterAll(async () => { await mock.close(); });

  it("fetchCandidateIssues queries by jql and filters by required labels", async () => {
    const tracker = new JiraTrackerClient(makeConfig(), makeRedirectedFetch(mock.baseUrl));
    const issues = await tracker.fetchCandidateIssues();
    expect(issues.map((i) => i.identifier)).toEqual(["TEST-1"]);
    expect(issues[0]!.description).toContain("Do the thing.");
    expect(issues[0]!.url).toBe(`https://${FAKE_DOMAIN}/browse/TEST-1`);
  });

  it("fetchIssuesByStates uses the requested state names", async () => {
    const tracker = new JiraTrackerClient(makeConfig({ required_labels: [] }), makeRedirectedFetch(mock.baseUrl));
    const done = await tracker.fetchIssuesByStates(["Done"]);
    expect(done.map((i) => i.identifier)).toEqual(["TEST-3"]);
  });

  it("fetchIssueStatesByIds returns status names keyed by id", async () => {
    const tracker = new JiraTrackerClient(makeConfig(), makeRedirectedFetch(mock.baseUrl));
    const states = await tracker.fetchIssueStatesByIds(["1001", "1003"]);
    expect(states["1001"]).toBe("Todo");
    expect(states["1003"]).toBe("Done");
  });

  it("comment posts ADF-formatted body", async () => {
    const tracker = new JiraTrackerClient(makeConfig(), makeRedirectedFetch(mock.baseUrl));
    await tracker.comment("1001", "hello jira");
    const req = mock.requests.find((r) => r.method === "POST" && r.path === "/rest/api/3/issue/1001/comment");
    expect(req).toBeDefined();
    const body = req!.body as { body: { type: string; content: Array<{ type: string; content: Array<{ type: string; text: string }> }> } };
    expect(body.body.type).toBe("doc");
    expect(body.body.content[0]!.content[0]!.text).toBe("hello jira");
  });

  it("transition resolves the matching transition id and posts to /transitions", async () => {
    const tracker = new JiraTrackerClient(makeConfig(), makeRedirectedFetch(mock.baseUrl));
    await tracker.transition("1001", "Done");
    expect(mock.issues.get("1001")!.fields.status.name).toBe("Done");
  });

  it("transition throws jira_transition_not_found for unknown state", async () => {
    const tracker = new JiraTrackerClient(makeConfig(), makeRedirectedFetch(mock.baseUrl));
    await expect(tracker.transition("1001", "NoSuchState")).rejects.toThrow(/jira_transition_not_found/);
  });
});
