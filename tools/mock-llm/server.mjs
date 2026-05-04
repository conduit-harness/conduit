import { createServer } from "node:http";

// Mock LLM server compatible with OpenAI Chat Completions, Anthropic Messages,
// and Ollama-style /api/chat endpoints. Returns a fixed assistant reply so
// runner integration tests don't need real model providers or network access.
//
// Usage (programmatic):
//   import { startMockLlm } from "./server.mjs";
//   const { url, close } = await startMockLlm();
//
// Usage (standalone): `node server.mjs` — listens on $PORT (default 3000).

const FIXED_REPLY = "ok: mock-llm response";

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

function openaiCompletion(model, content) {
  return {
    id: "mock-cmpl-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model ?? "mock",
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function anthropicMessage(model, content) {
  return {
    id: "mock-msg-" + Date.now(),
    type: "message",
    role: "assistant",
    model: model ?? "mock",
    content: [{ type: "text", text: content }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function ollamaChat(model, content) {
  return {
    model: model ?? "mock",
    created_at: new Date().toISOString(),
    message: { role: "assistant", content },
    done: true,
  };
}

function makeHandler(opts) {
  const reply = opts?.reply ?? FIXED_REPLY;
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock-llm");
    const fail = url.searchParams.get("fail");
    if (fail) return send(res, Number(fail), { error: { message: "mock-llm forced failure" } });

    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/tags") return send(res, 200, { models: [{ name: "mock" }] });
    if (req.method === "GET" && url.pathname === "/v1/models") return send(res, 200, { object: "list", data: [{ id: "mock", object: "model" }] });

    const body = await readBody(req);
    const model = body && typeof body === "object" ? body.model : undefined;

    if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname.endsWith("/chat/completions"))) {
      return send(res, 200, openaiCompletion(model, reply));
    }
    if (req.method === "POST" && (url.pathname === "/v1/messages" || url.pathname.endsWith("/messages"))) {
      return send(res, 200, anthropicMessage(model, reply));
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      return send(res, 200, ollamaChat(model, reply));
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      return send(res, 200, { model: model ?? "mock", response: reply, done: true });
    }
    send(res, 404, { error: { message: `no route for ${req.method} ${url.pathname}` } });
  };
}

export function startMockLlm(opts = {}) {
  const server = createServer(makeHandler(opts));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createServer(makeHandler());
  server.listen(port, "0.0.0.0", () => console.log(`[mock-llm] listening on :${port}`));
}
