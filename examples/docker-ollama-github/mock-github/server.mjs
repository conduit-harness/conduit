import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(path.join(here, "seed.json"), "utf8"));
const issues = new Map(seed.issues.map(i => [String(i.number), i]));

const port = Number(process.env.PORT ?? 3000);

function log(...args) {
  console.log(`[mock-github]`, ...args);
}

function send(res, status, body) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); } catch { return text; }
}

const listRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/?$/;
const itemRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/?$/;
const commentRoute = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments\/?$/;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock-github");
  const auth = req.headers.authorization ?? "";
  log(req.method, url.pathname + url.search, auth ? "(auth ok)" : "(no auth)");

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return send(res, 401, { message: "missing bearer token" });
  }

  if (req.method === "GET" && listRoute.test(url.pathname)) {
    const state = url.searchParams.get("state") ?? "open";
    const filtered = [...issues.values()].filter(i => i.state === state);
    return send(res, 200, filtered);
  }

  const itemMatch = url.pathname.match(itemRoute);
  if (itemMatch) {
    const id = itemMatch[1];
    const issue = issues.get(id);
    if (!issue) return send(res, 404, { message: "not found" });
    if (req.method === "GET") return send(res, 200, issue);
    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (body && typeof body === "object" && typeof body.state === "string") {
        issue.state = body.state;
        issue.updated_at = new Date().toISOString();
        log(`issue #${id} state -> ${body.state}`);
      }
      return send(res, 200, issue);
    }
  }

  const commentMatch = url.pathname.match(commentRoute);
  if (commentMatch && req.method === "POST") {
    const id = commentMatch[1];
    if (!issues.has(id)) return send(res, 404, { message: "not found" });
    const body = await readBody(req);
    const text = body && typeof body === "object" ? body.body : String(body ?? "");
    log(`issue #${id} comment:\n---\n${text}\n---`);
    return send(res, 201, { id: Date.now(), body: text });
  }

  send(res, 404, { message: `no route for ${req.method} ${url.pathname}` });
});

server.listen(port, "0.0.0.0", () => log(`listening on :${port}`));
