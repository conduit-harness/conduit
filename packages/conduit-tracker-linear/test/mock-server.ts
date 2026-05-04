import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export type LinearSeedIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  branchName: string | null;
  createdAt: string;
  updatedAt: string;
  state: { name: string };
  labels: string[];
};

export type LinearSeed = {
  issues: LinearSeedIssue[];
  team: { id: string; states: Array<{ id: string; name: string }> };
};

export type RequestLog = { operationName: string; variables: Record<string, unknown> };

export type LinearMockHandle = {
  url: string;
  endpointUrl: string;
  requests: RequestLog[];
  state: LinearSeed;
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

function nodeFor(issue: LinearSeedIssue) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    url: issue.url,
    branchName: issue.branchName,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    state: { name: issue.state.name },
    labels: { nodes: issue.labels.map((name) => ({ name })) },
    inverseRelations: { nodes: [] as Array<{ type: string; issue: { id: string; identifier: string; state: { name: string } } }> },
  };
}

export async function startLinearMock(): Promise<LinearMockHandle> {
  const seedRaw = await readFile(path.join(here, "fixtures", "seed.json"), "utf8");
  const seed = JSON.parse(seedRaw) as LinearSeed;
  const issues = new Map(seed.issues.map((i) => [i.id, i]));
  const requests: RequestLog[] = [];

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || url.pathname !== "/graphql") return send(res, 404, { errors: [{ message: "no route" }] });

    const body = (await readBody(req)) as { query?: string; variables?: Record<string, unknown> } | null;
    const query = body?.query ?? "";
    const variables = body?.variables ?? {};
    const opNameMatch = query.match(/(?:query|mutation)\s+(\w+)/);
    const operationName = opNameMatch ? opNameMatch[1]! : "unknown";
    requests.push({ operationName, variables });

    if (operationName === "ConduitCandidateIssuesByProject" || operationName === "ConduitCandidateIssuesByTeam") {
      const stateNames = (variables.stateNames as string[] | undefined) ?? [];
      const matches = [...issues.values()].filter((i) => stateNames.length === 0 || stateNames.includes(i.state.name));
      return send(res, 200, { data: { issues: { nodes: matches.map(nodeFor), pageInfo: { hasNextPage: false, endCursor: null } } } });
    }
    if (operationName === "ConduitIssueStates") {
      const ids = ((variables.ids as string[] | undefined) ?? []);
      const nodes = [...issues.values()].filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, state: { name: i.state.name } }));
      return send(res, 200, { data: { issues: { nodes } } });
    }
    if (operationName === "ConduitComment") {
      return send(res, 200, { data: { commentCreate: { success: true } } });
    }
    if (operationName === "ConduitIssueTeam") {
      const id = variables.id as string;
      const issue = issues.get(id);
      if (!issue) return send(res, 200, { data: { issue: null } });
      return send(res, 200, { data: { issue: { id, team: { id: seed.team.id, states: { nodes: seed.team.states } }, state: { name: issue.state.name } } } });
    }
    if (operationName === "ConduitTransition") {
      const id = variables.id as string;
      const stateId = variables.stateId as string;
      const issue = issues.get(id);
      const targetState = seed.team.states.find((s) => s.id === stateId);
      if (issue && targetState) issue.state = { name: targetState.name };
      return send(res, 200, { data: { issueUpdate: { success: true } } });
    }
    return send(res, 200, { errors: [{ message: `unknown operation: ${operationName}` }] });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        endpointUrl: `${url}/graphql`,
        requests,
        state: seed,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
