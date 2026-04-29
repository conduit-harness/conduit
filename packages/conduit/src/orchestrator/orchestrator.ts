import type { Issue, RunAttempt, ServiceConfig, WorkflowDefinition } from "../domain/types.js";
import { Logger } from "../logging/logger.js";
import type { IssueTracker } from "../tracker/tracker.js";
import type { AgentRunner } from "../agent/runner.js";
import { GitWorktreeManager } from "../workspace/git-worktree.js";
import { JsonStateStore } from "../state/json-state.js";
import { renderPrompt } from "../prompt/render.js";

export class Orchestrator {
  private readonly workspaces: GitWorktreeManager;
  private readonly state: JsonStateStore;
  constructor(private readonly config: ServiceConfig, private readonly workflow: WorkflowDefinition, private readonly tracker: IssueTracker, private readonly agent: AgentRunner, private readonly logger: Logger) {
    this.workspaces = new GitWorktreeManager(config);
    this.state = new JsonStateStore(config.state.root);
  }
  async tick(options: { dryRun?: boolean } = {}) {
    const candidates = await this.tracker.fetchCandidateIssues();
    const state = await this.state.load();
    const claimed = new Set([...state.completedIssueIds, ...state.attempts.filter(a => a.status === "running").map(a => a.issueId)]);
    const dispatchable = candidates.filter(i => !claimed.has(i.id)).sort(sortIssue).slice(0, this.config.agent.maxConcurrentAgents);
    this.logger.info("dispatch candidates selected", { fetched: candidates.length, dispatchable: dispatchable.length, dryRun: !!options.dryRun });
    for (const issue of dispatchable) {
      if (options.dryRun) { this.logger.info("dry-run would dispatch", { issue: issue.identifier }); continue; }
      await this.dispatch(issue);
    }
  }
  private async dispatch(issue: Issue) {
    const prior = (await this.state.load()).attempts.filter(a => a.issueId === issue.id).length;
    const attemptNo = prior + 1;
    const workspace = await this.workspaces.prepare(issue, attemptNo);
    const attempt: RunAttempt = { id: `${issue.id}-${Date.now()}`, issueId: issue.id, issueIdentifier: issue.identifier, attempt: attemptNo, workspacePath: workspace.path, branchName: workspace.branchName, startedAt: new Date().toISOString(), status: "running" };
    await this.safeWrite("on_start", issue, `Conduit started attempt ${attemptNo} on branch ${workspace.branchName}.`);
    const prompt = renderPrompt(this.workflow.promptTemplate, { issue, workspace, attempt, config: this.config });
    this.logger.info("agent starting", { issue: issue.identifier, attempt: attemptNo, workspace: workspace.path });
    this.logger.info("llm request sent", { issue: issue.identifier, promptChars: prompt.length });
    const result = await this.agent.run(attempt, prompt);
    this.logger.info("llm response received", { issue: issue.identifier, status: result.status, outputChars: result.output.length });
    const finalAttempt: RunAttempt = { ...attempt, status: result.status, finishedAt: new Date().toISOString() };
    if (result.error) finalAttempt.error = result.error;
    await this.state.appendAttempt(finalAttempt);
    const event = result.status === "succeeded" ? "on_success" : "on_terminal_failure";
    await this.safeWrite(event, issue, `Conduit attempt ${attemptNo} ${result.status}.${result.error ? ` Error: ${result.error}` : ""}\n\nOutput:\n${result.output.slice(-4000)}`);
    this.logger.info("agent finished", { issue: issue.identifier, status: result.status, error: result.error });
  }
  private async safeWrite(event: "on_start" | "on_success" | "on_failure" | "on_terminal_failure", issue: Issue, body: string) {
    try { await this.tracker.applyWrite(event, issue, body); } catch (error) { this.logger.warn("tracker write failed", { event, issue: issue.identifier, error: error instanceof Error ? error.message : String(error) }); }
  }
}
function sortIssue(a: Issue, b: Issue) { return (a.priority ?? 9999) - (b.priority ?? 9999) || a.createdAt?.localeCompare(b.createdAt ?? "") || 0; }
