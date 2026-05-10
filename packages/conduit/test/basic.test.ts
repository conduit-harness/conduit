import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildConfig, loadWorkflow, validateForDispatch } from "../src/config/workflow.js";
import { defaultLogPath } from "../src/reporting/report.js";
import { renderPrompt } from "../src/prompt/render.js";

describe("workflow config", () => {
  it("loads the example workflow", async () => {
    const workflow = await loadWorkflow(".conduit/workflow.example.md");
    const config = buildConfig(workflow, process.cwd());
    expect(config.tracker.kind).toBe("fake");
    expect(config.workspace.baseRef).toBe("main");
    expect(config.state.root).toContain(".conduit");
    expect(config.tracker.excludedLabels).toContain("blocked");
  });

  it("defaults logs.root to <repo>/.conduit/logs when unset", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: {}, promptTemplate: "" }, "/tmp/repo");
    expect(config.logs.root).toBe(path.resolve("/tmp/repo", ".conduit/logs"));
  });

  it("resolves a relative logs.root override against the repo root", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: { logs: { root: "build/logs" } }, promptTemplate: "" }, "/tmp/repo");
    expect(config.logs.root).toBe(path.resolve("/tmp/repo", "build/logs"));
  });

  it("respects an absolute logs.root override", () => {
    const absolute = path.resolve("/var/log/conduit");
    const config = buildConfig({ path: "WORKFLOW.md", config: { logs: { root: absolute } }, promptTemplate: "" }, "/tmp/repo");
    expect(config.logs.root).toBe(absolute);
  });

  it("composes the run-log file path from the resolved logs.root", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: { logs: { root: "alt/logs" } }, promptTemplate: "" }, "/tmp/repo");
    expect(defaultLogPath(config.logs.root)).toBe(path.resolve("/tmp/repo", "alt/logs", "last-run.ndjson"));
  });
});

describe("max_attempts config", () => {
  it("defaults maxAttempts to 3 when not set", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: {}, promptTemplate: "" }, "/tmp/repo");
    expect(config.agent.maxAttempts).toBe(3);
  });

  it("preserves explicit max_attempts: 0 (unlimited sentinel)", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: { agent: { max_attempts: 0 } }, promptTemplate: "" }, "/tmp/repo");
    expect(config.agent.maxAttempts).toBe(0);
  });

  it("warns when max_attempts is 0", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: { agent: { max_attempts: 0, kind: "fake" }, tracker: { kind: "fake" } }, promptTemplate: "" }, "/tmp/repo");
    const warnings: string[] = [];
    validateForDispatch(config, (msg) => warnings.push(msg));
    expect(warnings.some(w => w.includes("unlimited"))).toBe(true);
  });

  it("does not warn when max_attempts is non-zero", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: { agent: { max_attempts: 3, kind: "fake" }, tracker: { kind: "fake" } }, promptTemplate: "" }, "/tmp/repo");
    const warnings: string[] = [];
    validateForDispatch(config, (msg) => warnings.push(msg));
    expect(warnings).toHaveLength(0);
  });
});

describe("prompt rendering", () => {
  it("renders supported variables", () => {
    const config = buildConfig({ path: "WORKFLOW.md", config: {}, promptTemplate: "" }, process.cwd());
    const text = renderPrompt("Hello {{issue.identifier}} in {{workspace.path}}", {
      config,
      issue: { id: "1", identifier: "ABC-1", title: "T", description: null, priority: null, state: "Todo", branchName: null, url: null, labels: ["ai"], blockedBy: [], createdAt: null, updatedAt: null },
      workspace: { path: "/tmp/w", workspaceKey: "abc-1", branchName: "conduit/abc-1/1", createdNow: true },
      attempt: { id: "a1", issueId: "1", issueIdentifier: "ABC-1", attempt: 1, workspacePath: "/tmp/w", branchName: "b", startedAt: new Date().toISOString(), status: "running" }
    });
    expect(text).toContain("Hello ABC-1 in /tmp/w");
  });
});
