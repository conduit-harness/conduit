export type Issue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: Array<{ id: string | null; identifier: string | null; state: string | null }>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkflowDefinition = {
  path: string;
  config: Record<string, unknown>;
  promptTemplate: string;
};

export type TrackerWriteEvent = "on_start" | "on_success" | "on_failure" | "on_terminal_failure";

export type TrackerWriteAction = {
  comment: boolean;
  transitionTo?: string;
};

export type ServiceConfig = {
  repoPath: string;
  workflowPath: string;
  tracker: {
    kind: string;
    activeStates: string[];
    terminalStates: string[];
    requiredLabels: string[];
    excludedLabels: string[];
    pageSize: number;
    writes: {
      enabled: boolean;
      actions: Partial<Record<TrackerWriteEvent, TrackerWriteAction>>;
    };
    raw: Record<string, unknown>;
  };
  polling: { intervalMs: number };
  workspace: { root: string; strategy: "git-worktree"; baseRef: string };
  state: { root: string };
  hooks: { afterCreate: string | undefined; beforeRun: string | undefined; afterRun: string | undefined; beforeRemove: string | undefined; timeoutMs: number };
  agent: {
    kind: string;
    maxConcurrentAgents: number;
    maxAttempts: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
    raw: Record<string, unknown>;
  };
};

export type Workspace = { path: string; workspaceKey: string; branchName: string; createdNow: boolean };
export type AttemptStatus = "running" | "succeeded" | "failed" | "timed_out";
export type RunAttempt = {
  id: string;
  issueId: string;
  issueIdentifier: string;
  attempt: number;
  workspacePath: string;
  branchName: string;
  startedAt: string;
  finishedAt?: string;
  status: AttemptStatus;
  error?: string;
};

export type PersistedState = {
  version: 1;
  attempts: RunAttempt[];
  completedIssueIds: string[];
  retryAttempts: Record<string, { issueId: string; identifier: string; attempt: number; dueAtMs: number; error: string | null }>;
};
