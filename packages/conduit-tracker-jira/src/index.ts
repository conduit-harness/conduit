import type { Issue, ServiceConfig } from "@conduit-harness/conduit";
import { BaseTracker } from "@conduit-harness/conduit";

function str(v: unknown, fallback?: string): string | undefined { return typeof v === "string" && v.length > 0 ? v : fallback; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }

export default class JiraTrackerClient extends BaseTracker {
  private readonly base: string;
  private readonly auth: string;
  private readonly domain: string;
  private readonly projectKey: string;

  constructor(config: ServiceConfig, private readonly fetchImpl: typeof fetch = fetch) {
    super(config);
    const raw = config.tracker.raw;
    this.domain = str(raw.domain) ?? "";
    this.projectKey = str(raw.project_key) ?? "";
    const apiKey = str(raw.api_key) ?? process.env.JIRA_API_TOKEN ?? "";
    const email = str(raw.email) ?? process.env.JIRA_EMAIL ?? "";
    this.base = `https://${this.domain}/rest/api/3`;
    this.auth = "Basic " + Buffer.from(`${email}:${apiKey}`).toString("base64");
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const stateList = this.config.tracker.activeStates.map(s => `"${s}"`).join(", ");
    const jql = `project = "${this.projectKey}" AND status in (${stateList}) ORDER BY updated DESC`;
    const out: Issue[] = [];
    let startAt = 0;
    const pageSize = this.config.tracker.pageSize;
    do {
      const data = await this.get<JiraSearchResult>(`/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${pageSize}&fields=summary,description,status,labels,priority,created,updated,issuelinks`);
      out.push(...data.issues.map(i => normalizeIssue(i, this.domain)));
      if (data.startAt + data.issues.length >= data.total) break;
      startAt += data.issues.length;
    } while (true);
    return out.filter(i => labelsMatch(i, this.config.tracker.requiredLabels, this.config.tracker.excludedLabels));
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const saved = this.config.tracker.activeStates;
    this.config.tracker.activeStates = stateNames;
    try { return await this.fetchCandidateIssues(); } finally { this.config.tracker.activeStates = saved; }
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>> {
    if (issueIds.length === 0) return {};
    const jql = `issue in (${issueIds.join(", ")})`;
    const data = await this.get<JiraSearchResult>(`/search?jql=${encodeURIComponent(jql)}&maxResults=${issueIds.length}&fields=status`);
    return Object.fromEntries(data.issues.map(i => [i.id, i.fields.status?.name ?? ""]));
  }

  override async comment(issueId: string, body: string): Promise<void> {
    await this.post(`/issue/${issueId}/comment`, { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] } });
  }

  override async transition(issueId: string, stateName: string): Promise<void> {
    const data = await this.get<{ transitions: Array<{ id: string; name: string }> }>(`/issue/${issueId}/transitions`);
    const match = data.transitions.find(t => t.name.toLowerCase() === stateName.toLowerCase());
    if (!match) throw new Error(`jira_transition_not_found: ${stateName}`);
    await this.post(`/issue/${issueId}/transitions`, { transition: { id: match.id } });
  }

  async preflightAuth(): Promise<void> {
    const apiKey = str(process.env.JIRA_API_TOKEN);
    const email = str(process.env.JIRA_EMAIL);
    if (!apiKey || !email || !this.domain) {
      throw new Error(
        `Jira tracker: authentication required.\n\n` +
        `Set the JIRA_API_TOKEN and JIRA_EMAIL environment variables or configure them in your workflow.\n` +
        `See https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/ for setup instructions.\n`
      );
    }
    try {
      await this.get<{ name?: string }>("/myself");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes("401") || message.includes("403")) {
        throw new Error(
          `Jira tracker: invalid or expired token.\n\n` +
          `Update your JIRA_API_TOKEN and JIRA_EMAIL environment variables or configuration.\n` +
          `See https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/ for setup instructions.\n`
        );
      }
      throw cause;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { headers: { authorization: this.auth, accept: "application/json" }, signal: controller.signal });
      if (!res.ok) throw new Error(`jira_api_status: ${res.status}`);
      return await res.json() as T;
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("jira_")) throw cause; throw new Error(`jira_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }

  private async post(path: string, body: unknown): Promise<void> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { method: "POST", headers: { authorization: this.auth, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok && res.status !== 204) throw new Error(`jira_api_status: ${res.status}`);
    } catch (cause) { if (cause instanceof Error && cause.message.startsWith("jira_")) throw cause; throw new Error(`jira_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    finally { clearTimeout(timer); }
  }
}

type JiraSearchResult = { issues: JiraIssueRaw[]; startAt: number; total: number };
type JiraIssueRaw = { id: string; key: string; fields: { summary: string; description: unknown; status: { name: string }; labels: string[]; priority?: { id: string }; created: string; updated: string; issuelinks?: JiraIssueLink[] } };
type JiraIssueLink = { type: { inward: string }; inwardIssue?: { id: string; key: string; fields?: { status?: { name: string } } } };

function extractAdfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  const children = Array.isArray(n.content) ? n.content : [];
  return children.map(extractAdfText).join(n.type === "paragraph" || n.type === "heading" ? "\n" : "");
}

function normalizeIssue(raw: JiraIssueRaw, domain: string): Issue {
  const blockedBy = (raw.fields.issuelinks ?? []).filter(l => l.type.inward.toLowerCase().includes("blocked") && l.inwardIssue).map(l => ({ id: l.inwardIssue!.id, identifier: l.inwardIssue!.key, state: l.inwardIssue?.fields?.status?.name ?? null }));
  return { id: raw.id, identifier: raw.key, title: raw.fields.summary, description: raw.fields.description ? extractAdfText(raw.fields.description).trim() || null : null, priority: raw.fields.priority?.id ? Number(raw.fields.priority.id) : null, state: raw.fields.status.name, branchName: null, url: `https://${domain}/browse/${raw.key}`, labels: raw.fields.labels.map(l => l.toLowerCase()), blockedBy, createdAt: raw.fields.created, updatedAt: raw.fields.updated };
}

function labelsMatch(issue: Issue, required: string[], excluded: string[]) { const labels = new Set(issue.labels); return required.every(l => labels.has(l.toLowerCase())) && !excluded.some(l => labels.has(l.toLowerCase())); }
