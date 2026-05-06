import { spawn } from "node:child_process";
import type { AgentResult, AgentRunner, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

export default class CodexCliRunner implements AgentRunner {
  private readonly command: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    this.command = str(raw.command, "codex exec -s workspace-write -");
    this.turnTimeoutMs = num(raw.turn_timeout_ms, 3600000);
    this.stallTimeoutMs = num(raw.stall_timeout_ms, 300000);
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    return new Promise((resolve) => {
      const [shell, flag] = nativeShell();
      const child = spawn(shell, [flag, this.command], { cwd: attempt.workspacePath, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let settled = false; let stallTimer: NodeJS.Timeout | undefined;
      const finish = (result: AgentResult) => { if (settled) return; settled = true; clearTimeout(turnTimer); if (stallTimer) clearTimeout(stallTimer); resolve(result); };
      const bumpStall = () => { if (this.stallTimeoutMs <= 0) return; if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "codex_stall_timeout" }); }, this.stallTimeoutMs); };
      const turnTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output, error: "codex_turn_timeout" }); }, this.turnTimeoutMs);
      child.stdout.on("data", d => { output += d.toString(); bumpStall(); });
      child.stderr.on("data", d => { output += d.toString(); bumpStall(); });
      child.on("error", err => finish({ status: "failed", output, error: err.message }));
      child.on("close", code => {
        const result: AgentResult = { status: code === 0 ? "succeeded" : "failed", output };
        if (code !== null) result.exitCode = code;
        if (code !== 0) result.error = `codex_exit_${code}`;
        finish(result);
      });
      child.stdin.end(prompt);
      bumpStall();
    });
  }
}
