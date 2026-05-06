import type { Issue, ServiceConfig, TrackerWriteEvent } from "../domain/types.js";

export interface IssueTracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>>;
  comment(issueId: string, body: string): Promise<void>;
  transition(issueId: string, stateName: string): Promise<void>;
  applyWrite(event: TrackerWriteEvent, issue: Issue, body: string): Promise<void>;
  preflightAuth?(): Promise<void>;
}

export abstract class BaseTracker implements IssueTracker {
  constructor(protected readonly config: ServiceConfig) {}
  abstract fetchCandidateIssues(): Promise<Issue[]>;
  abstract fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  abstract fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>>;
  async comment(_issueId: string, _body: string): Promise<void> {}
  async transition(_issueId: string, _stateName: string): Promise<void> {}
  async applyWrite(event: TrackerWriteEvent, issue: Issue, body: string): Promise<void> {
    const writes = this.config.tracker.writes;
    if (!writes.enabled) return;
    const action = writes.actions[event];
    if (!action) return;
    if (action.comment) await this.comment(issue.id, body);
    if (action.transitionTo && issue.state !== action.transitionTo) await this.transition(issue.id, action.transitionTo);
  }
}
