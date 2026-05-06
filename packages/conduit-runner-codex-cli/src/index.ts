import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentResult, AgentRunner, AgentUsage, RunAttempt, ServiceConfig } from "@conduit-harness/conduit";

function str(v: unknown, fallback: string): string { return typeof v === "string" && v.length > 0 ? v : fallback; }
function num(v: unknown, fallback: number): number { const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : fallback; }
function nativeShell(): [string, string] { return process.platform === "win32" ? ["powershell", "-Command"] : ["bash", "-lc"]; }

interface CodexItemCompletedEvent {
  type: "item.completed";
  item?: {
    type?: string;
    text?: string;
  };
}

interface CodexTurnCompletedEvent {
  type: "turn.completed";
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
}

export default class CodexCliRunner implements AgentRunner {
  private readonly command: string;
  private readonly turnTimeoutMs: number;
  private readonly stallTimeoutMs: number;

  constructor(config: ServiceConfig) {
    const raw = config.agent.raw;
    const baseCommand = str(raw.command, "codex exec -s workspace-write -");
    this.command = baseCommand.includes("--json") ? baseCommand : `${baseCommand} --json`;
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
        `codex-cli runner: '${bin}' was not found on PATH.\n\n` +
        `Install Codex CLI:\n` +
        `  npm install -g @openai/codex\n` +
        `\nSee https://github.com/openai/codex for setup.`,
      );
    }
  }

  private parseJsonlOutput(jsonlOutput: string): { output: string; usage?: AgentUsage } {
    const lines = jsonlOutput.trim().split("\n");
    const agentMessages: string[] = [];
    let usage: AgentUsage | undefined;

    for (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line) as CodexItemCompletedEvent | CodexTurnCompletedEvent;

        if (event.type === "item.completed") {
          const itemEvent = event as CodexItemCompletedEvent;
          if (itemEvent.item?.type === "agent_message" && itemEvent.item.text) {
            agentMessages.push(itemEvent.item.text);
          }
        } else if (event.type === "turn.completed") {
          const turnEvent = event as CodexTurnCompletedEvent;
          if (turnEvent.usage) {
            usage = {
              inputTokens: turnEvent.usage.input_tokens ?? 0,
              outputTokens: turnEvent.usage.output_tokens ?? 0,
              cacheReadInputTokens: turnEvent.usage.cached_input_tokens ?? 0,
              cacheCreationInputTokens: 0,
            };
          }
        }
      } catch {
        // Ignore parse errors and continue
      }
    }

    return {
      output: agentMessages.join("\n"),
      usage,
    };
  }

  async preflightAuth(): Promise<void> {
    const credentialsPath = path.join(os.homedir(), ".codex", "credentials.json");
    if (!existsSync(credentialsPath)) {
      throw new Error(
        `codex-cli runner: authentication required.\n\n` +
        `Run the following to authenticate:\n` +
        `  codex login\n`
      );
    }
    try {
      const content = readFileSync(credentialsPath, "utf8");
      const creds = JSON.parse(content) as Record<string, unknown>;
      if (!creds || typeof creds !== "object" || Object.keys(creds).length === 0) {
        throw new Error("credentials file is empty");
      }
    } catch {
      throw new Error(
        `codex-cli runner: authentication required.\n\n` +
        `Run the following to authenticate:\n` +
        `  codex login\n`
      );
    }
  }

  async run(attempt: RunAttempt, prompt: string): Promise<AgentResult> {
    return new Promise((resolve) => {
      const [shell, flag] = nativeShell();
      const child = spawn(shell, [flag, this.command], { cwd: attempt.workspacePath, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let settled = false; let stallTimer: NodeJS.Timeout | undefined;
      const finish = (result: AgentResult) => { if (settled) return; settled = true; clearTimeout(turnTimer); if (stallTimer) clearTimeout(stallTimer); resolve(result); };
      const bumpStall = () => { if (this.stallTimeoutMs <= 0) return; if (stallTimer) clearTimeout(stallTimer); stallTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output: "", error: "codex_stall_timeout" }); }, this.stallTimeoutMs); };
      const turnTimer = setTimeout(() => { child.kill("SIGTERM"); finish({ status: "timed_out", output: "", error: "codex_turn_timeout" }); }, this.turnTimeoutMs);
      child.stdout.on("data", d => { output += d.toString(); bumpStall(); });
      child.stderr.on("data", d => { output += d.toString(); bumpStall(); });
      child.on("error", err => finish({ status: "failed", output: "", error: err.message }));
      child.on("close", code => {
        const { output: agentOutput, usage } = this.parseJsonlOutput(output);
        const result: AgentResult = { status: code === 0 ? "succeeded" : "failed", output: agentOutput };
        if (code !== null) result.exitCode = code;
        if (code !== 0) result.error = `codex_exit_${code}`;
        if (usage) result.usage = usage;
        finish(result);
      });
      child.stdin.end(prompt);
      bumpStall();
    });
  }
}
