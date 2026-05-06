import type { Issue, ServiceConfig } from "@conduit-harness/conduit";
import { BaseTracker } from "@conduit-harness/conduit";

const CANDIDATES_BY_PROJECT = `query ConduitCandidateIssuesByProject($projectSlug: String!, $stateNames: [String!], $first: Int!, $after: String) {
  issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $stateNames } } }, first: $first, after: $after, orderBy: updatedAt) {
    nodes { id identifier title description priority url branchName createdAt updatedAt
      state { name }
      labels { nodes { name } }
      inverseRelations { nodes { type issue { id identifier state { name } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
const CANDIDATES_BY_TEAM = `query ConduitCandidateIssuesByTeam($teamKey: String!, $stateNames: [String!], $first: Int!, $after: String) {
  issues(filter: { team: { key: { eq: $teamKey } }, state: { name: { in: $stateNames } } }, first: $first, after: $after, orderBy: updatedAt) {
    nodes { id identifier title description priority url branchName createdAt updatedAt
      state { name }
      labels { nodes { name } }
      inverseRelations { nodes { type issue { id identifier state { name } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
const STATES = `query ConduitIssueStates($ids: [ID!]) { issues(filter: { id: { in: $ids } }, first: 250) { nodes { id state { name } } } }`;
const COMMENT = `mutation ConduitComment($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }`;
const ISSUE_TEAM = `query ConduitIssueTeam($id: String!) { issue(id: $id) { id team { id states { nodes { id name } } } state { name } } }`;
const UPDATE = `mutation ConduitTransition($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }`;
const VIEWER = `query ConduitViewer { viewer { id } }`;

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

function str(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }

export default class LinearTrackerClient extends BaseTracker {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly projectSlug: string | undefined;
  private readonly teamKey: string | undefined;

  constructor(config: ServiceConfig, private readonly fetchImpl: typeof fetch = fetch) {
    super(config);
    const raw = config.tracker.raw;
    this.endpoint = str(raw.endpoint) ?? "https://api.linear.app/graphql";
    this.apiKey = str(raw.api_key) ?? process.env.LINEAR_API_KEY;
    this.projectSlug = str(raw.project_slug);
    this.teamKey = str(raw.team_key);
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const out: Issue[] = []; let after: string | null = null;
    do {
      const byProject = !!this.projectSlug;
      const query = byProject ? CANDIDATES_BY_PROJECT : CANDIDATES_BY_TEAM;
      const selector = byProject ? { projectSlug: this.projectSlug } : { teamKey: this.teamKey };
      const data: { issues: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await this.gql(query, { ...selector, stateNames: this.config.tracker.activeStates, first: this.config.tracker.pageSize, after });
      out.push(...data.issues.nodes.map(normalizeIssue));
      if (data.issues.pageInfo.hasNextPage && !data.issues.pageInfo.endCursor) throw new Error("linear_missing_end_cursor");
      after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null;
    } while (after);
    return out.filter(i => labelsMatch(i, this.config.tracker.requiredLabels, this.config.tracker.excludedLabels));
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const saved = this.config.tracker.activeStates; this.config.tracker.activeStates = stateNames;
    try { return await this.fetchCandidateIssues(); } finally { this.config.tracker.activeStates = saved; }
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>> {
    if (issueIds.length === 0) return {};
    const data = await this.gql<{ issues: { nodes: Array<{ id: string; state?: { name?: string } }> } }>(STATES, { ids: issueIds });
    return Object.fromEntries(data.issues.nodes.map(n => [n.id, n.state?.name ?? ""]));
  }

  override async comment(issueId: string, body: string): Promise<void> { await this.gql(COMMENT, { issueId, body }); }

  override async transition(issueId: string, stateName: string): Promise<void> {
    const data = await this.gql<{ issue: { state?: { name?: string }; team?: { states?: { nodes?: Array<{ id: string; name: string }> } } } | null }>(ISSUE_TEAM, { id: issueId });
    if (!data.issue) throw new Error("linear_unknown_payload: missing issue");
    if (data.issue.state?.name === stateName) return;
    const state = data.issue.team?.states?.nodes?.find(s => s.name.toLowerCase() === stateName.toLowerCase());
    if (!state) throw new Error(`linear_state_not_found: ${stateName}`);
    await this.gql(UPDATE, { id: issueId, stateId: state.id });
  }

  async preflightAuth(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        `Linear tracker: authentication required.\n\n` +
        `Set the LINEAR_API_KEY environment variable or configure 'api_key' in your workflow.\n` +
        `See https://linear.app/docs/graphql/working-with-the-graphql-api for setup instructions.\n`
      );
    }
    try {
      await this.gql<{ viewer?: { id?: string } }>(VIEWER, {});
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes("401") || message.includes("403") || message.includes("unauthorized")) {
        throw new Error(
          `Linear tracker: invalid or expired token.\n\n` +
          `Update your LINEAR_API_KEY environment variable or 'api_key' configuration.\n` +
          `See https://linear.app/docs/graphql/working-with-the-graphql-api for setup instructions.\n`
        );
      }
      throw cause;
    }
  }

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: this.apiKey ?? "" }, body: JSON.stringify({ query, variables }), signal: controller.signal });
      if (!res.ok) throw new Error(`linear_api_status: ${res.status}`);
      const json = await res.json() as GqlResponse<T>;
      if (json.errors?.length) throw new Error(`linear_graphql_errors: ${json.errors.map(e => e.message).join("; ")}`);
      if (!json.data) throw new Error("linear_unknown_payload");
      return json.data;
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("linear_")) throw cause; throw new Error(`linear_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }
}

function labelsMatch(issue: Issue, required: string[], excluded: string[]) { const labels = new Set(issue.labels); return required.every(l => labels.has(l.toLowerCase())) && !excluded.some(l => labels.has(l.toLowerCase())); }
function normalizeIssue(raw: unknown): Issue {
  const r = raw as Record<string, any>;
  const labels = Array.isArray(r.labels?.nodes) ? r.labels.nodes.map((l: any) => String(l.name).toLowerCase()) : [];
  const blockedBy = Array.isArray(r.inverseRelations?.nodes) ? r.inverseRelations.nodes.filter((x: any) => x.type === "blocks").map((x: any) => ({ id: x.issue?.id ?? null, identifier: x.issue?.identifier ?? null, state: x.issue?.state?.name ?? null })) : [];
  return { id: String(r.id), identifier: String(r.identifier), title: String(r.title), description: r.description ?? null, priority: Number.isInteger(r.priority) ? r.priority : null, state: String(r.state?.name ?? ""), branchName: r.branchName ?? null, url: r.url ?? null, labels, blockedBy, createdAt: r.createdAt ?? null, updatedAt: r.updatedAt ?? null };
}
