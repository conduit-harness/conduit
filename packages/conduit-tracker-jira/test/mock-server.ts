import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: unknown;
    status: { name: string };
    labels: string[];
    priority?: { id: string };
    created: string;
    updated: string;
  };
};

export type RequestLog = { method: string; path: string; body: unknown; auth: string };

export type JiraMockHandle = {
  url: string;
  baseUrl: string;
  requests: RequestLog[];
  issues: Map<string, JiraIssue>;
  close: () => Promise<void>;
};

function send(res: Parameters<Parameters<typeof createServer>[0]>[1], status: number, body: unknown) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req: Parameters<Parameters<typeof createServer>[0]>[0]) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); } catch { return text; }
}

const TRANSITIONS = [
  { id: "11", name: "To Do" },
  { id: "21", name: "In Progress" },
  { id: "31", name: "Done" },
];

export async function startJiraMock(): Promise<JiraMockHandle> {
  const seedRaw = await readFile(path.join(here, "fixtures", "seed.json"), "utf8");
  const seed = JSON.parse(seedRaw) as { issues: JiraIssue[] };
  const issues = new Map<string, JiraIssue>(seed.issues.map((i) => [i.id, i]));
  const requests: RequestLog[] = [];

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const body = await readBody(req);
    const auth = (req.headers.authorization ?? "").toString();
    requests.push({ method: req.method ?? "", path: url.pathname + url.search, body, auth });

    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (!auth.toLowerCase().startsWith("basic ")) return send(res, 401, { message: "missing basic auth" });

    if (req.method === "GET" && url.pathname === "/rest/api/3/search") {
      const jql = url.searchParams.get("jql") ?? "";
      const max = Number(url.searchParams.get("maxResults") ?? "50");
      const start = Number(url.searchParams.get("startAt") ?? "0");
      const wantedStates: string[] = [];
      const m = jql.match(/status in \(([^)]+)\)/);
      if (m) for (const s of m[1]!.split(",")) { const v = s.trim().replace(/^"|"$/g, ""); if (v) wantedStates.push(v); }
      const idMatch = jql.match(/issue in \(([^)]+)\)/);
      const wantedIds = idMatch ? idMatch[1]!.split(",").map((s) => s.trim()) : null;
      let matches = [...issues.values()];
      if (wantedIds) matches = matches.filter((i) => wantedIds.includes(i.id) || wantedIds.includes(i.key));
      else if (wantedStates.length) matches = matches.filter((i) => wantedStates.some((s) => s.toLowerCase() === i.fields.status.name.toLowerCase()));
      const slice = matches.slice(start, start + max);
      return send(res, 200, { issues: slice, startAt: start, total: matches.length });
    }

    let mTrans = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/transitions\/?$/);
    if (mTrans && req.method === "GET") return send(res, 200, { transitions: TRANSITIONS });
    if (mTrans && req.method === "POST") {
      const id = mTrans[1]!;
      const issue = issues.get(id);
      if (!issue) return send(res, 404, { message: "not found" });
      const transId = body && typeof body === "object" ? (body as { transition?: { id?: string } }).transition?.id : undefined;
      const trans = TRANSITIONS.find((t) => t.id === transId);
      if (trans) issue.fields.status.name = trans.name;
      return send(res, 204, null);
    }

    let mComment = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/comment\/?$/);
    if (mComment && req.method === "POST") {
      const id = mComment[1]!;
      if (!issues.has(id)) return send(res, 404, { message: "not found" });
      return send(res, 201, { id: String(Date.now()), body });
    }

    send(res, 404, { message: `no route for ${req.method} ${url.pathname}` });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        issues,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
