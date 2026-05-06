import type { Issue, RunAttempt, ServiceConfig, WorkflowDefinition, Workspace } from "../domain/types.js";
import { Logger } from "../logging/logger.js";
import type { IssueTracker } from "../tracker/tracker.js";
import type { AgentRunner, AgentResult } from "../agent/runner.js";
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
    if (options.dryRun) {
      for (const issue of dispatchable) this.logger.info("dry-run would dispatch", { issue: issue.identifier });
      return;
    }
    await Promise.all(dispatchable.map(issue => this.dispatch(issue)));
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
    const startTime = Date.now();
    const result = await this.agent.run(attempt, prompt);
    const duration = Date.now() - startTime;
    const log = result.fullLog ?? result.output;
    this.logger.info("llm response received", { issue: issue.identifier, status: result.status, outputChars: log.length });
    const finalAttempt: RunAttempt = { ...attempt, status: result.status, finishedAt: new Date().toISOString() };
    if (result.error) finalAttempt.error = result.error;
    await this.state.appendAttempt(finalAttempt);
    const event = result.status === "succeeded" ? "on_success" : "on_terminal_failure";
    const comment = this.composeComment(attemptNo, result, workspace, duration);
    await this.safeWrite(event, issue, comment);
    this.logger.info("agent finished", { issue: issue.identifier, status: result.status, error: result.error });
  }

  private composeComment(attemptNo: number, result: AgentResult, workspace: Workspace, durationMs: number): string {
    const statusEmoji = result.status === "succeeded" ? "✅" : result.status === "timed_out" ? "⏱️" : "❌";
    const durationSec = (durationMs / 1000).toFixed(1);
    let body = `${statusEmoji} Conduit attempt ${attemptNo} ${result.status}.`;
    body += `\nBranch: \`${workspace.branchName}\``;
    body += `\nDuration: ${durationSec}s`;
    if (result.usage) {
      body += `\nInput tokens: ${result.usage.inputTokens}`;
      body += `\nOutput tokens: ${result.usage.outputTokens}`;
      if (result.usage.cacheCreationInputTokens > 0) body += `\nCache creation tokens: ${result.usage.cacheCreationInputTokens}`;
      if (result.usage.cacheReadInputTokens > 0) body += `\nCache read tokens: ${result.usage.cacheReadInputTokens}`;
    }
    if (result.summary) body += `\n\n${result.summary}`;
    if (result.error) body += `\n\n**Error:** ${result.error}`;
    const log = result.fullLog ?? result.output;
    if (log.length > 0) {
      body += `\n\n<details><summary>Full log</summary>\n\n\`\`\`\n${log.slice(-4000)}\n\`\`\`\n</details>`;
    }
    return body;
  }

  private async safeWrite(event: "on_start" | "on_success" | "on_failure" | "on_terminal_failure", issue: Issue, body: string) {
    try { await this.tracker.applyWrite(event, issue, body); } catch (error) { this.logger.warn("tracker write failed", { event, issue: issue.identifier, error: error instanceof Error ? error.message : String(error) }); }
  }
}
function sortIssue(a: Issue, b: Issue) { return (a.priority ?? 9999) - (b.priority ?? 9999) || a.createdAt?.localeCompare(b.createdAt ?? "") || 0; }
