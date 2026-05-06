import { spawn, spawnSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentResult, AgentRunner, AgentUsage, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

const PROMPT_FILENAME = ".conduit-claude-prompt.md";

export function parseClaudeJsonOutput(raw: string): { summary?: string; usage?: AgentUsage; fullLog: string } | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    const result: { summary?: string; usage?: AgentUsage; fullLog: string } = { fullLog: raw };
    if (typeof p.result === "string") result.summary = p.result;
    const rawUsage = p.usage;
    if (rawUsage !== null && typeof rawUsage === "object") {
      const u = rawUsage as Record<string, unknown>;
      result.usage = {
        inputTokens: num(u.input_tokens, 0),
        outputTokens: num(u.output_tokens, 0),
        cacheCreationInputTokens: num(u.cache_creation_input_tokens, 0),
        cacheReadInputTokens: num(u.cache_read_input_tokens, 0),
      };
    }
    return result;
  } catch {
    return null;
  }
}

export default class ClaudeCliRunner implements AgentRunner {
  private readonly command: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    this.command = str(raw.command, "claude --dangerously-skip-permissions --output-format json -p -");
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
        `claude-cli runner: '${bin}' was not found on PATH.\n\n` +
        `Install Claude Code:\n` +
        `  npm install -g @anthropic-ai/claude-code\n` +
        `\nSee https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview for setup.`,
      );
    }
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    // Write the prompt to a file in the workspace and let the shell pipe it
    // into claude's stdin via a shell redirect. Direct Node->child stdin piping
    // does not work reliably on Windows: powershell -Command does not forward
    // its own stdin to the native binary the way bash -lc does, so claude -p -
    // sits at zero-output forever and the stall timer kills it. Reading the
    // file inside the shell sidesteps that. The aider runner uses the same
    // pattern via --message-file.
    const promptFile = join(attempt.workspacePath, PROMPT_FILENAME);
    await writeFile(promptFile, prompt, "utf8");
    const fullCommand = this.buildCommand();
    const result = await new Promise<AgentResult>((resolve) => {
      const [shell, flag] = nativeShell();
      const child = spawn(shell, [flag, fullCommand], { cwd: attempt.workspacePath, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let output = ""; let settled = false; let stallTimer: NodeJS.Timeout | undefined;
      const finish = (r: AgentResult) => { if (settled) return; settled = true; clearTimeout(turnTimer); if (stallTimer) clearTimeout(stallTimer); resolve(r); };
      const bumpStall = () => { if (this.stallTimeoutMs <= 0) return; if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "claude_stall_timeout" }); }, this.stallTimeoutMs); };
      const turnTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "claude_turn_timeout" }); }, this.turnTimeoutMs);
      child.stdout.on("data", d => { output += d.toString(); bumpStall(); });
      child.stderr.on("data", d => { output += d.toString(); bumpStall(); });
      child.on("error", err => finish({ status: "failed", output, error: err.message }));
      child.on("close", code => {
        const r: AgentResult = { status: code === 0 ? "succeeded" : "failed", output };
        if (code !== null) r.exitCode = code;
        if (code !== 0) r.error = `claude_exit_${code}`;
        if (code === 0) {
          const parsed = parseClaudeJsonOutput(output);
          if (parsed !== null) {
            if (parsed.summary !== undefined) r.summary = parsed.summary;
            if (parsed.usage !== undefined) r.usage = parsed.usage;
            r.fullLog = parsed.fullLog;
          }
        }
        finish(r);
      });
      bumpStall();
    });
    await unlink(promptFile).catch(() => {});
    return result;
  }

  private buildCommand(): string {
    const reader = process.platform === "win32"
      ? `Get-Content -Raw '${PROMPT_FILENAME}'`
      : `cat '${PROMPT_FILENAME}'`;
    return `${reader} | ${this.command}`;
  }
}
