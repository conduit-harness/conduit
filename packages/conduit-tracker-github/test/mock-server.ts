import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export type GhIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
};

export type RequestLog = { method: string; path: string; body: unknown; auth: string };

export type GhMockHandle = {
  url: string;
  baseUrl: string;
  requests: RequestLog[];
  issues: Map<string, GhIssue>;
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

export async function startGithubMock(): Promise<GhMockHandle> {
  const seedRaw = await readFile(path.join(here, "fixtures", "seed.json"), "utf8");
  const seed = JSON.parse(seedRaw) as { issues: GhIssue[] };
  const issues = new Map<string, GhIssue>(seed.issues.map((i) => [String(i.number), i]));
  const requests: RequestLog[] = [];

  const listRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/?$/;
  const itemRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/?$/;
  const commentRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments\/?$/;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const body = await readBody(req);
    const auth = (req.headers.authorization ?? "").toString();
    requests.push({ method: req.method ?? "", path: url.pathname + url.search, body, auth });

    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (!auth.toLowerCase().startsWith("bearer ")) return send(res, 401, { message: "missing bearer token" });

    if (req.method === "GET" && listRoute.test(url.pathname)) {
      const state = url.searchParams.get("state") ?? "open";
      const filtered = [...issues.values()].filter((i) => i.state === state);
      return send(res, 200, filtered);
    }
    const itemMatch = url.pathname.match(itemRoute);
    if (itemMatch) {
      const id = itemMatch[1]!;
      const issue = issues.get(id);
      if (!issue) return send(res, 404, { message: "not found" });
      if (req.method === "GET") return send(res, 200, issue);
      if (req.method === "PATCH") {
        if (body && typeof body === "object" && typeof (body as { state?: unknown }).state === "string") {
          issue.state = (body as { state: string }).state;
          issue.updated_at = new Date().toISOString();
        }
        return send(res, 200, issue);
      }
    }
    const commentMatch = url.pathname.match(commentRoute);
    if (commentMatch && req.method === "POST") {
      const id = commentMatch[1]!;
      if (!issues.has(id)) return send(res, 404, { message: "not found" });
      return send(res, 201, { id: Date.now(), body: body && typeof body === "object" ? (body as { body?: string }).body : "" });
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
