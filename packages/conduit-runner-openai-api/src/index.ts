import type { AgentResult, AgentRunner, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function maybeStr(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }

export default class OpenAIApiRunner implements AgentRunner {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly token: string | undefined;
  private readonly turnTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    this.endpoint = str(raw.endpoint, "https://api.openai.com/v1/chat/completions");
    this.model = str(raw.model, "gpt-4o");
    this.token = maybeStr(raw.token) ?? process.env.OPENAI_API_KEY ?? process.env.GITHUB_TOKEN;
    this.turnTimeoutMs = num(raw.turn_timeout_ms, 3600000);
  }

  async run(_attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.turnTimeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: prompt }] }),
        signal: controller.signal,
      });
      if (!res.ok) return { status: "failed", output: "", error: `openai_api_status: ${res.status}` };
      const json = await res.json() as { choices: Array<{ message: { content: string } }> };
      return { status: "succeeded", output: json.choices[0]?.message.content ?? "" };
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return { status: "timed_out", output: "", error: "openai_turn_timeout" };
      return { status: "failed", output: "", error: `openai_request: ${cause instanceof Error ? cause.message : String(cause)}` };
    } finally { clearTimeout(timer); }
  }
}
