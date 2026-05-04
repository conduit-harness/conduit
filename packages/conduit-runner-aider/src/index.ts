import { spawn, spawnSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentResult, AgentRunner, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function maybeStr(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

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
    // Aider treats stdin lines as separate chat turns, so we hand it the prompt
    // via --message-file <tempfile> instead — appended automatically by the runner.
    this.command = str(raw.command, "aider --yes-always --no-pretty --no-stream --no-show-model-warnings --no-detect-urls --no-check-update");
    this.model = str(raw.model, "ollama_chat/qwen2.5-coder:14b");
    this.ollamaEndpoint = str(raw.ollama_endpoint, "http://localhost:11434");
    this.apiKey = maybeStr(raw.api_key);
    this.extraArgs = str(raw.extra_args, "");
    this.turnTimeoutMs = num(raw.turn_timeout_ms, 3600000);
    this.stallTimeoutMs = num(raw.stall_timeout_ms, 300000);
    this.preflight();
  }

  private preflight(): void {
    const bin = this.command.trim().split(/\s+/)[0];
    if (!bin) return;
    const result = spawnSync(bin, ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
    const notFound = process.platform === "win32"
      ? (result.status ?? 1) !== 0
      : result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ENOENT";
    if (notFound) {
      throw new Error(
        `aider runner: '${bin}' was not found on PATH.\n\n` +
        `Install aider:\n` +
        `  macOS / Linux:  curl -LsSf https://aider.chat/install.sh | sh\n` +
        `  Windows:        powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"\n` +
        `\nOther install methods: https://aider.chat/docs/install.html`,
      );
    }
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    const promptFile = join(attempt.workspacePath, ".conduit-aider-prompt.md");
    await writeFile(promptFile, prompt, "utf8");
    const fullCommand = this.buildCommand(promptFile);
    const env: NodeJS.ProcessEnv = { ...process.env, OLLAMA_API_BASE: this.ollamaEndpoint };
    if (this.apiKey) env.OPENAI_API_KEY = this.apiKey;
    const result = await new Promise<AgentResult>((resolve) => {
      const [shell, flag] = nativeShell();
      const child = spawn(shell, [flag, fullCommand], { cwd: attempt.workspacePath, env, stdio: ["ignore", "pipe", "pipe"] });
      let output = ""; let settled = false; let stallTimer: NodeJS.Timeout | undefined;
      const finish = (r: AgentResult) => { if (settled) return; settled = true; clearTimeout(turnTimer); if (stallTimer) clearTimeout(stallTimer); resolve(r); };
      const bumpStall = () => { if (this.stallTimeoutMs <= 0) return; if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "aider_stall_timeout" }); }, this.stallTimeoutMs); };
      const turnTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "aider_turn_timeout" }); }, this.turnTimeoutMs);
      child.stdout.on("data", d => { output += d.toString(); bumpStall(); });
      child.stderr.on("data", d => { output += d.toString(); bumpStall(); });
      child.on("error", err => finish({ status: "failed", output, error: err.message }));
      child.on("close", code => {
        const r: AgentResult = { status: code === 0 ? "succeeded" : "failed", output };
        if (code !== null) r.exitCode = code;
        if (code !== 0) r.error = `aider_exit_${code}`;
        finish(r);
      });
      bumpStall();
    });
    await unlink(promptFile).catch(() => {});
    return result;
  }

  private buildCommand(promptFile: string): string {
    const parts = [this.command];
    if (!/--model(\s|=)/.test(this.command)) parts.push(`--model ${shellQuote(this.model)}`);
    if (!/--message-file(\s|=)/.test(this.command)) parts.push(`--message-file ${shellQuote(promptFile)}`);
    if (this.extraArgs.length > 0) parts.push(this.extraArgs);
    return parts.join(" ");
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
