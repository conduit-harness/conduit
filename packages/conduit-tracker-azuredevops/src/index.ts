import type { Issue, ServiceConfig } from "@conduit-harness/conduit";
import { BaseTracker } from "@conduit-harness/conduit";

function str(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }

const API_VERSION = "7.1";
const COMMENTS_API_VERSION = "7.1-preview.4";
const BATCH_SIZE_MAX = 200;
const FIELDS = ["System.Id", "System.Title", "System.Description", "System.State", "System.Tags", "System.CreatedDate", "System.ChangedDate", "Microsoft.VSTS.Common.Priority"];

export default class AzureDevOpsTrackerClient extends BaseTracker {
  private readonly base: string;
  private readonly organization: string;
  private readonly project: string;
  private readonly auth: string;

  constructor(config: ServiceConfig, private readonly fetchImpl: typeof fetch = fetch) {
    super(config);
    const raw = config.tracker.raw;
    const baseUrl = (str(raw.base_url) ?? "https://dev.azure.com").replace(/\/+$/, "");
    this.organization = str(raw.organization) ?? "";
    this.project = str(raw.project) ?? "";
    this.base = `${baseUrl}/${encodeURIComponent(this.organization)}`;
    const pat = str(raw.api_key) ?? str(raw.token) ?? process.env.AZURE_DEVOPS_TOKEN ?? "";
    this.auth = "Basic " + Buffer.from(`:${pat}`).toString("base64");
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    return await this.fetchByStates(this.config.tracker.activeStates);
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    return await this.fetchByStates(stateNames);
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Record<string, string>> {
    if (issueIds.length === 0) return {};
    const out: Record<string, string> = {};
    for (const chunk of chunks(issueIds, BATCH_SIZE_MAX)) {
      const items = await this.getWorkItems(chunk.map(id => Number(id)).filter(n => Number.isFinite(n)), ["System.Id", "System.State"]);
      for (const item of items) out[String(item.id)] = stringField(item.fields["System.State"]);
    }
    return out;
  }

  override async comment(issueId: string, body: string): Promise<void> {
    await this.request("POST", `/${encodeURIComponent(this.project)}/_apis/wit/workItems/${issueId}/comments?api-version=${COMMENTS_API_VERSION}`, "application/json", { text: body });
  }

  override async transition(issueId: string, stateName: string): Promise<void> {
    await this.request("PATCH", `/${encodeURIComponent(this.project)}/_apis/wit/workitems/${issueId}?api-version=${API_VERSION}`, "application/json-patch+json", [{ op: "add", path: "/fields/System.State", value: stateName }]);
  }

  private async fetchByStates(stateNames: string[]): Promise<Issue[]> {
    const ids = await this.queryWorkItemIds(stateNames);
    if (ids.length === 0) return [];
    const out: Issue[] = [];
    for (const chunk of chunks(ids, BATCH_SIZE_MAX)) {
      const items = await this.getWorkItems(chunk, FIELDS);
      for (const item of items) out.push(normalizeIssue(item, this.base, this.project));
    }
    return out.filter(i => labelsMatch(i, this.config.tracker.requiredLabels, this.config.tracker.excludedLabels));
  }

  private async queryWorkItemIds(stateNames: string[]): Promise<number[]> {
    const escapedProject = wiqlEscape(this.project);
    const stateClause = stateNames.length === 0 ? "" : `AND [System.State] IN (${stateNames.map(s => `'${wiqlEscape(s)}'`).join(", ")})`;
    const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${escapedProject}' ${stateClause} ORDER BY [System.ChangedDate] DESC`;
    const result = await this.request<WiqlResult>("POST", `/${encodeURIComponent(this.project)}/_apis/wit/wiql?api-version=${API_VERSION}`, "application/json", { query });
    return (result?.workItems ?? []).map(w => w.id);
  }

  private async getWorkItems(ids: number[], fields: string[]): Promise<WorkItemRaw[]> {
    if (ids.length === 0) return [];
    const result = await this.request<{ value: WorkItemRaw[] }>("POST", `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`, "application/json", { ids, fields });
    return result?.value ?? [];
  }

  private async request<T>(method: string, path: string, contentType: string, body: unknown): Promise<T | undefined> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: { authorization: this.auth, accept: "application/json", "content-type": contentType },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`azuredevops_api_status: ${res.status}`);
      if (res.status === 204) return undefined;
      const text = await res.text();
      return text.length > 0 ? JSON.parse(text) as T : undefined;
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith("azuredevops_")) throw cause;
      throw new Error(`azuredevops_api_request: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    } finally { clearTimeout(timer); }
  }
}

type WiqlResult = { workItems: Array<{ id: number; url: string }> };
type WorkItemRaw = { id: number; fields: Record<string, unknown>; relations?: Array<{ rel: string; url: string; attributes?: Record<string, unknown> }> };

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function wiqlEscape(value: string): string { return value.replace(/'/g, "''"); }

function stringField(v: unknown): string { return typeof v === "string" ? v : ""; }

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTags(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  return value.split(";").map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
}

function normalizeIssue(raw: WorkItemRaw, base: string, project: string): Issue {
  const fields = raw.fields;
  const descriptionHtml = stringField(fields["System.Description"]);
  const description = descriptionHtml.length > 0 ? htmlToText(descriptionHtml) || null : null;
  const priorityRaw = fields["Microsoft.VSTS.Common.Priority"];
  const priority = typeof priorityRaw === "number" ? priorityRaw : null;
  return {
    id: String(raw.id),
    identifier: `#${raw.id}`,
    title: stringField(fields["System.Title"]),
    description,
    priority,
    state: stringField(fields["System.State"]),
    branchName: null,
    url: `${base}/${encodeURIComponent(project)}/_workitems/edit/${raw.id}`,
    labels: parseTags(fields["System.Tags"]),
    blockedBy: [],
    createdAt: stringField(fields["System.CreatedDate"]) || null,
    updatedAt: stringField(fields["System.ChangedDate"]) || null,
  };
}

function labelsMatch(issue: Issue, required: string[], excluded: string[]) {
  const labels = new Set(issue.labels);
  return required.every(l => labels.has(l.toLowerCase())) && !excluded.some(l => labels.has(l.toLowerCase()));
}
