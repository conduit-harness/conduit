import { spawn } from "node:child_process";
import type { AgentResult, AgentRunner, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function maybeStr(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }

export default class AiderRunner implements AgentRunner {
  private readonly command: string;
  private readonly model: string;
  private readonly ollamaEndpoint: string;
  private readonly apiKey: string | undefined;
  private readonly extraArgs: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    this.command = str(raw.command, "aider --yes-always --no-pretty --no-stream --message-file -");
    this.model = str(raw.model, "ollama_chat/qwen2.5-coder:14b");
    this.ollamaEndpoint = str(raw.ollama_endpoint, "http://localhost:11434");
    this.apiKey = maybeStr(raw.api_key);
    this.extraArgs = str(raw.extra_args, "");
    this.turnTimeoutMs = num(raw.turn_timeout_ms, 3600000);
    this.stallTimeoutMs = num(raw.stall_timeout_ms, 300000);
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    const fullCommand = this.buildCommand();
    const env: NodeJS.ProcessEnv = { ...process.env, OLLAMA_API_BASE: this.ollamaEndpoint };
    if (this.apiKey) env.OPENAI_API_KEY = this.apiKey;
    return new Promise((resolve) => {
      const child = spawn("bash", ["-lc", fullCommand], { cwd: attempt.workspacePath, env, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let settled = false; let stallTimer: NodeJS.Timeout | undefined;
      const finish = (result: AgentResult) => { if (settled) return; settled = true; clearTimeout(turnTimer); if (stallTimer) clearTimeout(stallTimer); resolve(result); };
      const bumpStall = () => { if (this.stallTimeoutMs <= 0) return; if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "aider_stall_timeout" }); }, this.stallTimeoutMs); };
      const turnTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "aider_turn_timeout" }); }, this.turnTimeoutMs);
      child.stdout.on("data", d => { output += d.toString(); bumpStall(); });
      child.stderr.on("data", d => { output += d.toString(); bumpStall(); });
      child.on("error", err => finish({ status: "failed", output, error: err.message }));
      child.on("close", code => {
        const result: AgentResult = { status: code === 0 ? "succeeded" : "failed", output };
        if (code !== null) result.exitCode = code;
        if (code !== 0) result.error = `aider_exit_${code}`;
        finish(result);
      });
      child.stdin.end(prompt);
      bumpStall();
    });
  }

  private buildCommand(): string {
    const parts = [this.command];
    if (!/--model(\s|=)/.test(this.command)) parts.push(`--model ${shellQuote(this.model)}`);
    if (this.extraArgs.length > 0) parts.push(this.extraArgs);
    return parts.join(" ");
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
