import type { Issue, ServiceConfig } from "@conduit-harness/conduit";
import { BaseTracker } from "@conduit-harness/conduit";

function str(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }

export default class ForgejoTrackerClient extends BaseTracker {
  private readonly base: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly apiKey: string | undefined;

  constructor(config: ServiceConfig, private readonly fetchImpl: typeof fetch = fetch) {
    super(config);
    const raw = config.tracker.raw;
    const baseUrl = (str(raw.base_url) ?? "").replace(/\/+$/, "");
    if (!baseUrl) throw new Error("forgejo_missing_base_url: set tracker.base_url to your Forgejo/Gitea instance URL");
    this.base = `${baseUrl}/api/v1`;
    this.owner = str(raw.owner) ?? "";
    this.repo = str(raw.repo) ?? "";
    this.apiKey = str(raw.api_key) ?? str(raw.token) ?? process.env.FORGEJO_TOKEN ?? process.env.GITEA_TOKEN;
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const out: Issue[] = [];
    let page = 1;
    do {
      const items = await this.get<FJIssueRaw[]>(`/repos/${this.owner}/${this.repo}/issues?state=open&type=issues&limit=${this.config.tracker.pageSize}&page=${page}`);
      if (items.length === 0) break;
      out.push(...items.filter(i => !i.pull_request).map(normalizeIssue));
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
    if (wantOpen) results.push(await this.fetchCandidateIssues());
    if (wantClosed) results.push(await this.fetchByState("closed"));
    return results.flat();
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>> {
    if (issueIds.length === 0) return {};
    const entries = await Promise.all(issueIds.map(async id => {
      const issue = await this.get<FJIssueRaw>(`/repos/${this.owner}/${this.repo}/issues/${id}`);
      return [id, issue.state] as const;
    }));
    return Object.fromEntries(entries);
  }

  override async comment(issueId: string, body: string): Promise<void> {
    await this.request("POST", `/repos/${this.owner}/${this.repo}/issues/${issueId}/comments`, { body });
  }

  override async transition(issueId: string, stateName: string): Promise<void> {
    const terminalSet = new Set(this.config.tracker.terminalStates.map(s => s.toLowerCase()));
    const state = terminalSet.has(stateName.toLowerCase()) ? "closed" : "open";
    await this.request("PATCH", `/repos/${this.owner}/${this.repo}/issues/${issueId}`, { state });
  }

  private async fetchByState(state: "open" | "closed"): Promise<Issue[]> {
    const out: Issue[] = []; let page = 1;
    do {
      const items = await this.get<FJIssueRaw[]>(`/repos/${this.owner}/${this.repo}/issues?state=${state}&type=issues&limit=${this.config.tracker.pageSize}&page=${page}`);
      if (items.length === 0) break;
      out.push(...items.filter(i => !i.pull_request).map(normalizeIssue));
      if (items.length < this.config.tracker.pageSize) break;
      page++;
    } while (true);
    return out;
  }

  private headers() { return { authorization: `token ${this.apiKey ?? ""}`, accept: "application/json" }; }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) throw new Error(`forgejo_api_status: ${res.status}`);
      return await res.json() as T;
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("forgejo_")) throw cause; throw new Error(`forgejo_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }

  private async request(method: string, path: string, body: unknown): Promise<void> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { method, headers: { ...this.headers(), "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) throw new Error(`forgejo_api_status: ${res.status}`);
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("forgejo_")) throw cause; throw new Error(`forgejo_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }
}

type FJIssueRaw = { number: number; title: string; body: string | null; state: string; html_url: string; labels: Array<{ name: string }>; created_at: string; updated_at: string; pull_request?: unknown };

function normalizeIssue(raw: FJIssueRaw): Issue { return { id: String(raw.number), identifier: `#${raw.number}`, title: raw.title, description: raw.body ?? null, priority: null, state: raw.state, branchName: null, url: raw.html_url, labels: raw.labels.map(l => l.name.toLowerCase()), blockedBy: [], createdAt: raw.created_at, updatedAt: raw.updated_at }; }
function labelsMatch(issue: Issue, required: string[], excluded: string[]) { const labels = new Set(issue.labels); return required.every(l => labels.has(l.toLowerCase())) && !excluded.some(l => labels.has(l.toLowerCase())); }
