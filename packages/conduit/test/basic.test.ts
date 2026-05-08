import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildConfig, loadWorkflow } from "../src/config/workflow.js";
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
