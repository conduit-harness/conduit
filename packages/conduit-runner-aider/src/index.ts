import { spawn, spawnSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentResult, AgentRunner, AgentUsage, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function maybeStr(v: unknown): string | undefined { return typeof v === "string" && v.length > 0 ? v : undefined; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

function parseShorthandNumber(s: string): number | undefined {
  const match = /^([\d.]+)([kmb])?$/i.exec(s.trim());
  if (!match) return undefined;
  const base = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(base)) return undefined;
  const suffix = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = { k: 1000, m: 1000000, b: 1000000000 };
  return Math.round(base * (multipliers[suffix] ?? 1));
}

function parseAiderTokenUsage(output: string): AgentUsage | undefined {
  const tokenLine = output.split("\n").find(line => line.includes("Tokens:") && (line.includes("sent") || line.includes("received")));
  if (!tokenLine) return undefined;
  const sentMatch = /(\d+\.?\d*[kmb]?)\s*(?:tokens?)?\s*sent/i.exec(tokenLine);
  const receivedMatch = /(\d+\.?\d*[kmb]?)\s*(?:tokens?)?\s*received/i.exec(tokenLine);
  const inputTokens = sentMatch ? (parseShorthandNumber(sentMatch[1] ?? "") ?? 0) : 0;
  const outputTokens = receivedMatch ? (parseShorthandNumber(receivedMatch[1] ?? "") ?? 0) : 0;
  if (inputTokens === 0 && outputTokens === 0) return undefined;
  return { inputTokens, outputTokens, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

export default class AiderRunner implements AgentRunner {
  private readonly command: string;
  private readonly model: string;
  private readonly ollamaEndpoint: string;
  private readonly apiKey: string | undefined;
  private readonly extraArgs: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;
  private ollamaPreflight: boolean | Error | undefined;

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

  private async preflightOllama(): Promise<void> {
    if (this.ollamaPreflight !== undefined) {
      if (this.ollamaPreflight instanceof Error) throw this.ollamaPreflight;
      return;
    }

    if (!this.model.startsWith("ollama_chat/")) {
      this.ollamaPreflight = true;
      return;
    }

    try {
      const url = `${this.ollamaEndpoint}/api/tags`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        const error = new Error(
          `aider runner: Ollama is not reachable at ${this.ollamaEndpoint}.\n\n` +
          `- Is the Ollama daemon running? Start it with: \`ollama serve\` (or open the Ollama app)\n` +
          `- Is \`ollama_endpoint\` correct in your workflow?`,
        );
        this.ollamaPreflight = error;
        throw error;
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models ?? [];
      const modelName = this.model.slice("ollama_chat/".length);
      const found = models.some(m => m.name === modelName);

      if (!found) {
        const available = models.map(m => m.name).join(", ");
        const error = new Error(
          `aider runner: model '${modelName}' is not pulled in Ollama.\n\n` +
          `Pull it with: ollama pull ${modelName}\n\n` +
          `Currently available: ${available || "(none)"}`,
        );
        this.ollamaPreflight = error;
        throw error;
      }

      this.ollamaPreflight = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.ollamaPreflight === undefined) this.ollamaPreflight = error;
      throw error;
    }
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    await this.preflightOllama();
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
        if (code === 0) {
          const usage = parseAiderTokenUsage(output);
          if (usage !== undefined) r.usage = usage;
        }
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
  if (/^[A-Za-z0-9_./:@\\-]+$/.test(value)) return value;
  if (process.platform === "win32") return `'${value.replace(/'/g, "''")}'`;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
