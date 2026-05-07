import { appendFileSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";
const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MAX_SINK_BYTES = 5 * 1024 * 1024;

export type LoggerOptions = { sinkPath?: string };

export class Logger {
  private readonly sinkPath: string | null;
  private sinkErrorReported = false;
  constructor(private readonly level: LogLevel = "info", options: LoggerOptions = {}) {
    this.sinkPath = options.sinkPath ?? null;
  }
  child(fields: Record<string, unknown>): Logger {
    return new ChildLogger(this, fields);
  }
  debug(message: string, fields: Record<string, unknown> = {}) { this.emit("debug", message, fields); }
  info(message: string, fields: Record<string, unknown> = {}) { this.emit("info", message, fields); }
  warn(message: string, fields: Record<string, unknown> = {}) { this.emit("warn", message, fields); }
  error(message: string, fields: Record<string, unknown> = {}) { this.emit("error", message, fields); }
  protected emit(level: LogLevel, message: string, fields: Record<string, unknown>) {
    if (rank[level] < rank[this.level]) return;
    const record = { ts: new Date().toISOString(), level, message, ...fields };
    const line = JSON.stringify(record);
    if (level === "error") console.error(line); else console.log(line);
    this.appendSink(line);
  }
  private appendSink(line: string) {
    if (!this.sinkPath) return;
    try {
      try {
        const s = statSync(this.sinkPath);
        if (s.size >= MAX_SINK_BYTES) {
          const dir = path.dirname(this.sinkPath);
          const base = path.basename(this.sinkPath, ".ndjson");
          renameSync(this.sinkPath, path.join(dir, `${base}.1.ndjson`));
        }
      } catch { /* file may not exist yet */ }
      appendFileSync(this.sinkPath, `${line}\n`, "utf8");
    } catch (err) {
      if (!this.sinkErrorReported) {
        this.sinkErrorReported = true;
        console.error(`conduit: log sink write failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
}

class ChildLogger extends Logger {
  constructor(private readonly parent: Logger, private readonly fields: Record<string, unknown>) { super("debug"); }
  protected override emit(level: LogLevel, message: string, fields: Record<string, unknown>) {
    (this.parent as unknown as { emit(level: LogLevel, message: string, fields: Record<string, unknown>): void }).emit(level, message, { ...this.fields, ...fields });
  }
}

export function openLogSink(sinkPath: string): string {
  mkdirSync(path.dirname(sinkPath), { recursive: true });
  writeFileSync(sinkPath, "");
  return sinkPath;
}
