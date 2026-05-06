import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AgentResult, AgentRunner, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

const PROMPT_FILENAME = ".conduit-claude-prompt.md";

export default class ClaudeCliRunner implements AgentRunner {
  private readonly command: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    this.command = str(raw.command, "claude --dangerously-skip-permissions -p -");
    this.turnTimeoutMs = num(raw.turn_timeout_ms, 3600000);
    this.stallTimeoutMs = num(raw.stall_timeout_ms, 300000);
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
