import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export type GlIssue = {
  iid: number;
  title: string;
  description: string | null;
  state: string;
  web_url: string;
  labels: string[];
  created_at: string;
  updated_at: string;
};

export type RequestLog = { method: string; path: string; body: unknown; token: string };

export type GlMockHandle = {
  url: string;
  baseUrl: string;
  requests: RequestLog[];
  issues: Map<string, GlIssue>;
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

export async function startGitlabMock(): Promise<GlMockHandle> {
  const seedRaw = await readFile(path.join(here, "fixtures", "seed.json"), "utf8");
  const seed = JSON.parse(seedRaw) as { issues: GlIssue[] };
  const issues = new Map<string, GlIssue>(seed.issues.map((i) => [String(i.iid), i]));
  const requests: RequestLog[] = [];

  const listRoute = /^\/api\/v4\/projects\/[^/]+\/issues\/?$/;
  const itemRoute = /^\/api\/v4\/projects\/[^/]+\/issues\/(\d+)\/?$/;
  const notesRoute = /^\/api\/v4\/projects\/[^/]+\/issues\/(\d+)\/notes\/?$/;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const body = await readBody(req);
    const token = (req.headers["private-token"] ?? "").toString();
    requests.push({ method: req.method ?? "", path: url.pathname + url.search, body, token });

    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (!token) return send(res, 401, { message: "missing private-token" });

    if (req.method === "GET" && listRoute.test(url.pathname)) {
      const iidParams = url.searchParams.getAll("iids[]");
      const state = url.searchParams.get("state");
      let result = [...issues.values()];
      if (iidParams.length > 0) result = result.filter((i) => iidParams.includes(String(i.iid)));
      else if (state) result = result.filter((i) => i.state === state);
      return send(res, 200, result);
    }

    const itemMatch = url.pathname.match(itemRoute);
    if (itemMatch && req.method === "PUT") {
      const id = itemMatch[1]!;
      const issue = issues.get(id);
      if (!issue) return send(res, 404, { message: "not found" });
      const stateEvent = body && typeof body === "object" ? (body as { state_event?: string }).state_event : undefined;
      if (stateEvent === "close") issue.state = "closed";
      if (stateEvent === "reopen") issue.state = "opened";
      issue.updated_at = new Date().toISOString();
      return send(res, 200, issue);
    }

    const notesMatch = url.pathname.match(notesRoute);
    if (notesMatch && req.method === "POST") {
      const id = notesMatch[1]!;
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
