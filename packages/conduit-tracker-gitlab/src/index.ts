import type { Issue, ServiceConfig } from "@ausernamedtom/conduit";
import { BaseTracker } from "@ausernamedtom/conduit";

function str(v: unknown, fallback?: string): string { return typeof v === "string" && v.length > 0 ? v : (fallback ?? ""); }
function maybeStr(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }

export default class GitLabTrackerClient extends BaseTracker {
  private readonly base: string;
  private readonly project: string;
  private readonly apiKey: string | undefined;

  constructor(config: ServiceConfig, private readonly fetchImpl: typeof fetch = fetch) {
    super(config);
    const raw = config.tracker.raw;
    const gitlabUrl = str(raw.gitlab_url, "https://gitlab.com");
    this.base = `${gitlabUrl}/api/v4`;
    this.project = encodeURIComponent(str(raw.project_id));
    this.apiKey = maybeStr(raw.api_key) ?? maybeStr(raw.token) ?? process.env.GITLAB_TOKEN;
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const out: Issue[] = []; let page = 1;
    do {
      const items = await this.get<GLIssueRaw[]>(`/projects/${this.project}/issues?state=opened&per_page=${this.config.tracker.pageSize}&page=${page}`);
      if (items.length === 0) break;
      out.push(...items.map(normalizeIssue));
      if (items.length < this.config.tracker.pageSize) break;
      page++;
    } while (true);
    return out.filter(i => labelsMatch(i, this.config.tracker.requiredLabels, this.config.tracker.excludedLabels));
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const terminalSet = new Set(this.config.tracker.terminalStates.map(s => s.toLowerCase()));
    const wantClosed = stateNames.some(s => terminalSet.has(s.toLowerCase()));
    const wantOpen = stateNames.some(s => !terminalSet.has(s.toLowerCase()));
    const results: Issue[][] = [];
    if (wantOpen) results.push(await this.fetchByGLState("opened"));
    if (wantClosed) results.push(await this.fetchByGLState("closed"));
    return results.flat();
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>> {
    if (issueIds.length === 0) return {};
    const query = issueIds.map(id => `iids[]=${id}`).join("&");
    const items = await this.get<GLIssueRaw[]>(`/projects/${this.project}/issues?${query}&per_page=${issueIds.length}`);
    return Object.fromEntries(items.map(i => [String(i.iid), i.state]));
  }

  override async comment(issueId: string, body: string): Promise<void> {
    await this.request("POST", `/projects/${this.project}/issues/${issueId}/notes`, { body });
  }

  override async transition(issueId: string, stateName: string): Promise<void> {
    const terminalSet = new Set(this.config.tracker.terminalStates.map(s => s.toLowerCase()));
    const stateEvent = terminalSet.has(stateName.toLowerCase()) ? "close" : "reopen";
    await this.request("PUT", `/projects/${this.project}/issues/${issueId}`, { state_event: stateEvent });
  }

  private async fetchByGLState(state: "opened" | "closed"): Promise<Issue[]> {
    const out: Issue[] = []; let page = 1;
    do {
      const items = await this.get<GLIssueRaw[]>(`/projects/${this.project}/issues?state=${state}&per_page=${this.config.tracker.pageSize}&page=${page}`);
      if (items.length === 0) break;
      out.push(...items.map(normalizeIssue));
      if (items.length < this.config.tracker.pageSize) break;
      page++;
    } while (true);
    return out;
  }

  private headers() { return { "private-token": this.apiKey ?? "", accept: "application/json" }; }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) throw new Error(`gitlab_api_status: ${res.status}`);
      return await res.json() as T;
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("gitlab_")) throw cause; throw new Error(`gitlab_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }

  private async request(method: string, path: string, body: unknown): Promise<void> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { method, headers: { ...this.headers(), "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) throw new Error(`gitlab_api_status: ${res.status}`);
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("gitlab_")) throw cause; throw new Error(`gitlab_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }
}

type GLIssueRaw = { iid: number; title: string; description: string | null; state: string; web_url: string; labels: string[]; created_at: string; updated_at: string };

function normalizeIssue(raw: GLIssueRaw): Issue { return { id: String(raw.iid), identifier: `#${raw.iid}`, title: raw.title, description: raw.description ?? null, priority: null, state: raw.state, branchName: null, url: raw.web_url, labels: raw.labels.map(l => l.toLowerCase()), blockedBy: [], createdAt: raw.created_at, updatedAt: raw.updated_at }; }
function labelsMatch(issue: Issue, required: string[], excluded: string[]) { const labels = new Set(issue.labels); return required.every(l => labels.has(l.toLowerCase())) && !excluded.some(l => labels.has(l.toLowerCase())); }
